-- Server-only primitives. No browser grants, API routing or data cutover.
begin;

-- Import jobs in original sheet-row order. New jobs continue the same ordering.
alter table bomedia.jobs add column collection_sequence bigint generated always as identity unique;

create function bomedia.kobo(value text) returns bigint
language plpgsql immutable set search_path = pg_catalog as $$
begin
  if value is null or value !~ '^[0-9]{1,19}$' then
    raise exception 'Expected nonnegative integer kobo' using errcode = '22023';
  end if;
  return value::bigint;
end $$;

create function bomedia.feet(value text) returns numeric
language plpgsql immutable set search_path = pg_catalog as $$
begin
  if value is null or value !~ '^[0-9]{1,12}(\.[0-9]{1,6})?$' then
    raise exception 'Expected nonnegative decimal quantity with at most six decimal places' using errcode = '22023';
  end if;
  return value::numeric;
end $$;

-- Advisory transaction locks serialize identical request keys across connections.
-- The payload hash is calculated here, not supplied/trusted from a browser.
create function bomedia.prior_result(operation_name text, request_id text, payload jsonb)
returns jsonb language plpgsql set search_path = pg_catalog, bomedia as $$
declare previous bomedia.idempotency_requests%rowtype;
begin
  if request_id is null or btrim(request_id) = '' or length(request_id) > 200
    or payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'Invalid operation key or payload' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(operation_name || ':' || request_id, 0));
  select * into previous from bomedia.idempotency_requests
    where operation = operation_name and request_key = request_id;
  if found then
    if previous.payload_sha256 <> encode(sha256(convert_to(payload::text, 'UTF8')), 'hex') then
      raise exception 'Request key was already used with different data' using errcode = '22023';
    end if;
    return previous.response;
  end if;
  return null;
end $$;

create function bomedia.record_payment(request_id text, payload jsonb) returns jsonb
language plpgsql set search_path = pg_catalog, bomedia as $$
declare
  previous jsonb; result jsonb; customer uuid; actor uuid; paid bigint; remaining bigint;
  selected_ids uuid[]; job_row record; due numeric; applied bigint; payment uuid;
  allocations jsonb := '[]'::jsonb; last_job uuid; date_value date;
begin
  previous := bomedia.prior_result('payment', request_id, payload);
  if previous is not null then return previous; end if;
  customer := (payload->>'customer_id')::uuid;
  actor := (payload->>'actor_id')::uuid;
  paid := bomedia.kobo(payload->>'amount_kobo');
  if customer is null or paid <= 0 or (payload->>'business_date') is null
    or (payload->>'business_date') !~ '^\d{4}-\d{2}-\d{2}$'
    or jsonb_typeof(payload->'job_ids') is distinct from 'array' then
    raise exception 'Customer, date, positive payment and job IDs are required' using errcode = '22023';
  end if;
  date_value := (payload->>'business_date')::date;
  select array_agg(value::uuid) into selected_ids from jsonb_array_elements_text(payload->'job_ids');
  if coalesce(cardinality(selected_ids), 0) not between 1 and 500
    or array_position(selected_ids, null) is not null
    or cardinality(selected_ids) <> (select count(distinct x) from unnest(selected_ids) x) then
    raise exception 'Select 1 to 500 distinct jobs' using errcode = '22023';
  end if;
  -- Lock in UUID order even though allocation follows collection_sequence.
  perform id from bomedia.jobs where id = any(selected_ids) order by id for update;
  if (select count(*) from bomedia.jobs where id = any(selected_ids) and customer_id = customer)
      <> cardinality(selected_ids) then
    raise exception 'A selected job is missing or belongs to another customer' using errcode = '22023';
  end if;
  insert into bomedia.payments(customer_id, amount_kobo, business_date, occurred_at, method, collected_by, notes)
    values (customer, paid, date_value, now(), payload->>'method', actor, payload->>'notes') returning id into payment;
  remaining := paid;
  for job_row in select j.* from bomedia.jobs j where j.id = any(selected_ids) order by collection_sequence loop
    last_job := job_row.id;
    select greatest(0, job_row.amount_kobo::numeric
      + coalesce((select sum(amount_kobo) from bomedia.job_adjustments where job_id = job_row.id), 0)
      - coalesce((select sum(amount_kobo) from bomedia.payment_allocations where job_id = job_row.id), 0)) into due;
    applied := least(remaining::numeric, due)::bigint;
    if applied > 0 then
      insert into bomedia.payment_allocations(payment_id, job_id, customer_id, amount_kobo, kind)
        values (payment, job_row.id, customer, applied, 'settlement');
      allocations := allocations || jsonb_build_array(jsonb_build_object('job_id', job_row.id, 'kind', 'settlement', 'amount_kobo', applied::text));
      remaining := remaining - applied;
    end if;
  end loop;
  -- Existing business rule: excess is rounding on the last selected job,
  -- never credit silently applied against unrelated jobs.
  if remaining > 0 then
    insert into bomedia.payment_allocations(payment_id, job_id, customer_id, amount_kobo, kind)
      values (payment, last_job, customer, remaining, 'rounding');
    allocations := allocations || jsonb_build_array(jsonb_build_object('job_id', last_job, 'kind', 'rounding', 'amount_kobo', remaining::text));
  end if;
  if (select sum(amount_kobo) from bomedia.payment_allocations where payment_id = payment) <> paid then
    raise exception 'Payment allocations do not reconcile' using errcode = '23514';
  end if;
  result := jsonb_build_object('payment_id', payment, 'amount_kobo', paid::text, 'allocations', allocations);
  insert into bomedia.idempotency_requests(operation, request_key, payload_sha256, actor_id, response)
    values ('payment', request_id, encode(sha256(convert_to(payload::text, 'UTF8')), 'hex'), actor, result);
  insert into bomedia.audit_events(actor_id, action, entity_type, entity_id, details)
    values (actor, 'payment_recorded', 'payment', payment, jsonb_build_object('amount_kobo', paid::text));
  return result;
end $$;

-- Input prices and tiling must be calculated by the future trusted Next.js adapter.
-- This function validates totals and atomically records the resulting operation.
create function bomedia.record_sale(request_id text, payload jsonb) returns jsonb
language plpgsql set search_path = pg_catalog, bomedia as $$
declare
  previous jsonb; result jsonb; customer uuid; actor uuid; order_id_value uuid; date_value date;
  item jsonb; stock jsonb; job_id_value uuid; job_ids jsonb := '[]'::jsonb;
  material uuid; roll uuid; roll_ids uuid[] := '{}'; stock_sum numeric;
  quantity_value numeric; length_value numeric; unit_price bigint; amount_value bigint;
  initial_payment bigint; initial_result jsonb := null;
begin
  previous := bomedia.prior_result('sale', request_id, payload);
  if previous is not null then return previous; end if;
  customer := (payload->>'customer_id')::uuid;
  actor := (payload->>'actor_id')::uuid;
  initial_payment := bomedia.kobo(coalesce(payload->>'initial_payment_kobo', '0'));
  if customer is null or (payload->>'business_date') is null
    or (payload->>'business_date') !~ '^\d{4}-\d{2}-\d{2}$'
    or jsonb_typeof(payload->'jobs') is distinct from 'array' then
    raise exception 'Customer, date and jobs are required' using errcode = '22023';
  end if;
  if jsonb_array_length(payload->'jobs') not between 1 and 500 then
    raise exception 'Expected 1 to 500 jobs' using errcode = '22023';
  end if;
  date_value := (payload->>'business_date')::date;
  for item in select value from jsonb_array_elements(payload->'jobs') loop
    if jsonb_typeof(item) <> 'object' or jsonb_typeof(item->'stock') is distinct from 'array'
      or coalesce(btrim(item->>'description'), '') = '' then
      raise exception 'Each job needs a description and stock array' using errcode = '22023';
    end if;
    if jsonb_array_length(item->'stock') > 500 then
      raise exception 'Too many stock allocations' using errcode = '22023';
    end if;
    for stock in select value from jsonb_array_elements(item->'stock') loop
      roll := (stock->>'roll_id')::uuid;
      if roll is null then raise exception 'Roll ID is required' using errcode = '22023'; end if;
      roll_ids := array_append(roll_ids, roll);
    end loop;
  end loop;
  perform id from bomedia.inventory_rolls where id = any(roll_ids) order by id for update;
  insert into bomedia.orders(customer_id, created_by) values (customer, actor) returning id into order_id_value;
  for item in select value from jsonb_array_elements(payload->'jobs') loop
    material := (item->>'material_id')::uuid;
    quantity_value := bomedia.feet(item->>'quantity');
    unit_price := bomedia.kobo(item->>'unit_price_kobo');
    amount_value := bomedia.kobo(item->>'amount_kobo');
    if quantity_value <= 0 or round(quantity_value * unit_price) <> amount_value then
      raise exception 'Job amount must equal quantity times unit price, rounded to kobo' using errcode = '22023';
    end if;
    if (material is null and jsonb_array_length(item->'stock') <> 0)
      or (material is not null and jsonb_array_length(item->'stock') = 0) then
      raise exception 'Tracked materials require stock allocations' using errcode = '22023';
    end if;
    insert into bomedia.jobs(order_id, customer_id, material_id, description, quantity,
      unit_price_kobo, amount_kobo, job_status, business_date, occurred_at, logged_by,
      width_ft, height_ft, tiled_length_ft)
    values (order_id_value, customer, material, item->>'description', quantity_value,
      unit_price, amount_value, coalesce(item->>'job_status', 'Pending'), date_value, now(), actor,
      case when item->>'width_ft' is not null then bomedia.feet(item->>'width_ft') end,
      case when item->>'height_ft' is not null then bomedia.feet(item->>'height_ft') end,
      case when material is not null then bomedia.feet(item->>'tiled_length_ft') end)
    returning id into job_id_value;
    job_ids := job_ids || jsonb_build_array(job_id_value);
    stock_sum := 0;
    for stock in select value from jsonb_array_elements(item->'stock') loop
      roll := (stock->>'roll_id')::uuid;
      length_value := bomedia.feet(stock->>'length_ft');
      if length_value <= 0 then raise exception 'Stock deduction must be positive' using errcode = '22023'; end if;
      update bomedia.inventory_rolls set remaining_length_ft = remaining_length_ft - length_value,
        status = case when remaining_length_ft - length_value = 0 then 'Out of Stock'
          when remaining_length_ft - length_value <= low_stock_threshold_ft then 'Low Stock' else 'Active' end
        where id = roll and material_id = material and remaining_length_ft >= length_value;
      if not found then
        raise exception 'Insufficient stock, missing roll or mismatched material' using errcode = '23514';
      end if;
      insert into bomedia.inventory_movements(roll_id, job_id, kind, length_delta_ft, reason, business_date, created_by)
        values (roll, job_id_value, 'sale', -length_value, 'Sale consumption', date_value, actor);
      stock_sum := stock_sum + length_value;
    end loop;
    if material is not null and stock_sum <> bomedia.feet(item->>'tiled_length_ft') then
      raise exception 'Stock allocations must match tiled length' using errcode = '23514';
    end if;
  end loop;
  if initial_payment > 0 then
    initial_result := bomedia.record_payment('sale/' || order_id_value::text || '/initial',
      jsonb_build_object('customer_id', customer, 'actor_id', actor, 'business_date', payload->>'business_date',
        'amount_kobo', initial_payment::text, 'job_ids', job_ids, 'method', payload->>'payment_method'));
  end if;
  result := jsonb_build_object('order_id', order_id_value, 'job_ids', job_ids, 'initial_payment', initial_result);
  insert into bomedia.idempotency_requests(operation, request_key, payload_sha256, actor_id, response)
    values ('sale', request_id, encode(sha256(convert_to(payload::text, 'UTF8')), 'hex'), actor, result);
  insert into bomedia.audit_events(actor_id, action, entity_type, entity_id)
    values (actor, 'sale_recorded', 'order', order_id_value);
  return result;
end $$;

-- Named grants will be added only with the authenticated server adapter.
revoke all on all functions in schema bomedia from public;
revoke all on all sequences in schema bomedia from public;
commit;

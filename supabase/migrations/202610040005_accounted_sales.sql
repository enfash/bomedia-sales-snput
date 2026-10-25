-- Inactive server capabilities for explicit customer identity and tracked sales.
begin;
create function bomedia.api_customer(request_id text,payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,bomedia as $$
declare previous jsonb; result jsonb; actor uuid; customer uuid;
begin
  actor:=(payload->>'actor_id')::uuid;
  if not exists(select 1 from bomedia.staff where id=actor and disabled_at is null) then
    raise exception 'Enabled actor required' using errcode='42501'; end if;
  previous:=bomedia.prior_result('api_customer',request_id,payload);
  if previous is not null then return previous; end if;
  perform singleton from bomedia.bookkeeping_settings where singleton and state='active' for update;
  if not found then raise exception 'Active accounting books required' using errcode='23514'; end if;
  if coalesce(length(btrim(payload->>'name')),0) not between 1 and 200
    or length(coalesce(payload->>'contact',''))>200 then
    raise exception 'Customer name and bounded contact required' using errcode='22023'; end if;
  -- Creation is explicit. Matching names are never merged automatically.
  insert into bomedia.customers(display_name,contact) values(btrim(payload->>'name'),nullif(btrim(payload->>'contact'),'')) returning id into customer;
  result:=jsonb_build_object('customer_id',customer);
  insert into bomedia.idempotency_requests(operation,request_key,payload_sha256,actor_id,response)
    values('api_customer',request_id,encode(sha256(convert_to(payload::text,'UTF8')),'hex'),actor,result);
  insert into bomedia.audit_events(actor_id,action,entity_type,entity_id) values(actor,'customer_created','customer',customer);
  return result;
end $$;

create function bomedia.api_sale(request_id text,payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,bomedia as $$
declare previous jsonb; result jsonb; actor uuid; customer bomedia.customers%rowtype;
  mat bomedia.materials%rowtype; roll bomedia.inventory_rolls%rowtype; item jsonb; jobs jsonb:='[]'; stock jsonb;
  remaining_by_roll jsonb:='{}'; costs jsonb:='[]'; journals jsonb:='[]'; lines jsonb; journal jsonb;
  material_ids uuid[]; quantity_value numeric; w numeric; h numeric; length_value numeric; normal_length numeric; rotated_length numeric;
  unit_price bigint; amount_value bigint; total numeric:=0; available numeric; used numeric; need numeric; cost numeric;
  initial_paid bigint; sale jsonb; receipt jsonb:=null; job uuid; idx integer:=0; name_value text;
begin
  actor:=(payload->>'actor_id')::uuid;
  select display_name into name_value from bomedia.staff where id=actor and disabled_at is null;
  if not found then raise exception 'Enabled actor required' using errcode='42501'; end if;
  previous:=bomedia.prior_result('api_sale',request_id,payload);
  if previous is not null then return previous; end if;
  perform singleton from bomedia.bookkeeping_settings where singleton and state='active' for update;
  if not found then raise exception 'Active accounting books required' using errcode='23514'; end if;
  select * into customer from bomedia.customers where id=(payload->>'customer_id')::uuid for share;
  if not found then raise exception 'Select an existing customer identity' using errcode='22023'; end if;
  if jsonb_typeof(payload->'jobs') is distinct from 'array' or jsonb_array_length(payload->'jobs') not between 1 and 100 then
    raise exception 'Select 1 to 100 tracked jobs' using errcode='22023'; end if;
  select array_agg((v->>'material_id')::uuid) into material_ids from jsonb_array_elements(payload->'jobs') v;
  if array_position(material_ids,null) is not null then raise exception 'Every tracked job needs a material' using errcode='22023'; end if;
  -- Shared lock order for financial stock workflows: settings, materials, rolls.
  perform id from bomedia.materials where id=any(material_ids) order by id for update;
  perform id from bomedia.inventory_rolls where material_id=any(material_ids) order by id for update;
  initial_paid:=bomedia.kobo(coalesce(payload->>'initial_payment_kobo','0'));
  for item in select value from jsonb_array_elements(payload->'jobs') loop
    select * into mat from bomedia.materials where id=(item->>'material_id')::uuid;
    if not found then raise exception 'Material not found' using errcode='22023'; end if;
    quantity_value:=bomedia.feet(item->>'quantity'); w:=bomedia.feet(item->>'width_ft'); h:=bomedia.feet(item->>'height_ft');
    if quantity_value not between 1 and 10000 or quantity_value<>trunc(quantity_value) or w<=0 or h<=0
      or coalesce(length(btrim(item->>'description')),0) not between 1 and 1000 then
      raise exception 'Positive dimensions, whole quantity and description required' using errcode='22023'; end if;
    normal_length:=case when w<=mat.width_ft then ceil(quantity_value/floor(mat.width_ft/w))*h end;
    rotated_length:=case when h<=mat.width_ft then ceil(quantity_value/floor(mat.width_ft/h))*w end;
    length_value:=least(normal_length,rotated_length);
    if length_value is null then raise exception 'Job does not fit the roll in either orientation' using errcode='22023'; end if;
    -- Catalog price and tiling are authoritative; the submitted quote is only
    -- an agreement check, so an offline stale price cannot silently change a bill.
    unit_price:=round(w*h*mat.selling_price_per_sqft_kobo)::bigint;
    if unit_price<=0 or unit_price<>bomedia.kobo(item->>'expected_unit_price_kobo') then
      raise exception 'Price changed or is invalid; review this quote before posting' using errcode='22023'; end if;
    amount_value:=(unit_price*quantity_value)::bigint; total:=total+amount_value;
    stock:='[]';need:=length_value;cost:=0;
    for roll in select * from bomedia.inventory_rolls where material_id=mat.id and width_ft=mat.width_ft
      and lower(status) in ('active','low stock') and remaining_length_ft>0
      order by (id=mat.active_roll_id) desc nulls last,legacy_roll_id nulls last,id loop
      available:=coalesce((remaining_by_roll->>roll.id::text)::numeric,roll.remaining_length_ft);
      used:=least(need,available);
      if used>0 then
        if roll.purchase_cost_kobo is null or roll.total_length_ft<=0 then
          raise exception 'Roll cost needs review before accounting consumption' using errcode='23514'; end if;
        -- Per-roll purchase cost: difference of rounded remaining values keeps
        -- partial consumption and final depletion consistent to the last kobo.
        cost:=cost+round(available/roll.total_length_ft*roll.purchase_cost_kobo)
          -round((available-used)/roll.total_length_ft*roll.purchase_cost_kobo);
        stock:=stock||jsonb_build_array(jsonb_build_object('roll_id',roll.id,'length_ft',used::text));
        remaining_by_roll:=jsonb_set(remaining_by_roll,array[roll.id::text],to_jsonb((available-used)::text));
        need:=need-used;
      end if;
      exit when need=0;
    end loop;
    if need>0 then raise exception 'Insufficient eligible stock' using errcode='23514'; end if;
    costs:=costs||jsonb_build_array(cost::text);
    jobs:=jobs||jsonb_build_array(jsonb_build_object('material_id',mat.id,'description',btrim(item->>'description'),
      'quantity',quantity_value::text,'width_ft',w::text,'height_ft',h::text,'tiled_length_ft',length_value::text,
      'unit_price_kobo',unit_price::text,'amount_kobo',amount_value::text,'stock',stock));
  end loop;
  if initial_paid>total then raise exception 'Initial receipt exceeds the sale; explicit customer credit treatment required' using errcode='22023'; end if;
  if (select coalesce(sum((v#>>'{}')::numeric),0) from jsonb_array_elements(costs) v) >
    (select coalesce(sum(l.debit_kobo::numeric-l.credit_kobo),0) from bomedia.journal_lines l join bomedia.journal_entries e on e.id=l.entry_id
      where l.account_code='1200' and e.status='posted' and e.business_date<=(payload->>'business_date')::date) then
    raise exception 'Inventory accounting value needs reconciliation before sale' using errcode='23514'; end if;
  sale:=bomedia.record_sale('accounted-sale/'||encode(sha256(convert_to(request_id,'UTF8')),'hex'),
    jsonb_build_object('actor_id',actor,'customer_id',customer.id,'business_date',payload->>'business_date','jobs',jobs));
  for job in select value::uuid from jsonb_array_elements_text(sale->'job_ids') loop
    item:=jobs->idx;cost:=(costs->>idx)::numeric;
    update bomedia.jobs set client_name_snapshot=customer.display_name,contact_snapshot=customer.contact,
      material_name_snapshot=(select name from bomedia.materials where id=(item->>'material_id')::uuid),
      price_per_sqft_kobo=(select selling_price_per_sqft_kobo from bomedia.materials where id=(item->>'material_id')::uuid),
      logged_by_snapshot=name_value where id=job;
    lines:=jsonb_build_array(jsonb_build_object('account_code','1100','debit_kobo',item->>'amount_kobo','customer_id',customer.id,'job_id',job),
      jsonb_build_object('account_code','4000','credit_kobo',item->>'amount_kobo'));
    if cost>0 then lines:=lines||jsonb_build_array(jsonb_build_object('account_code','5000','debit_kobo',cost::text),
      jsonb_build_object('account_code','1200','credit_kobo',cost::text)); end if;
    journal:=bomedia.post_journal('sale-job/'||job::text,jsonb_build_object('actor_id',actor,'business_date',payload->>'business_date',
      'kind','sale','memo','Sale and material consumption','source_type','job','source_id',job,'lines',lines));
    journals:=journals||jsonb_build_array(journal->>'journal_entry_id');idx:=idx+1;
  end loop;
  if initial_paid>0 then
    receipt:=bomedia.record_accounted_payment('sale-receipt/'||(sale->>'order_id'),jsonb_build_object('actor_id',actor,'customer_id',customer.id,
      'business_date',payload->>'business_date','job_ids',sale->'job_ids','amount_kobo',initial_paid::text,
      'cash_account_code',payload->>'cash_account_code','method',payload->>'payment_method'));
  end if;
  -- Promote an eligible remaining roll and its catalog price for the next sale.
  for mat in select * from bomedia.materials where id=any(material_ids) order by id loop
    select * into roll from bomedia.inventory_rolls where material_id=mat.id and remaining_length_ft>0
      and lower(status) in ('active','low stock') order by (id=mat.active_roll_id) desc nulls last,legacy_roll_id nulls last,id limit 1;
    update bomedia.materials set active_roll_id=case when found then roll.id else null end,
      selling_price_per_sqft_kobo=coalesce(roll.selling_price_kobo,selling_price_per_sqft_kobo) where id=mat.id;
  end loop;
  result:=sale||jsonb_build_object('total_kobo',total::text,'initial_payment',receipt,'journal_entry_ids',journals);
  insert into bomedia.idempotency_requests(operation,request_key,payload_sha256,actor_id,response)
    values('api_sale',request_id,encode(sha256(convert_to(payload::text,'UTF8')),'hex'),actor,result);
  return result;
end $$;
revoke all on function bomedia.api_customer(text,jsonb),bomedia.api_sale(text,jsonb) from public;
grant execute on function bomedia.api_customer(text,jsonb),bomedia.api_sale(text,jsonb) to bomedia_financial_runtime;
commit;

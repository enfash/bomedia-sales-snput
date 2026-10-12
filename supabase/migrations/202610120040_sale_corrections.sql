-- Sale corrections and cancellations (owner request, 12 Oct). A sale is never edited in place or removed: a correction reverses the old
-- money entry and puts the exact stock back on its rolls, then posts the corrected sale; a cancellation reverses everything and the sale
-- stays visible as Cancelled. The old version is kept in `job_revisions` with who, when, why and who approved, and in the audit log.
-- The owner does this directly. A cashier asks (within the days the owner allows) and the owner approves in the Approvals inbox.
begin;

alter table bomedia.jobs add column cancelled_at timestamptz, add column cancelled_by uuid references bomedia.staff(id), add column cancel_reason text;

create table bomedia.job_revisions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references bomedia.jobs(id),
  revision integer not null check (revision >= 1),
  kind text not null check (kind in ('correction', 'cancellation')),
  before jsonb not null,
  after jsonb not null,
  stock_returned jsonb not null default '[]'::jsonb,
  stock_taken jsonb not null default '[]'::jsonb,
  reversed_entry_id uuid references bomedia.journal_entries(id),
  new_entry_id uuid references bomedia.journal_entries(id),
  reason text not null check (btrim(reason) <> '' and length(reason) <= 500),
  changed_by uuid not null references bomedia.staff(id),
  approved_by uuid references bomedia.staff(id),
  approval_request_id uuid references bomedia.approval_requests(id),
  created_at timestamptz not null default now(),
  unique (job_id, revision)
);
create index job_revisions_job on bomedia.job_revisions(job_id, revision desc);
alter table bomedia.job_revisions enable row level security;

alter table bomedia.approval_requests drop constraint approval_requests_operation_check;
alter table bomedia.approval_requests add constraint approval_requests_operation_check check (operation in ('screen_order', 'screen_expense', 'sale_correction'));
-- Until the owner switches this on, only the owner can correct or cancel a sale. `days` is how old a sale may be for a cashier to ask.
insert into bomedia.approval_rules(kind, params) values ('edit_old', '{"days": 7}');

-- The journal guard refuses to reverse an entry that belongs to a job. A correction is the "business reversal" it asks for: allowed only
-- while the correction function has switched on a transaction-local flag, and the exact-offset check still applies.
do $$
declare definition text; needle text;
begin
  definition := pg_get_functiondef('bomedia.guard_journal_entry()'::regprocedure);
  needle := $t$      if not found or original.status <> 'posted' or original.source_type is not null
        or exists (select 1 from bomedia.journal_lines where entry_id = original.id and job_id is not null) then$t$;
  if strpos(definition, needle) = 0 then raise exception 'Journal reversal guard changed'; end if;
  definition := replace(definition, needle, $t$      if not found or original.status <> 'posted'
        or (coalesce(current_setting('bomedia.business_reversal', true), '') <> 'on' and (original.source_type is not null
          or exists (select 1 from bomedia.journal_lines where entry_id = original.id and job_id is not null))) then$t$);
  execute definition;
end $$;

-- The sale journal that is still in force for a job (the latest one nobody has reversed).
create function bomedia.job_current_entry(job_value uuid) returns uuid
language sql stable security definer set search_path = pg_catalog, bomedia as $$
  select e.id from bomedia.journal_entries e
  where e.kind = 'sale' and e.status = 'posted'
    and exists (select 1 from bomedia.journal_lines l where l.entry_id = e.id and l.job_id = job_value and l.account_code = '1100')
    and not exists (select 1 from bomedia.journal_entries r where r.reverses_entry_id = e.id)
  order by e.created_at desc, e.id limit 1
$$;

-- What this job still holds out of stock: its sales less anything already put back, per roll.
create function bomedia.job_stock_net(job_value uuid) returns table(roll_id uuid, length_ft numeric)
language sql stable security definer set search_path = pg_catalog, bomedia as $$
  select m.roll_id, -sum(m.length_delta_ft) from bomedia.inventory_movements m
  where m.job_id = job_value and m.kind in ('sale', 'reversal') group by m.roll_id having sum(m.length_delta_ft) < 0
$$;

-- Takes `need` feet of a material from its rolls the way a sale does (active roll first), costing each roll exactly. `extra` adds length
-- to named rolls first (stock a correction is about to put back), so a plan can be checked without changing anything.
create function bomedia.draw_stock(material_value uuid, need_value numeric, extra jsonb) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, bomedia as $$
declare mat bomedia.materials%rowtype; roll bomedia.inventory_rolls%rowtype; available numeric; used numeric; need numeric := need_value;
  cost numeric := 0; stock jsonb := '[]';
begin
  select * into mat from bomedia.materials where id = material_value;
  if not found then raise exception 'Material not found' using errcode = '22023'; end if;
  for roll in select * from bomedia.inventory_rolls where material_id = mat.id and width_ft = mat.width_ft
    and ((lower(status) in ('active', 'low stock') and remaining_length_ft > 0) or coalesce((extra ->> id::text)::numeric, 0) > 0)
    order by (id = mat.active_roll_id) desc nulls last, legacy_roll_id nulls last, id loop
    available := roll.remaining_length_ft + coalesce((extra ->> roll.id::text)::numeric, 0);
    used := least(need, available);
    if used > 0 then
      if roll.purchase_cost_kobo is null or roll.total_length_ft <= 0 then raise exception 'Roll cost needs review before accounting consumption' using errcode = '23514'; end if;
      cost := cost + round(available / roll.total_length_ft * roll.purchase_cost_kobo) - round((available - used) / roll.total_length_ft * roll.purchase_cost_kobo);
      stock := stock || jsonb_build_array(jsonb_build_object('roll_id', roll.id, 'roll', roll.item_name, 'length_ft', trim_scale(used)::text));
      need := need - used;
    end if;
    exit when need = 0;
  end loop;
  return jsonb_build_object('stock', stock, 'cost_kobo', cost::bigint::text, 'missing_ft', need::text);
end $$;

-- What a change would do, in plain figures, without doing it. `change`: {mode: 'correct' | 'cancel', description, quantity, width, height,
-- unit, priceKobo (per sq ft), materialId, businessDate}. Fields left out stay as they are.
create function bomedia.plan_job_change(job_value uuid, change jsonb) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, bomedia as $$
declare j bomedia.jobs%rowtype; o bomedia.orders%rowtype; mat bomedia.materials%rowtype; oldmat bomedia.materials%rowtype; mode_value text := change ->> 'mode';
  net jsonb; returns jsonb := '[]'; new_desc text; new_date date; qty numeric; w numeric; h numeric; ppsf bigint; unit_price bigint; amount bigint;
  normal_length numeric; rotated_length numeric; length_value numeric; draw jsonb; extra jsonb := '{}'; r record; paid bigint; before jsonb; after jsonb;
  sales_ref text;
begin
  select * into j from bomedia.jobs where id = job_value;
  if not found then raise exception 'That sale could not be found' using errcode = 'P0002'; end if;
  if j.cancelled_at is not null then raise exception 'This sale is already cancelled' using errcode = '22023'; end if;
  select * into o from bomedia.orders where id = j.order_id;
  sales_ref := coalesce(o.legacy_sales_id, o.reference);
  select * into oldmat from bomedia.materials where id = j.material_id;
  select coalesce(sum(a.amount_kobo), 0) into paid from bomedia.payment_allocations a where a.job_id = j.id;
  for r in select * from bomedia.job_stock_net(j.id) loop
    returns := returns || jsonb_build_array(jsonb_build_object('roll_id', r.roll_id, 'roll', (select item_name from bomedia.inventory_rolls where id = r.roll_id), 'length_ft', trim_scale(r.length_ft)::text));
    extra := extra || jsonb_build_object(r.roll_id::text, r.length_ft);
  end loop;
  before := jsonb_build_object('description', j.description, 'quantity', trim_scale(j.quantity)::text, 'width_ft', trim_scale(j.width_ft)::text, 'height_ft', trim_scale(j.height_ft)::text,
    'price_per_sqft_kobo', j.price_per_sqft_kobo::text, 'amount_kobo', j.amount_kobo::text, 'material', coalesce(j.material_name_snapshot, oldmat.name), 'material_id', j.material_id,
    'business_date', j.business_date, 'status', j.job_status);
  if mode_value = 'cancel' then
    after := jsonb_build_object('description', j.description, 'amount_kobo', '0', 'status', 'Cancelled');
    return jsonb_build_object('mode', 'cancel', 'job_id', j.id, 'sales_id', sales_ref, 'client', j.client_name_snapshot, 'before', before, 'after', after,
      'returns', returns, 'takes', '[]'::jsonb, 'old_amount_kobo', j.amount_kobo::text, 'new_amount_kobo', '0', 'paid_kobo', paid::text, 'cost_kobo', '0');
  elsif mode_value is distinct from 'correct' then
    raise exception 'Choose correct or cancel' using errcode = '22023';
  end if;

  new_desc := btrim(coalesce(change ->> 'description', j.description));
  if length(new_desc) not between 1 and 1000 then raise exception 'Describe the job in up to 1000 characters' using errcode = '22023'; end if;
  new_date := case when change ? 'businessDate' then bomedia.check_business_date(change ->> 'businessDate') else j.business_date end;
  qty := case when change ? 'quantity' then bomedia.feet(change ->> 'quantity') else j.quantity end;
  if qty not between 1 and 10000 or qty <> trunc(qty) then raise exception 'Quantity must be a whole number' using errcode = '22023'; end if;

  if j.service_id is not null then
    unit_price := j.unit_price_kobo; amount := (unit_price * qty)::bigint;
    after := jsonb_build_object('description', new_desc, 'quantity', qty::text, 'amount_kobo', amount::text, 'business_date', new_date);
    return jsonb_build_object('mode', 'correct', 'job_id', j.id, 'sales_id', sales_ref, 'client', j.client_name_snapshot, 'before', before, 'after', after,
      'returns', '[]'::jsonb, 'takes', '[]'::jsonb, 'old_amount_kobo', j.amount_kobo::text, 'new_amount_kobo', amount::text, 'paid_kobo', paid::text, 'cost_kobo', '0');
  end if;

  select * into mat from bomedia.materials where id = case when change ? 'materialId' then (change ->> 'materialId')::uuid else j.material_id end;
  if not found then raise exception 'Material not found' using errcode = '22023'; end if;
  w := j.width_ft; h := j.height_ft;
  if change ? 'width' or change ? 'height' then
    if coalesce(change ->> 'unit', 'ft') not in ('ft', 'in') then raise exception 'Choose feet or inches' using errcode = '22023'; end if;
    if change ? 'width' then w := bomedia.feet(change ->> 'width'); if change ->> 'unit' = 'in' then w := round(w / 12, 6); end if; end if;
    if change ? 'height' then h := bomedia.feet(change ->> 'height'); if change ->> 'unit' = 'in' then h := round(h / 12, 6); end if; end if;
  end if;
  if w is null or h is null or w <= 0 or h <= 0 then raise exception 'Positive dimensions are required' using errcode = '22023'; end if;
  ppsf := case when change ? 'priceKobo' then bomedia.kobo(change ->> 'priceKobo') else coalesce(j.price_per_sqft_kobo, mat.selling_price_per_sqft_kobo) end;
  normal_length := case when w <= mat.width_ft then ceil(qty / floor(mat.width_ft / w)) * h end;
  rotated_length := case when h <= mat.width_ft then ceil(qty / floor(mat.width_ft / h)) * w end;
  length_value := least(normal_length, rotated_length);
  if length_value is null then raise exception 'Job does not fit the roll in either orientation' using errcode = '22023'; end if;
  unit_price := round(w * h * ppsf)::bigint;
  if unit_price <= 0 then raise exception 'A positive price is required' using errcode = '22023'; end if;
  amount := (unit_price * qty)::bigint;
  -- Stock the sale holds comes back first, so only the difference has to exist on the shelf.
  draw := bomedia.draw_stock(mat.id, length_value, case when j.material_id = mat.id then extra else '{}'::jsonb end);
  if (draw ->> 'missing_ft')::numeric > 0 then
    raise exception 'Not enough % in stock for this change: % ft short', mat.name, trim_scale((draw ->> 'missing_ft')::numeric) using errcode = '22023'; end if;
  after := jsonb_build_object('description', new_desc, 'quantity', qty::text, 'width_ft', trim_scale(w)::text, 'height_ft', trim_scale(h)::text,
    'price_per_sqft_kobo', ppsf::text, 'amount_kobo', amount::text, 'material', mat.name, 'material_id', mat.id, 'business_date', new_date);
  return jsonb_build_object('mode', 'correct', 'job_id', j.id, 'sales_id', sales_ref, 'client', j.client_name_snapshot, 'before', before, 'after', after,
    'returns', returns, 'takes', draw -> 'stock', 'old_amount_kobo', j.amount_kobo::text, 'new_amount_kobo', amount::text, 'paid_kobo', paid::text,
    'cost_kobo', draw ->> 'cost_kobo', 'tiled_length_ft', length_value::text, 'unit_price_kobo', unit_price::text);
end $$;

-- Does the correction. The caller has already decided it may (owner, or an approved request).
create function bomedia.apply_job_change(job_value uuid, change jsonb, actor uuid, approver uuid, request_value uuid, reason_value text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, bomedia as $$
declare plan jsonb; j bomedia.jobs%rowtype; entry uuid; original bomedia.journal_entries%rowtype; lines_value jsonb; rev uuid := gen_random_uuid();
  revision_no integer; r record; s jsonb; roll bomedia.inventory_rolls%rowtype; mat bomedia.materials%rowtype; draw jsonb; new_entry jsonb; today_value date := (now() at time zone 'Africa/Lagos')::date;
  amount bigint; cost bigint; kind_value text; sale_lines jsonb; mat_ids uuid[]; changed text[] := '{}'; typed bigint; listed bigint;
begin
  perform singleton from bomedia.bookkeeping_settings where singleton and state = 'active' for update;
  if not found then raise exception 'Active accounting books required' using errcode = '23514'; end if;
  select * into j from bomedia.jobs where id = job_value for update;
  if not found then raise exception 'That sale could not be found' using errcode = 'P0002'; end if;
  plan := bomedia.plan_job_change(job_value, change);
  kind_value := case when plan ->> 'mode' = 'cancel' then 'cancellation' else 'correction' end;
  select coalesce(array_agg(distinct m), '{}') into mat_ids from (select j.material_id as m union select (plan -> 'after' ->> 'material_id')::uuid) x where m is not null;
  perform id from bomedia.materials where id = any(mat_ids) order by id for update;
  perform id from bomedia.inventory_rolls where material_id = any(mat_ids) order by id for update;
  select coalesce(max(revision), 0) + 1 into revision_no from bomedia.job_revisions where job_id = job_value;
  insert into bomedia.job_revisions(id, job_id, revision, kind, before, after, stock_returned, stock_taken, reason, changed_by, approved_by, approval_request_id)
    values (rev, job_value, revision_no, kind_value, plan -> 'before', plan -> 'after', plan -> 'returns', plan -> 'takes', btrim(reason_value), actor, approver, request_value);

  -- 1. Reverse the money the sale posted, line for line, on the sale's own date.
  entry := bomedia.job_current_entry(job_value);
  if entry is not null then
    select * into original from bomedia.journal_entries where id = entry;
    select jsonb_agg(jsonb_build_object('account_code', account_code, 'debit_kobo', credit_kobo::text, 'credit_kobo', debit_kobo::text, 'customer_id', customer_id, 'job_id', job_id) order by line_number)
      into lines_value from bomedia.journal_lines where entry_id = entry;
    perform set_config('bomedia.business_reversal', 'on', true);
    perform bomedia.post_journal('sale-correction-reverse/' || rev::text, jsonb_build_object('actor_id', actor, 'business_date', original.business_date, 'kind', 'reversal',
      'memo', 'Sale ' || kind_value || ': ' || btrim(reason_value), 'reverses_entry_id', entry, 'lines', lines_value));
    perform set_config('bomedia.business_reversal', 'off', true);
    update bomedia.job_revisions set reversed_entry_id = (select id from bomedia.journal_entries where reverses_entry_id = entry) where id = rev;
  end if;

  -- 2. Put the stock back on the rolls it came from.
  for r in select * from bomedia.job_stock_net(job_value) loop
    select * into roll from bomedia.inventory_rolls where id = r.roll_id;
    update bomedia.inventory_rolls set remaining_length_ft = remaining_length_ft + r.length_ft,
      status = case when remaining_length_ft + r.length_ft = 0 then 'Out of Stock' when remaining_length_ft + r.length_ft <= low_stock_threshold_ft then 'Low Stock' else 'Active' end
      where id = r.roll_id;
    insert into bomedia.inventory_movements(roll_id, job_id, kind, length_delta_ft, reason, business_date, created_by)
      values (r.roll_id, job_value, 'reversal', r.length_ft, 'Sale ' || kind_value, today_value, actor);
  end loop;

  if kind_value = 'cancellation' then
    update bomedia.jobs set amount_kobo = 0, unit_price_kobo = 0, job_status = 'Cancelled', cancelled_at = now(), cancelled_by = actor, cancel_reason = btrim(reason_value) where id = job_value;
  else
    amount := (plan ->> 'new_amount_kobo')::bigint; cost := coalesce((plan ->> 'cost_kobo')::bigint, 0);
    -- 3. Take what the corrected sale needs.
    for s in select value from jsonb_array_elements(plan -> 'takes') loop
      update bomedia.inventory_rolls set remaining_length_ft = remaining_length_ft - (s ->> 'length_ft')::numeric,
        status = case when remaining_length_ft - (s ->> 'length_ft')::numeric = 0 then 'Out of Stock' when remaining_length_ft - (s ->> 'length_ft')::numeric <= low_stock_threshold_ft then 'Low Stock' else 'Active' end
        where id = (s ->> 'roll_id')::uuid and remaining_length_ft >= (s ->> 'length_ft')::numeric;
      if not found then raise exception 'Not enough stock for this change; refresh and try again' using errcode = '22023'; end if;
      insert into bomedia.inventory_movements(roll_id, job_id, kind, length_delta_ft, reason, business_date, created_by)
        values ((s ->> 'roll_id')::uuid, job_value, 'sale', -(s ->> 'length_ft')::numeric, 'Sale consumption (corrected)', (plan -> 'after' ->> 'business_date')::date, actor);
    end loop;
    if j.service_id is not null then
      update bomedia.jobs set description = plan -> 'after' ->> 'description', quantity = (plan -> 'after' ->> 'quantity')::numeric, amount_kobo = amount,
        business_date = (plan -> 'after' ->> 'business_date')::date where id = job_value;
    else
      select * into mat from bomedia.materials where id = (plan -> 'after' ->> 'material_id')::uuid;
      update bomedia.jobs set description = plan -> 'after' ->> 'description', quantity = (plan -> 'after' ->> 'quantity')::numeric,
        width_ft = (plan -> 'after' ->> 'width_ft')::numeric, height_ft = (plan -> 'after' ->> 'height_ft')::numeric,
        tiled_length_ft = (plan ->> 'tiled_length_ft')::numeric, unit_price_kobo = (plan ->> 'unit_price_kobo')::bigint, amount_kobo = amount,
        price_per_sqft_kobo = (plan -> 'after' ->> 'price_per_sqft_kobo')::bigint, material_id = mat.id, material_name_snapshot = mat.name,
        legacy_size_values = '{}'::jsonb, business_date = (plan -> 'after' ->> 'business_date')::date where id = job_value;
      listed := mat.selling_price_per_sqft_kobo; typed := (plan -> 'after' ->> 'price_per_sqft_kobo')::bigint;
      if typed <> listed then
        insert into bomedia.sale_reviews(job_id, kind, details, created_by) values (job_value, 'price', jsonb_build_object('typed_per_sqft_kobo', typed, 'list_per_sqft_kobo', listed), actor)
          on conflict (job_id, kind) do update set details = excluded.details, reviewed_at = null, reviewed_by = null;
      end if;
    end if;
    -- 4. Post the corrected sale.
    if amount > 0 then
      sale_lines := jsonb_build_array(jsonb_build_object('account_code', '1100', 'debit_kobo', amount::text, 'customer_id', j.customer_id, 'job_id', job_value),
        jsonb_build_object('account_code', '4000', 'credit_kobo', amount::text));
      if cost > 0 then sale_lines := sale_lines || jsonb_build_array(jsonb_build_object('account_code', '5000', 'debit_kobo', cost::text), jsonb_build_object('account_code', '1200', 'credit_kobo', cost::text)); end if;
      new_entry := bomedia.post_journal('sale-correction-post/' || rev::text, jsonb_build_object('actor_id', actor, 'business_date', plan -> 'after' ->> 'business_date', 'kind', 'sale',
        'memo', 'Corrected sale and material consumption', 'source_type', 'job_revision', 'source_id', rev, 'lines', sale_lines));
      update bomedia.job_revisions set new_entry_id = (new_entry ->> 'journal_entry_id')::uuid where id = rev;
    end if;
  end if;

  -- Keep the next sale pointed at a roll that still has stock.
  for mat in select * from bomedia.materials where id = any(mat_ids) order by id loop
    select * into roll from bomedia.inventory_rolls where material_id = mat.id and remaining_length_ft > 0 and lower(status) in ('active', 'low stock')
      order by (id = mat.active_roll_id) desc nulls last, legacy_roll_id nulls last, id limit 1;
    update bomedia.materials set active_roll_id = case when found then roll.id else null end where id = mat.id;
  end loop;

  select array_agg(k order by k) into changed from (select k from jsonb_object_keys(plan -> 'after') k where (plan -> 'after') -> k is distinct from (plan -> 'before') -> k) x;
  insert into bomedia.audit_events(actor_id, action, entity_type, entity_id, details)
    values (actor, case when kind_value = 'cancellation' then 'sale_cancelled' else 'sale_corrected' end, 'job', job_value,
      jsonb_build_object('sales_id', plan ->> 'sales_id', 'client', plan ->> 'client', 'description', plan -> 'before' ->> 'description', 'fields', to_jsonb(coalesce(changed, '{}')),
        'approved_by', approver, 'reason', btrim(reason_value)));
  return jsonb_build_object('job_id', job_value, 'sales_id', plan ->> 'sales_id', 'revision', revision_no, 'kind', kind_value, 'new_amount_kobo', plan ->> 'new_amount_kobo',
    'old_amount_kobo', plan ->> 'old_amount_kobo');
end $$;

create or replace function bomedia.audit_category(action_value text) returns text
language sql immutable set search_path = pg_catalog as $$
  select case
    when action_value in ('staff_login','staff_logout') then 'signins'
    when action_value like 'staff\_%' then 'staff'
    when action_value like 'approval\_%' then 'approvals'
    when action_value in ('sale_recorded','payment_recorded','quote_saved','customer_created','customer_updated','sale_corrected','sale_cancelled')
      or action_value like 'price\_%' or action_value like 'job\_%' then 'sales'
    when action_value like 'expense\_%' then 'expenses'
    when action_value like 'stock\_%' or action_value like 'waste\_%' then 'stock'
    when action_value in ('business_details_saved','payment_method_saved','service_saved','services_reordered','books_closed',
      'material_price_changed','material_renamed','material_added','material_size_added','material_size_saved') then 'settings'
    else 'other' end
$$;

-- The owner can set how many days back a cashier may ask for a correction (and switch cashier requests on), like the other rules.
create or replace function bomedia.api_approval_rule_save(request_id text, payload jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, bomedia as $$
declare previous jsonb; result jsonb; actor uuid; kind_value text; new_params jsonb; days_value numeric; percent_value numeric; amount_value numeric;
begin
  if jsonb_typeof(payload) is distinct from 'object' then raise exception 'A rule is required' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_object_keys(payload) k where k not in ('actor_id', 'kind', 'enabled', 'params')) then
    raise exception 'Unexpected rule field' using errcode = '22023'; end if;
  actor := (payload ->> 'actor_id')::uuid;
  if not exists (select 1 from bomedia.staff where id = actor and disabled_at is null) then
    raise exception 'An enabled staff member is required' using errcode = '42501'; end if;
  previous := bomedia.prior_result('api_approval_rule_save', request_id, payload);
  if previous is not null then return previous; end if;
  kind_value := payload ->> 'kind';
  if not exists (select 1 from bomedia.approval_rules where kind = kind_value) then raise exception 'Choose a rule that exists' using errcode = '22023'; end if;
  if jsonb_typeof(payload -> 'enabled') is distinct from 'boolean' or jsonb_typeof(payload -> 'params') is distinct from 'object' then
    raise exception 'Switch the rule on or off and give its limit' using errcode = '22023'; end if;
  if kind_value = 'date' then
    days_value := (payload -> 'params' ->> 'days')::numeric;
    if days_value is null or days_value <> trunc(days_value) or days_value not between 0 and 30 then raise exception 'Days of grace must be 0 to 30' using errcode = '22023'; end if;
    new_params := jsonb_build_object('days', days_value::integer);
  elsif kind_value = 'price' then
    percent_value := (payload -> 'params' ->> 'percent')::numeric;
    if percent_value is null or percent_value not between 0 and 100 then raise exception 'The price tolerance must be 0 to 100 percent' using errcode = '22023'; end if;
    new_params := jsonb_build_object('percent', percent_value);
  elsif kind_value = 'expense_limit' then
    amount_value := (payload -> 'params' ->> 'amount_kobo')::numeric;
    if amount_value is null or amount_value <> trunc(amount_value) or amount_value not between 100 and 1000000000000 then
      raise exception 'The expense limit must be at least ₦1 and a whole number of kobo' using errcode = '22023'; end if;
    new_params := jsonb_build_object('amount_kobo', amount_value::bigint);
  elsif kind_value = 'edit_old' then
    days_value := (payload -> 'params' ->> 'days')::numeric;
    if days_value is null or days_value <> trunc(days_value) or days_value not between 1 and 90 then raise exception 'Choose 1 to 90 days' using errcode = '22023'; end if;
    new_params := jsonb_build_object('days', days_value::integer);
  else raise exception 'This rule cannot be changed yet' using errcode = '22023'; end if;
  update bomedia.approval_rules set enabled = (payload ->> 'enabled')::boolean, params = new_params, updated_by = actor, updated_at = now() where kind = kind_value;
  result := jsonb_build_object('kind', kind_value, 'enabled', (payload ->> 'enabled')::boolean, 'params', new_params);
  insert into bomedia.idempotency_requests(operation, request_key, payload_sha256, actor_id, response)
    values ('api_approval_rule_save', request_id, encode(sha256(convert_to(payload::text, 'UTF8')), 'hex'), actor, result);
  insert into bomedia.audit_events(actor_id, action, entity_type, details)
    values (actor, 'approval_rule_saved', 'approval_rule', jsonb_build_object('kind', kind_value, 'enabled', (payload ->> 'enabled')::boolean, 'params', new_params));
  return result;
end $$;

-- Which jobs a request is about: the one job to correct, or every live job of the sale to cancel.
create function bomedia.correction_job_ids(payload jsonb) returns uuid[]
language plpgsql stable security definer set search_path = pg_catalog, bomedia as $$
declare job_ids uuid[];
begin
  if payload ->> 'mode' = 'correct' then
    if coalesce(payload ->> 'jobId', '') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'Choose the job to correct' using errcode = '22023'; end if;
    return array[(payload ->> 'jobId')::uuid];
  elsif payload ->> 'mode' = 'cancel' then
    select array_agg(j.id order by j.collection_sequence nulls last, j.id) into job_ids from bomedia.jobs j join bomedia.orders o on o.id = j.order_id
      where (o.legacy_sales_id = payload ->> 'salesId' or o.reference = payload ->> 'salesId') and j.cancelled_at is null;
    if job_ids is null then raise exception 'That sale could not be found or is already cancelled' using errcode = 'P0002'; end if;
    return job_ids;
  end if;
  raise exception 'Choose correct or cancel' using errcode = '22023';
end $$;

-- What a request would do, without doing it, so the screen can show the money and stock effect before anything is sent.
create function bomedia.api_sale_correction_preview(payload jsonb) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, bomedia as $$
declare change jsonb; job uuid; plans jsonb := '[]';
begin
  if jsonb_typeof(payload) is distinct from 'object' then raise exception 'A correction is required' using errcode = '22023'; end if;
  change := coalesce(payload -> 'changes', '{}'::jsonb) || jsonb_build_object('mode', payload ->> 'mode');
  if exists (select 1 from jsonb_object_keys(change) k where k not in ('mode', 'description', 'quantity', 'width', 'height', 'unit', 'priceKobo', 'materialId', 'businessDate')) then
    raise exception 'Unexpected change field' using errcode = '22023'; end if;
  foreach job in array bomedia.correction_job_ids(payload) loop
    plans := plans || jsonb_build_array(bomedia.plan_job_change(job, change));
  end loop;
  return jsonb_build_object('plans', plans);
end $$;

-- Everything that was changed on a sale, newest first: who, when, why, who approved, and what it was before.
create function bomedia.api_sale_history(sales_value text) returns jsonb
language sql stable security definer set search_path = pg_catalog, bomedia as $$
  select coalesce(jsonb_agg(jsonb_build_object('at', r.created_at, 'kind', r.kind, 'revision', r.revision, 'job', r.before ->> 'description', 'reason', r.reason,
    'by', (select display_name from bomedia.staff where id = r.changed_by), 'approved_by', (select display_name from bomedia.staff where id = r.approved_by),
    'before', r.before, 'after', r.after, 'stock_returned', r.stock_returned, 'stock_taken', r.stock_taken) order by r.created_at desc, r.revision desc), '[]'::jsonb)
  from bomedia.job_revisions r join bomedia.jobs j on j.id = r.job_id join bomedia.orders o on o.id = j.order_id
  where o.reference = sales_value or o.legacy_sales_id = sales_value
$$;

-- Ask to correct one job of a sale (`jobId`, `changes`) or cancel a whole sale (`salesId`). The owner's own change is applied at once; a cashier's
-- is held for the owner (only when the owner has switched cashier requests on, and only for a sale newer than the days allowed).
create function bomedia.api_sale_correction(request_id text, payload jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, bomedia as $$
declare clean jsonb; by_owner boolean; actor uuid; previous jsonb; mode_value text; reason text; change jsonb; job_ids uuid[]; job uuid; plans jsonb := '[]'; plan jsonb;
  rule bomedia.approval_rules%rowtype; today_value date := (now() at time zone 'Africa/Lagos')::date; days_value integer; req bomedia.approval_requests%rowtype;
  digest text; applied jsonb := '[]'; approver uuid; request_ref uuid; result jsonb; sales_ref text; client_name text; kind_value text; total_new bigint := 0;
begin
  if jsonb_typeof(payload) is distinct from 'object' then raise exception 'A correction is required' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_object_keys(payload) k where k not in ('actor_id', 'mode', 'jobId', 'salesId', 'changes', 'reason', 'byOwner')) then
    raise exception 'Unexpected correction field' using errcode = '22023'; end if;
  by_owner := coalesce(payload ->> 'byOwner' = 'true', false);
  clean := payload - 'byOwner';
  actor := (payload ->> 'actor_id')::uuid;
  if not exists (select 1 from bomedia.staff where id = actor and disabled_at is null) then raise exception 'An enabled staff member is required' using errcode = '42501'; end if;
  previous := bomedia.prior_result('sale_correction', request_id, clean);
  if previous is not null then return previous; end if;
  mode_value := payload ->> 'mode';
  reason := btrim(coalesce(payload ->> 'reason', ''));
  if mode_value not in ('correct', 'cancel') then raise exception 'Choose correct or cancel' using errcode = '22023'; end if;
  if reason = '' or length(reason) > 500 then raise exception 'Say why, in up to 500 characters' using errcode = '22023'; end if;
  change := coalesce(payload -> 'changes', '{}'::jsonb) || jsonb_build_object('mode', mode_value);
  if jsonb_typeof(change) is distinct from 'object' then raise exception 'Changes must be an object' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_object_keys(change) k where k not in ('mode', 'description', 'quantity', 'width', 'height', 'unit', 'priceKobo', 'materialId', 'businessDate')) then
    raise exception 'Unexpected change field' using errcode = '22023'; end if;

  job_ids := bomedia.correction_job_ids(payload);
  foreach job in array job_ids loop
    plan := bomedia.plan_job_change(job, change);
    plans := plans || jsonb_build_array(plan);
    total_new := total_new + (plan ->> 'new_amount_kobo')::bigint;
  end loop;
  sales_ref := plans -> 0 ->> 'sales_id'; client_name := plans -> 0 ->> 'client';
  kind_value := case when mode_value = 'cancel' then 'cancellation' else 'correction' end;

  select * into req from bomedia.approval_requests where operation = 'sale_correction' and request_key = request_id;
  if found and req.status = 'approved' then approver := req.decided_by; request_ref := req.id;
  elsif not by_owner then
    select * into rule from bomedia.approval_rules where kind = 'edit_old';
    if not found or not rule.enabled then raise exception 'Only the owner can correct or cancel a sale' using errcode = '22023'; end if;
    days_value := coalesce((rule.params ->> 'days')::integer, 7);
    foreach job in array job_ids loop
      if (select business_date from bomedia.jobs where id = job) < today_value - days_value then
        raise exception 'This sale is more than % days old. Ask the owner to change it.', days_value using errcode = '22023'; end if;
    end loop;
    digest := encode(sha256(convert_to(clean::text, 'UTF8')), 'hex');
    perform pg_advisory_xact_lock(hashtextextended('approval:sale_correction:' || request_id, 0));
    select * into req from bomedia.approval_requests where operation = 'sale_correction' and request_key = request_id for update;
    if found then
      if req.payload_sha256 <> digest then raise exception 'This request ID was already used for different values' using errcode = '22023'; end if;
      return bomedia.approval_answer(req);
    end if;
    insert into bomedia.approval_requests(operation, request_key, payload, payload_sha256, kinds, changes, summary, reason, requested_by)
      values ('sale_correction', request_id, clean, digest, array[kind_value], plans,
        jsonb_build_object('kind', kind_value, 'sales_id', sales_ref, 'client', client_name, 'total_kobo', total_new::text, 'jobs', jsonb_array_length(plans)), reason, actor)
      returning * into req;
    insert into bomedia.audit_events(actor_id, action, entity_type, entity_id, details)
      values (actor, 'approval_requested', 'approval_request', req.id, jsonb_build_object('kinds', to_jsonb(array[kind_value]), 'operation', 'sale_correction', 'sales_id', sales_ref));
    return bomedia.approval_answer(req);
  else approver := null;
  end if;

  foreach job in array job_ids loop
    applied := applied || jsonb_build_array(bomedia.apply_job_change(job, change, actor, approver, request_ref, reason));
  end loop;
  result := jsonb_build_object('status', 'applied', 'kind', kind_value, 'sales_id', sales_ref, 'jobs', applied, 'request_id', request_id);
  insert into bomedia.idempotency_requests(operation, request_key, payload_sha256, actor_id, response)
    values ('sale_correction', request_id, encode(sha256(convert_to(clean::text, 'UTF8')), 'hex'), actor, result);
  return result;
end $$;

-- Approving now also applies a held sale correction.
create or replace function bomedia.api_approval_decision(request_id text, payload jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, bomedia as $$
#variable_conflict use_variable
declare previous jsonb; result jsonb; actor uuid; req bomedia.approval_requests%rowtype; posted jsonb; failure text; note_value text;
begin
  if jsonb_typeof(payload) is distinct from 'object' then raise exception 'A decision is required' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_object_keys(payload) k where k not in ('actor_id', 'approval_request_id', 'decision', 'note')) then
    raise exception 'Unexpected decision field' using errcode = '22023'; end if;
  actor := (payload ->> 'actor_id')::uuid;
  if not exists (select 1 from bomedia.staff where id = actor and disabled_at is null) then
    raise exception 'An enabled staff member is required' using errcode = '42501'; end if;
  previous := bomedia.prior_result('api_approval_decision', request_id, payload);
  if previous is not null then return previous; end if;
  note_value := nullif(btrim(coalesce(payload ->> 'note', '')), '');
  if payload ->> 'decision' not in ('approve', 'decline') or length(coalesce(note_value, '')) > 500 then
    raise exception 'Approve or decline, with a short note' using errcode = '22023'; end if;
  select * into req from bomedia.approval_requests where id = (payload ->> 'approval_request_id')::uuid for update;
  if not found then raise exception 'This request no longer exists' using errcode = '22023'; end if;
  if req.status <> 'pending' then raise exception 'This request has already been decided' using errcode = '22023'; end if;
  if req.expires_at < now() then
    update bomedia.approval_requests set status = 'expired' where id = req.id;
    raise exception 'This request has expired. Ask the cashier to enter it again.' using errcode = '22023';
  end if;

  if payload ->> 'decision' = 'decline' then
    update bomedia.approval_requests set status = 'declined', decided_by = actor, decided_at = now(), decision_note = note_value where id = req.id;
    result := jsonb_build_object('approval_request_id', req.id, 'status', 'declined');
  else
    -- Posting happens inside a sub-transaction: if the books refuse it (closed month, stock, a receipt, a price that moved) nothing is half done,
    -- the request stays pending with the reason, and the owner can decline it.
    begin
      update bomedia.approval_requests set status = 'approved', decided_by = actor, decided_at = now(), decision_note = note_value, last_error = null where id = req.id;
      if req.operation = 'screen_expense' then posted := bomedia.api_screen_expense(req.request_key, req.payload);
      elsif req.operation = 'sale_correction' then posted := bomedia.api_sale_correction(req.request_key, req.payload);
      else posted := bomedia.api_screen_order(req.request_key, req.payload); end if;
      update bomedia.approval_requests set result = posted where id = req.id;
    exception when others then
      failure := sqlerrm;
    end;
    if failure is not null then
      update bomedia.approval_requests set last_error = failure where id = req.id;
      return jsonb_build_object('approval_request_id', req.id, 'status', 'failed', 'error', failure);
    end if;
    result := jsonb_build_object('approval_request_id', req.id, 'status', 'approved', 'sales_id', posted ->> 'sales_id',
      'references', case when req.operation = 'screen_expense' then (select coalesce(jsonb_agg(e ->> 'reference'), '[]'::jsonb) from jsonb_array_elements(posted -> 'expenses') e) else null end);
  end if;
  insert into bomedia.idempotency_requests(operation, request_key, payload_sha256, actor_id, response)
    values ('api_approval_decision', request_id, encode(sha256(convert_to(payload::text, 'UTF8')), 'hex'), actor, result);
  insert into bomedia.audit_events(actor_id, action, entity_type, entity_id, details)
    values (actor, 'approval_' || (result ->> 'status'), 'approval_request', req.id,
      jsonb_build_object('kinds', to_jsonb(req.kinds), 'requested_by', req.requested_by, 'operation', req.operation));
  return result;
end $$;

revoke all on function bomedia.job_current_entry(uuid), bomedia.job_stock_net(uuid), bomedia.draw_stock(uuid, numeric, jsonb), bomedia.plan_job_change(uuid, jsonb),
  bomedia.apply_job_change(uuid, jsonb, uuid, uuid, uuid, text), bomedia.correction_job_ids(jsonb), bomedia.api_sale_correction(text, jsonb),
  bomedia.api_sale_correction_preview(jsonb), bomedia.api_sale_history(text) from public;
grant execute on function bomedia.api_sale_correction(text, jsonb), bomedia.api_sale_correction_preview(jsonb), bomedia.api_sale_history(text) to bomedia_financial_runtime;
commit;

-- Review repairs. Local verification only; apply through the approved cutover process.
begin;

create or replace function bomedia.api_screen_order(request_id text, payload jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, bomedia as $$
declare previous jsonb; clean jsonb; by_owner boolean; reason text; changes jsonb; req bomedia.approval_requests%rowtype; digest text; actor uuid; kinds_value text[];
begin
  -- Anything malformed goes straight to the order function, which raises its own plain error.
  if jsonb_typeof(payload) is distinct from 'object' or request_id is null or btrim(request_id) = '' or length(request_id) > 200
     or coalesce(payload ->> 'actor_id', '') !~ '^[0-9a-fA-F-]{36}$' then
    return bomedia.screen_order_before_approvals(request_id, payload);
  end if;
  by_owner := coalesce(payload -> 'by_owner' = 'true'::jsonb, false);
  reason := nullif(btrim(coalesce(payload ->> 'approvalReason', '')), '');
  clean := payload - 'by_owner' - 'approvalReason';

  perform pg_advisory_xact_lock(hashtextextended('approval:screen_order:' || request_id, 0));
  previous := bomedia.prior_result('screen_order', request_id, clean);
  if previous is not null then return previous; end if;
  actor := (clean ->> 'actor_id')::uuid;
  if not exists (select 1 from bomedia.staff where id = actor and disabled_at is null) then
    raise exception 'An enabled staff member is required' using errcode = '42501'; end if;
  digest := encode(sha256(convert_to(clean::text, 'UTF8')), 'hex');
  select * into req from bomedia.approval_requests where operation = 'screen_order' and request_key = request_id for update;
  if found then
    if req.payload_sha256 <> digest then raise exception 'This request ID was already used for different values' using errcode = '22023'; end if;
    if req.status = 'approved' then return bomedia.screen_order_before_approvals(request_id, clean); end if;
    return bomedia.approval_answer(req);
  end if;
  changes := bomedia.approval_changes(clean);
  if by_owner or jsonb_array_length(changes) = 0 then return bomedia.screen_order_before_approvals(request_id, clean); end if;
  if reason is null then raise exception 'Add a reason for the owner' using errcode = '22023'; end if;
  select array_agg(distinct c ->> 'kind' order by c ->> 'kind') into kinds_value from jsonb_array_elements(changes) c;
  insert into bomedia.approval_requests(operation, request_key, payload, payload_sha256, kinds, changes, summary, reason, requested_by)
    values ('screen_order', request_id, clean, digest, kinds_value, changes,
      jsonb_build_object('client', clean ->> 'clientName', 'total_kobo', clean ->> 'totalKobo',
        'items', case when jsonb_typeof(clean -> 'items') = 'array' then (select coalesce(jsonb_agg(i ->> 'description'), '[]') from jsonb_array_elements(clean -> 'items') i) else '[]'::jsonb end),
      reason, actor)
    returning * into req;
  insert into bomedia.audit_events(actor_id, action, entity_type, entity_id, details)
    values (actor, 'approval_requested', 'approval_request', req.id, jsonb_build_object('kinds', to_jsonb(kinds_value)));
  return bomedia.approval_answer(req);
end $$;

create or replace function bomedia.api_screen_expense(request_id text, payload jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, bomedia as $$
declare clean jsonb; by_owner boolean; reason text; changes jsonb; req bomedia.approval_requests%rowtype; digest text; actor uuid; kinds_value text[]; previous jsonb;
begin
  -- Anything malformed goes straight to the expense function, which raises its own plain error.
  if jsonb_typeof(payload) is distinct from 'object' or request_id is null or btrim(request_id) = '' or length(request_id) > 200
     or coalesce(payload ->> 'actor_id', '') !~ '^[0-9a-fA-F-]{36}$' then
    return bomedia.screen_expense_before_approvals(request_id, payload);
  end if;
  by_owner := coalesce(payload ->> 'byOwner' = 'true', false);
  reason := nullif(btrim(coalesce(payload ->> 'approvalReason', '')), '');
  clean := payload - 'approvalReason';
  -- An expense already posted under this key is simply answered again, whatever the rule says now.
  perform pg_advisory_xact_lock(hashtextextended('approval:screen_expense:' || request_id, 0));
  previous := bomedia.prior_result('api_screen_expense', request_id, clean);
  if previous is not null then return previous; end if;

  actor := (clean ->> 'actor_id')::uuid;
  if not exists (select 1 from bomedia.staff where id = actor and disabled_at is null) then
    raise exception 'An enabled staff member is required' using errcode = '42501'; end if;
  digest := encode(sha256(convert_to(clean::text, 'UTF8')), 'hex');
  select * into req from bomedia.approval_requests where operation = 'screen_expense' and request_key = request_id for update;
  if found then
    if req.payload_sha256 <> digest then raise exception 'This request ID was already used for different values' using errcode = '22023'; end if;
    if req.status = 'approved' then return bomedia.screen_expense_before_approvals(request_id, clean); end if;
    return bomedia.approval_answer(req);
  end if;
  changes := bomedia.expense_changes(clean);
  if by_owner or jsonb_array_length(changes) = 0 then return bomedia.screen_expense_before_approvals(request_id, clean); end if;
  if reason is null then raise exception 'Add a reason for the owner' using errcode = '22023'; end if;
  select array_agg(distinct c ->> 'kind' order by c ->> 'kind') into kinds_value from jsonb_array_elements(changes) c;
  insert into bomedia.approval_requests(operation, request_key, payload, payload_sha256, kinds, changes, summary, reason, requested_by)
    values ('screen_expense', request_id, clean, digest, kinds_value, changes,
      jsonb_build_object('kind', 'expense',
        'total_kobo', (select coalesce(sum((i ->> 'amountKobo')::bigint), 0)::text from jsonb_array_elements(clean -> 'items') i where i ->> 'amountKobo' ~ '^[0-9]{1,15}$'),
        'items', (select coalesce(jsonb_agg(jsonb_build_object('category', i ->> 'category', 'description', i ->> 'description', 'paid_to', i ->> 'paidTo',
          'amount_kobo', i ->> 'amountKobo', 'status', i ->> 'status')), '[]'::jsonb) from jsonb_array_elements(clean -> 'items') i)),
      reason, actor)
    returning * into req;
  insert into bomedia.audit_events(actor_id, action, entity_type, entity_id, details)
    values (actor, 'approval_requested', 'approval_request', req.id, jsonb_build_object('kinds', to_jsonb(kinds_value), 'operation', 'screen_expense'));
  return bomedia.approval_answer(req);
end $$;

create or replace function bomedia.plan_job_change(job_value uuid, change jsonb) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, bomedia as $$
declare j bomedia.jobs%rowtype; o bomedia.orders%rowtype; mat bomedia.materials%rowtype; oldmat bomedia.materials%rowtype; mode_value text := change ->> 'mode';
  net jsonb; returns jsonb := '[]'; new_desc text; new_date date; qty numeric; w numeric; h numeric; ppsf bigint; unit_price bigint; amount bigint;
  normal_length numeric; rotated_length numeric; length_value numeric; draw jsonb; extra jsonb := '{}'; r record; paid bigint; before jsonb; after jsonb;
  sales_ref text;
begin
  select * into j from bomedia.jobs where id = job_value;
  if not found then raise exception 'That sale could not be found' using errcode = 'P0002'; end if;
  if j.cancelled_at is not null then raise exception 'This sale is already cancelled' using errcode = '22023'; end if;
  if (j.amount_kobo > 0 or exists (select 1 from bomedia.journal_lines l join bomedia.journal_entries e on e.id=l.entry_id where l.job_id=j.id and l.account_code='1100' and e.kind='opening' and e.status='posted')) and bomedia.job_current_entry(j.id) is null then
    raise exception 'Historical sale needs an opening-balance adjustment; normal correction or cancellation is unavailable' using errcode = '22023';
  end if;
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

-- One object-level read boundary; owner identity is supplied only by the trusted server.
create function bomedia.api_expense_detail(action_value text, payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,bomedia as $$
declare e bomedia.expenses%rowtype; actor uuid := (payload->>'actor_id')::uuid;
begin
  if not exists(select 1 from bomedia.staff where id=actor and disabled_at is null) then raise exception 'Sign in again' using errcode='42501'; end if;
  select * into e from bomedia.expenses where reference=payload->>'reference';
  if not found or (coalesce(payload->>'by_owner','false') <> 'true' and
    (e.logged_by is distinct from actor or e.business_date is distinct from (now() at time zone 'Africa/Lagos')::date)) then
    raise exception 'Expense is not available to this account' using errcode='42501'; end if;
  if action_value='history' then return bomedia.api_expense_history(e.reference); end if;
  if action_value='preview' then return bomedia.api_expense_correction_preview(payload - 'actor_id' - 'by_owner'); end if;
  raise exception 'Unknown expense read' using errcode='22023';
end $$;
revoke all on function bomedia.api_expense_detail(text,jsonb) from public;
grant execute on function bomedia.api_expense_detail(text,jsonb) to bomedia_financial_runtime;
revoke execute on function bomedia.api_expense_history(text), bomedia.api_expense_correction_preview(jsonb) from bomedia_financial_runtime;

create or replace function bomedia.api_receipt(action_value text,payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,bomedia as $$
declare actor uuid; target bomedia.receipt_uploads%rowtype;
begin
  actor:=(payload->>'actor_id')::uuid;
  if not exists(select 1 from bomedia.staff where id=actor and disabled_at is null) then raise exception 'Enabled staff required' using errcode='42501'; end if;
  if action_value='reserve' then
    perform pg_advisory_xact_lock(hashtextextended(actor::text||'/'||(payload->>'request_id'),0));
    select * into target from bomedia.receipt_uploads where actor_id=actor and request_id=(payload->>'request_id')::uuid;
    if found then
      if target.sha256<>payload->>'sha256' or target.byte_size<>(payload->>'byte_size')::int or target.mime_type<>payload->>'mime_type' then
        raise exception 'Receipt retry changed; preserve the original upload' using errcode='22023'; end if;
    else
      insert into bomedia.receipt_uploads(actor_id,request_id,sha256,file_id,mime_type,byte_size)
        values(actor,(payload->>'request_id')::uuid,payload->>'sha256',payload->>'file_id',payload->>'mime_type',(payload->>'byte_size')::int) returning * into target;
    end if;
  elsif action_value in ('read','ready') then
    select * into target from bomedia.receipt_uploads where id=(payload->>'receipt_id')::uuid for update;
    if not found or (action_value='ready' and target.actor_id<>actor)
      or (action_value='read' and coalesce(payload->>'by_owner','false')<>'true' and (
        (target.expense_id is null and target.actor_id<>actor) or
        (target.expense_id is not null and not exists(select 1 from bomedia.expenses e where e.id=target.expense_id
          and e.logged_by=actor and e.business_date=(now() at time zone 'Africa/Lagos')::date)))) then
      raise exception 'Receipt not available' using errcode='42501'; end if;
    if action_value='ready' then update bomedia.receipt_uploads set ready=true where id=target.id returning * into target; end if;
  else raise exception 'Unknown receipt action' using errcode='22023'; end if;
  return to_jsonb(target);
end $$;

alter table bomedia.notification_outbox add column delivered_target_ids uuid[] not null default '{}';

create or replace function bomedia.api_push_claim(owner_value uuid, batch_value integer) returns jsonb
language plpgsql security definer set search_path = pg_catalog, bomedia as $$
declare r bomedia.notification_outbox%rowtype; target uuid; targets jsonb; result jsonb := '[]';
begin
  for r in select * from bomedia.notification_outbox where sent_at is null and attempts < 5 and (claimed_at is null or claimed_at < now() - interval '2 minutes')
    order by created_at limit least(greatest(coalesce(batch_value, 20), 1), 100) for update skip locked loop
    target := case when r.audience = 'owner' then owner_value else r.recipient_staff_id end;
    update bomedia.notification_outbox set attempts = attempts + 1, claimed_at = now() where id = r.id;
    select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb) into targets
      from bomedia.push_subscriptions s join bomedia.staff st on st.id = s.staff_id
      where not (s.id = any(r.delivered_target_ids)) and s.staff_id = target and st.disabled_at is null and target is distinct from r.actor_staff_id
        and not exists (select 1 from bomedia.notification_preferences p where p.staff_id = s.staff_id and p.kind = r.kind and not p.enabled);
    if jsonb_array_length(targets) = 0 then
      update bomedia.notification_outbox set sent_at = now() where id = r.id;   -- nobody to tell: done
    else
      result := result || jsonb_build_array(jsonb_build_object('id', r.id, 'title', r.title, 'body', r.body, 'url', r.url, 'kind', r.kind, 'targets', targets));
    end if;
  end loop;
  return result;
end $$;

create or replace function bomedia.api_push_report(results jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, bomedia as $$
declare item jsonb; gone_id text;
begin
  if jsonb_typeof(results) is distinct from 'array' then raise exception 'Results are required' using errcode = '22023'; end if;
  for item in select value from jsonb_array_elements(results) loop
    for gone_id in select value from jsonb_array_elements_text(coalesce(item -> 'gone', '[]'::jsonb)) loop
      delete from bomedia.push_subscriptions where id = gone_id::uuid;
    end loop;
    update bomedia.push_subscriptions set last_used_at = now(), last_error = null where id in (select value::uuid from jsonb_array_elements_text(coalesce(item -> 'delivered_to', '[]'::jsonb)));
    update bomedia.notification_outbox set delivered_target_ids = array(select distinct unnest(delivered_target_ids || array(select value::uuid from jsonb_array_elements_text(coalesce(item->'delivered_to','[]'::jsonb))))) where id=(item->>'id')::uuid;
    if coalesce(item ->> 'error', '') = '' then
      update bomedia.notification_outbox set sent_at = now(), last_error = null where id = (item ->> 'id')::uuid;
    else
      update bomedia.notification_outbox set last_error = left(item ->> 'error', 500), claimed_at = null where id = (item ->> 'id')::uuid;
    end if;
  end loop;
  return jsonb_build_object('reported', jsonb_array_length(results));
end $$;

create or replace function bomedia.api_push_subscribe(request_id text, payload jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, bomedia as $$
declare actor uuid; sub_id uuid;
begin
  if jsonb_typeof(payload) is distinct from 'object' then raise exception 'A phone is required' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_object_keys(payload) k where k not in ('actor_id', 'endpoint', 'p256dh', 'auth', 'label')) then
    raise exception 'Unexpected phone field' using errcode = '22023'; end if;
  actor := (payload ->> 'actor_id')::uuid;
  if not exists (select 1 from bomedia.staff where id = actor and disabled_at is null) then raise exception 'An enabled staff member is required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('push-subscriptions:' || actor::text,0));
  if not exists(select 1 from bomedia.push_subscriptions where staff_id=actor and endpoint=payload->>'endpoint') and
    (select count(*) from bomedia.push_subscriptions where staff_id=actor)>=5 then
    raise exception 'Remove an old phone before adding another (maximum 5)' using errcode='22023'; end if;
  insert into bomedia.push_subscriptions(staff_id, endpoint, p256dh, auth, label)
    values (actor, payload ->> 'endpoint', payload ->> 'p256dh', payload ->> 'auth', left(coalesce(nullif(btrim(payload ->> 'label'), ''), 'Phone'), 100))
    on conflict (endpoint) do update set staff_id = excluded.staff_id, p256dh = excluded.p256dh, auth = excluded.auth, label = excluded.label, last_error = null
    returning id into sub_id;
  return jsonb_build_object('id', sub_id, 'subscribed', true);
end $$;

create table bomedia.push_test_limits(staff_id uuid primary key references bomedia.staff(id), last_sent_at timestamptz not null);
alter table bomedia.push_test_limits enable row level security;
revoke all on bomedia.push_test_limits from public;

create or replace function bomedia.api_push_test(request_id text, payload jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, bomedia as $$
declare actor uuid; phones integer; home text;
begin
  if jsonb_typeof(payload) is distinct from 'object' or exists (select 1 from jsonb_object_keys(payload) k where k not in ('actor_id', 'url')) then
    raise exception 'Choose who to test' using errcode = '22023'; end if;
  actor := (payload ->> 'actor_id')::uuid;
  if not exists (select 1 from bomedia.staff where id = actor and disabled_at is null) then raise exception 'An enabled staff member is required' using errcode = '42501'; end if;
  select count(*)::integer into phones from bomedia.push_subscriptions where staff_id = actor;
  if phones = 0 then raise exception 'Turn on alerts for a phone first' using errcode = '22023'; end if;
  insert into bomedia.push_test_limits values(actor,clock_timestamp()) on conflict(staff_id) do update set last_sent_at=excluded.last_sent_at
    where bomedia.push_test_limits.last_sent_at < clock_timestamp()-interval '30 seconds';
  if not found then raise exception 'Wait 30 seconds before another test alert' using errcode='22023'; end if;
  home := case when payload ->> 'url' like '/%' then left(payload ->> 'url', 200) else '/' end;
  insert into bomedia.notification_outbox(kind, audience, recipient_staff_id, title, body, url)
    values ('test', 'staff', actor, 'Phone alerts are on', 'This is a test alert from BOMedia.', home);
  return jsonb_build_object('queued', phones);
end $$;


-- Shift totals use original cash movements, never the mutable face amount/status of an expense or sale.
create function bomedia.api_shift_report(date_value text, payload jsonb) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,bomedia as $$
declare actor uuid := (payload->>'actor_id')::uuid; viewer uuid; day_value date := date_value::date;
  sales jsonb; receipts jsonb; spending jsonb; staff_list jsonb;
begin
  if not exists(select 1 from bomedia.staff where id=actor and disabled_at is null) then raise exception 'Sign in again' using errcode='42501'; end if;
  viewer := case when payload->>'by_owner'='true' then null else actor end;
  select coalesce(jsonb_agg(r.row || jsonb_build_object('_staffId',j.logged_by::text) order by j.collection_sequence),'[]') into sales
    from jsonb_array_elements(bomedia.api_legacy_feed('sales')) r(row) join bomedia.jobs j on j.id::text=r.row->>'_jobId'
    where j.business_date=day_value and j.cancelled_at is null and (viewer is null or j.logged_by=viewer);
  select coalesce(jsonb_agg(jsonb_build_object('DATE',p.business_date::text,'AMOUNT',bomedia.naira_text(p.amount_kobo),
    '_amountKobo',p.amount_kobo::text,'_method',coalesce((select case l.account_code when '1000' then 'cash' when '1010' then 'transfer' when '1020' then 'pos' else 'other' end
      from bomedia.journal_entries e join bomedia.journal_lines l on l.entry_id=e.id join bomedia.ledger_accounts a on a.code=l.account_code
      where e.source_type='payment' and e.source_id=p.id and e.status='posted' and e.kind<>'reversal' and a.purpose='cash_bank' limit 1),lower(p.method)),
    'PAYMENT METHOD',p.method,'COLLECTED BY',coalesce(st.display_name,p.collected_by_snapshot,''),
    '_staffId',p.collected_by::text) order by p.created_at,p.id),'[]') into receipts
    from bomedia.payments p left join bomedia.staff st on st.id=p.collected_by
    where p.business_date=day_value and (viewer is null or p.collected_by=viewer);
  select coalesce(jsonb_agg(jsonb_build_object('DATE',e.business_date::text,'AMOUNT',bomedia.naira_text(l.credit_kobo-l.debit_kobo),
    '_amountKobo',(l.credit_kobo-l.debit_kobo)::text,'_method',case l.account_code when '1000' then 'cash' when '1010' then 'transfer' when '1020' then 'pos' else 'other' end,'PAYMENT METHOD',case l.account_code when '1000' then 'Cash' when '1010' then 'Transfer' when '1020' then 'POS' else a.name end,
    'CATEGORY',case when e.source_type='expense_recovery' then 'Expense recovery' else coalesce(x.category,'Expense') end,
    'DESCRIPTION',e.memo,'LOGGED BY',coalesce(st.display_name,''),'_staffId',e.created_by::text) order by e.created_at,e.id,l.line_number),'[]') into spending
    from bomedia.journal_entries e join bomedia.journal_lines l on l.entry_id=e.id join bomedia.ledger_accounts a on a.code=l.account_code
      left join bomedia.expenses x on x.id=e.source_id left join bomedia.staff st on st.id=e.created_by
    where e.status='posted' and e.kind<>'reversal' and e.source_type in ('expense','expense_payment','expense_recovery') and a.purpose='cash_bank'
      and e.business_date=day_value and (viewer is null or e.created_by=viewer);
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',display_name) order by display_name,id),'[]') into staff_list
    from bomedia.staff where viewer is null or id=viewer;
  return jsonb_build_object('sales',sales,'payments',receipts,'expenses',spending,'staff',staff_list,'date',day_value::text);
end $$;
revoke all on function bomedia.api_shift_report(text,jsonb) from public;
grant execute on function bomedia.api_shift_report(text,jsonb) to bomedia_financial_runtime;

do $$
declare definition text; needle text := 'select * into req from bomedia.approval_requests where id = (payload ->> ''approval_request_id'')::uuid for update;';
begin
  definition := pg_get_functiondef('bomedia.api_approval_decision(text,jsonb)'::regprocedure);
  if strpos(definition,needle)=0 then raise exception 'Approval decision function changed'; end if;
  definition := replace(definition,needle,
    'select * into req from bomedia.approval_requests where id = (payload ->> ''approval_request_id'')::uuid;
     if found and req.operation in (''screen_order'',''screen_expense'') then
       perform pg_advisory_xact_lock(hashtextextended(''approval:'' || req.operation || '':'' || req.request_key,0));
     end if;
     ' || needle);
  execute definition;
end $$;

commit;

-- Owner approvals. A cashier's sale that breaks a rule the owner switched on (a date other than today, a print price away from the list
-- price) is held as a request instead of being posted. Nothing is recorded until the owner approves; approving posts exactly what was held,
-- through the same path as any sale. Rules start switched off, so nothing changes until the owner turns one on.
-- The owner's own entries are never held: the server marks them (`by_owner`), the same way owner-only screens are checked in the API layer.
begin;

create table bomedia.approval_rules (
  kind text primary key check (kind in ('date', 'price', 'expense_limit', 'edit_old')),
  enabled boolean not null default false,
  params jsonb not null default '{}'::jsonb check (jsonb_typeof(params) = 'object'),
  updated_by uuid references bomedia.staff(id),
  updated_at timestamptz not null default now()
);
-- Only these two are evaluated so far; the other kinds are added with their own stage.
insert into bomedia.approval_rules(kind, params) values ('date', '{"days": 0}'), ('price', '{"percent": 0}');

create table bomedia.approval_requests (
  id uuid primary key default gen_random_uuid(),
  operation text not null check (operation in ('screen_order')),
  request_key text not null check (btrim(request_key) <> '' and length(request_key) <= 200),
  payload jsonb not null,
  payload_sha256 text not null,
  kinds text[] not null check (cardinality(kinds) >= 1),
  changes jsonb not null,
  summary jsonb not null default '{}'::jsonb,
  reason text not null check (btrim(reason) <> '' and length(reason) <= 500),
  requested_by uuid not null references bomedia.staff(id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'expired')),
  decided_by uuid references bomedia.staff(id),
  decided_at timestamptz,
  decision_note text check (decision_note is null or length(decision_note) <= 500),
  result jsonb,
  last_error text,
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now(),
  unique (operation, request_key)
);
create index approval_requests_pending on bomedia.approval_requests (created_at desc) where status = 'pending';
create index approval_requests_requester on bomedia.approval_requests (requested_by, created_at desc);

-- What breaks a rule in this sale, as plain facts for the owner. Empty when nothing does or the rule is off.
create function bomedia.approval_changes(clean jsonb) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, bomedia as $$
declare out jsonb := '[]'; rule bomedia.approval_rules%rowtype; today_value date := (now() at time zone 'Africa/Lagos')::date; asked date;
  grace integer; item jsonb; mat bomedia.materials%rowtype; typed bigint; list_price bigint; tolerance numeric;
begin
  if jsonb_typeof(clean) is distinct from 'object' or clean ->> 'operation' is distinct from 'sale' then return out; end if;

  select * into rule from bomedia.approval_rules where kind = 'date';
  if found and rule.enabled and coalesce(clean ->> 'businessDate', '') ~ '^\d{4}-\d{2}-\d{2}$' then
    begin asked := (clean ->> 'businessDate')::date; exception when others then asked := null; end;
    grace := coalesce((rule.params ->> 'days')::integer, 0);
    if asked is not null and abs(asked - today_value) > grace then
      out := out || jsonb_build_array(jsonb_build_object('kind', 'date', 'normal', today_value, 'asked', asked, 'days_off', asked - today_value));
    end if;
  end if;

  select * into rule from bomedia.approval_rules where kind = 'price';
  if found and rule.enabled and jsonb_typeof(clean -> 'items') = 'array' then
    tolerance := coalesce((rule.params ->> 'percent')::numeric, 0);
    for item in select value from jsonb_array_elements(clean -> 'items') loop
      if jsonb_typeof(item) is distinct from 'object' or item ->> 'kind' is distinct from 'print' then continue; end if;
      if coalesce(item ->> 'priceKobo', '') !~ '^[1-9][0-9]{0,18}$' then continue; end if;
      select * into mat from bomedia.materials
        where id::text = item ->> 'ref' or bomedia.material_code(legacy_material_id, name, width_ft) = item ->> 'ref' limit 1;
      if not found then continue; end if;
      typed := (item ->> 'priceKobo')::bigint;
      list_price := mat.selling_price_per_sqft_kobo;
      if list_price > 0 and abs(typed - list_price) * 100 > tolerance * list_price then
        out := out || jsonb_build_array(jsonb_build_object('kind', 'price', 'item', item ->> 'description', 'material', mat.name,
          'list_per_sqft_kobo', list_price::text, 'typed_per_sqft_kobo', typed::text,
          'percent_off', round((typed - list_price) * 100.0 / list_price, 1)));
      end if;
    end loop;
  end if;
  return out;
end $$;

create function bomedia.approval_answer(req bomedia.approval_requests) returns jsonb
language sql immutable set search_path = pg_catalog as $$
  select jsonb_build_object('status', case req.status when 'pending' then 'awaiting_approval' else req.status end,
    'approval_request_id', req.id, 'kinds', to_jsonb(req.kinds), 'request_id', req.request_key, 'decision_note', req.decision_note)
$$;

-- The old order function keeps all its rules; it is only reachable through the gate below.
alter function bomedia.api_screen_order(text, jsonb) rename to screen_order_before_approvals;
revoke all on function bomedia.screen_order_before_approvals(text, jsonb) from public, bomedia_financial_runtime;

create function bomedia.api_screen_order(request_id text, payload jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, bomedia as $$
declare clean jsonb; by_owner boolean; reason text; changes jsonb; req bomedia.approval_requests%rowtype; digest text; actor uuid; kinds_value text[];
begin
  -- Anything malformed goes straight to the order function, which raises its own plain error.
  if jsonb_typeof(payload) is distinct from 'object' or request_id is null or btrim(request_id) = '' or length(request_id) > 200
     or coalesce(payload ->> 'actor_id', '') !~ '^[0-9a-fA-F-]{36}$' then
    return bomedia.screen_order_before_approvals(request_id, payload);
  end if;
  by_owner := coalesce(payload -> 'by_owner' = 'true'::jsonb, false);
  reason := nullif(btrim(coalesce(payload ->> 'approvalReason', '')), '');
  clean := payload - 'by_owner' - 'approvalReason';
  changes := bomedia.approval_changes(clean);
  if by_owner or jsonb_array_length(changes) = 0 then return bomedia.screen_order_before_approvals(request_id, clean); end if;

  actor := (clean ->> 'actor_id')::uuid;
  if not exists (select 1 from bomedia.staff where id = actor and disabled_at is null) then
    raise exception 'An enabled staff member is required' using errcode = '42501'; end if;
  digest := encode(sha256(convert_to(clean::text, 'UTF8')), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('approval:screen_order:' || request_id, 0));
  select * into req from bomedia.approval_requests where operation = 'screen_order' and request_key = request_id for update;
  if found then
    if req.payload_sha256 <> digest then raise exception 'This request ID was already used for different values' using errcode = '22023'; end if;
    if req.status = 'approved' then return bomedia.screen_order_before_approvals(request_id, clean); end if;
    return bomedia.approval_answer(req);
  end if;
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

create function bomedia.api_approval_rules() returns jsonb
language sql stable security definer set search_path = pg_catalog, bomedia as $$
  select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'enabled', enabled, 'params', params) order by kind), '[]') from bomedia.approval_rules
$$;

create function bomedia.api_approval_rule_save(request_id text, payload jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, bomedia as $$
declare previous jsonb; result jsonb; actor uuid; kind_value text; new_params jsonb; days_value numeric; percent_value numeric;
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
  else raise exception 'This rule cannot be changed yet' using errcode = '22023'; end if;
  update bomedia.approval_rules set enabled = (payload ->> 'enabled')::boolean, params = new_params, updated_by = actor, updated_at = now() where kind = kind_value;
  result := jsonb_build_object('kind', kind_value, 'enabled', (payload ->> 'enabled')::boolean, 'params', new_params);
  insert into bomedia.idempotency_requests(operation, request_key, payload_sha256, actor_id, response)
    values ('api_approval_rule_save', request_id, encode(sha256(convert_to(payload::text, 'UTF8')), 'hex'), actor, result);
  insert into bomedia.audit_events(actor_id, action, entity_type, details)
    values (actor, 'approval_rule_saved', 'approval_rule', jsonb_build_object('kind', kind_value, 'enabled', (payload ->> 'enabled')::boolean, 'params', new_params));
  return result;
end $$;

create function bomedia.approval_row(r bomedia.approval_requests) returns jsonb
language sql stable security definer set search_path = pg_catalog, bomedia as $$
  select jsonb_build_object('id', r.id, 'status', case when r.status = 'pending' and r.expires_at < now() then 'expired' else r.status end,
    'kinds', to_jsonb(r.kinds), 'changes', r.changes, 'summary', r.summary, 'reason', r.reason,
    'requested_by', (select display_name from bomedia.staff where id = r.requested_by), 'requested_by_id', r.requested_by,
    'created_at', r.created_at, 'expires_at', r.expires_at, 'decided_at', r.decided_at,
    'decided_by', (select display_name from bomedia.staff where id = r.decided_by), 'decision_note', r.decision_note, 'last_error', r.last_error,
    'sales_id', r.result ->> 'sales_id')
$$;

-- Owner list: what is waiting, then the last 30 days of decisions.
create function bomedia.api_approvals() returns jsonb
language sql stable security definer set search_path = pg_catalog, bomedia as $$
  select jsonb_build_object(
    'pending_count', (select count(*) from bomedia.approval_requests where status = 'pending' and expires_at >= now()),
    'data', coalesce((select jsonb_agg(bomedia.approval_row(r) order by (r.status = 'pending' and r.expires_at >= now()) desc, r.created_at desc)
      from (select * from bomedia.approval_requests where status = 'pending' or created_at > now() - interval '30 days' order by created_at desc limit 200) r), '[]'))
$$;

-- A staff member's own requests, so they can see what is waiting and what was decided.
create function bomedia.api_my_approvals(actor_value text) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, bomedia as $$
declare actor uuid;
begin
  if coalesce(actor_value, '') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'An enabled staff member is required' using errcode = '42501'; end if;
  actor := actor_value::uuid;
  if not exists (select 1 from bomedia.staff where id = actor and disabled_at is null) then raise exception 'An enabled staff member is required' using errcode = '42501'; end if;
  return jsonb_build_object('data', coalesce((select jsonb_agg(bomedia.approval_row(r) order by r.created_at desc)
    from (select * from bomedia.approval_requests where requested_by = actor and (status = 'pending' or created_at > now() - interval '30 days') order by created_at desc limit 100) r), '[]'));
end $$;

create function bomedia.api_approval_decision(request_id text, payload jsonb) returns jsonb
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
    -- Posting happens inside a sub-transaction: if the books refuse it (closed month, stock, a price that moved) nothing is half done,
    -- the request stays pending with the reason, and the owner can decline it.
    begin
      update bomedia.approval_requests set status = 'approved', decided_by = actor, decided_at = now(), decision_note = note_value, last_error = null where id = req.id;
      posted := bomedia.api_screen_order(req.request_key, req.payload);
      update bomedia.approval_requests set result = posted where id = req.id;
    exception when others then
      failure := sqlerrm;
    end;
    if failure is not null then
      update bomedia.approval_requests set last_error = failure where id = req.id;
      return jsonb_build_object('approval_request_id', req.id, 'status', 'failed', 'error', failure);
    end if;
    result := jsonb_build_object('approval_request_id', req.id, 'status', 'approved', 'sales_id', posted ->> 'sales_id');
  end if;
  insert into bomedia.idempotency_requests(operation, request_key, payload_sha256, actor_id, response)
    values ('api_approval_decision', request_id, encode(sha256(convert_to(payload::text, 'UTF8')), 'hex'), actor, result);
  insert into bomedia.audit_events(actor_id, action, entity_type, entity_id, details)
    values (actor, 'approval_' || (result ->> 'status'), 'approval_request', req.id, jsonb_build_object('kinds', to_jsonb(req.kinds), 'requested_by', req.requested_by));
  return result;
end $$;

-- Same rule as before, plus the new actions under their own heading.
create or replace function bomedia.audit_category(action_value text) returns text
language sql immutable set search_path = pg_catalog as $$
  select case
    when action_value in ('staff_login','staff_logout') then 'signins'
    when action_value like 'staff\_%' then 'staff'
    when action_value like 'approval\_%' then 'approvals'
    when action_value in ('sale_recorded','payment_recorded','quote_saved','customer_created')
      or action_value like 'price\_%' or action_value like 'job\_%' then 'sales'
    when action_value like 'expense\_%' then 'expenses'
    when action_value like 'stock\_%' or action_value like 'waste\_%' then 'stock'
    when action_value in ('business_details_saved','payment_method_saved','service_saved','services_reordered','books_closed',
      'material_price_changed','material_renamed','material_added','material_size_added','material_size_saved') then 'settings'
    else 'other' end
$$;

alter table bomedia.approval_rules enable row level security;
alter table bomedia.approval_requests enable row level security;

revoke all on function bomedia.approval_changes(jsonb), bomedia.approval_answer(bomedia.approval_requests), bomedia.approval_row(bomedia.approval_requests),
  bomedia.api_screen_order(text, jsonb), bomedia.api_approval_rules(), bomedia.api_approval_rule_save(text, jsonb), bomedia.api_approvals(),
  bomedia.api_my_approvals(text), bomedia.api_approval_decision(text, jsonb) from public;
grant execute on function bomedia.api_screen_order(text, jsonb), bomedia.api_approval_rules(), bomedia.api_approval_rule_save(text, jsonb), bomedia.api_approvals(),
  bomedia.api_my_approvals(text), bomedia.api_approval_decision(text, jsonb) to bomedia_financial_runtime;
commit;

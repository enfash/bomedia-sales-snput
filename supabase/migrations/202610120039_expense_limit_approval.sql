-- Owner approvals, stage 3: an expense above an amount the owner sets is held until he approves it. Same machinery as held sales:
-- nothing is posted or paid out before the decision, approving posts exactly what was held through the normal expense path, and the owner's
-- own entries are never held. The rule starts switched off. Each single expense is checked (not a daily total).
begin;

alter table bomedia.approval_requests drop constraint approval_requests_operation_check;
alter table bomedia.approval_requests add constraint approval_requests_operation_check check (operation in ('screen_order', 'screen_expense'));
insert into bomedia.approval_rules(kind, params) values ('expense_limit', '{"amount_kobo": 5000000}');

-- The owner can set the limit like the other rules (a whole number of kobo, at least 1 naira).
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
  else raise exception 'This rule cannot be changed yet' using errcode = '22023'; end if;
  update bomedia.approval_rules set enabled = (payload ->> 'enabled')::boolean, params = new_params, updated_by = actor, updated_at = now() where kind = kind_value;
  result := jsonb_build_object('kind', kind_value, 'enabled', (payload ->> 'enabled')::boolean, 'params', new_params);
  insert into bomedia.idempotency_requests(operation, request_key, payload_sha256, actor_id, response)
    values ('api_approval_rule_save', request_id, encode(sha256(convert_to(payload::text, 'UTF8')), 'hex'), actor, result);
  insert into bomedia.audit_events(actor_id, action, entity_type, details)
    values (actor, 'approval_rule_saved', 'approval_rule', jsonb_build_object('kind', kind_value, 'enabled', (payload ->> 'enabled')::boolean, 'params', new_params));
  return result;
end $$;

-- Each expense in a "log" that is above the limit, as plain facts for the owner. Empty when nothing is or the rule is off.
create function bomedia.expense_changes(clean jsonb) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, bomedia as $$
declare out jsonb := '[]'; rule bomedia.approval_rules%rowtype; item jsonb; limit_kobo bigint; amount bigint;
begin
  if jsonb_typeof(clean) is distinct from 'object' or clean ->> 'operation' is distinct from 'log' or jsonb_typeof(clean -> 'items') is distinct from 'array' then return out; end if;
  select * into rule from bomedia.approval_rules where kind = 'expense_limit';
  if not found or not rule.enabled then return out; end if;
  limit_kobo := coalesce((rule.params ->> 'amount_kobo')::bigint, 0);
  for item in select value from jsonb_array_elements(clean -> 'items') loop
    if jsonb_typeof(item) is distinct from 'object' or coalesce(item ->> 'amountKobo', '') !~ '^[1-9][0-9]{0,15}$' then continue; end if;
    amount := (item ->> 'amountKobo')::bigint;
    if amount > limit_kobo then
      out := out || jsonb_build_array(jsonb_build_object('kind', 'expense_limit', 'category', item ->> 'category', 'description', item ->> 'description',
        'paid_to', item ->> 'paidTo', 'amount_kobo', amount::text, 'limit_kobo', limit_kobo::text));
    end if;
  end loop;
  return out;
end $$;

-- The expense function keeps all its rules; it is only reachable through the gate below.
alter function bomedia.api_screen_expense(text, jsonb) rename to screen_expense_before_approvals;
revoke all on function bomedia.screen_expense_before_approvals(text, jsonb) from public, bomedia_financial_runtime;

create function bomedia.api_screen_expense(request_id text, payload jsonb) returns jsonb
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
  previous := bomedia.prior_result('api_screen_expense', request_id, clean);
  if previous is not null then return previous; end if;
  changes := bomedia.expense_changes(clean);
  if by_owner or jsonb_array_length(changes) = 0 then return bomedia.screen_expense_before_approvals(request_id, clean); end if;

  actor := (clean ->> 'actor_id')::uuid;
  if not exists (select 1 from bomedia.staff where id = actor and disabled_at is null) then
    raise exception 'An enabled staff member is required' using errcode = '42501'; end if;
  digest := encode(sha256(convert_to(clean::text, 'UTF8')), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('approval:screen_expense:' || request_id, 0));
  select * into req from bomedia.approval_requests where operation = 'screen_expense' and request_key = request_id for update;
  if found then
    if req.payload_sha256 <> digest then raise exception 'This request ID was already used for different values' using errcode = '22023'; end if;
    if req.status = 'approved' then return bomedia.screen_expense_before_approvals(request_id, clean); end if;
    return bomedia.approval_answer(req);
  end if;
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

-- Lists now say what kind of entry a request is and its reference once posted (BOM-... for a sale, EXP-... for an expense).
create or replace function bomedia.approval_row(r bomedia.approval_requests) returns jsonb
language sql stable security definer set search_path = pg_catalog, bomedia as $$
  select jsonb_build_object('id', r.id, 'operation', r.operation, 'status', case when r.status = 'pending' and r.expires_at < now() then 'expired' else r.status end,
    'kinds', to_jsonb(r.kinds), 'changes', r.changes, 'summary', r.summary, 'reason', r.reason,
    'requested_by', (select display_name from bomedia.staff where id = r.requested_by), 'requested_by_id', r.requested_by,
    'created_at', r.created_at, 'expires_at', r.expires_at, 'decided_at', r.decided_at,
    'decided_by', (select display_name from bomedia.staff where id = r.decided_by), 'decision_note', r.decision_note, 'last_error', r.last_error,
    'sales_id', r.result ->> 'sales_id', 'reference', coalesce(r.result ->> 'sales_id', r.result -> 'expenses' -> 0 ->> 'reference'))
$$;

-- Approving now posts a held expense as well as a held sale.
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

revoke all on function bomedia.expense_changes(jsonb), bomedia.api_screen_expense(text, jsonb) from public;
grant execute on function bomedia.api_screen_expense(text, jsonb) to bomedia_financial_runtime;
commit;

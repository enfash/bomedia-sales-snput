-- Expense corrections and cancellations (owner request, 13 Oct). Like a sale, an expense is never edited in place or removed: a correction
-- reverses the money entries it made and posts the corrected ones; a cancellation reverses them and the expense stays visible as Cancelled.
-- The old version lives in `expense_revisions` (who, when, why, who approved) and the audit log.
-- Money already paid out stays paid out. If a correction lowers a paid expense, the difference was still handed over, so it is held in account
-- 1300 "Paid out, to be recovered" until the owner gets it back. A paid expense cannot go up (log the extra as a new expense).
-- The owner changes any expense directly. A cashier may ask (only for an expense they logged, only within the days the owner allows, and only
-- when the owner has switched on "edit_old") and the owner approves in the Approvals inbox.
begin;

alter table bomedia.expenses add column cancelled_at timestamptz, add column cancelled_by uuid references bomedia.staff(id), add column cancel_reason text;

insert into bomedia.ledger_accounts(code, name, category, normal_side, purpose) values ('1300', 'Paid out, to be recovered', 'asset', 'debit', 'general');

create table bomedia.expense_revisions (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references bomedia.expenses(id),
  revision integer not null check (revision >= 1),
  kind text not null check (kind in ('correction', 'cancellation')),
  before jsonb not null,
  after jsonb not null,
  excess_kobo bigint not null default 0 check (excess_kobo >= 0),
  reversed_entry_ids uuid[] not null default '{}',
  new_entry_id uuid references bomedia.journal_entries(id),
  reason text not null check (btrim(reason) <> '' and length(reason) <= 500),
  changed_by uuid not null references bomedia.staff(id),
  approved_by uuid references bomedia.staff(id),
  approval_request_id uuid references bomedia.approval_requests(id),
  created_at timestamptz not null default now(),
  unique (expense_id, revision)
);
create index expense_revisions_expense on bomedia.expense_revisions(expense_id, revision desc);
alter table bomedia.expense_revisions enable row level security;

alter table bomedia.approval_requests drop constraint approval_requests_operation_check;
alter table bomedia.approval_requests add constraint approval_requests_operation_check
  check (operation in ('screen_order', 'screen_expense', 'sale_correction', 'expense_correction'));

-- Every money entry of this expense that is still in force: the expense itself, its later payment and any corrected version, none of them reversed.
create function bomedia.expense_open_entries(expense_value uuid) returns setof uuid
language sql stable security definer set search_path = pg_catalog, bomedia as $$
  select j.id from bomedia.journal_entries j
  where j.status = 'posted' and j.kind <> 'reversal'
    and ((j.source_type in ('expense', 'expense_payment') and j.source_id = expense_value)
      or (j.source_type = 'expense_revision' and j.source_id in (select r.id from bomedia.expense_revisions r where r.expense_id = expense_value)))
    and not exists (select 1 from bomedia.journal_entries r where r.reverses_entry_id = j.id)
  order by j.created_at, j.id
$$;

-- An unpaid expense can be paid while the entry in force still owes it (account 2010), or through a matching opening balance. A cancelled or
-- already paid expense cannot be paid.
create or replace function bomedia.expense_is_payable(expense uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, bomedia as $$
  select exists (select 1 from bomedia.expenses x where x.id = expense and x.status = 'Unpaid' and x.cancelled_at is null)
    and (exists (select 1 from bomedia.expense_open_entries(expense) o(id) join bomedia.journal_lines l on l.entry_id = o.id
        where l.account_code = '2010' and l.credit_kobo > 0)
      or exists (select 1 from bomedia.expense_opening_items o join bomedia.journal_entries j on j.id = o.journal_entry_id
        join bomedia.expenses e on e.id = o.expense_id where o.expense_id = expense and o.amount_kobo = e.amount_kobo and j.status = 'posted'
        and not exists (select 1 from bomedia.journal_entries reversal where reversal.reverses_entry_id = j.id and reversal.status = 'posted')))
$$;

-- What a change would do to one expense, without doing it: the old and new values and how much of a paid expense was already handed over.
create function bomedia.plan_expense_change(expense_value uuid, change jsonb) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, bomedia as $$
declare e bomedia.expenses%rowtype; mode_value text := change ->> 'mode'; new_amount bigint; new_category text; new_date date; new_description text; new_paid_to text;
  before jsonb; after jsonb; paid boolean; excess bigint := 0; category_value text;
begin
  if mode_value not in ('correct', 'cancel') then raise exception 'Choose correct or cancel' using errcode = '22023'; end if;
  select * into e from bomedia.expenses where id = expense_value;
  if not found then raise exception 'That expense could not be found' using errcode = 'P0002'; end if;
  if e.cancelled_at is not null then raise exception 'This expense is already cancelled' using errcode = '22023'; end if;
  if not exists (select 1 from bomedia.expense_open_entries(e.id)) then
    raise exception 'This expense predates the books and cannot be changed here' using errcode = '23514'; end if;
  paid := e.status = 'Paid';
  before := jsonb_build_object('amount_kobo', e.amount_kobo::text, 'category', e.category, 'description', coalesce(e.description, ''), 'paid_to', coalesce(e.paid_to, ''),
    'business_date', e.business_date, 'status', e.status);
  if mode_value = 'cancel' then
    after := before || jsonb_build_object('amount_kobo', '0', 'status', 'Cancelled');
    if paid then excess := e.amount_kobo; end if;
    new_amount := 0;
  else
    new_amount := case when change ? 'amountKobo' then bomedia.kobo(change ->> 'amountKobo') else e.amount_kobo end;
    if new_amount <= 0 then raise exception 'Expense amount must be positive' using errcode = '22023'; end if;
    if paid and new_amount > e.amount_kobo then
      raise exception 'A paid expense cannot go up. Log the extra as a new expense.' using errcode = '22023'; end if;
    if change ? 'category' then
      select c.name into category_value from bomedia.expense_categories c join bomedia.ledger_accounts a on a.code = c.account_code
        where c.name = btrim(change ->> 'category') and c.enabled and a.active;
      if category_value is null then raise exception 'Unsupported expense category' using errcode = '22023'; end if;
      new_category := category_value;
    else new_category := e.category; end if;
    if change ? 'businessDate' then
      if coalesce(change ->> 'businessDate', '') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Business date required' using errcode = '22023'; end if;
      new_date := (change ->> 'businessDate')::date;
    else new_date := e.business_date; end if;
    new_description := case when change ? 'description' then nullif(btrim(change ->> 'description'), '') else e.description end;
    new_paid_to := case when change ? 'paidTo' then nullif(btrim(change ->> 'paidTo'), '') else e.paid_to end;
    if length(coalesce(new_description, '')) > 1000 or length(coalesce(new_paid_to, '')) > 200 then
      raise exception 'The description and payee are too long' using errcode = '22023'; end if;
    after := jsonb_build_object('amount_kobo', new_amount::text, 'category', new_category, 'description', coalesce(new_description, ''), 'paid_to', coalesce(new_paid_to, ''),
      'business_date', new_date, 'status', e.status);
    if after = before then raise exception 'Change at least one thing' using errcode = '22023'; end if;
    if paid then excess := e.amount_kobo - new_amount; end if;
  end if;
  return jsonb_build_object('mode', mode_value, 'expense_id', e.id, 'reference', e.reference, 'before', before, 'after', after, 'old_amount_kobo', e.amount_kobo::text,
    'new_amount_kobo', new_amount::text, 'paid', paid, 'excess_kobo', excess::text);
end $$;

-- Does the change. The caller has already decided it may (owner, or an approved request).
create function bomedia.apply_expense_change(expense_value uuid, change jsonb, actor uuid, approver uuid, request_value uuid, reason_value text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, bomedia as $$
declare plan jsonb; e bomedia.expenses%rowtype; rev uuid := gen_random_uuid(); revision_no integer; kind_value text; open_ids uuid[]; entry uuid; original bomedia.journal_entries%rowtype;
  lines_value jsonb; new_lines jsonb := '[]'; cash_code text; debit_code text; amount bigint; excess bigint; reversed uuid[] := '{}'; posted jsonb; changed text[] := '{}';
begin
  perform singleton from bomedia.bookkeeping_settings where singleton and state = 'active' for update;
  if not found then raise exception 'Active accounting books required' using errcode = '23514'; end if;
  select * into e from bomedia.expenses where id = expense_value for update;
  if not found then raise exception 'That expense could not be found' using errcode = 'P0002'; end if;
  plan := bomedia.plan_expense_change(expense_value, change);
  kind_value := case when plan ->> 'mode' = 'cancel' then 'cancellation' else 'correction' end;
  amount := (plan ->> 'new_amount_kobo')::bigint; excess := (plan ->> 'excess_kobo')::bigint;
  select array_agg(x.id) into open_ids from bomedia.expense_open_entries(e.id) x(id);
  if e.status = 'Paid' then
    select l.account_code into cash_code from bomedia.journal_lines l join bomedia.ledger_accounts a on a.code = l.account_code
      where l.entry_id = any (open_ids) and a.purpose = 'cash_bank' and l.credit_kobo > 0 group by l.account_code order by sum(l.credit_kobo) desc limit 1;
    if cash_code is null then raise exception 'The account this expense was paid from could not be found' using errcode = '23514'; end if;
  end if;
  select coalesce(max(revision), 0) + 1 into revision_no from bomedia.expense_revisions where expense_id = expense_value;
  insert into bomedia.expense_revisions(id, expense_id, revision, kind, before, after, excess_kobo, reason, changed_by, approved_by, approval_request_id)
    values (rev, expense_value, revision_no, kind_value, plan -> 'before', plan -> 'after', excess, btrim(reason_value), actor, approver, request_value);

  -- 1. Reverse every money entry of the expense that is still in force, line for line, each on its own date.
  perform set_config('bomedia.business_reversal', 'on', true);
  foreach entry in array open_ids loop
    select * into original from bomedia.journal_entries where id = entry;
    select jsonb_agg(jsonb_build_object('account_code', account_code, 'debit_kobo', credit_kobo::text, 'credit_kobo', debit_kobo::text) order by line_number)
      into lines_value from bomedia.journal_lines where entry_id = entry;
    perform bomedia.post_journal('expense-correction-reverse/' || rev::text || '/' || entry::text, jsonb_build_object('actor_id', actor, 'business_date', original.business_date,
      'kind', 'reversal', 'memo', 'Expense ' || kind_value || ': ' || btrim(reason_value), 'reverses_entry_id', entry, 'lines', lines_value));
    reversed := reversed || (select r.id from bomedia.journal_entries r where r.reverses_entry_id = entry);
  end loop;
  perform set_config('bomedia.business_reversal', 'off', true);

  -- 2. Post the expense as it now stands. A paid expense keeps the full amount that left the account; what is no longer an expense is held in 1300.
  select coalesce((select c.account_code from bomedia.expense_categories c where c.name = plan -> 'after' ->> 'category'), '6000') into debit_code;
  if e.status = 'Paid' then
    new_lines := jsonb_build_array(jsonb_build_object('account_code', cash_code, 'credit_kobo', e.amount_kobo::text));
    if amount > 0 then new_lines := new_lines || jsonb_build_array(jsonb_build_object('account_code', debit_code, 'debit_kobo', amount::text)); end if;
    if excess > 0 then new_lines := new_lines || jsonb_build_array(jsonb_build_object('account_code', '1300', 'debit_kobo', excess::text)); end if;
  elsif amount > 0 then
    new_lines := jsonb_build_array(jsonb_build_object('account_code', debit_code, 'debit_kobo', amount::text), jsonb_build_object('account_code', '2010', 'credit_kobo', amount::text));
  end if;
  if jsonb_array_length(new_lines) > 0 then
    posted := bomedia.post_journal('expense-correction-post/' || rev::text, jsonb_build_object('actor_id', actor, 'business_date', plan -> 'after' ->> 'business_date', 'kind', 'expense',
      'memo', 'Corrected expense: ' || (plan -> 'after' ->> 'category'), 'source_type', 'expense_revision', 'source_id', rev, 'lines', new_lines));
    update bomedia.expense_revisions set new_entry_id = (posted ->> 'journal_entry_id')::uuid where id = rev;
  end if;
  update bomedia.expense_revisions set reversed_entry_ids = reversed where id = rev;

  if kind_value = 'cancellation' then
    update bomedia.expenses set amount_kobo = 0, status = 'Cancelled', cancelled_at = now(), cancelled_by = actor, cancel_reason = btrim(reason_value) where id = expense_value;
  else
    update bomedia.expenses set amount_kobo = amount, category = plan -> 'after' ->> 'category', description = nullif(plan -> 'after' ->> 'description', ''),
      paid_to = nullif(plan -> 'after' ->> 'paid_to', ''), business_date = (plan -> 'after' ->> 'business_date')::date where id = expense_value;
  end if;

  select array_agg(k order by k) into changed from (select k from jsonb_object_keys(plan -> 'after') k where (plan -> 'after') -> k is distinct from (plan -> 'before') -> k) x;
  insert into bomedia.audit_events(actor_id, action, entity_type, entity_id, details)
    values (actor, case when kind_value = 'cancellation' then 'expense_cancelled' else 'expense_corrected' end, 'expense', expense_value,
      jsonb_build_object('reference', e.reference, 'category', e.category, 'paid_to', e.paid_to, 'fields', to_jsonb(coalesce(changed, '{}')), 'approved_by', approver, 'reason', btrim(reason_value)));
  return jsonb_build_object('expense_id', expense_value, 'reference', e.reference, 'revision', revision_no, 'kind', kind_value, 'new_amount_kobo', plan ->> 'new_amount_kobo',
    'old_amount_kobo', plan ->> 'old_amount_kobo', 'excess_kobo', plan ->> 'excess_kobo');
end $$;

-- Which expense a request is about: its readable reference (EXP-...) or its id.
create function bomedia.correction_expense_id(payload jsonb) returns uuid
language plpgsql stable security definer set search_path = pg_catalog, bomedia as $$
declare found_id uuid;
begin
  if coalesce(payload ->> 'reference', '') <> '' then select id into found_id from bomedia.expenses where reference = payload ->> 'reference';
  elsif coalesce(payload ->> 'expenseId', '') ~ '^[0-9a-fA-F-]{36}$' then select id into found_id from bomedia.expenses where id = (payload ->> 'expenseId')::uuid;
  else raise exception 'Choose the expense to change' using errcode = '22023'; end if;
  if found_id is null then raise exception 'That expense could not be found' using errcode = 'P0002'; end if;
  return found_id;
end $$;

create function bomedia.api_expense_correction_preview(payload jsonb) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, bomedia as $$
declare change jsonb;
begin
  if jsonb_typeof(payload) is distinct from 'object' then raise exception 'A correction is required' using errcode = '22023'; end if;
  change := coalesce(payload -> 'changes', '{}'::jsonb) || jsonb_build_object('mode', payload ->> 'mode');
  if exists (select 1 from jsonb_object_keys(change) k where k not in ('mode', 'amountKobo', 'category', 'description', 'paidTo', 'businessDate')) then
    raise exception 'Unexpected change field' using errcode = '22023'; end if;
  return jsonb_build_object('plan', bomedia.plan_expense_change(bomedia.correction_expense_id(payload), change));
end $$;

-- Everything that was changed on an expense, newest first: who, when, why, who approved, and what it was before.
create function bomedia.api_expense_history(reference_value text) returns jsonb
language sql stable security definer set search_path = pg_catalog, bomedia as $$
  select coalesce(jsonb_agg(jsonb_build_object('at', r.created_at, 'kind', r.kind, 'revision', r.revision, 'reason', r.reason,
    'by', (select display_name from bomedia.staff where id = r.changed_by), 'approved_by', (select display_name from bomedia.staff where id = r.approved_by),
    'before', r.before, 'after', r.after, 'excess_kobo', r.excess_kobo::text) order by r.created_at desc, r.revision desc), '[]'::jsonb)
  from bomedia.expense_revisions r join bomedia.expenses e on e.id = r.expense_id where e.reference = reference_value
$$;

-- Ask to correct or cancel an expense. The owner's own change is applied at once; a cashier's is held for the owner.
create function bomedia.api_expense_correction(request_id text, payload jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, bomedia as $$
declare clean jsonb; by_owner boolean; actor uuid; previous jsonb; mode_value text; reason text; change jsonb; target_id uuid; target bomedia.expenses%rowtype; plan jsonb;
  rule bomedia.approval_rules%rowtype; today_value date := (now() at time zone 'Africa/Lagos')::date; days_value integer; req bomedia.approval_requests%rowtype;
  digest text; approver uuid; request_ref uuid; result jsonb; kind_value text; applied jsonb;
begin
  if jsonb_typeof(payload) is distinct from 'object' then raise exception 'A correction is required' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_object_keys(payload) k where k not in ('actor_id', 'mode', 'expenseId', 'reference', 'changes', 'reason', 'byOwner')) then
    raise exception 'Unexpected correction field' using errcode = '22023'; end if;
  by_owner := coalesce(payload ->> 'byOwner' = 'true', false);
  clean := payload - 'byOwner';
  actor := (payload ->> 'actor_id')::uuid;
  if not exists (select 1 from bomedia.staff where id = actor and disabled_at is null) then raise exception 'An enabled staff member is required' using errcode = '42501'; end if;
  previous := bomedia.prior_result('expense_correction', request_id, clean);
  if previous is not null then return previous; end if;
  mode_value := payload ->> 'mode';
  reason := btrim(coalesce(payload ->> 'reason', ''));
  if mode_value not in ('correct', 'cancel') then raise exception 'Choose correct or cancel' using errcode = '22023'; end if;
  if reason = '' or length(reason) > 500 then raise exception 'Say why, in up to 500 characters' using errcode = '22023'; end if;
  change := coalesce(payload -> 'changes', '{}'::jsonb) || jsonb_build_object('mode', mode_value);
  if jsonb_typeof(change) is distinct from 'object' then raise exception 'Changes must be an object' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_object_keys(change) k where k not in ('mode', 'amountKobo', 'category', 'description', 'paidTo', 'businessDate')) then
    raise exception 'Unexpected change field' using errcode = '22023'; end if;
  target_id := bomedia.correction_expense_id(payload);
  select * into target from bomedia.expenses where id = target_id;
  kind_value := case when mode_value = 'cancel' then 'cancellation' else 'correction' end;

  select * into req from bomedia.approval_requests where operation = 'expense_correction' and request_key = request_id;
  if found and req.status = 'approved' then approver := req.decided_by; request_ref := req.id;
  elsif not by_owner then
    select * into rule from bomedia.approval_rules where kind = 'edit_old';
    if not found or not rule.enabled then raise exception 'Only the owner can correct or cancel an expense' using errcode = '22023'; end if;
    if target.logged_by is distinct from actor then raise exception 'You can only ask to change an expense you logged' using errcode = '22023'; end if;
    days_value := coalesce((rule.params ->> 'days')::integer, 7);
    if target.business_date < today_value - days_value then
      raise exception 'This expense is more than % days old. Ask the owner to change it.', days_value using errcode = '22023'; end if;
    plan := bomedia.plan_expense_change(target_id, change);
    digest := encode(sha256(convert_to(clean::text, 'UTF8')), 'hex');
    perform pg_advisory_xact_lock(hashtextextended('approval:expense_correction:' || request_id, 0));
    select * into req from bomedia.approval_requests where operation = 'expense_correction' and request_key = request_id for update;
    if found then
      if req.payload_sha256 <> digest then raise exception 'This request ID was already used for different values' using errcode = '22023'; end if;
      return bomedia.approval_answer(req);
    end if;
    insert into bomedia.approval_requests(operation, request_key, payload, payload_sha256, kinds, changes, summary, reason, requested_by)
      values ('expense_correction', request_id, clean, digest, array[kind_value], jsonb_build_array(plan),
        jsonb_build_object('kind', kind_value, 'reference', target.reference, 'category', target.category, 'paid_to', target.paid_to,
          'total_kobo', plan ->> 'new_amount_kobo', 'old_total_kobo', plan ->> 'old_amount_kobo'), reason, actor)
      returning * into req;
    insert into bomedia.audit_events(actor_id, action, entity_type, entity_id, details)
      values (actor, 'approval_requested', 'approval_request', req.id, jsonb_build_object('kinds', to_jsonb(array[kind_value]), 'operation', 'expense_correction', 'reference', target.reference));
    return bomedia.approval_answer(req);
  else approver := null;
  end if;

  applied := bomedia.apply_expense_change(target_id, change, actor, approver, request_ref, reason);
  result := jsonb_build_object('status', 'applied', 'kind', kind_value, 'reference', target.reference, 'expense', applied, 'request_id', request_id);
  insert into bomedia.idempotency_requests(operation, request_key, payload_sha256, actor_id, response)
    values ('expense_correction', request_id, encode(sha256(convert_to(clean::text, 'UTF8')), 'hex'), actor, result);
  return result;
end $$;

-- The owner's inbox row names the reference of an expense change as it does for a sale.
create or replace function bomedia.approval_row(r bomedia.approval_requests) returns jsonb
language sql stable security definer set search_path = pg_catalog, bomedia as $$
  select jsonb_build_object('id', r.id, 'operation', r.operation, 'status', case when r.status = 'pending' and r.expires_at < now() then 'expired' else r.status end,
    'kinds', to_jsonb(r.kinds), 'changes', r.changes, 'summary', r.summary, 'reason', r.reason,
    'requested_by', (select display_name from bomedia.staff where id = r.requested_by), 'requested_by_id', r.requested_by,
    'created_at', r.created_at, 'expires_at', r.expires_at, 'decided_at', r.decided_at,
    'decided_by', (select display_name from bomedia.staff where id = r.decided_by), 'decision_note', r.decision_note, 'last_error', r.last_error,
    'sales_id', r.result ->> 'sales_id', 'reference', coalesce(r.result ->> 'sales_id', r.result ->> 'reference', r.result -> 'expenses' -> 0 ->> 'reference'))
$$;

-- Approving now also applies a held expense correction.
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
      elsif req.operation = 'expense_correction' then posted := bomedia.api_expense_correction(req.request_key, req.payload);
      else posted := bomedia.api_screen_order(req.request_key, req.payload); end if;
      update bomedia.approval_requests set result = posted where id = req.id;
    exception when others then
      failure := sqlerrm;
    end;
    if failure is not null then
      update bomedia.approval_requests set last_error = failure where id = req.id;
      return jsonb_build_object('approval_request_id', req.id, 'status', 'failed', 'error', failure);
    end if;
    result := jsonb_build_object('approval_request_id', req.id, 'status', 'approved', 'sales_id', posted ->> 'sales_id', 'reference', posted ->> 'reference',
      'references', case when req.operation = 'screen_expense' then (select coalesce(jsonb_agg(e ->> 'reference'), '[]'::jsonb) from jsonb_array_elements(posted -> 'expenses') e) else null end);
  end if;
  insert into bomedia.idempotency_requests(operation, request_key, payload_sha256, actor_id, response)
    values ('api_approval_decision', request_id, encode(sha256(convert_to(payload::text, 'UTF8')), 'hex'), actor, result);
  insert into bomedia.audit_events(actor_id, action, entity_type, entity_id, details)
    values (actor, 'approval_' || (result ->> 'status'), 'approval_request', req.id,
      jsonb_build_object('kinds', to_jsonb(req.kinds), 'requested_by', req.requested_by, 'operation', req.operation));
  return result;
end $$;

revoke all on function bomedia.expense_open_entries(uuid), bomedia.plan_expense_change(uuid, jsonb), bomedia.apply_expense_change(uuid, jsonb, uuid, uuid, uuid, text),
  bomedia.correction_expense_id(jsonb), bomedia.api_expense_correction(text, jsonb), bomedia.api_expense_correction_preview(jsonb), bomedia.api_expense_history(text) from public;
grant execute on function bomedia.api_expense_correction(text, jsonb), bomedia.api_expense_correction_preview(jsonb), bomedia.api_expense_history(text) to bomedia_financial_runtime;
commit;

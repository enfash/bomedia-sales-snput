-- Private accounting primitives only. No opening amounts, runtime grants or cutover.
begin;

create table bomedia.bookkeeping_settings (
  singleton boolean primary key default true check (singleton),
  starts_on date not null,
  state text not null default 'setup' check (state in ('setup', 'active')),
  closed_through date,
  currency text not null default 'NGN' check (currency = 'NGN'),
  check (closed_through is null or closed_through >= starts_on - 1)
);
-- Intentionally no settings row: the opening date/activation requires cutover input.
create table bomedia.ledger_accounts (
  code text primary key check (code ~ '^[0-9]{4,8}$'),
  name text not null check (btrim(name) <> ''),
  category text not null check (category in ('asset', 'liability', 'equity', 'income', 'expense')),
  normal_side text not null check (normal_side in ('debit', 'credit')),
  purpose text not null default 'general' check (purpose in ('general', 'cash_bank', 'receivables', 'customer_deposits', 'inventory')),
  active boolean not null default true,
  check (purpose <> 'cash_bank' or (category = 'asset' and normal_side = 'debit')),
  check (purpose <> 'receivables' or (category = 'asset' and normal_side = 'debit'))
);
insert into bomedia.ledger_accounts(code, name, category, normal_side, purpose) values
  ('1000', 'Cash on hand', 'asset', 'debit', 'cash_bank'),
  ('1100', 'Customer receivables', 'asset', 'debit', 'receivables'),
  ('1200', 'Inventory', 'asset', 'debit', 'inventory'),
  ('1500', 'Equipment', 'asset', 'debit', 'general'),
  ('1590', 'Accumulated depreciation', 'asset', 'credit', 'general'),
  ('2000', 'Supplier payables', 'liability', 'credit', 'general'),
  ('2100', 'Customer deposits and credits', 'liability', 'credit', 'customer_deposits'),
  ('2200', 'Loans payable', 'liability', 'credit', 'general'),
  ('3000', 'Owner capital', 'equity', 'credit', 'general'),
  ('3100', 'Retained earnings', 'equity', 'credit', 'general'),
  ('4000', 'Sales revenue', 'income', 'credit', 'general'),
  ('4010', 'Sales discounts and allowances', 'income', 'debit', 'general'),
  ('5000', 'Cost of goods sold', 'expense', 'debit', 'general'),
  ('6000', 'Operating expenses', 'expense', 'debit', 'general'),
  ('6100', 'Bad debt expense', 'expense', 'debit', 'general');
-- Bank accounts must be named/configured from the owner's actual accounts.

create table bomedia.journal_entries (
  id uuid primary key default gen_random_uuid(),
  business_date date not null,
  kind text not null check (kind in ('opening', 'sale', 'receipt', 'expense', 'adjustment', 'reversal')),
  memo text not null check (btrim(memo) <> ''),
  status text not null default 'draft' check (status in ('draft', 'posted')),
  source_type text,
  source_id uuid,
  evidence_reference text,
  opening_confirmed boolean not null default false,
  reverses_entry_id uuid unique references bomedia.journal_entries(id),
  created_by uuid not null references bomedia.staff(id),
  created_at timestamptz not null default now(),
  posted_at timestamptz,
  unique (source_type, source_id),
  check ((source_type is null) = (source_id is null)),
  check (source_type is null or btrim(source_type) <> ''),
  check ((kind = 'reversal') = (reverses_entry_id is not null)),
  check ((status = 'posted') = (posted_at is not null))
);
create table bomedia.journal_lines (
  entry_id uuid not null references bomedia.journal_entries(id),
  line_number integer not null check (line_number between 1 and 1000),
  account_code text not null references bomedia.ledger_accounts(code),
  debit_kobo bigint not null default 0 check (debit_kobo >= 0),
  credit_kobo bigint not null default 0 check (credit_kobo >= 0),
  customer_id uuid references bomedia.customers(id),
  job_id uuid,
  memo text,
  primary key (entry_id, line_number),
  check ((debit_kobo > 0 and credit_kobo = 0) or (credit_kobo > 0 and debit_kobo = 0)),
  check (job_id is null or customer_id is not null),
  foreign key (job_id, customer_id) references bomedia.jobs(id, customer_id)
);
create index journal_lines_account on bomedia.journal_lines(account_code, entry_id);
create index journal_lines_job on bomedia.journal_lines(job_id, entry_id);
create index journal_entries_date on bomedia.journal_entries(business_date) where status = 'posted';

create function bomedia.guard_bookkeeping_settings() returns trigger
language plpgsql set search_path = pg_catalog, bomedia as $$
begin
  if tg_op = 'DELETE' then raise exception 'Bookkeeping settings cannot be deleted' using errcode = '23514'; end if;
  if old.starts_on <> new.starts_on and exists (select 1 from bomedia.journal_entries) then
    raise exception 'Opening date cannot change after journal creation' using errcode = '23514';
  end if;
  if old.closed_through is not null and (new.closed_through is null or new.closed_through < old.closed_through) then
    raise exception 'Closed accounting periods cannot be reopened by this operation' using errcode = '23514';
  end if;
  if old.state = 'active' and new.state <> 'active' then
    raise exception 'Active books cannot return to setup' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger guard_bookkeeping_settings before update or delete on bomedia.bookkeeping_settings
  for each row execute function bomedia.guard_bookkeeping_settings();

create function bomedia.guard_ledger_account() returns trigger
language plpgsql set search_path = pg_catalog, bomedia as $$
begin
  if (old.code, old.category, old.normal_side, old.purpose) is distinct from
     (new.code, new.category, new.normal_side, new.purpose)
    and (old.code = '1100' or exists (select 1 from bomedia.journal_lines where account_code = old.code)) then
    raise exception 'An account with journal lines cannot be reclassified' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger guard_ledger_account before update on bomedia.ledger_accounts
  for each row execute function bomedia.guard_ledger_account();

create function bomedia.guard_journal_line() returns trigger
language plpgsql set search_path = pg_catalog, bomedia as $$
declare parent_status text; purpose_value text;
begin
  if tg_op = 'UPDATE' and (old.entry_id, old.line_number) is distinct from (new.entry_id, new.line_number) then
    raise exception 'Journal line identity is immutable' using errcode = '23514';
  end if;
  select status into parent_status from bomedia.journal_entries
    where id = case when tg_op = 'DELETE' then old.entry_id else new.entry_id end for update;
  if parent_status is distinct from 'draft' then
    raise exception 'Posted journal lines cannot be changed' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  select purpose into purpose_value from bomedia.ledger_accounts where code = new.account_code and active for share;
  if not found then raise exception 'Journal account is missing or inactive' using errcode = '23514'; end if;
  if purpose_value = 'receivables' and (new.customer_id is null or new.job_id is null) then
    raise exception 'Receivables require customer and job identity' using errcode = '23514';
  end if;
  if purpose_value = 'customer_deposits' and new.customer_id is null then
    raise exception 'Customer deposits require customer identity' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger guard_journal_line before insert or update or delete on bomedia.journal_lines
  for each row execute function bomedia.guard_journal_line();

create function bomedia.guard_journal_entry() returns trigger
language plpgsql set search_path = pg_catalog, bomedia as $$
declare config bomedia.bookkeeping_settings%rowtype; debit_total numeric; credit_total numeric; line_count integer;
  original bomedia.journal_entries%rowtype;
begin
  if tg_op in ('UPDATE', 'DELETE') and old.status = 'posted' then
    raise exception 'Posted journals are immutable; use a linked correction' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if tg_op = 'INSERT' and new.status <> 'draft' then
    raise exception 'Create lines before posting a journal' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and (old.id, old.created_by, old.created_at) is distinct from (new.id, new.created_by, new.created_at) then
    raise exception 'Journal origin is immutable' using errcode = '23514';
  end if;
  -- All accounting operations lock settings before jobs/other business rows.
  select * into config from bomedia.bookkeeping_settings where singleton for update;
  if not found then raise exception 'Opening date has not been configured' using errcode = '23514'; end if;
  if config.closed_through is not null and new.business_date <= config.closed_through then
    raise exception 'This accounting period is closed' using errcode = '23514';
  end if;
  if new.kind = 'opening' then
    if config.state <> 'setup' or new.business_date <> config.starts_on - 1 then
      raise exception 'Opening journals belong to the day before accounting starts and require setup state' using errcode = '23514';
    end if;
  elsif config.state <> 'active' or new.business_date < config.starts_on then
    raise exception 'New accounting requires active books and a date on or after the start' using errcode = '23514';
  end if;
  if not exists (select 1 from bomedia.staff where id = new.created_by and disabled_at is null) then
    raise exception 'An enabled staff actor is required' using errcode = '23514';
  end if;
  if new.status = 'posted' then
    if new.kind = 'opening' and (not new.opening_confirmed or coalesce(btrim(new.evidence_reference), '') = '') then
      raise exception 'Opening balances need confirmation and evidence' using errcode = '23514';
    end if;
    perform a.code from bomedia.ledger_accounts a where a.code in
      (select account_code from bomedia.journal_lines where entry_id = new.id) order by a.code for share;
    if exists (select 1 from bomedia.journal_lines l join bomedia.ledger_accounts a on a.code = l.account_code
      where l.entry_id = new.id and not a.active) then
      raise exception 'Cannot post to an inactive account' using errcode = '23514';
    end if;
    select count(*), sum(debit_kobo), sum(credit_kobo) into line_count, debit_total, credit_total
      from bomedia.journal_lines where entry_id = new.id;
    if line_count < 2 or debit_total is distinct from credit_total or debit_total <= 0 then
      raise exception 'A posted journal needs at least two lines and equal positive debit and credit totals' using errcode = '23514';
    end if;
    if new.kind = 'reversal' then
      select * into original from bomedia.journal_entries where id = new.reverses_entry_id for update;
      if not found or original.status <> 'posted' or original.source_type is not null
        or exists (select 1 from bomedia.journal_lines where entry_id = original.id and job_id is not null) then
        raise exception 'Only standalone posted journals can be reversed here; business-linked entries need a business reversal' using errcode = '23514';
      end if;
      if new.business_date < original.business_date then
        raise exception 'Reversal cannot predate its original journal' using errcode = '23514';
      end if;
      if exists (
        (select account_code, debit_kobo, credit_kobo, customer_id, job_id from bomedia.journal_lines where entry_id = new.id
         except all
         select account_code, credit_kobo, debit_kobo, customer_id, job_id from bomedia.journal_lines where entry_id = original.id)
        union all
        (select account_code, credit_kobo, debit_kobo, customer_id, job_id from bomedia.journal_lines where entry_id = original.id
         except all
         select account_code, debit_kobo, credit_kobo, customer_id, job_id from bomedia.journal_lines where entry_id = new.id)
      ) then raise exception 'Reversal must exactly offset every original journal line' using errcode = '23514'; end if;
    end if;
  end if;
  return new;
end $$;
create trigger guard_journal_entry before insert or update or delete on bomedia.journal_entries
  for each row execute function bomedia.guard_journal_entry();

-- These security-invoker functions remain private migration-owner primitives.
-- The authenticated runtime adapter must derive actor IDs from verified sessions,
-- restrict manual journals/activation to the owner, and expose only permitted operations.
create function bomedia.post_journal(request_id text, payload jsonb) returns jsonb
language plpgsql set search_path = pg_catalog, bomedia as $$
declare previous jsonb; result jsonb; entry uuid; line jsonb; number_value integer := 0;
begin
  previous := bomedia.prior_result('journal', request_id, payload);
  if previous is not null then return previous; end if;
  if jsonb_typeof(payload->'lines') is distinct from 'array'
    or jsonb_array_length(payload->'lines') not between 2 and 1000
    or (payload->>'business_date') is null or (payload->>'business_date') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Journal date and 2 to 1000 lines are required' using errcode = '22023';
  end if;
  insert into bomedia.journal_entries(business_date, kind, memo, created_by, source_type, source_id,
    evidence_reference, opening_confirmed, reverses_entry_id)
    values ((payload->>'business_date')::date, payload->>'kind', payload->>'memo', (payload->>'actor_id')::uuid,
      payload->>'source_type', (payload->>'source_id')::uuid, payload->>'evidence_reference',
      coalesce((payload->>'opening_confirmed')::boolean, false), (payload->>'reverses_entry_id')::uuid)
    returning id into entry;
  for line in select value from jsonb_array_elements(payload->'lines') loop
    number_value := number_value + 1;
    insert into bomedia.journal_lines(entry_id, line_number, account_code, debit_kobo, credit_kobo, customer_id, job_id, memo)
      values (entry, number_value, line->>'account_code', bomedia.kobo(coalesce(line->>'debit_kobo', '0')),
        bomedia.kobo(coalesce(line->>'credit_kobo', '0')), (line->>'customer_id')::uuid, (line->>'job_id')::uuid, line->>'memo');
  end loop;
  update bomedia.journal_entries set status = 'posted', posted_at = now() where id = entry;
  result := jsonb_build_object('journal_entry_id', entry);
  insert into bomedia.idempotency_requests(operation, request_key, payload_sha256, actor_id, response)
    values ('journal', request_id, encode(sha256(convert_to(payload::text, 'UTF8')), 'hex'), (payload->>'actor_id')::uuid, result);
  insert into bomedia.audit_events(actor_id, action, entity_type, entity_id)
    values ((payload->>'actor_id')::uuid, 'journal_posted', 'journal_entry', entry);
  return result;
end $$;

create function bomedia.reverse_journal(request_id text, payload jsonb) returns jsonb
language plpgsql set search_path = pg_catalog, bomedia as $$
declare lines_value jsonb; entry uuid;
begin
  entry := (payload->>'journal_entry_id')::uuid;
  select jsonb_agg(jsonb_build_object('account_code', account_code, 'debit_kobo', credit_kobo::text,
    'credit_kobo', debit_kobo::text, 'customer_id', customer_id, 'job_id', job_id) order by line_number)
    into lines_value from bomedia.journal_lines where entry_id = entry;
  if lines_value is null then raise exception 'Original journal not found' using errcode = '22023'; end if;
  return bomedia.post_journal(request_id, jsonb_build_object('actor_id', payload->>'actor_id',
    'business_date', payload->>'business_date', 'kind', 'reversal', 'memo', payload->>'reason',
    'reverses_entry_id', entry, 'lines', lines_value));
end $$;

create view bomedia.job_balances with (security_invoker = true) as
select j.id as job_id, j.customer_id, j.amount_kobo::numeric
  + coalesce((select sum(a.amount_kobo) from bomedia.job_adjustments a where a.job_id = j.id), 0)
  - coalesce((select sum(p.amount_kobo) from bomedia.payment_allocations p where p.job_id = j.id), 0) as balance_kobo
from bomedia.jobs j;
create view bomedia.ledger_account_balances with (security_invoker = true) as
select a.code, a.name, a.category, a.normal_side,
  coalesce(sum(l.debit_kobo) filter (where e.status = 'posted'), 0) as debit_kobo,
  coalesce(sum(l.credit_kobo) filter (where e.status = 'posted'), 0) as credit_kobo,
  coalesce(sum(l.debit_kobo::numeric - l.credit_kobo) filter (where e.status = 'posted'), 0) as debit_minus_credit_kobo
from bomedia.ledger_accounts a left join bomedia.journal_lines l on l.account_code = a.code
left join bomedia.journal_entries e on e.id = l.entry_id group by a.code;

create function bomedia.record_accounted_payment(request_id text, payload jsonb) returns jsonb
language plpgsql set search_path = pg_catalog, bomedia as $$
declare previous jsonb; result jsonb; receipt jsonb; journal jsonb; line jsonb; lines_value jsonb;
  ids uuid[]; job_value record; due numeric := 0; ledger_due numeric; paid bigint; customer uuid; cash_code text; collection_date date;
begin
  previous := bomedia.prior_result('accounted_payment', request_id, payload);
  if previous is not null then return previous; end if;
  perform singleton from bomedia.bookkeeping_settings where singleton and state = 'active' for update;
  if not found then raise exception 'Active accounting books are required' using errcode = '23514'; end if;
  paid := bomedia.kobo(payload->>'amount_kobo');
  customer := (payload->>'customer_id')::uuid;
  cash_code := payload->>'cash_account_code';
  if (payload->>'business_date') is null or (payload->>'business_date') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Collection date is required' using errcode = '22023';
  end if;
  collection_date := (payload->>'business_date')::date;
  if paid <= 0 or customer is null or jsonb_typeof(payload->'job_ids') is distinct from 'array' then
    raise exception 'Positive payment, customer and selected jobs are required' using errcode = '22023';
  end if;
  if not exists (select 1 from bomedia.staff where id = (payload->>'actor_id')::uuid and disabled_at is null) then
    raise exception 'An enabled collector is required' using errcode = '23514';
  end if;
  perform code from bomedia.ledger_accounts where code = cash_code and purpose = 'cash_bank' and active for share;
  if not found then raise exception 'Choose an active cash or bank account' using errcode = '22023'; end if;
  select array_agg(value::uuid) into ids from jsonb_array_elements_text(payload->'job_ids');
  if coalesce(cardinality(ids), 0) not between 1 and 500 or array_position(ids, null) is not null
    or cardinality(ids) <> (select count(distinct x) from unnest(ids) x) then
    raise exception 'Select 1 to 500 distinct jobs' using errcode = '22023';
  end if;
  perform id from bomedia.jobs where id = any(ids) order by id for update;
  if (select count(*) from bomedia.jobs where id = any(ids) and customer_id = customer) <> cardinality(ids) then
    raise exception 'Selected jobs must belong to this customer' using errcode = '22023';
  end if;
  if exists (select 1 from bomedia.jobs where id = any(ids) and business_date > collection_date) then
    raise exception 'Collection cannot predate a selected job' using errcode = '22023';
  end if;
  for job_value in select * from bomedia.job_balances where job_id = any(ids) loop
    select coalesce(sum(l.debit_kobo::numeric - l.credit_kobo), 0) into ledger_due
      from bomedia.journal_lines l join bomedia.journal_entries e on e.id = l.entry_id
      where l.account_code = '1100' and l.job_id = job_value.job_id and e.status = 'posted' and e.business_date <= collection_date;
    if ledger_due <> job_value.balance_kobo then
      raise exception 'Job balance and accounting ledger must agree before collection' using errcode = '23514';
    end if;
    due := due + greatest(0, job_value.balance_kobo);
  end loop;
  -- Underpayments remain debt down to one kobo. Never write them off implicitly.
  -- Excess receipts need a separate explicit deposit/rounding policy; do not guess.
  if paid > due then
    raise exception 'Payment exceeds selected debt; excess needs an explicit deposit or rounding treatment' using errcode = '22023';
  end if;
  receipt := bomedia.record_payment('accounted/' || encode(sha256(convert_to(request_id, 'UTF8')), 'hex'), payload);
  lines_value := jsonb_build_array(jsonb_build_object('account_code', cash_code, 'debit_kobo', paid::text));
  for line in select value from jsonb_array_elements(receipt->'allocations') loop
    if line->>'kind' <> 'settlement' then raise exception 'Unexpected excess allocation' using errcode = '23514'; end if;
    lines_value := lines_value || jsonb_build_array(jsonb_build_object('account_code', '1100', 'credit_kobo', line->>'amount_kobo',
      'customer_id', customer, 'job_id', line->>'job_id'));
  end loop;
  journal := bomedia.post_journal('receipt/' || (receipt->>'payment_id'), jsonb_build_object('actor_id', payload->>'actor_id',
    'business_date', payload->>'business_date', 'kind', 'receipt', 'memo', 'Customer payment',
    'source_type', 'payment', 'source_id', receipt->>'payment_id', 'lines', lines_value));
  result := receipt || journal;
  insert into bomedia.idempotency_requests(operation, request_key, payload_sha256, actor_id, response)
    values ('accounted_payment', request_id, encode(sha256(convert_to(payload::text, 'UTF8')), 'hex'), (payload->>'actor_id')::uuid, result);
  return result;
end $$;

alter table bomedia.bookkeeping_settings enable row level security;
alter table bomedia.ledger_accounts enable row level security;
alter table bomedia.journal_entries enable row level security;
alter table bomedia.journal_lines enable row level security;
revoke all on all tables in schema bomedia from public;
revoke all on all functions in schema bomedia from public;
revoke all on all sequences in schema bomedia from public;
do $$
declare role_name text;
begin
  foreach role_name in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format('revoke all on all tables in schema bomedia from %I', role_name);
      execute format('revoke all on all functions in schema bomedia from %I', role_name);
      execute format('revoke all on all sequences in schema bomedia from %I', role_name);
    end if;
  end loop;
end $$;
commit;

-- Money paid out for an expense that was later lowered or cancelled is held in account 1300 "Paid out, to be recovered". When the payee
-- gives it back, the owner records it here: cash (or transfer / POS) goes up and the 1300 balance goes down. Nothing is edited; each
-- receipt is its own entry. The feed also says how much is still to recover (`_toRecover`).
begin;

create table bomedia.expense_recoveries (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references bomedia.expenses(id),
  amount_kobo bigint not null check (amount_kobo > 0),
  payment_method text not null,
  business_date date not null,
  journal_entry_id uuid references bomedia.journal_entries(id),
  received_by uuid not null references bomedia.staff(id),
  created_at timestamptz not null default now()
);
create index expense_recoveries_expense on bomedia.expense_recoveries(expense_id);
alter table bomedia.expense_recoveries enable row level security;

-- What is still held in 1300 for this expense: what its entries in force hold, less what has come back.
create function bomedia.expense_to_recover(expense_value uuid) returns bigint
language sql stable security definer set search_path = pg_catalog, bomedia as $$
  select coalesce(sum(l.debit_kobo - l.credit_kobo), 0)::bigint
  from bomedia.journal_lines l join bomedia.journal_entries j on j.id = l.entry_id
  where l.account_code = '1300' and j.status = 'posted'
    and (j.id in (select x.id from bomedia.expense_open_entries(expense_value) x(id))
      or (j.source_type = 'expense_recovery' and j.source_id in (select r.id from bomedia.expense_recoveries r where r.expense_id = expense_value)))
$$;

create function bomedia.api_expense_recovery(request_id text, payload jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, bomedia as $$
declare previous jsonb; result jsonb; actor uuid; target bomedia.expenses%rowtype; held bigint; amount bigint; method_value jsonb; rec uuid := gen_random_uuid(); posted jsonb;
begin
  if jsonb_typeof(payload) is distinct from 'object' then raise exception 'A recovery is required' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_object_keys(payload) k where k not in ('actor_id', 'reference', 'amountKobo', 'paymentMethod', 'businessDate')) then
    raise exception 'Unexpected recovery field' using errcode = '22023'; end if;
  actor := (payload ->> 'actor_id')::uuid;
  if not exists (select 1 from bomedia.staff where id = actor and disabled_at is null) then raise exception 'An enabled staff member is required' using errcode = '42501'; end if;
  previous := bomedia.prior_result('api_expense_recovery', request_id, payload);
  if previous is not null then return previous; end if;
  perform singleton from bomedia.bookkeeping_settings where singleton and state = 'active' for update;
  if not found then raise exception 'Active accounting books required' using errcode = '23514'; end if;
  select * into target from bomedia.expenses where reference = payload ->> 'reference' for update;
  if not found then raise exception 'That expense could not be found' using errcode = 'P0002'; end if;
  held := bomedia.expense_to_recover(target.id);
  amount := bomedia.kobo(payload ->> 'amountKobo');
  if held <= 0 then raise exception 'Nothing is waiting to be recovered on this expense' using errcode = '22023'; end if;
  if amount <= 0 or amount > held then raise exception 'Enter an amount up to the % still to recover', (held / 100.0)::numeric(14,2) using errcode = '22023'; end if;
  if coalesce(payload ->> 'businessDate', '') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Business date required' using errcode = '22023'; end if;
  method_value := bomedia.resolve_payment_method(payload ->> 'paymentMethod');
  insert into bomedia.expense_recoveries(id, expense_id, amount_kobo, payment_method, business_date, received_by)
    values (rec, target.id, amount, method_value ->> 'label', (payload ->> 'businessDate')::date, actor);
  posted := bomedia.post_journal('expense-recovery/' || rec::text, jsonb_build_object('actor_id', actor, 'business_date', payload ->> 'businessDate', 'kind', 'expense',
    'memo', 'Recovered from payee: ' || target.category, 'source_type', 'expense_recovery', 'source_id', rec,
    'lines', jsonb_build_array(jsonb_build_object('account_code', method_value ->> 'account_code', 'debit_kobo', amount::text), jsonb_build_object('account_code', '1300', 'credit_kobo', amount::text))));
  update bomedia.expense_recoveries set journal_entry_id = (posted ->> 'journal_entry_id')::uuid where id = rec;
  result := jsonb_build_object('reference', target.reference, 'recovered_kobo', amount::text, 'still_to_recover_kobo', (held - amount)::text);
  insert into bomedia.idempotency_requests(operation, request_key, payload_sha256, actor_id, response)
    values ('api_expense_recovery', request_id, encode(sha256(convert_to(payload::text, 'UTF8')), 'hex'), actor, result);
  insert into bomedia.audit_events(actor_id, action, entity_type, entity_id, details)
    values (actor, 'expense_recovered', 'expense', target.id, jsonb_build_object('reference', target.reference, 'category', target.category, 'paid_to', target.paid_to));
  return result;
end $$;

create or replace function bomedia.api_legacy_feed(resource_value text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,bomedia as $$
declare result jsonb;
begin
  result:=bomedia.legacy_feed_rows(resource_value);
  if resource_value='expenses' then
    -- legacy_feed_rows numbers expenses by (created_at, id); the same ordering gives the same position here.
    select coalesce(jsonb_agg(r.row||jsonb_build_object('_loggedById',coalesce(x.logged_by::text,''),'_revisions',coalesce(x.revisions,0)::text,'_toRecover',coalesce(x.recover,0)::text) order by r.n),'[]') into result
    from jsonb_array_elements(result) with ordinality r(row,n)
    left join (select e.logged_by,(select count(*) from bomedia.expense_revisions v where v.expense_id=e.id) as revisions,bomedia.expense_to_recover(e.id) as recover,
        row_number() over (order by e.created_at,e.id) as rn from bomedia.expenses e) x on x.rn=r.n;
    return result;
  end if;
  if resource_value<>'sales' then return result; end if;
  select coalesce(jsonb_agg(r.row||jsonb_build_object('_jobId',j.id::text,'_customerId',j.customer_id::text,
      '_revisions',(select count(*) from bomedia.job_revisions v where v.job_id=j.id)::text) order by r.n),'[]') into result
  from jsonb_array_elements(result) with ordinality r(row,n) join bomedia.jobs j on j.collection_sequence=(r.row->>'_rowIndex')::bigint;
  return result;
end $$;

revoke all on function bomedia.expense_to_recover(uuid), bomedia.api_expense_recovery(text, jsonb) from public;
grant execute on function bomedia.api_expense_recovery(text, jsonb) to bomedia_financial_runtime;
commit;

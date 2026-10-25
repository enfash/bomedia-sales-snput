-- Accounted expense writes through the restricted financial role.
-- Logging an expense recognises the cost on its business date. An expense
-- already paid credits the chosen Cash/Transfer/POS account; an unpaid one
-- credits 2010 until a separate, owner-recorded payment settles it.
-- The category decides the debit account: running costs hit 6000, Equipment
-- is capitalised to 1500. Stock purchases (SAV, Flex, Raw Materials) are not
-- accepted here; they belong to the restock workflow so rolls and the 1200
-- inventory balance move together.
-- Legacy (imported, pre-books) unpaid expenses have no accrual journal, so
-- they cannot be paid here; they belong in evidence-backed opening balances.
begin;
do $$ begin
  if exists(select 1 from bomedia.idempotency_requests where operation in ('api_expense','api_expense_payment')) then
    raise exception 'Existing expense retries require an explicit compatibility migration';
  end if;
end $$;
insert into bomedia.ledger_accounts(code,name,category,normal_side,purpose) values
  ('2010','Expenses awaiting payment','liability','credit','general');
create table bomedia.expense_categories (
  name text primary key check (btrim(name)<>'' and length(name)<=100),
  account_code text not null references bomedia.ledger_accounts(code) check (account_code in ('6000','1500')),
  enabled boolean not null default true
);
insert into bomedia.expense_categories(name,account_code) values
  ('Ink','6000'),('Utilities','6000'),('Salaries','6000'),('Transport','6000'),('Maintenance','6000'),
  ('Marketing','6000'),('Office Supplies','6000'),('Miscellaneous','6000'),('Equipment','1500');
alter table bomedia.expense_categories enable row level security;
revoke all on bomedia.expense_categories from public;
create function bomedia.api_expense_categories() returns jsonb
language sql security definer set search_path=pg_catalog,bomedia as $$
  select jsonb_build_object('data',coalesce(jsonb_agg(jsonb_build_object('name',c.name,'capital',c.account_code='1500') order by c.name),'[]'),
    'next_after_id',null) from bomedia.expense_categories c join bomedia.ledger_accounts a on a.code=c.account_code
    where c.enabled and a.active
$$;

create function bomedia.api_expense(request_id text,payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,bomedia as $$
declare previous jsonb; result jsonb; actor uuid; expense uuid; amount bigint; paid boolean;
  method_value jsonb; credit_code text; debit_code text; category_value text; journal jsonb; status_value text;
begin
  if jsonb_typeof(payload) is distinct from 'object' then
    raise exception 'Expense payload is required' using errcode='22023'; end if;
  if exists(select 1 from jsonb_object_keys(payload) k where k not in
    ('actor_id','business_date','amount_kobo','category','description','paid_to','status','payment_method')) then
    raise exception 'Unexpected expense field' using errcode='22023'; end if;
  actor:=(payload->>'actor_id')::uuid;
  if not exists(select 1 from bomedia.staff where id=actor and disabled_at is null) then
    raise exception 'An enabled staff member is required' using errcode='42501'; end if;
  previous:=bomedia.prior_result('api_expense',request_id,payload);
  if previous is not null then return previous; end if;
  perform singleton from bomedia.bookkeeping_settings where singleton and state='active' for update;
  if not found then raise exception 'Active accounting books required' using errcode='23514'; end if;
  amount:=bomedia.kobo(payload->>'amount_kobo');
  if amount<=0 then raise exception 'Expense amount must be positive' using errcode='22023'; end if;
  if coalesce(payload->>'business_date','') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Business date required' using errcode='22023'; end if;
  if coalesce(length(btrim(payload->>'category')),0) not between 1 and 100
    or length(coalesce(payload->>'description',''))>1000 or length(coalesce(payload->>'paid_to',''))>200 then
    raise exception 'Category required; description and payee are bounded' using errcode='22023'; end if;
  select c.name,c.account_code into category_value,debit_code from bomedia.expense_categories c
    join bomedia.ledger_accounts a on a.code=c.account_code where c.name=btrim(payload->>'category') and c.enabled and a.active;
  if category_value is null then
    raise exception 'Unsupported expense category; stock purchases use restock' using errcode='22023'; end if;
  if payload->>'status' not in ('paid','unpaid') then
    raise exception 'Expense status must be paid or unpaid' using errcode='22023'; end if;
  paid:=payload->>'status'='paid';
  if paid then
    method_value:=bomedia.resolve_payment_method(payload->>'payment_method');
    credit_code:=method_value->>'account_code';
  elsif payload ? 'payment_method' then
    raise exception 'Unpaid expenses take a method only when paid' using errcode='22023';
  else credit_code:='2010'; end if;
  status_value:=case when paid then 'Paid' else 'Unpaid' end;
  insert into bomedia.expenses(amount_kobo,business_date,category,description,paid_to,payment_method,status,
      logged_by,paid_by,paid_at,occurred_at)
    values(amount,(payload->>'business_date')::date,category_value,nullif(btrim(payload->>'description'),''),
      nullif(btrim(payload->>'paid_to'),''),method_value->>'label',status_value,actor,
      case when paid then actor end,case when paid then now() end,now())
    returning id into expense;
  journal:=bomedia.post_journal('api-expense/'||expense::text,jsonb_build_object('actor_id',actor,'kind','expense',
    'memo','Expense: '||category_value,'business_date',payload->>'business_date','source_type','expense','source_id',expense,
    'lines',jsonb_build_array(jsonb_build_object('account_code',debit_code,'debit_kobo',amount::text),
      jsonb_build_object('account_code',credit_code,'credit_kobo',amount::text))));
  result:=jsonb_build_object('expense_id',expense,'journal_entry_id',journal->>'journal_entry_id',
    'amount_kobo',amount::text,'status',status_value);
  insert into bomedia.idempotency_requests(operation,request_key,payload_sha256,actor_id,response)
    values('api_expense',request_id,encode(sha256(convert_to(payload::text,'UTF8')),'hex'),actor,result);
  insert into bomedia.audit_events(actor_id,action,entity_type,entity_id) values(actor,'expense_logged','expense',expense);
  return result;
end $$;

create function bomedia.api_expense_payment(request_id text,payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,bomedia as $$
declare previous jsonb; result jsonb; actor uuid; target bomedia.expenses%rowtype; method_value jsonb; journal jsonb;
begin
  if jsonb_typeof(payload) is distinct from 'object' then
    raise exception 'Expense payment payload is required' using errcode='22023'; end if;
  if exists(select 1 from jsonb_object_keys(payload) k where k not in ('actor_id','expense_id','business_date','payment_method')) then
    raise exception 'Unexpected expense payment field' using errcode='22023'; end if;
  actor:=(payload->>'actor_id')::uuid;
  if not exists(select 1 from bomedia.staff where id=actor and disabled_at is null) then
    raise exception 'An enabled staff member is required' using errcode='42501'; end if;
  previous:=bomedia.prior_result('api_expense_payment',request_id,payload);
  if previous is not null then return previous; end if;
  perform singleton from bomedia.bookkeeping_settings where singleton and state='active' for update;
  if not found then raise exception 'Active accounting books required' using errcode='23514'; end if;
  if coalesce(payload->>'business_date','') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Business date required' using errcode='22023'; end if;
  select * into target from bomedia.expenses where id=(payload->>'expense_id')::uuid for update;
  if not found or target.status<>'Unpaid' then
    raise exception 'Only an unpaid expense can be paid' using errcode='22023'; end if;
  if not exists(select 1 from bomedia.journal_entries j join bomedia.journal_lines l on l.entry_id=j.id
      where j.source_type='expense' and j.source_id=target.id and j.status='posted' and l.account_code='2010') then
    raise exception 'This expense predates the books; settle it through opening balances' using errcode='23514'; end if;
  if (payload->>'business_date')::date<target.business_date then
    raise exception 'Payment cannot precede the expense' using errcode='22023'; end if;
  method_value:=bomedia.resolve_payment_method(payload->>'payment_method');
  journal:=bomedia.post_journal('api-expense-payment/'||target.id::text,jsonb_build_object('actor_id',actor,'kind','expense',
    'memo','Expense paid: '||target.category,'business_date',payload->>'business_date','source_type','expense_payment','source_id',target.id,
    'lines',jsonb_build_array(jsonb_build_object('account_code','2010','debit_kobo',target.amount_kobo::text),
      jsonb_build_object('account_code',method_value->>'account_code','credit_kobo',target.amount_kobo::text))));
  update bomedia.expenses set status='Paid',payment_method=method_value->>'label',paid_by=actor,paid_at=now() where id=target.id;
  result:=jsonb_build_object('expense_id',target.id,'journal_entry_id',journal->>'journal_entry_id',
    'amount_kobo',target.amount_kobo::text,'status','Paid');
  insert into bomedia.idempotency_requests(operation,request_key,payload_sha256,actor_id,response)
    values('api_expense_payment',request_id,encode(sha256(convert_to(payload::text,'UTF8')),'hex'),actor,result);
  insert into bomedia.audit_events(actor_id,action,entity_type,entity_id) values(actor,'expense_paid','expense',target.id);
  return result;
end $$;
-- Owner list of unpaid expenses. payable=false marks legacy rows without an
-- accrual journal; they are shown but must be settled via opening balances.
create function bomedia.api_expenses_awaiting() returns jsonb
language sql security definer set search_path=pg_catalog,bomedia as $$
  select jsonb_build_object('data',coalesce(jsonb_agg(to_jsonb(r) order by r.business_date nulls first,r.id),'[]'),'next_after_id',null) from
    (select e.id,e.amount_kobo::text as amount_kobo,e.business_date,e.category,e.description,e.paid_to,
      coalesce(s.display_name,e.logged_by_snapshot) as logged_by,
      exists(select 1 from bomedia.journal_entries j join bomedia.journal_lines l on l.entry_id=j.id
        where j.source_type='expense' and j.source_id=e.id and j.status='posted' and l.account_code='2010') as payable
     from bomedia.expenses e left join bomedia.staff s on s.id=e.logged_by
     where e.status='Unpaid' order by e.business_date nulls first,e.id limit 500) r
$$;
revoke all on function bomedia.api_expense(text,jsonb),bomedia.api_expense_payment(text,jsonb),bomedia.api_expense_categories(),bomedia.api_expenses_awaiting() from public;
grant execute on function bomedia.api_expense(text,jsonb),bomedia.api_expense_payment(text,jsonb),bomedia.api_expense_categories(),bomedia.api_expenses_awaiting() to bomedia_financial_runtime;
commit;

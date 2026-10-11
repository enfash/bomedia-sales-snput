-- Stage 3: atomic screen batches, receipt linkage and evidence-backed opening liabilities.
-- Final opening journals are still a privileged final-import operation, not a staff action.
begin;
create table bomedia.receipt_uploads (
  id uuid primary key default gen_random_uuid(), actor_id uuid not null references bomedia.staff(id),
  request_id uuid not null, sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
  file_id text not null unique check(file_id ~ '^[A-Za-z0-9_-]{10,200}$'),
  mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp')),
  byte_size integer not null check(byte_size between 1 and 1048576),
  ready boolean not null default false, expense_id uuid references bomedia.expenses(id),
  created_at timestamptz not null default now(), unique(actor_id,request_id)
);
alter table bomedia.receipt_uploads enable row level security;
revoke all on bomedia.receipt_uploads from public;

create function bomedia.api_receipt(action_value text,payload jsonb) returns jsonb
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
    if not found or (target.actor_id<>actor and (action_value='ready' or target.expense_id is null)) then
      raise exception 'Receipt not available' using errcode='42501'; end if;
    if action_value='ready' then update bomedia.receipt_uploads set ready=true where id=target.id returning * into target; end if;
  else raise exception 'Unknown receipt action' using errcode='22023'; end if;
  return to_jsonb(target);
end $$;

create table bomedia.expense_opening_items (
  expense_id uuid primary key references bomedia.expenses(id),
  journal_entry_id uuid not null unique references bomedia.journal_entries(id),
  amount_kobo bigint not null check(amount_kobo>0), evidence_reference text not null check(btrim(evidence_reference)<>''),
  confirmed_by uuid not null references bomedia.staff(id), confirmed_at timestamptz not null default now()
);
alter table bomedia.expense_opening_items enable row level security;
revoke all on bomedia.expense_opening_items from public;
-- Only the final-import/migration role may call this; no runtime grant.
create function bomedia.link_expense_opening(payload jsonb) returns void
language plpgsql security definer set search_path=pg_catalog,bomedia as $$
declare e bomedia.expenses%rowtype; j bomedia.journal_entries%rowtype; amount bigint;
begin
  select * into e from bomedia.expenses where id=(payload->>'expense_id')::uuid for update;
  if not found or e.status<>'Unpaid' or e.amount_kobo<=0 or e.business_date is null then raise exception 'Supported unpaid expense required' using errcode='22023'; end if;
  select * into j from bomedia.journal_entries where id=(payload->>'journal_entry_id')::uuid;
  if not found or j.kind<>'opening' or j.status<>'posted' or not j.opening_confirmed or j.source_type is distinct from 'expense_opening' or j.source_id is distinct from e.id then
    raise exception 'An evidenced posted opening journal for this expense is required' using errcode='23514'; end if;
  select coalesce(sum(credit_kobo-debit_kobo),0) into amount from bomedia.journal_lines where entry_id=j.id and account_code='2010';
  if amount<>e.amount_kobo or exists(select 1 from bomedia.journal_entries where source_type='expense' and source_id=e.id and status='posted') then
    raise exception 'Opening liability must match this unaccrued expense exactly' using errcode='23514'; end if;
  insert into bomedia.expense_opening_items(expense_id,journal_entry_id,amount_kobo,evidence_reference,confirmed_by)
    values(e.id,j.id,amount,j.evidence_reference,(payload->>'actor_id')::uuid);
end $$;
create function bomedia.expense_is_payable(expense uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,bomedia as $$
  select exists(select 1 from bomedia.journal_entries j join bomedia.journal_lines l on l.entry_id=j.id
      where j.source_type='expense' and j.source_id=expense and j.status='posted' and l.account_code='2010')
    or exists(select 1 from bomedia.expense_opening_items o join bomedia.journal_entries j on j.id=o.journal_entry_id
      join bomedia.expenses e on e.id=o.expense_id where o.expense_id=expense and o.amount_kobo=e.amount_kobo and j.status='posted'
      and not exists(select 1 from bomedia.journal_entries reversal where reversal.reverses_entry_id=j.id and reversal.status='posted'))
$$;
do $$
declare definition text; needle text;
begin
  definition:=pg_get_functiondef('bomedia.api_expense_payment(text,jsonb)'::regprocedure);
  needle:=$text$exists(select 1 from bomedia.journal_entries j join bomedia.journal_lines l on l.entry_id=j.id
      where j.source_type='expense' and j.source_id=target.id and j.status='posted' and l.account_code='2010')$text$;
  if strpos(definition,needle)=0 then raise exception 'Expense payment changed; review opening liability integration'; end if;
  execute replace(definition,needle,'bomedia.expense_is_payable(target.id)');
  definition:=pg_get_functiondef('bomedia.api_expenses_awaiting()'::regprocedure);
  needle:=$text$exists(select 1 from bomedia.journal_entries j join bomedia.journal_lines l on l.entry_id=j.id
        where j.source_type='expense' and j.source_id=e.id and j.status='posted' and l.account_code='2010')$text$;
  if strpos(definition,needle)=0 then raise exception 'Awaiting expenses changed'; end if;
  execute replace(definition,needle,'bomedia.expense_is_payable(e.id)');
  definition:=pg_get_functiondef('bomedia.legacy_feed_rows(text)'::regprocedure);
  needle:=$text$'TIMESTAMP',e.created_at::text,'_rowIndex'$text$;
  if strpos(definition,needle)=0 then raise exception 'Expense feed changed'; end if;
  execute replace(definition,needle,$text$'_expenseId',e.id,'_amountKobo',e.amount_kobo::text,'_payable',bomedia.expense_is_payable(e.id),'_backend','postgres','TIMESTAMP',e.created_at::text,'_rowIndex'$text$);
end $$;

create function bomedia.api_screen_expense(request_id text,payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,bomedia as $$
declare actor uuid; previous jsonb; result jsonb; results jsonb:='[]'; item jsonb; saved jsonb; target bomedia.expenses%rowtype;
  receipt bomedia.receipt_uploads%rowtype; idx integer:=0; pay boolean;
begin
  actor:=(payload->>'actor_id')::uuid;
  if not exists(select 1 from bomedia.staff where id=actor and disabled_at is null) then raise exception 'Enabled staff required' using errcode='42501'; end if;
  previous:=bomedia.prior_result('api_screen_expense',request_id,payload);
  if previous is not null then return previous; end if;
  if payload->>'operation' not in ('log','pay') then raise exception 'Expense operation required' using errcode='22023'; end if;
  perform singleton from bomedia.bookkeeping_settings where singleton and state='active' for update;
  if not found then raise exception 'Active books required' using errcode='23514'; end if;
  pay:=payload->>'operation'='pay';
  if pay then
    select * into target from bomedia.expenses where id=(payload->>'expenseId')::uuid for update;
    if not found or target.amount_kobo<>bomedia.kobo(payload->>'amountKobo') then raise exception 'Expense amount changed; review it' using errcode='22023'; end if;
    saved:=bomedia.api_expense_payment('screen-pay/'||request_id,jsonb_build_object('actor_id',actor,'expense_id',target.id,
      'business_date',payload->>'businessDate','payment_method',payload->>'paymentMethod'));
    results:=jsonb_build_array(saved||jsonb_build_object('reference',target.reference,'business_date',payload->>'businessDate','receipt_id',null));
  else
    if jsonb_typeof(payload->'items') is distinct from 'array' or jsonb_array_length(payload->'items') not between 1 and 100 then
      raise exception 'Expense items required' using errcode='22023'; end if;
    for item in select value from jsonb_array_elements(payload->'items') loop
      saved:=bomedia.api_expense('screen/'||request_id||'/'||idx,jsonb_strip_nulls(jsonb_build_object('actor_id',actor,
        'business_date',item->>'businessDate','amount_kobo',item->>'amountKobo','category',item->>'category',
        'description',item->>'description','paid_to',item->>'paidTo','status',item->>'status','payment_method',item->>'paymentMethod')));
      select * into target from bomedia.expenses where id=(saved->>'expense_id')::uuid;
      if item ? 'receiptId' then
        select * into receipt from bomedia.receipt_uploads where id=(item->>'receiptId')::uuid for update;
        if not found or not receipt.ready or receipt.actor_id<>actor or receipt.expense_id is not null then
          raise exception 'Receipt must be uploaded by this staff member and attached only once' using errcode='22023'; end if;
        update bomedia.receipt_uploads set expense_id=target.id where id=receipt.id;
        insert into bomedia.receipt_references(expense_id,storage_provider,external_file_id,url)
          values(target.id,'supabase_storage',receipt.file_id,'/api/accounting/receipts/'||receipt.id);
      end if;
      results:=results||jsonb_build_array(saved||jsonb_build_object('reference',target.reference,'business_date',item->>'businessDate','receipt_id',item->>'receiptId'));
      idx:=idx+1;
    end loop;
  end if;
  result:=jsonb_build_object('request_id',request_id,'actor_id',actor,'operation',payload->>'operation','expenses',results);
  insert into bomedia.idempotency_requests(operation,request_key,payload_sha256,actor_id,response)
    values('api_screen_expense',request_id,encode(sha256(convert_to(payload::text,'UTF8')),'hex'),actor,result);
  return result;
end $$;
revoke all on function bomedia.link_expense_opening(jsonb),bomedia.expense_is_payable(uuid),bomedia.api_screen_expense(text,jsonb),bomedia.api_receipt(text,jsonb) from public;
grant execute on function bomedia.api_screen_expense(text,jsonb),bomedia.api_receipt(text,jsonb) to bomedia_financial_runtime;
commit;

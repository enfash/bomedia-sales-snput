-- Staff choose Cash, Transfer or POS; ledger destinations remain server-side.
begin;
do $$ begin
  if exists(select 1 from bomedia.idempotency_requests where operation in ('accounted_payment','api_sale')) then
    raise exception 'Existing financial retries require explicit compatibility migration';
  end if;
end $$;
insert into bomedia.ledger_accounts(code,name,category,normal_side,purpose) values
  ('1010','Transfer receipts awaiting reconciliation','asset','debit','cash_bank'),
  ('1020','POS receipts awaiting settlement','asset','debit','cash_bank');
create table bomedia.payment_methods (
  method text primary key check(method in ('cash','transfer','pos')),
  label text not null,
  account_code text not null references bomedia.ledger_accounts(code),
  enabled boolean not null default true
);
insert into bomedia.payment_methods(method,label,account_code) values
  ('cash','Cash','1000'),('transfer','Transfer','1010'),('pos','POS','1020');
alter table bomedia.payment_methods enable row level security;
revoke all on bomedia.payment_methods from public;
create function bomedia.resolve_payment_method(value text) returns jsonb
language plpgsql set search_path=pg_catalog,bomedia as $$
declare method_value jsonb;
begin
  select jsonb_build_object('method',m.method,'label',m.label,'account_code',m.account_code) into method_value
    from bomedia.payment_methods m join bomedia.ledger_accounts a on a.code=m.account_code
    where m.method=lower(btrim(value)) and m.enabled and a.active and a.purpose='cash_bank';
  if method_value is null then raise exception 'Choose Cash, Transfer or POS' using errcode='22023'; end if;
  return method_value;
end $$;
create function bomedia.api_payment_methods() returns jsonb
language sql security definer set search_path=pg_catalog,bomedia as $$
  select jsonb_build_object('data',coalesce(jsonb_agg(jsonb_build_object('method',m.method,'label',m.label) order by m.method),'[]'),
    'next_after_id',null) from bomedia.payment_methods m join bomedia.ledger_accounts a on a.code=m.account_code
    where m.enabled and a.active and a.purpose='cash_bank'
$$;

create or replace function bomedia.api_collect(request_id text, payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,bomedia as $$
declare method_value jsonb;
begin
  if jsonb_typeof(payload) is distinct from 'object' then
    raise exception 'Payment payload is required' using errcode='22023'; end if;
  if exists(select 1 from jsonb_object_keys(payload) k where k not in
    ('actor_id','customer_id','job_ids','amount_kobo','business_date','cash_account_code','method','notes')) then
    raise exception 'Unexpected payment field' using errcode='22023'; end if;
  if not exists(select 1 from bomedia.staff where id=(payload->>'actor_id')::uuid and disabled_at is null) then
    raise exception 'An enabled collector is required' using errcode='42501'; end if;
  if request_id is null or btrim(request_id)='' or length(request_id)>200 then
    raise exception 'Invalid operation key' using errcode='22023'; end if;
  method_value:=bomedia.resolve_payment_method(payload->>'method');
  if payload->>'cash_account_code' is not null and payload->>'cash_account_code'<>method_value->>'account_code' then
    raise exception 'Payment method and receiving account do not match' using errcode='22023'; end if;
  payload:=payload||jsonb_build_object('method',method_value->>'label','cash_account_code',method_value->>'account_code');
  return bomedia.record_accounted_payment('api-collection/'||encode(sha256(convert_to(request_id,'UTF8')),'hex'),payload);
end $$;
-- The core remains private; only this method-resolving wrapper is granted.
alter function bomedia.api_sale(text,jsonb) rename to post_tracked_sale;
revoke all on function bomedia.post_tracked_sale(text,jsonb) from public,bomedia_financial_runtime;
create function bomedia.api_sale(request_id text,payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,bomedia as $$
declare method_value jsonb;
begin
  if bomedia.kobo(coalesce(payload->>'initial_payment_kobo','0'))>0 then
    method_value:=bomedia.resolve_payment_method(payload->>'payment_method');
    if payload->>'cash_account_code' is not null and payload->>'cash_account_code'<>method_value->>'account_code' then
      raise exception 'Payment method and receiving account do not match' using errcode='22023'; end if;
    payload:=payload||jsonb_build_object('payment_method',method_value->>'label','cash_account_code',method_value->>'account_code');
  end if;
  return bomedia.post_tracked_sale(request_id,payload);
end $$;
revoke all on function bomedia.resolve_payment_method(text),bomedia.api_payment_methods(),bomedia.api_sale(text,jsonb) from public;
grant execute on function bomedia.api_payment_methods(),bomedia.api_sale(text,jsonb) to bomedia_financial_runtime;
commit;

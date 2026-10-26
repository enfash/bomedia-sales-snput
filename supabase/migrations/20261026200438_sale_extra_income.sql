-- Owner policy: future excess receipts are non-refundable extra income, not customer credit.
-- Keep the original sale, full receipt, debt allocations and separate income auditable.
begin;

insert into bomedia.ledger_accounts(code,name,category,normal_side,purpose)
values ('4020','Extra payment income','income','credit','general');

create table bomedia.payment_extra_income (
  payment_id uuid primary key,
  job_id uuid not null,
  customer_id uuid not null,
  amount_kobo bigint not null check (amount_kobo > 0),
  foreign key (payment_id,customer_id) references bomedia.payments(id,customer_id),
  foreign key (job_id,customer_id) references bomedia.jobs(id,customer_id)
);
create index payment_extra_income_job on bomedia.payment_extra_income(job_id);
alter table bomedia.payment_extra_income enable row level security;
revoke all on bomedia.payment_extra_income from public,anon,authenticated,bomedia_financial_runtime;

-- Guarded edits retain all subsequent validation, approval and idempotency repairs.
create function pg_temp.patch_function(target regprocedure, needle text, replacement text) returns void
language plpgsql as $$
declare definition text := pg_get_functiondef(target);
begin
  if strpos(definition,needle)=0 then raise exception 'Extra income migration: review changed function %',target; end if;
  execute replace(definition,needle,replacement);
end $$;

select pg_temp.patch_function('bomedia.record_payment(text,jsonb)',
  $old$if remaining > 0 then
    insert into bomedia.payment_allocations$old$,
  $new$if remaining > 0 and payload->>'excess_treatment' = 'income' then
    insert into bomedia.payment_extra_income(payment_id,job_id,customer_id,amount_kobo)
      values(payment,last_job,customer,remaining);
  elsif remaining > 0 then
    insert into bomedia.payment_allocations$new$);
select pg_temp.patch_function('bomedia.record_payment(text,jsonb)',
  $old$(select sum(amount_kobo) from bomedia.payment_allocations where payment_id = payment) <> paid$old$,
  $new$coalesce((select sum(amount_kobo) from bomedia.payment_allocations where payment_id = payment),0)
    + coalesce((select amount_kobo from bomedia.payment_extra_income where payment_id=payment),0) <> paid$new$);
select pg_temp.patch_function('bomedia.record_payment(text,jsonb)',
  $old$'amount_kobo', paid::text, 'allocations', allocations)$old$,
  $new$'amount_kobo', paid::text, 'allocations', allocations,
    'extra_income_kobo',coalesce((select amount_kobo::text from bomedia.payment_extra_income where payment_id=payment),'0'))$new$);

select pg_temp.patch_function('bomedia.record_accounted_payment(text,jsonb)',
  $old$if paid > due then
    raise exception 'Payment exceeds selected debt; excess needs an explicit deposit or rounding treatment' using errcode = '22023';
  end if;$old$,
  $new$-- The owner's explicit policy records excess as income in 4020, never as receivables credit.$new$);
select pg_temp.patch_function('bomedia.record_accounted_payment(text,jsonb)',
  $old$'hex'), payload);$old$,
  $new$'hex'), payload || jsonb_build_object('excess_treatment','income'));$new$);
select pg_temp.patch_function('bomedia.record_accounted_payment(text,jsonb)',
  $old$journal := bomedia.post_journal('receipt/'$old$,
  $new$if (receipt->>'extra_income_kobo')::bigint > 0 then
    lines_value := lines_value || jsonb_build_array(jsonb_build_object('account_code','4020',
      'credit_kobo',receipt->>'extra_income_kobo','customer_id',customer));
  end if;
  journal := bomedia.post_journal('receipt/'$new$);

select pg_temp.patch_function('bomedia.post_tracked_sale(text,jsonb)',
  $old$if initial_paid>total then raise exception 'Initial receipt exceeds the sale; explicit customer credit treatment required' using errcode='22023'; end if;$old$,
  $new$-- The receipt primitive splits any excess from settlement and posts it to extra income.$new$);
select pg_temp.patch_function('bomedia.screen_order_before_approvals(text,jsonb)',
  $old$or paid>total$old$, '');

-- Include the split on payment history, without altering the sale's settled amount or debt.
select pg_temp.patch_function('bomedia.api_customer_profile(text)',
  $old$'amount_kobo', p.amount_kobo::text, 'method'$old$,
  $new$'amount_kobo', p.amount_kobo::text,
    'extra_income_kobo',coalesce((select amount_kobo::text from bomedia.payment_extra_income where payment_id=p.id),'0'), 'method'$new$);

-- The sales feed keeps settlement-only payment columns so all existing debt calculations remain valid.
-- The payment feed gets an explicit extra-income row on the actual receipt date (including day-one payments).
alter function bomedia.api_legacy_feed(text) rename to feed_before_extra_income;
revoke all on function bomedia.feed_before_extra_income(text) from public,bomedia_financial_runtime;
create function bomedia.api_legacy_feed(resource_value text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,bomedia as $$
declare result jsonb; extras jsonb;
begin
  result:=bomedia.feed_before_extra_income(resource_value);
  if resource_value='sales' then
    select coalesce(jsonb_agg(r.row || jsonb_build_object('EXTRA INCOME (₦)',bomedia.naira_text(coalesce(x.amount,0))) order by r.n),'[]')
      into result from jsonb_array_elements(result) with ordinality r(row,n)
      left join (select job_id,sum(amount_kobo) amount from bomedia.payment_extra_income group by job_id) x
        on x.job_id=(r.row->>'_jobId')::uuid;
  elsif resource_value='payments' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'PAYMENT ID',p.reference,'SALES ID',coalesce(o.legacy_sales_id,o.reference),
      'CLIENT NAME',c.display_name,'DATE',p.business_date::text,'AMOUNT',bomedia.naira_text(x.amount_kobo),
      'PAYMENT TYPE','Extra income','COLLECTED BY',coalesce(s.display_name,p.collected_by_snapshot,''),
      'NOTES','Non-refundable excess payment','TIMESTAMP',p.created_at::text,'BATCH ID',p.reference,
      'PAYMENT METHOD',coalesce(p.method,''),'_extraIncomeKobo',x.amount_kobo::text,
      '_paymentId',p.id::text) order by p.created_at,p.id),'[]') into extras
    from bomedia.payment_extra_income x join bomedia.payments p on p.id=x.payment_id
      join bomedia.jobs j on j.id=x.job_id join bomedia.orders o on o.id=j.order_id
      join bomedia.customers c on c.id=x.customer_id left join bomedia.staff s on s.id=p.collected_by;
    result:=result||extras;
  end if;
  return result;
end $$;
revoke all on function bomedia.api_legacy_feed(text) from public;
grant execute on function bomedia.api_legacy_feed(text) to bomedia_financial_runtime;
commit;

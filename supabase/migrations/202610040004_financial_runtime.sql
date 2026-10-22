-- Narrow server capabilities. No activation, opening entries or browser grants.
begin;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='bomedia_financial_runtime') then
    create role bomedia_financial_runtime nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
  end if;
end $$;

-- Requests reach this capability only through the trusted server after session
-- verification. The dedicated login cannot call primitives or write tables.
create function bomedia.api_collect(request_id text, payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,bomedia as $$
begin
  if jsonb_typeof(payload) is distinct from 'object' then
    raise exception 'Payment payload is required' using errcode='22023'; end if;
  if exists(select 1 from jsonb_object_keys(payload) k where k not in
    ('actor_id','customer_id','job_ids','amount_kobo','business_date','cash_account_code','method','notes')) then
    raise exception 'Unexpected payment field' using errcode='22023'; end if;
  if not exists(select 1 from bomedia.staff where id=(payload->>'actor_id')::uuid and disabled_at is null) then
    raise exception 'An enabled collector is required' using errcode='42501'; end if;
  return bomedia.record_accounted_payment(request_id,payload);
end $$;

-- Explicit projections keep hashes, sessions and migration evidence private.
-- Monetary values are strings; clients must not coerce bigint into unsafe numbers.
create function bomedia.api_read(resource_value text, filter_value jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,bomedia as $$
declare result jsonb; take_value integer; after_value uuid; customer_value uuid;
begin
  if filter_value is null or jsonb_typeof(filter_value) <> 'object' then
    raise exception 'Read filter is required' using errcode='22023'; end if;
  if exists(select 1 from jsonb_object_keys(filter_value) k where k not in ('limit','after_id','customer_id')) then
    raise exception 'Unexpected read filter' using errcode='22023'; end if;
  take_value := coalesce((filter_value->>'limit')::integer,100);
  if take_value not between 1 and 500 then raise exception 'Limit must be 1 to 500' using errcode='22023'; end if;
  after_value := (filter_value->>'after_id')::uuid;
  customer_value := (filter_value->>'customer_id')::uuid;
  if customer_value is not null and resource_value not in ('customers','jobs','payments') then
    raise exception 'Customer filter is not supported here' using errcode='22023'; end if;
  if resource_value='customers' then
    select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') into result from
      (select id,display_name,contact from bomedia.customers where (after_value is null or id>after_value)
        and (customer_value is null or id=customer_value) order by id limit take_value+1) r;
  elsif resource_value='jobs' then
    select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') into result from
      (select j.id,j.order_id,j.customer_id,coalesce(j.client_name_snapshot,c.display_name) as customer_name,
        j.description,j.material_id,j.quantity::text,j.unit_price_kobo::text,j.amount_kobo::text,b.balance_kobo::text,
        j.job_status,j.business_date,j.logged_by,j.created_at
       from bomedia.jobs j join bomedia.job_balances b on b.job_id=j.id join bomedia.customers c on c.id=j.customer_id
       where (after_value is null or j.id>after_value) and (customer_value is null or j.customer_id=customer_value)
       order by j.id limit take_value+1) r;
  elsif resource_value='payments' then
    select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') into result from
      (select p.id,p.customer_id,p.amount_kobo::text,p.business_date,p.method,p.collected_by,p.notes,p.created_at,
        (select coalesce(jsonb_agg(jsonb_build_object('job_id',a.job_id,'amount_kobo',a.amount_kobo::text,'kind',a.kind) order by a.job_id),'[]')
          from bomedia.payment_allocations a where a.payment_id=p.id) as allocations
       from bomedia.payments p where (after_value is null or p.id>after_value)
        and (customer_value is null or p.customer_id=customer_value) order by p.id limit take_value+1) r;
  elsif resource_value='expenses' then
    select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') into result from
      (select e.id,e.amount_kobo::text,e.business_date,e.category,e.description,e.paid_to,e.payment_method,e.status,
        e.logged_by,e.logged_by_snapshot,e.paid_by,e.paid_at,e.occurred_at,e.created_at,
        (select coalesce(jsonb_agg(jsonb_build_object('id',rr.id,'url',rr.url,'storage_provider',rr.storage_provider) order by rr.id),'[]')
          from bomedia.receipt_references rr where rr.expense_id=e.id) as receipts
       from bomedia.expenses e where after_value is null or e.id>after_value order by e.id limit take_value+1) r;
  elsif resource_value='materials' then
    select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') into result from
      (select m.id,m.legacy_material_id,m.name,m.category,m.width_ft::text,m.selling_price_per_sqft_kobo::text,
        m.low_stock_threshold_ft::text,m.active_roll_id,m.notes,
        (select coalesce(sum(i.remaining_length_ft),0)::text from bomedia.inventory_rolls i where i.material_id=m.id) as remaining_length_ft,
        (select coalesce(sum(i.total_length_ft),0)::text from bomedia.inventory_rolls i where i.material_id=m.id) as total_length_ft,
        (select count(*)::int from bomedia.inventory_rolls i where i.material_id=m.id) as roll_count
       from bomedia.materials m where after_value is null or m.id>after_value order by m.id limit take_value+1) r;
  elsif resource_value='inventory' then
    select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') into result from
      (select id,material_id,legacy_roll_id,item_name,category,width_ft::text,total_length_ft::text,remaining_length_ft::text,
        waste_length_ft::text,purchase_cost_kobo::text,selling_price_kobo::text,cost_per_sqft_kobo_exact::text,
        low_stock_threshold_ft::text,status,business_date,original_unit
       from bomedia.inventory_rolls where after_value is null or id>after_value order by id limit take_value+1) r;
  elsif resource_value='estimates' then
    select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') into result from
      (select id,legacy_quote_id,customer_id,client_name_snapshot,business_date,cart_data,created_at
       from bomedia.estimates where after_value is null or id>after_value order by id limit take_value+1) r;
  elsif resource_value='cash_accounts' then
    if after_value is not null or customer_value is not null then raise exception 'Invalid account filter' using errcode='22023'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('code',code,'name',name) order by code),'[]') into result
      from bomedia.ledger_accounts where active and purpose='cash_bank';
    return jsonb_build_object('data',result,'next_after_id',null);
  else raise exception 'Unsupported resource' using errcode='22023'; end if;
  return jsonb_build_object('data',case when jsonb_array_length(result)>take_value then result-take_value else result end,
    'next_after_id',case when jsonb_array_length(result)>take_value then result->(take_value-1)->>'id' else null end);
end $$;
-- Owner-only HTTP endpoint. The server checks the verified configured admin.
create function bomedia.api_report(from_value date, through_value date) returns jsonb
language plpgsql security definer set search_path=pg_catalog,bomedia as $$
declare balances jsonb; settings jsonb; profit numeric;
begin
  if from_value is null or through_value is null or from_value>through_value then
    raise exception 'Choose a valid reporting period' using errcode='22023'; end if;
  select jsonb_build_object('starts_on',starts_on,'state',state,'closed_through',closed_through,'currency',currency)
    into settings from bomedia.bookkeeping_settings where singleton;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.code),'[]') into balances from (
    select a.code,a.name,a.category,a.normal_side,
      coalesce(sum(l.debit_kobo) filter(where e.business_date<=through_value and e.status='posted'),0)::text as debit_kobo,
      coalesce(sum(l.credit_kobo) filter(where e.business_date<=through_value and e.status='posted'),0)::text as credit_kobo,
      coalesce(sum(l.debit_kobo) filter(where e.business_date between from_value and through_value and e.status='posted'),0)::text as period_debit_kobo,
      coalesce(sum(l.credit_kobo) filter(where e.business_date between from_value and through_value and e.status='posted'),0)::text as period_credit_kobo
    from bomedia.ledger_accounts a left join bomedia.journal_lines l on l.account_code=a.code
      left join bomedia.journal_entries e on e.id=l.entry_id group by a.code
  ) r;
  select coalesce(sum((v->>'period_credit_kobo')::numeric-(v->>'period_debit_kobo')::numeric),0) into profit
    from jsonb_array_elements(balances) v where v->>'category' in ('income','expense');
  return jsonb_build_object('from',from_value,'through',through_value,'bookkeeping',settings,'accounts',balances,
    'period_profit_kobo',profit::text,
    'receipts_kobo',(select coalesce(sum(amount_kobo),0)::text from bomedia.payments where business_date between from_value and through_value),
    'recorded_expenses_kobo',(select coalesce(sum(amount_kobo),0)::text from bomedia.expenses where business_date between from_value and through_value));
end $$;
revoke all on function bomedia.api_report(date,date) from public;
grant execute on function bomedia.api_report(date,date) to bomedia_financial_runtime;
revoke all on function bomedia.api_collect(text,jsonb),bomedia.api_read(text,jsonb) from public;
grant usage on schema bomedia to bomedia_financial_runtime;
grant execute on function bomedia.api_collect(text,jsonb),bomedia.api_read(text,jsonb) to bomedia_financial_runtime;
commit;

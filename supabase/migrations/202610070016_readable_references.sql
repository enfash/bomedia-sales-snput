-- Readable references, never long random codes, wherever staff can see an ID
-- (owner request, 7 Oct). The old sheet's styles are kept:
--   sale (order)  BOM-YYYYMMDD-NNNN, as New Sale made them
--   payment       PAY-YYYYMMDD-NNNN
--   expense       EXP-YYYYMMDD-NNNN
--   roll          its name, e.g. "Flex 10ft - Roll 003"
--   material      NAME-WIDTHFT, e.g. FLEX-10FT, as the Inventory page made them
-- Imported rows keep their sheet IDs. Database IDs stay internal. Local only.
begin;
create sequence bomedia.order_reference_seq;
create sequence bomedia.payment_reference_seq;
create sequence bomedia.expense_reference_seq;
alter table bomedia.orders add column reference text unique;
alter table bomedia.payments add column reference text unique;
alter table bomedia.expenses add column reference text unique;

create function bomedia.next_reference(prefix text, seq regclass) returns text
language sql volatile set search_path=pg_catalog,bomedia as $$
  select prefix||'-'||to_char(now() at time zone 'Africa/Lagos','YYYYMMDD')||'-'||lpad(nextval(seq)::text,4,'0')
$$;
create function bomedia.set_reference() returns trigger
language plpgsql set search_path=pg_catalog,bomedia as $$
begin
  if new.reference is null then
    new.reference:=case tg_table_name
      when 'orders' then bomedia.next_reference('BOM','bomedia.order_reference_seq')
      when 'payments' then bomedia.next_reference('PAY','bomedia.payment_reference_seq')
      else bomedia.next_reference('EXP','bomedia.expense_reference_seq') end;
  end if;
  return new;
end $$;
create trigger orders_reference before insert on bomedia.orders for each row execute function bomedia.set_reference();
create trigger payments_reference before insert on bomedia.payments for each row execute function bomedia.set_reference();
create trigger expenses_reference before insert on bomedia.expenses for each row execute function bomedia.set_reference();

-- Rows already there (sandbox and rehearsal data), dated by when they were made.
update bomedia.orders o set reference='BOM-'||to_char(o.created_at at time zone 'Africa/Lagos','YYYYMMDD')||'-'||lpad(r.n::text,4,'0')
  from (select id,nextval('bomedia.order_reference_seq') as n from (select id from bomedia.orders order by created_at,id) x) r where r.id=o.id;
update bomedia.payments p set reference='PAY-'||to_char(p.created_at at time zone 'Africa/Lagos','YYYYMMDD')||'-'||lpad(r.n::text,4,'0')
  from (select id,nextval('bomedia.payment_reference_seq') as n from (select id from bomedia.payments order by created_at,id) x) r where r.id=p.id;
update bomedia.expenses e set reference='EXP-'||to_char(e.created_at at time zone 'Africa/Lagos','YYYYMMDD')||'-'||lpad(r.n::text,4,'0')
  from (select id,nextval('bomedia.expense_reference_seq') as n from (select id from bomedia.expenses order by created_at,id) x) r where r.id=e.id;

create function bomedia.material_code(legacy text, name text, width numeric) returns text
language sql immutable set search_path=pg_catalog as $$
  select coalesce(legacy, upper(regexp_replace(btrim(name),'\s+','-','g'))||'-'||trim_scale(width)::text||'FT')
$$;

create or replace function bomedia.legacy_feed_rows(resource_value text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,bomedia as $$
declare result jsonb;
begin
  if resource_value='sales' then
    with alloc as (
      select a.job_id,
        sum(a.amount_kobo) filter (where p.business_date is not distinct from j.business_date) as initial_kobo,
        sum(a.amount_kobo) filter (where p.business_date is distinct from j.business_date) as later_kobo
      from bomedia.payment_allocations a join bomedia.payments p on p.id=a.payment_id join bomedia.jobs j on j.id=a.job_id
      group by a.job_id),
    adj as (select job_id,sum(amount_kobo) as kobo from bomedia.job_adjustments group by job_id),
    rows as (
      select j.collection_sequence as seq, j.business_date, j.created_at,
        coalesce(j.client_name_snapshot,c.display_name) as client, coalesce(j.contact_snapshot,c.contact,'') as contact,
        j.description, coalesce(sv.name,m.name,j.material_name_snapshot,'') as material,
        j.price_per_sqft_kobo, j.legacy_size_values, j.width_ft, j.height_ft, j.quantity, j.unit_price_kobo,
        j.amount_kobo+coalesce(adj.kobo,0) as total_kobo, coalesce(al.initial_kobo,0) as initial_kobo,
        coalesce(al.later_kobo,0) as later_kobo, j.job_status,
        coalesce(s.display_name,j.logged_by_snapshot,'') as logged_by,
        coalesce(o.legacy_sales_id,o.reference) as sales_id, coalesce(o.legacy_transaction_id,o.legacy_sales_id,o.reference) as transaction_id
      from bomedia.jobs j join bomedia.orders o on o.id=j.order_id join bomedia.customers c on c.id=j.customer_id
      left join bomedia.materials m on m.id=j.material_id left join bomedia.services sv on sv.id=j.service_id
      left join bomedia.staff s on s.id=j.logged_by left join alloc al on al.job_id=j.id left join adj on adj.job_id=j.id)
    select coalesce(jsonb_agg(jsonb_build_object(
      'DATE',coalesce(r.business_date::text,''),'CLIENT NAME',r.client,'JOB DESCRIPTION',r.description,'CONTACT',r.contact,
      'MATERIAL',r.material,'Cost Per SQRFT',coalesce(bomedia.naira_text(r.price_per_sqft_kobo),''),
      '3FT',coalesce(r.legacy_size_values->>'3FT',''),'4FT',coalesce(r.legacy_size_values->>'4FT',''),
      '5FT',coalesce(r.legacy_size_values->>'5FT',''),'6FT',coalesce(r.legacy_size_values->>'6FT',''),
      '7FT',coalesce(r.legacy_size_values->>'7FT',''),'8FT',coalesce(r.legacy_size_values->>'8FT',''),
      '10FT',coalesce(r.legacy_size_values->>'10FT',''),
      'custom',coalesce(r.legacy_size_values->>'custom',
        case when r.width_ft is not null and r.height_ft is not null then trim_scale(r.width_ft)::text||'x'||trim_scale(r.height_ft)::text else '' end),
      'QTY',trim_scale(r.quantity)::text,'UNIT COST (₦)',bomedia.naira_text(r.unit_price_kobo),
      'INITIAL PAYMENT (₦)',bomedia.naira_text(r.initial_kobo),'AMOUNT (₦)',bomedia.naira_text(r.total_kobo),
      'ADDITIONAL PAYMENT 1',case when r.later_kobo>0 then bomedia.naira_text(r.later_kobo) else '' end,
      'ADDITIONAL PAYMENT 2','',
      'AMOUNT DIFFERENCES',bomedia.naira_text(r.total_kobo-r.initial_kobo-r.later_kobo),
      'PAYMENT STATUS',case when r.total_kobo-r.initial_kobo-r.later_kobo<=0 then 'Paid'
        when r.initial_kobo+r.later_kobo>0 then 'Part-payment' else 'Unpaid' end,
      'JOB STATUS',r.job_status,'Logged By',r.logged_by,'Sales ID',r.sales_id,
      'TIMESTAMP',r.created_at::text,'TRANSACTION ID',r.transaction_id,'_rowIndex',r.seq::text)
      order by r.seq),'[]') into result from rows r;
  elsif resource_value='payments' then
    select coalesce(jsonb_agg(x.doc order by x.rn),'[]') into result from (select jsonb_build_object(
      'PAYMENT ID',coalesce(p.legacy_payment_id,p.reference),'SALES ID',coalesce(o.legacy_sales_id,o.reference),
      'CLIENT NAME',coalesce(j.client_name_snapshot,c.display_name),'DATE',coalesce(p.business_date::text,''),
      'AMOUNT',bomedia.naira_text(a.amount_kobo),'PAYMENT TYPE',case a.kind when 'rounding' then 'Rounding' else 'Settlement' end,
      'BALANCE BEFORE','','BALANCE AFTER','','COLLECTED BY',coalesce(s.display_name,p.collected_by_snapshot,''),
      'NOTES',coalesce(p.notes,''),'TIMESTAMP',p.created_at::text,'BATCH ID',coalesce(p.legacy_batch_id,p.reference),
      'PAYMENT METHOD',coalesce(p.method,''),'_rowIndex',(row_number() over (order by p.created_at,p.id,a.job_id))::text)
      as doc, row_number() over (order by p.created_at,p.id,a.job_id) as rn
    from bomedia.payment_allocations a join bomedia.payments p on p.id=a.payment_id
      join bomedia.jobs j on j.id=a.job_id join bomedia.orders o on o.id=j.order_id
      join bomedia.customers c on c.id=p.customer_id left join bomedia.staff s on s.id=p.collected_by
    where p.business_date is distinct from j.business_date) x;
  elsif resource_value='expenses' then
    select coalesce(jsonb_agg(x.doc order by x.rn),'[]') into result from (select jsonb_build_object(
      'DATE',coalesce(e.business_date::text,''),'EXPENSE ID',coalesce(e.legacy_expense_id,e.reference),
      'AMOUNT',bomedia.naira_text(e.amount_kobo),'CATEGORY',e.category,'DESCRIPTION',coalesce(e.description,''),
      'PAID TO',coalesce(e.paid_to,''),'PAYMENT METHOD',coalesce(e.payment_method,''),
      'RECEIPT URL',coalesce((select rr.url from bomedia.receipt_references rr where rr.expense_id=e.id order by rr.id limit 1),''),
      'Logged By',coalesce(l.display_name,e.logged_by_snapshot,''),'STATUS',e.status,
      'PAID BY',coalesce(pb.display_name,e.paid_by_snapshot,''),'PAID AT',coalesce(e.paid_at::text,''),
      'TIMESTAMP',e.created_at::text,'_rowIndex',(row_number() over (order by e.created_at,e.id))::text)
      as doc, row_number() over (order by e.created_at,e.id) as rn
    from bomedia.expenses e left join bomedia.staff l on l.id=e.logged_by left join bomedia.staff pb on pb.id=e.paid_by) x;
  elsif resource_value='inventory' then
    select coalesce(jsonb_agg(x.doc order by x.rn),'[]') into result from (select jsonb_build_object(
      'Roll ID',coalesce(i.legacy_roll_id,i.item_name),'Item Name',i.item_name,'Category',coalesce(i.category,m.category,''),
      'Width (ft)',trim_scale(i.width_ft)::text,'Raw Length (ft)',coalesce(trim_scale(i.raw_length_ft)::text,''),
      'Total Length (ft)',trim_scale(i.total_length_ft)::text,'Remaining Length (ft)',trim_scale(i.remaining_length_ft)::text,
      'Waste Logged (ft)',trim_scale(i.waste_length_ft)::text,'Unit',coalesce(i.original_unit,'ft'),
      'Price',bomedia.naira_text(m.selling_price_per_sqft_kobo),'Cost',coalesce(bomedia.naira_text(i.purchase_cost_kobo),''),
      'Waste Factor',coalesce(trim_scale(i.waste_factor)::text,''),
      'Cost per Sqft',coalesce(bomedia.naira_text(coalesce(i.cost_per_sqft_kobo_exact,i.cost_per_sqft_kobo)),''),
      'Low Stock Threshold (ft)',trim_scale(i.low_stock_threshold_ft)::text,
      'Status',case when i.remaining_length_ft<=0 then 'Out of Stock' when i.remaining_length_ft<=i.low_stock_threshold_ft then 'Low Stock' else 'Active' end,
      'Date Added',coalesce(i.business_date::text,''),'Material ID',bomedia.material_code(m.legacy_material_id,m.name,m.width_ft),
      '_rowIndex',(row_number() over (order by i.created_at,i.id))::text)
      as doc, row_number() over (order by i.created_at,i.id) as rn
    from bomedia.inventory_rolls i join bomedia.materials m on m.id=i.material_id) x;
  elsif resource_value='materials' then
    with agg as (
      select material_id, sum(remaining_length_ft) as remaining, sum(total_length_ft) as capacity, count(*) as rolls,
        sum(coalesce(purchase_cost_kobo,0)) as spent,
        sum(case when total_length_ft>0 then remaining_length_ft/total_length_ft*coalesce(purchase_cost_kobo,0) else 0 end) as asset_kobo,
        sum(width_ft*remaining_length_ft) as remaining_sqft, sum(width_ft*greatest(total_length_ft-remaining_length_ft,0)) as used_sqft,
        max(created_at) as updated
      from bomedia.inventory_rolls group by material_id)
    select coalesce(jsonb_agg(jsonb_build_object(
      'Material ID',bomedia.material_code(m.legacy_material_id,m.name,m.width_ft),'Material Name',m.name,'Width (ft)',trim_scale(m.width_ft)::text,
      'Selling Price',bomedia.naira_text(m.selling_price_per_sqft_kobo),
      'Total Remaining (ft)',trim_scale(coalesce(g.remaining,0))::text,'Total Capacity (ft)',trim_scale(coalesce(g.capacity,0))::text,
      'Active Roll ID',coalesce(ar.legacy_roll_id,ar.item_name,''),'Roll Count',coalesce(g.rolls,0)::text,
      'Status',case when coalesce(g.remaining,0)<=0 then 'Out of Stock' when g.remaining<=m.low_stock_threshold_ft then 'Low Stock' else 'Active' end,
      'Low Stock Threshold (ft)',trim_scale(m.low_stock_threshold_ft)::text,'Last Updated',coalesce(g.updated::text,''),
      'Notes',coalesce(m.notes,''),'Total Spent',bomedia.naira_text(coalesce(g.spent,0)),
      'Total Remaining Asset Value',bomedia.naira_text(coalesce(g.asset_kobo,0)),
      'Total Remaining Revenue',bomedia.naira_text(coalesce(g.remaining_sqft,0)*m.selling_price_per_sqft_kobo),
      'Total Realised Revenue',bomedia.naira_text(coalesce(g.used_sqft,0)*m.selling_price_per_sqft_kobo))
      order by m.name,m.id),'[]') into result
    from bomedia.materials m left join agg g on g.material_id=m.id left join bomedia.inventory_rolls ar on ar.id=m.active_roll_id;
  else raise exception 'Unsupported legacy resource' using errcode='22023';
  end if;
  return result;
end $$;

create or replace function bomedia.api_job_status(request_id text, payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,bomedia as $$
declare actor uuid; ref text; status_value text; job record; matches integer;
begin
  actor:=bomedia.stock_actor(request_id,payload,array['actor_id','job_ref','status','any_age']);
  ref:=btrim(coalesce(payload->>'job_ref',''));
  status_value:=payload->>'status';
  if status_value is null or status_value<>all(array['Quoted','Printing','Finishing','Ready','Delivered']) then
    raise exception 'Choose a valid job status' using errcode='22023'; end if;
  if ref='' or length(ref)>200 then raise exception 'Choose a job' using errcode='22023'; end if;
  if ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select count(*) into matches from bomedia.jobs where id=ref::uuid;
    select j.* into job from bomedia.jobs j where j.id=ref::uuid for update;
  elsif ref ~ '^[0-9]{1,18}$' then
    select count(*) into matches from bomedia.jobs where collection_sequence=ref::bigint;
    select j.* into job from bomedia.jobs j where j.collection_sequence=ref::bigint for update;
  else
    select count(*) into matches from bomedia.jobs j join bomedia.orders o on o.id=j.order_id where (o.legacy_sales_id=ref or o.reference=ref);
    select j.* into job from bomedia.jobs j join bomedia.orders o on o.id=j.order_id where (o.legacy_sales_id=ref or o.reference=ref) for update of j;
  end if;
  if matches<>1 then raise exception 'Job not found' using errcode='P0002'; end if;
  if coalesce((payload->>'any_age')::boolean,false) is not true and job.created_at<now()-interval '24 hours' then
    raise exception 'Only the owner can change jobs older than 24 hours' using errcode='42501'; end if;
  if job.job_status is distinct from status_value then
    update bomedia.jobs set job_status=status_value where id=job.id;
    insert into bomedia.audit_events(actor_id,action,entity_type,entity_id,details)
      values(actor,'job_status','job',job.id,jsonb_build_object('from',job.job_status,'to',status_value));
  end if;
  return jsonb_build_object('job_id',job.id,'job_status',status_value);
end $$;

create or replace function bomedia.api_legacy_collect(request_id text, payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,bomedia as $$
declare ref text; job_ids uuid[]:='{}'; job_value uuid; customers uuid[];
begin
  if jsonb_typeof(payload) is distinct from 'object' or exists(select 1 from jsonb_object_keys(payload) k
    where k<>all(array['actor_id','job_refs','amount_kobo','business_date','method','notes'])) then
    raise exception 'Unexpected payment field' using errcode='22023'; end if;
  if jsonb_typeof(payload->'job_refs') is distinct from 'array' or jsonb_array_length(payload->'job_refs') not between 1 and 500 then
    raise exception 'Choose 1 to 500 jobs' using errcode='22023'; end if;
  for ref in select btrim(value) from jsonb_array_elements_text(payload->'job_refs') loop
    job_value:=null;
    if ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select id into job_value from bomedia.jobs where id=ref::uuid;
    elsif ref ~ '^[0-9]{1,18}$' then
      select id into job_value from bomedia.jobs where collection_sequence=ref::bigint;
    elsif (select count(*) from bomedia.jobs j join bomedia.orders o on o.id=j.order_id where (o.legacy_sales_id=ref or o.reference=ref))=1 then
      select j.id into job_value from bomedia.jobs j join bomedia.orders o on o.id=j.order_id where (o.legacy_sales_id=ref or o.reference=ref);
    end if;
    if job_value is null then raise exception 'Job not found' using errcode='P0002'; end if;
    if not job_value=any(job_ids) then job_ids:=job_ids||job_value; end if;
  end loop;
  select array_agg(distinct customer_id) into customers from bomedia.jobs where id=any(job_ids);
  if cardinality(customers)<>1 then raise exception 'All jobs must belong to one customer' using errcode='22023'; end if;
  return bomedia.api_collect(request_id,jsonb_strip_nulls(jsonb_build_object('actor_id',payload->'actor_id','customer_id',customers[1],
    'job_ids',to_jsonb(job_ids),'amount_kobo',payload->'amount_kobo','business_date',payload->'business_date',
    'method',payload->'method','notes',payload->'notes')));
end $$;

create or replace function bomedia.api_legacy_sale(request_id text, payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,bomedia as $$
declare actor uuid; name_value text; contact_value text; customer_id_value uuid; status_value text; item jsonb;
  mat bomedia.materials%rowtype; w numeric; h numeric; qty numeric; typed bigint; jobs jsonb:='[]'; flags jsonb:='[]';
  result jsonb; job_ids uuid[]; i integer; paid bigint; method_value text; ref text; replay boolean; account_value text;
begin
  if jsonb_typeof(payload) is distinct from 'object' or exists(select 1 from jsonb_object_keys(payload) k
    where k<>all(array['actor_id','business_date','client_name','contact','job_status','initial_payment_kobo','payment_method','items'])) then
    raise exception 'Unexpected sale field' using errcode='22023'; end if;
  actor:=(payload->>'actor_id')::uuid;
  if not exists(select 1 from bomedia.staff where id=actor and disabled_at is null) then
    raise exception 'An enabled staff member is required' using errcode='42501'; end if;
  if request_id is null or btrim(request_id)='' or length(request_id)>200 then raise exception 'Invalid operation key' using errcode='22023'; end if;
  name_value:=regexp_replace(btrim(coalesce(payload->>'client_name','')),'\s+',' ','g');
  if length(name_value) not between 1 and 200 then raise exception 'Client name is required' using errcode='22023'; end if;
  contact_value:=nullif(btrim(coalesce(payload->>'contact','')),'');
  if length(contact_value)>100 then raise exception 'Contact is too long' using errcode='22023'; end if;
  status_value:=coalesce(nullif(payload->>'job_status',''),'Quoted');
  if status_value<>all(array['Quoted','Printing','Finishing','Ready','Delivered']) then
    raise exception 'Choose a valid job status' using errcode='22023'; end if;
  paid:=bomedia.kobo(coalesce(payload->>'initial_payment_kobo','0'));
  method_value:=nullif(payload->>'payment_method','');
  if paid>0 and method_value is null then raise exception 'Choose how the customer paid' using errcode='22023'; end if;
  -- Cash, Transfer or POS each post to their own cash or bank account.
  if paid>0 then
    account_value:=bomedia.resolve_payment_method(method_value)->>'account_code';
    method_value:=bomedia.resolve_payment_method(method_value)->>'label';
  end if;
  if jsonb_typeof(payload->'items') is distinct from 'array' or jsonb_array_length(payload->'items') not between 1 and 100 then
    raise exception 'Add 1 to 100 items' using errcode='22023'; end if;

  -- Same customer: same name ignoring case and repeated spaces; the oldest wins.
  select id into customer_id_value from bomedia.customers
    where lower(regexp_replace(btrim(display_name),'\s+',' ','g'))=lower(name_value) order by created_at,id limit 1;
  if customer_id_value is null then
    insert into bomedia.customers(display_name,contact) values(name_value,contact_value) returning id into customer_id_value;
  elsif contact_value is not null then
    update bomedia.customers set contact=contact_value where id=customer_id_value and contact is null;
  end if;

  for i in 0..jsonb_array_length(payload->'items')-1 loop
    item:=payload->'items'->i;
    ref:=btrim(coalesce(item->>'material_ref',''));
    select * into mat from bomedia.materials where (ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and id=ref::uuid)
      or bomedia.material_code(legacy_material_id,name,width_ft)=ref order by (legacy_material_id=ref) desc nulls last, created_at, id limit 1;
    if not found then raise exception 'Material not found' using errcode='22023'; end if;
    w:=bomedia.feet(item->>'width'); h:=bomedia.feet(item->>'height'); qty:=bomedia.feet(item->>'quantity');
    if item->>'unit'='in' then w:=round(w/12,6); h:=round(h/12,6);
    elsif coalesce(item->>'unit','ft')<>'ft' then raise exception 'Size unit must be ft or in' using errcode='22023'; end if;
    typed:=bomedia.kobo(item->>'price_per_sqft_kobo');
    if typed<=0 or w<=0 or h<=0 then raise exception 'Positive size and price required' using errcode='22023'; end if;
    -- Billed as typed. The core only accepts a server-set price under this key.
    jobs:=jobs||jsonb_build_array(jsonb_build_object('material_id',mat.id,'description',item->>'description','quantity',qty::text,
      'width_ft',w::text,'height_ft',h::text,'approved_unit_price_kobo',round(w*h*typed)::bigint::text,'allow_short_stock','true'));
    flags:=flags||jsonb_build_array(jsonb_build_object('typed',typed,'list',mat.selling_price_per_sqft_kobo));
  end loop;

  -- A retry of a saved sale returns it unchanged and must not touch the jobs
  -- again (the job board may have moved them since).
  replay:=exists(select 1 from bomedia.idempotency_requests where operation='api_sale' and request_key='legacy-sale/'||request_id);
  result:=bomedia.post_tracked_sale('legacy-sale/'||request_id,jsonb_strip_nulls(jsonb_build_object('actor_id',actor,
    'customer_id',customer_id_value,'business_date',payload->>'business_date','jobs',jobs,'initial_payment_kobo',paid::text,
    'payment_method',method_value,'cash_account_code',account_value)));
  if replay then return result||jsonb_build_object('customer_id',customer_id_value,
    'sales_id',(select reference from bomedia.orders where id=(result->>'order_id')::uuid)); end if;
  select array_agg(v::uuid order by n) into job_ids from jsonb_array_elements_text(result->'job_ids') with ordinality t(v,n);
  for i in 0..array_length(job_ids,1)-1 loop
    update bomedia.jobs set job_status=status_value,price_per_sqft_kobo=(flags->i->>'typed')::bigint where id=job_ids[i+1];
    if (flags->i->>'typed')::bigint<>(flags->i->>'list')::bigint then
      insert into bomedia.sale_reviews(job_id,kind,details,created_by) values(job_ids[i+1],'price',
        jsonb_build_object('typed_per_sqft_kobo',flags->i->'typed','list_per_sqft_kobo',flags->i->'list'),actor)
      on conflict (job_id,kind) do nothing;
    end if;
  end loop;
  for item in select value from jsonb_array_elements(result->'stock_shortfalls') loop
    insert into bomedia.sale_reviews(job_id,kind,details,created_by) values(job_ids[(item->>'index')::integer+1],'stock',
      jsonb_build_object('material_id',item->'material_id','missing_ft',item->'missing_ft'),actor)
    on conflict (job_id,kind) do nothing;
  end loop;
  return result||jsonb_build_object('customer_id',customer_id_value,
    'sales_id',(select reference from bomedia.orders where id=(result->>'order_id')::uuid));
end $$;

revoke all on function bomedia.next_reference(text,regclass),bomedia.set_reference(),bomedia.material_code(text,text,numeric) from public;
commit;

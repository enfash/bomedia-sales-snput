-- Services: non-stock sales (installation, design, delivery...). Local only.
-- The owner keeps the list. A fixed service bills its list price; a per-job
-- service is billed only at an owner-approved price, through the same price
-- requests as discounts. Services use no roll stock and post Dr 1100 / Cr 4000.
begin;
do $$ begin
  if exists(select 1 from bomedia.idempotency_requests where operation='api_service_save') then
    raise exception 'Existing service retries require an explicit compatibility migration';
  end if;
end $$;
create table bomedia.services (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 100),
  pricing text not null check (pricing in ('fixed','per_job')),
  unit_price_kobo bigint check (unit_price_kobo>0),
  visible boolean not null default true,
  created_by uuid references bomedia.staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((pricing='fixed')=(unit_price_kobo is not null))
);
create unique index services_name on bomedia.services(lower(btrim(name)));
alter table bomedia.services enable row level security;
revoke all on bomedia.services from public;
alter table bomedia.jobs add column service_id uuid references bomedia.services(id);
alter table bomedia.price_requests add column service_id uuid references bomedia.services(id),
  alter column material_id drop not null, alter column width_ft drop not null, alter column height_ft drop not null,
  alter column list_unit_price_kobo drop not null,
  add constraint price_request_item check ((material_id is null)<>(service_id is null)
    and (material_id is null or (width_ft is not null and height_ft is not null and list_unit_price_kobo is not null)));

create function bomedia.api_services(include_hidden boolean) returns jsonb
language sql security definer set search_path=pg_catalog,bomedia as $$
  select jsonb_build_object('data',coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'pricing',s.pricing,
    'unit_price_kobo',s.unit_price_kobo::text,'visible',s.visible) order by s.visible desc,lower(s.name)),'[]'),'next_after_id',null)
  from bomedia.services s where s.visible or include_hidden
$$;

create function bomedia.api_service_save(request_id text,payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,bomedia as $$
declare previous jsonb; result jsonb; actor uuid; service uuid;
begin
  if jsonb_typeof(payload) is distinct from 'object' then raise exception 'Service payload is required' using errcode='22023'; end if;
  if exists(select 1 from jsonb_object_keys(payload) k where k not in ('actor_id','service_id','name','pricing','unit_price_kobo','visible')) then
    raise exception 'Unexpected service field' using errcode='22023'; end if;
  actor:=(payload->>'actor_id')::uuid;
  if not exists(select 1 from bomedia.staff where id=actor and disabled_at is null) then
    raise exception 'An enabled staff member is required' using errcode='42501'; end if;
  previous:=bomedia.prior_result('api_service_save',request_id,payload);
  if previous is not null then return previous; end if;
  if payload->>'pricing' not in ('fixed','per_job') or jsonb_typeof(payload->'visible') is distinct from 'boolean'
    or coalesce(length(btrim(payload->>'name')),0) not between 1 and 100
    or ((payload->>'pricing')='fixed')<>(payload ? 'unit_price_kobo') then
    raise exception 'Name, pricing and (for fixed services) a price are required' using errcode='22023'; end if;
  if payload ? 'service_id' then
    update bomedia.services set name=btrim(payload->>'name'),pricing=payload->>'pricing',
      unit_price_kobo=case when payload ? 'unit_price_kobo' then bomedia.kobo(payload->>'unit_price_kobo') end,
      visible=(payload->>'visible')::boolean,updated_at=now() where id=(payload->>'service_id')::uuid returning id into service;
    if service is null then raise exception 'Unknown service' using errcode='22023'; end if;
  else
    insert into bomedia.services(name,pricing,unit_price_kobo,visible,created_by)
      values(btrim(payload->>'name'),payload->>'pricing',case when payload ? 'unit_price_kobo' then bomedia.kobo(payload->>'unit_price_kobo') end,
        (payload->>'visible')::boolean,actor) returning id into service;
  end if;
  result:=jsonb_build_object('service_id',service);
  insert into bomedia.idempotency_requests(operation,request_key,payload_sha256,actor_id,response)
    values('api_service_save',request_id,encode(sha256(convert_to(payload::text,'UTF8')),'hex'),actor,result);
  insert into bomedia.audit_events(actor_id,action,entity_type,entity_id,details)
    values(actor,'service_saved','service',service,payload-'actor_id');
  return result;
exception when unique_violation then raise exception 'A service with that name already exists' using errcode='22023';
end $$;

create or replace function bomedia.api_price_requests() returns jsonb
language sql security definer set search_path=pg_catalog,bomedia as $$
  select jsonb_build_object('data',coalesce(jsonb_agg(to_jsonb(r) order by r.pending desc,r.created_at desc),'[]'),'next_after_id',null) from
    (select p.id,p.status,p.status='pending' as pending,e.quote_number,e.client_name_snapshot as client_name,p.description,
      coalesce(m.name,s.name) as material_name,p.service_id is not null as is_service,
      trim_scale(p.width_ft)::text as width_ft,trim_scale(p.height_ft)::text as height_ft,trim_scale(p.quantity)::text as quantity,
      p.list_unit_price_kobo::text,p.requested_unit_price_kobo::text,round(p.list_unit_price_kobo*p.quantity)::bigint::text as list_total_kobo,
      round(p.requested_unit_price_kobo*p.quantity)::bigint::text as requested_total_kobo,p.reason,st.display_name as requested_by,
      p.decision_note,p.decided_at,p.created_at
     from bomedia.price_requests p join bomedia.estimates e on e.id=p.estimate_id left join bomedia.materials m on m.id=p.material_id
       left join bomedia.services s on s.id=p.service_id join bomedia.staff st on st.id=p.requested_by
     where p.status='pending' or p.decided_at>now()-interval '30 days' order by p.status='pending' desc,p.created_at desc limit 200) r
$$;

create or replace function bomedia.post_tracked_sale(request_id text,payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,bomedia as $$
declare previous jsonb; result jsonb; actor uuid; customer bomedia.customers%rowtype;
  mat bomedia.materials%rowtype; roll bomedia.inventory_rolls%rowtype; item jsonb; jobs jsonb:='[]'; stock jsonb;
  remaining_by_roll jsonb:='{}'; costs jsonb:='[]'; journals jsonb:='[]'; lines jsonb; journal jsonb;
  material_ids uuid[]; service_ids uuid[]; svc bomedia.services%rowtype; quantity_value numeric; w numeric; h numeric; length_value numeric; normal_length numeric; rotated_length numeric;
  unit_price bigint; amount_value bigint; total numeric:=0; available numeric; used numeric; need numeric; cost numeric;
  initial_paid bigint; sale jsonb; receipt jsonb:=null; job uuid; idx integer:=0; name_value text;
begin
  actor:=(payload->>'actor_id')::uuid;
  select display_name into name_value from bomedia.staff where id=actor and disabled_at is null;
  if not found then raise exception 'Enabled actor required' using errcode='42501'; end if;
  previous:=bomedia.prior_result('api_sale',request_id,payload);
  if previous is not null then return previous; end if;
  perform singleton from bomedia.bookkeeping_settings where singleton and state='active' for update;
  if not found then raise exception 'Active accounting books required' using errcode='23514'; end if;
  select * into customer from bomedia.customers where id=(payload->>'customer_id')::uuid for share;
  if not found then raise exception 'Select an existing customer identity' using errcode='22023'; end if;
  if jsonb_typeof(payload->'jobs') is distinct from 'array' or jsonb_array_length(payload->'jobs') not between 1 and 100 then
    raise exception 'Select 1 to 100 tracked jobs' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(payload->'jobs') v where jsonb_typeof(v)<>'object' or (v ? 'material_id')=(v ? 'service_id')) then
    raise exception 'Every job needs either a material or a service' using errcode='22023'; end if;
  select coalesce(array_agg((v->>'material_id')::uuid),'{}') into material_ids from jsonb_array_elements(payload->'jobs') v where v ? 'material_id';
  select coalesce(array_agg((v->>'service_id')::uuid),'{}') into service_ids from jsonb_array_elements(payload->'jobs') v where v ? 'service_id';
  -- Shared lock order for financial stock workflows: settings, materials, rolls.
  perform id from bomedia.materials where id=any(material_ids) order by id for update;
  perform id from bomedia.inventory_rolls where material_id=any(material_ids) order by id for update;
  perform id from bomedia.services where id=any(service_ids) order by id for share;
  initial_paid:=bomedia.kobo(coalesce(payload->>'initial_payment_kobo','0'));
  for item in select value from jsonb_array_elements(payload->'jobs') loop
    if item ? 'service_id' then
      -- Services use no stock. Fixed services bill their list price; per-job
      -- services bill only an owner-approved price injected by the wrapper.
      select * into svc from bomedia.services where id=(item->>'service_id')::uuid;
      if not found then raise exception 'Service not found' using errcode='22023'; end if;
      quantity_value:=bomedia.feet(item->>'quantity');
      if quantity_value not between 1 and 10000 or quantity_value<>trunc(quantity_value)
        or coalesce(length(btrim(item->>'description')),0) not between 1 and 1000 then
        raise exception 'Whole quantity and description required' using errcode='22023'; end if;
      if item ? 'approved_unit_price_kobo' then
        unit_price:=bomedia.kobo(item->>'approved_unit_price_kobo');
        if unit_price<=0 then raise exception 'Approved price is invalid' using errcode='22023'; end if;
      elsif svc.pricing='fixed' and svc.visible then
        unit_price:=svc.unit_price_kobo;
        if unit_price<>bomedia.kobo(item->>'expected_unit_price_kobo') then
          raise exception 'Price changed or is invalid; review this quote before posting' using errcode='22023'; end if;
      else raise exception 'This service needs an owner-approved price' using errcode='22023'; end if;
      amount_value:=(unit_price*quantity_value)::bigint; total:=total+amount_value;
      costs:=costs||jsonb_build_array('0');
      jobs:=jobs||jsonb_build_array(jsonb_build_object('service_id',svc.id,'description',btrim(item->>'description'),
        'quantity',quantity_value::text,'unit_price_kobo',unit_price::text,'amount_kobo',amount_value::text,'stock','[]'::jsonb));
      continue;
    end if;
    select * into mat from bomedia.materials where id=(item->>'material_id')::uuid;
    if not found then raise exception 'Material not found' using errcode='22023'; end if;
    quantity_value:=bomedia.feet(item->>'quantity'); w:=bomedia.feet(item->>'width_ft'); h:=bomedia.feet(item->>'height_ft');
    if quantity_value not between 1 and 10000 or quantity_value<>trunc(quantity_value) or w<=0 or h<=0
      or coalesce(length(btrim(item->>'description')),0) not between 1 and 1000 then
      raise exception 'Positive dimensions, whole quantity and description required' using errcode='22023'; end if;
    normal_length:=case when w<=mat.width_ft then ceil(quantity_value/floor(mat.width_ft/w))*h end;
    rotated_length:=case when h<=mat.width_ft then ceil(quantity_value/floor(mat.width_ft/h))*w end;
    length_value:=least(normal_length,rotated_length);
    if length_value is null then raise exception 'Job does not fit the roll in either orientation' using errcode='22023'; end if;
    -- Catalog price and tiling are authoritative; the submitted quote is only
    -- an agreement check, so an offline stale price cannot silently change a bill.
    -- approved_unit_price_kobo is set only by the api_sale wrapper after it
    -- verifies an owner-approved price request; callers cannot reach this core.
    if item ? 'approved_unit_price_kobo' then
      unit_price:=bomedia.kobo(item->>'approved_unit_price_kobo');
      if unit_price<=0 then raise exception 'Approved price is invalid' using errcode='22023'; end if;
    else
      unit_price:=round(w*h*mat.selling_price_per_sqft_kobo)::bigint;
      if unit_price<=0 or unit_price<>bomedia.kobo(item->>'expected_unit_price_kobo') then
        raise exception 'Price changed or is invalid; review this quote before posting' using errcode='22023'; end if;
    end if;
    amount_value:=(unit_price*quantity_value)::bigint; total:=total+amount_value;
    stock:='[]';need:=length_value;cost:=0;
    for roll in select * from bomedia.inventory_rolls where material_id=mat.id and width_ft=mat.width_ft
      and lower(status) in ('active','low stock') and remaining_length_ft>0
      order by (id=mat.active_roll_id) desc nulls last,legacy_roll_id nulls last,id loop
      available:=coalesce((remaining_by_roll->>roll.id::text)::numeric,roll.remaining_length_ft);
      used:=least(need,available);
      if used>0 then
        if roll.purchase_cost_kobo is null or roll.total_length_ft<=0 then
          raise exception 'Roll cost needs review before accounting consumption' using errcode='23514'; end if;
        -- Per-roll purchase cost: difference of rounded remaining values keeps
        -- partial consumption and final depletion consistent to the last kobo.
        cost:=cost+round(available/roll.total_length_ft*roll.purchase_cost_kobo)
          -round((available-used)/roll.total_length_ft*roll.purchase_cost_kobo);
        stock:=stock||jsonb_build_array(jsonb_build_object('roll_id',roll.id,'length_ft',used::text));
        remaining_by_roll:=jsonb_set(remaining_by_roll,array[roll.id::text],to_jsonb((available-used)::text));
        need:=need-used;
      end if;
      exit when need=0;
    end loop;
    if need>0 then raise exception 'Insufficient eligible stock' using errcode='23514'; end if;
    costs:=costs||jsonb_build_array(cost::text);
    jobs:=jobs||jsonb_build_array(jsonb_build_object('material_id',mat.id,'description',btrim(item->>'description'),
      'quantity',quantity_value::text,'width_ft',w::text,'height_ft',h::text,'tiled_length_ft',length_value::text,
      'unit_price_kobo',unit_price::text,'amount_kobo',amount_value::text,'stock',stock));
  end loop;
  if initial_paid>total then raise exception 'Initial receipt exceeds the sale; explicit customer credit treatment required' using errcode='22023'; end if;
  if (select coalesce(sum((v#>>'{}')::numeric),0) from jsonb_array_elements(costs) v) >
    (select coalesce(sum(l.debit_kobo::numeric-l.credit_kobo),0) from bomedia.journal_lines l join bomedia.journal_entries e on e.id=l.entry_id
      where l.account_code='1200' and e.status='posted' and e.business_date<=(payload->>'business_date')::date) then
    raise exception 'Inventory accounting value needs reconciliation before sale' using errcode='23514'; end if;
  sale:=bomedia.record_sale('accounted-sale/'||encode(sha256(convert_to(request_id,'UTF8')),'hex'),
    jsonb_build_object('actor_id',actor,'customer_id',customer.id,'business_date',payload->>'business_date','jobs',jobs));
  for job in select value::uuid from jsonb_array_elements_text(sale->'job_ids') loop
    item:=jobs->idx;cost:=(costs->>idx)::numeric;
    update bomedia.jobs set client_name_snapshot=customer.display_name,contact_snapshot=customer.contact,
      material_name_snapshot=coalesce((select name from bomedia.materials where id=(item->>'material_id')::uuid),
        (select name from bomedia.services where id=(item->>'service_id')::uuid)),
      service_id=(item->>'service_id')::uuid,
      price_per_sqft_kobo=(select selling_price_per_sqft_kobo from bomedia.materials where id=(item->>'material_id')::uuid),
      logged_by_snapshot=name_value where id=job;
    lines:=jsonb_build_array(jsonb_build_object('account_code','1100','debit_kobo',item->>'amount_kobo','customer_id',customer.id,'job_id',job),
      jsonb_build_object('account_code','4000','credit_kobo',item->>'amount_kobo'));
    if cost>0 then lines:=lines||jsonb_build_array(jsonb_build_object('account_code','5000','debit_kobo',cost::text),
      jsonb_build_object('account_code','1200','credit_kobo',cost::text)); end if;
    journal:=bomedia.post_journal('sale-job/'||job::text,jsonb_build_object('actor_id',actor,'business_date',payload->>'business_date',
      'kind','sale','memo','Sale and material consumption','source_type','job','source_id',job,'lines',lines));
    journals:=journals||jsonb_build_array(journal->>'journal_entry_id');idx:=idx+1;
  end loop;
  if initial_paid>0 then
    receipt:=bomedia.record_accounted_payment('sale-receipt/'||(sale->>'order_id'),jsonb_build_object('actor_id',actor,'customer_id',customer.id,
      'business_date',payload->>'business_date','job_ids',sale->'job_ids','amount_kobo',initial_paid::text,
      'cash_account_code',payload->>'cash_account_code','method',payload->>'payment_method'));
  end if;
  -- Promote an eligible remaining roll and its catalog price for the next sale.
  for mat in select * from bomedia.materials where id=any(material_ids) order by id loop
    select * into roll from bomedia.inventory_rolls where material_id=mat.id and remaining_length_ft>0
      and lower(status) in ('active','low stock') order by (id=mat.active_roll_id) desc nulls last,legacy_roll_id nulls last,id limit 1;
    update bomedia.materials set active_roll_id=case when found then roll.id else null end,
      selling_price_per_sqft_kobo=coalesce(roll.selling_price_kobo,selling_price_per_sqft_kobo) where id=mat.id;
  end loop;
  result:=sale||jsonb_build_object('total_kobo',total::text,'initial_payment',receipt,'journal_entry_ids',journals);
  insert into bomedia.idempotency_requests(operation,request_key,payload_sha256,actor_id,response)
    values('api_sale',request_id,encode(sha256(convert_to(payload::text,'UTF8')),'hex'),actor,result);
  return result;
end $$;

create or replace function bomedia.api_quote(request_id text,payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,bomedia as $$
declare previous jsonb; result jsonb; actor uuid; customer bomedia.customers%rowtype; mat bomedia.materials%rowtype;
  svc bomedia.services%rowtype; asks jsonb:='{}';
  item jsonb; req jsonb; items jsonb:='[]'; total bigint:=0; w numeric; h numeric; q numeric; unit_price bigint;
  estimate uuid; number_value text; client text; idx integer:=0; pending integer:=0;
begin
  if jsonb_typeof(payload) is distinct from 'object' then raise exception 'Quote payload is required' using errcode='22023'; end if;
  if exists(select 1 from jsonb_object_keys(payload) k where k not in ('actor_id','customer_id','client_name','business_date','items','price_requests')) then
    raise exception 'Unexpected quote field' using errcode='22023'; end if;
  actor:=(payload->>'actor_id')::uuid;
  if not exists(select 1 from bomedia.staff where id=actor and disabled_at is null) then
    raise exception 'An enabled staff member is required' using errcode='42501'; end if;
  previous:=bomedia.prior_result('api_quote',request_id,payload);
  if previous is not null then return previous; end if;
  if coalesce(payload->>'business_date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Business date required' using errcode='22023'; end if;
  if payload ? 'customer_id' then
    select * into customer from bomedia.customers where id=(payload->>'customer_id')::uuid;
    if not found then raise exception 'Unknown customer' using errcode='22023'; end if;
    client:=customer.display_name;
  else
    client:=btrim(payload->>'client_name');
    if coalesce(length(client),0) not between 1 and 200 then raise exception 'Choose a customer or enter a client name' using errcode='22023'; end if;
  end if;
  if jsonb_typeof(payload->'items') is distinct from 'array' or jsonb_array_length(payload->'items') not between 1 and 100 then
    raise exception 'A quote needs 1 to 100 items' using errcode='22023'; end if;
  if payload ? 'price_requests' then
    if jsonb_typeof(payload->'price_requests') is distinct from 'array' or jsonb_array_length(payload->'price_requests')>100 then
      raise exception 'Invalid price requests' using errcode='22023'; end if;
    for req in select value from jsonb_array_elements(payload->'price_requests') loop
      if coalesce(req->>'item_index','') !~ '^[0-9]{1,2}$' or (req->>'item_index')::integer>=jsonb_array_length(payload->'items')
        or asks ? (req->>'item_index') then raise exception 'Invalid item' using errcode='22023'; end if;
      asks:=asks||jsonb_build_object(req->>'item_index',req);
    end loop;
    if asks<>'{}' and customer.id is null then raise exception 'Choose the customer before asking for a price' using errcode='22023'; end if;
  end if;
  idx:=0;
  for item in select value from jsonb_array_elements(payload->'items') loop
    if jsonb_typeof(item)<>'object' or (item ? 'material_id')=(item ? 'service_id') then
      raise exception 'Each item needs a material or a service' using errcode='22023'; end if;
    if item ? 'service_id' then
      select * into svc from bomedia.services where id=(item->>'service_id')::uuid and visible;
      if not found then raise exception 'Service not found' using errcode='22023'; end if;
      q:=bomedia.feet(item->>'quantity');
      if q not between 1 and 10000 or q<>trunc(q) or coalesce(length(btrim(item->>'description')),0) not between 1 and 1000 then
        raise exception 'Whole quantity and description required' using errcode='22023'; end if;
      if svc.pricing='per_job' and not asks ? idx::text then raise exception 'This service is priced per job; ask the owner for a price' using errcode='22023'; end if;
      unit_price:=case when svc.pricing='per_job' then bomedia.kobo(asks->idx::text->>'requested_unit_price_kobo') else svc.unit_price_kobo end;
      items:=items||jsonb_build_array(jsonb_build_object('service_id',svc.id,'service_name',svc.name,'pricing',svc.pricing,
        'description',btrim(item->>'description'),'quantity',q::text,'list_unit_price_kobo',svc.unit_price_kobo::text,
        'unit_price_kobo',unit_price::text,'amount_kobo',(unit_price*q)::bigint::text));
      total:=total+(unit_price*q)::bigint; idx:=idx+1;
      continue;
    end if;
    select * into mat from bomedia.materials where id=(item->>'material_id')::uuid;
    if not found then raise exception 'Material not found' using errcode='22023'; end if;
    q:=bomedia.feet(item->>'quantity'); w:=bomedia.feet(item->>'width_ft'); h:=bomedia.feet(item->>'height_ft');
    if q not between 1 and 10000 or q<>trunc(q) or w<=0 or h<=0 or coalesce(length(btrim(item->>'description')),0) not between 1 and 1000 then
      raise exception 'Positive dimensions, whole quantity and description required' using errcode='22023'; end if;
    if w>mat.width_ft and h>mat.width_ft then raise exception 'Item does not fit the roll in either orientation' using errcode='22023'; end if;
    unit_price:=round(w*h*mat.selling_price_per_sqft_kobo)::bigint;
    if unit_price<=0 then raise exception 'Material price is not set' using errcode='22023'; end if;
    items:=items||jsonb_build_array(jsonb_build_object('material_id',mat.id,'material_name',mat.name,'roll_width_ft',trim_scale(mat.width_ft)::text,
      'description',btrim(item->>'description'),'width_ft',w::text,'height_ft',h::text,'quantity',q::text,
      'unit_price_kobo',unit_price::text,'amount_kobo',(unit_price*q)::bigint::text));
    total:=total+(unit_price*q)::bigint; idx:=idx+1;
  end loop;
  number_value:='QT-'||lpad(nextval('bomedia.quote_number_seq')::text,5,'0');
  insert into bomedia.estimates(customer_id,client_name_snapshot,business_date,cart_data,quote_number,created_by,total_kobo)
    values(customer.id,client,(payload->>'business_date')::date,items,number_value,actor,total) returning id into estimate;
  for req in select value from jsonb_each(asks) loop
    idx:=(req->>'item_index')::integer; item:=items->idx;
    if item ? 'material_id' and bomedia.kobo(req->>'requested_unit_price_kobo')=(item->>'unit_price_kobo')::bigint then
      raise exception 'Requested price matches the list price' using errcode='22023'; end if;
    if item ? 'service_id' and item->>'pricing'='fixed' and bomedia.kobo(req->>'requested_unit_price_kobo')=(item->>'list_unit_price_kobo')::bigint then
      raise exception 'Requested price matches the list price' using errcode='22023'; end if;
    insert into bomedia.price_requests(estimate_id,item_index,material_id,service_id,description,width_ft,height_ft,quantity,
        list_unit_price_kobo,requested_unit_price_kobo,reason,requested_by)
      values(estimate,idx,(item->>'material_id')::uuid,(item->>'service_id')::uuid,item->>'description',(item->>'width_ft')::numeric,(item->>'height_ft')::numeric,
        (item->>'quantity')::numeric,case when item ? 'material_id' then (item->>'unit_price_kobo')::bigint else (item->>'list_unit_price_kobo')::bigint end,
        bomedia.kobo(req->>'requested_unit_price_kobo'),btrim(req->>'reason'),actor);
    pending:=pending+1;
  end loop;
  result:=jsonb_build_object('estimate_id',estimate,'quote_number',number_value,'total_kobo',total::text,'items',items,'pending_price_requests',pending);
  insert into bomedia.idempotency_requests(operation,request_key,payload_sha256,actor_id,response)
    values('api_quote',request_id,encode(sha256(convert_to(payload::text,'UTF8')),'hex'),actor,result);
  insert into bomedia.audit_events(actor_id,action,entity_type,entity_id) values(actor,'quote_saved','estimate',estimate);
  return result;
end $$;

create or replace function bomedia.api_quote_lookup(number_value text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,bomedia as $$
declare svc bomedia.services%rowtype; e bomedia.estimates%rowtype; items jsonb:='[]'; item jsonb; idx integer:=0; mat bomedia.materials%rowtype; pr bomedia.price_requests%rowtype;
begin
  if coalesce(number_value,'') !~ '^QT-[0-9]{4,}$' then raise exception 'Enter a quote number like QT-00042' using errcode='22023'; end if;
  select * into e from bomedia.estimates where quote_number=number_value or (quote_number is null and upper(legacy_quote_id)=number_value)
    order by quote_number nulls last limit 1;
  if not found then return jsonb_build_object('found',false); end if;
  if e.quote_number is null then
    return jsonb_build_object('found',true,'legacy',true,'estimate_id',e.id,'client_name',e.client_name_snapshot,'business_date',e.business_date);
  end if;
  for item in select value from jsonb_array_elements(e.cart_data) loop
    select * into mat from bomedia.materials where id=(item->>'material_id')::uuid;
    select * into svc from bomedia.services where id=(item->>'service_id')::uuid;
    select * into pr from bomedia.price_requests where estimate_id=e.id and item_index=idx;
    items:=items||jsonb_build_array(item||jsonb_build_object('current_unit_price_kobo',
        case when mat.id is not null then round((item->>'width_ft')::numeric*(item->>'height_ft')::numeric*mat.selling_price_per_sqft_kobo)::bigint::text
          when svc.id is not null and svc.pricing='fixed' and svc.visible then svc.unit_price_kobo::text end,
      'price_request',case when pr.id is not null then jsonb_build_object('id',pr.id,'status',pr.status,
        'requested_unit_price_kobo',pr.requested_unit_price_kobo::text,'decision_note',pr.decision_note,'decided_at',pr.decided_at) end));
    idx:=idx+1; pr:=null; mat:=null; svc:=null;
  end loop;
  return jsonb_build_object('found',true,'legacy',false,'estimate_id',e.id,'quote_number',e.quote_number,'customer_id',e.customer_id,
    'client_name',e.client_name_snapshot,'business_date',e.business_date,'total_kobo',e.total_kobo::text,'used',e.used_order_id is not null,'items',items);
end $$;

create or replace function bomedia.api_sale(request_id text,payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,bomedia as $$
declare method_value jsonb; e bomedia.estimates%rowtype; pr bomedia.price_requests%rowtype; jobs jsonb:='[]'; job jsonb;
  replay boolean; result jsonb; used_ids uuid[]:='{}';
begin
  if bomedia.kobo(coalesce(payload->>'initial_payment_kobo','0'))>0 then
    method_value:=bomedia.resolve_payment_method(payload->>'payment_method');
    if payload->>'cash_account_code' is not null and payload->>'cash_account_code'<>method_value->>'account_code' then
      raise exception 'Payment method and receiving account do not match' using errcode='22023'; end if;
    payload:=payload||jsonb_build_object('payment_method',method_value->>'label','cash_account_code',method_value->>'account_code');
  end if;
  replay:=exists(select 1 from bomedia.idempotency_requests where operation='api_sale' and request_key=request_id);
  if payload ? 'quote_id' then
    select * into e from bomedia.estimates where id=(payload->>'quote_id')::uuid for update;
    if not found or e.quote_number is null then raise exception 'Unknown quote' using errcode='22023'; end if;
    if not replay and e.used_order_id is not null then raise exception 'This quote has already been used' using errcode='22023'; end if;
    if e.customer_id is not null and e.customer_id<>(payload->>'customer_id')::uuid then
      raise exception 'The quote belongs to another customer' using errcode='22023'; end if;
  end if;
  if jsonb_typeof(payload->'jobs')='array' then
    for job in select value from jsonb_array_elements(payload->'jobs') loop
      job:=job-'approved_unit_price_kobo';
      if job ? 'price_request_id' then
        if e.id is null then raise exception 'An approved price needs its quote' using errcode='22023'; end if;
        select * into pr from bomedia.price_requests where id=(job->>'price_request_id')::uuid and estimate_id=e.id for update;
        if not found or (not replay and pr.status<>'approved') then raise exception 'This price has not been approved' using errcode='22023'; end if;
        if pr.material_id is distinct from (job->>'material_id')::uuid or pr.service_id is distinct from (job->>'service_id')::uuid
          or pr.width_ft is distinct from (case when job ? 'width_ft' then bomedia.feet(job->>'width_ft') end)
          or pr.height_ft is distinct from (case when job ? 'height_ft' then bomedia.feet(job->>'height_ft') end)
          or pr.quantity<>bomedia.feet(job->>'quantity') or pr.id=any(used_ids) then
          raise exception 'The item changed after approval; it goes back to the list price' using errcode='22023'; end if;
        used_ids:=used_ids||pr.id;
        job:=job||jsonb_build_object('approved_unit_price_kobo',pr.requested_unit_price_kobo::text);
      end if;
      jobs:=jobs||jsonb_build_array(job);
    end loop;
    payload:=jsonb_set(payload,'{jobs}',jobs);
  end if;
  result:=bomedia.post_tracked_sale(request_id,payload);
  if e.id is not null and not replay then
    update bomedia.estimates set used_order_id=(result->>'order_id')::uuid where id=e.id;
    update bomedia.price_requests set status='used',used_order_id=(result->>'order_id')::uuid where id=any(used_ids);
  end if;
  return result;
end $$;
revoke all on function bomedia.api_services(boolean),bomedia.api_service_save(text,jsonb),bomedia.api_price_requests(),
  bomedia.api_quote(text,jsonb),bomedia.api_quote_lookup(text),bomedia.api_sale(text,jsonb) from public;
grant execute on function bomedia.api_services(boolean),bomedia.api_service_save(text,jsonb),bomedia.api_price_requests(),
  bomedia.api_quote(text,jsonb),bomedia.api_quote_lookup(text),bomedia.api_sale(text,jsonb) to bomedia_financial_runtime;
commit;

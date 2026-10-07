-- The existing New Sale screen saves to Postgres (owner decision 7 Oct: keep
-- the screens staff know). Local only.
-- * Customer: matched by name ignoring case and repeated spaces (the oldest
--   match wins), otherwise created.
-- * Price: staff may type their own price per sq ft. A price that differs from
--   the material's list price is billed as typed and flagged for owner review.
-- * Stock: as on the old screen, a sale is recorded even when the app's stock
--   is short; it uses what is left and flags the shortfall for review. The
--   unrecorded part carries no material cost until the owner corrects stock.
begin;
create table bomedia.sale_reviews (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references bomedia.jobs(id),
  kind text not null check (kind in ('price','stock')),
  details jsonb not null,
  created_by uuid references bomedia.staff(id),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references bomedia.staff(id),
  unique (job_id, kind)
);
alter table bomedia.sale_reviews enable row level security;
revoke all on bomedia.sale_reviews from public;

create or replace function bomedia.post_tracked_sale(request_id text,payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,bomedia as $$
declare previous jsonb; result jsonb; actor uuid; customer bomedia.customers%rowtype;
  mat bomedia.materials%rowtype; roll bomedia.inventory_rolls%rowtype; item jsonb; jobs jsonb:='[]'; stock jsonb;
  remaining_by_roll jsonb:='{}'; costs jsonb:='[]'; journals jsonb:='[]'; lines jsonb; journal jsonb;
  material_ids uuid[]; service_ids uuid[]; svc bomedia.services%rowtype; quantity_value numeric; w numeric; h numeric; length_value numeric; normal_length numeric; rotated_length numeric;
  unit_price bigint; amount_value bigint; total numeric:=0; available numeric; used numeric; need numeric; cost numeric;
  initial_paid bigint; sale jsonb; receipt jsonb:=null; job uuid; idx integer:=0; name_value text;
  shortfalls jsonb:='[]'; item_no integer:=-1;
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
    item_no:=item_no+1;
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
    if need>0 then
      -- The old New Sale form records a sale even when the app's stock is short
      -- and asks for a manual stock check. Only api_legacy_sale sets this flag.
      if (item->>'allow_short_stock')='true' then
        -- Record the part the books hold; the rest is flagged for a stock check.
        if need=length_value then raise exception 'No stock is recorded for this material; restock or count it first' using errcode='23514'; end if;
        shortfalls:=shortfalls||jsonb_build_array(jsonb_build_object('index',item_no,'material_id',mat.id,'missing_ft',need::text));
        length_value:=length_value-need;
      else raise exception 'Insufficient eligible stock' using errcode='23514'; end if;
    end if;
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
  result:=sale||jsonb_build_object('total_kobo',total::text,'initial_payment',receipt,'journal_entry_ids',journals,'stock_shortfalls',shortfalls);
  insert into bomedia.idempotency_requests(operation,request_key,payload_sha256,actor_id,response)
    values('api_sale',request_id,encode(sha256(convert_to(payload::text,'UTF8')),'hex'),actor,result);
  return result;
end $$;

create function bomedia.api_legacy_sale(request_id text, payload jsonb) returns jsonb
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
      or legacy_material_id=ref order by (legacy_material_id=ref) desc, id limit 1;
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
  if replay then return result||jsonb_build_object('customer_id',customer_id_value); end if;
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
  return result||jsonb_build_object('customer_id',customer_id_value);
end $$;
revoke all on function bomedia.api_legacy_sale(text,jsonb) from public;
grant execute on function bomedia.api_legacy_sale(text,jsonb) to bomedia_financial_runtime;
commit;

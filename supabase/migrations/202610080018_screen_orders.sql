-- Stage 2: familiar New Sale/Estimator screens, durable requests and quote conversion.
-- Previous migration files stay unchanged.
begin;
create function bomedia.api_order_catalog(request_id text, payload jsonb) returns jsonb
language sql security definer set search_path=pg_catalog,bomedia as $$
 select jsonb_build_object(
  'customers',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',display_name,'contact',contact) order by display_name,id),'[]') from bomedia.customers),
  'materials',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'ref',bomedia.material_code(legacy_material_id,name,width_ft),'name',name,
    'width',width_ft::text,'priceKobo',selling_price_per_sqft_kobo::text) order by name,id),'[]') from bomedia.materials),
  'services',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'pricing',pricing,'priceKobo',unit_price_kobo::text) order by name,id),'[]') from bomedia.services where visible))
$$;
create function bomedia.api_screen_order(request_id text, payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,bomedia as $$
declare actor uuid; previous jsonb; result jsonb; customer_id_value uuid; customer_count integer; name_value text;
  item jsonb; job jsonb; jobs jsonb:='[]'; quote_items jsonb:='[]'; flags jsonb:='[]';
  mat bomedia.materials%rowtype; svc bomedia.services%rowtype; e bomedia.estimates%rowtype; pr bomedia.price_requests%rowtype;
  w numeric; h numeric; q numeric; price bigint; unit_price bigint; total bigint:=0; paid bigint; idx integer:=0;
  job_ids uuid[]; approved_ids uuid[]:='{}'; method jsonb; quote_item jsonb;
begin
  actor:=bomedia.stock_actor(request_id,payload,array['actor_id','operation','businessDate','clientName','contact','customerId','quoteId','jobStatus','initialPaymentKobo','paymentMethod','totalKobo','items']);
  previous:=bomedia.prior_result('screen_order',request_id,payload);
  if previous is not null then return previous; end if;
  perform bomedia.check_business_date(payload->>'businessDate');
  if coalesce(payload->>'operation','') not in ('sale','quote') or coalesce(payload->>'jobStatus','') not in ('Quoted','Printing','Finishing','Ready','Delivered') then
    raise exception 'Choose a valid operation and job status' using errcode='22023'; end if;
  if jsonb_typeof(payload->'items') is distinct from 'array' or jsonb_array_length(payload->'items') not between 1 and 100 then
    raise exception 'Add 1 to 100 items' using errcode='22023'; end if;
  paid:=bomedia.kobo(payload->>'initialPaymentKobo');
  if payload->>'operation'='quote' and (paid<>0 or payload ? 'quoteId') then raise exception 'A quote cannot receive money or convert another quote' using errcode='22023'; end if;
  if paid>0 then method:=bomedia.resolve_payment_method(payload->>'paymentMethod'); end if;
  name_value:=regexp_replace(btrim(coalesce(payload->>'clientName','')),'\s+',' ','g');
  if length(name_value) not between 1 and 200 or length(coalesce(payload->>'contact',''))>100 then
    raise exception 'Customer name and contact are invalid' using errcode='22023'; end if;
  -- Serialize new-name matching so simultaneous orders do not create duplicate customers.
  perform pg_advisory_xact_lock(hashtextextended('screen-customer:'||lower(name_value),0));
  if payload ? 'customerId' then
    select id into customer_id_value from bomedia.customers where id=(payload->>'customerId')::uuid;
    if not found then raise exception 'Customer no longer exists' using errcode='22023'; end if;
  else
    select count(*),min(id::text)::uuid into customer_count,customer_id_value from bomedia.customers
      where lower(regexp_replace(btrim(display_name),'\s+',' ','g'))=lower(name_value);
    if customer_count>1 then raise exception 'Several customers share this name. Choose the correct customer suggestion.' using errcode='22023'; end if;
    if customer_count=0 then
      insert into bomedia.customers(display_name,contact) values(name_value,nullif(btrim(payload->>'contact'),'')) returning id into customer_id_value;
    end if;
  end if;
  update bomedia.customers set contact=nullif(btrim(payload->>'contact'),'')
    where id=customer_id_value and nullif(btrim(contact),'') is null and nullif(btrim(payload->>'contact'),'') is not null;
  if payload ? 'quoteId' then
    select * into e from bomedia.estimates where id=(payload->>'quoteId')::uuid for update;
    if not found or e.quote_number is null or e.used_order_id is not null then raise exception 'This quote is unavailable or already converted' using errcode='22023'; end if;
    if e.customer_id is not null and e.customer_id<>customer_id_value then raise exception 'Quote belongs to another customer' using errcode='22023'; end if;
    if jsonb_array_length(e.cart_data)<>jsonb_array_length(payload->'items') then raise exception 'Quote items changed; start a new order' using errcode='22023'; end if;
  end if;
  for item in select value from jsonb_array_elements(payload->'items') loop
    if jsonb_typeof(item) is distinct from 'object' or exists(select 1 from jsonb_object_keys(item) k where k<>all(array['kind','ref','description','quantity','width','height','unit','priceKobo','priceRequestId','approvedUnitKobo'])) then
      raise exception 'Invalid order item fields' using errcode='22023'; end if;
    q:=bomedia.feet(item->>'quantity'); price:=bomedia.kobo(item->>'priceKobo');
    if q not between 1 and 10000 or q<>trunc(q) or price<=0 or coalesce(length(btrim(item->>'description')),0) not between 1 and 1000 then
      raise exception 'Positive price, whole quantity and description required' using errcode='22023'; end if;
    mat:=null; svc:=null; pr:=null; w:=null; h:=null;
    if item->>'kind'='print' then
      if (select count(*) from bomedia.materials where id::text=item->>'ref' or bomedia.material_code(legacy_material_id,name,width_ft)=item->>'ref')<>1 then
        raise exception 'Material reference is missing or ambiguous. Refresh the material list.' using errcode='22023'; end if;
      select * into mat from bomedia.materials where id::text=item->>'ref' or bomedia.material_code(legacy_material_id,name,width_ft)=item->>'ref';
      if not found then raise exception 'Material not found' using errcode='22023'; end if;
      w:=bomedia.feet(item->>'width'); h:=bomedia.feet(item->>'height');
      if item->>'unit'='in' then w:=round(w/12,6); h:=round(h/12,6);
      elsif coalesce(item->>'unit','')<>'ft' then raise exception 'Choose feet or inches' using errcode='22023'; end if;
      if w<=0 or h<=0 then raise exception 'Positive dimensions required' using errcode='22023'; end if;
      unit_price:=round(w*h*price)::bigint;
      job:=jsonb_build_object('material_id',mat.id,'width_ft',w::text,'height_ft',h::text,'description',item->>'description','quantity',q::text,
        'approved_unit_price_kobo',unit_price::text,'allow_short_stock','true');
      quote_items:=quote_items||jsonb_build_array(job-'approved_unit_price_kobo'-'allow_short_stock');
    elsif item->>'kind'='service' then
      select * into svc from bomedia.services where id::text=item->>'ref' and visible;
      if not found or item ? 'width' or item ? 'height' then raise exception 'Choose a visible service without roll dimensions' using errcode='22023'; end if;
      unit_price:=price;
      if not item ? 'priceRequestId' and (svc.pricing<>'fixed' or svc.unit_price_kobo<>price) then
        raise exception 'This service needs its current list price or an owner-approved quote' using errcode='22023'; end if;
      job:=jsonb_build_object('service_id',svc.id,'description',item->>'description','quantity',q::text,'expected_unit_price_kobo',price::text);
      quote_items:=quote_items||jsonb_build_array(job-'expected_unit_price_kobo');
    else raise exception 'Choose print or service' using errcode='22023'; end if;
    if item ? 'approvedUnitKobo' then
      if not item ? 'priceRequestId' then raise exception 'Approved price needs approval identity' using errcode='22023'; end if;
      unit_price:=bomedia.kobo(item->>'approvedUnitKobo');
    end if;
    if e.id is not null then
      quote_item:=e.cart_data->idx;
      if (quote_item->>'material_id')::uuid is distinct from mat.id or (quote_item->>'service_id')::uuid is distinct from svc.id
        or (quote_item->>'quantity')::numeric<>q or (quote_item->>'width_ft')::numeric is distinct from w or (quote_item->>'height_ft')::numeric is distinct from h then
        raise exception 'Quote items changed; start a new order' using errcode='22023'; end if;
      if exists(select 1 from bomedia.price_requests where estimate_id=e.id and item_index=idx and status='pending') then
        raise exception 'A quote price is waiting for owner approval' using errcode='22023'; end if;
    end if;
    if item ? 'priceRequestId' then
      if e.id is null then raise exception 'An approved price needs its quote' using errcode='22023'; end if;
      select * into pr from bomedia.price_requests where id=(item->>'priceRequestId')::uuid and estimate_id=e.id and item_index=idx for update;
      if not found or pr.status<>'approved' or pr.material_id is distinct from mat.id or pr.service_id is distinct from svc.id
        or pr.quantity<>q or pr.width_ft is distinct from w or pr.height_ft is distinct from h or pr.requested_unit_price_kobo<>unit_price then
        raise exception 'Owner-approved price or item has changed' using errcode='22023'; end if;
      job:=job||jsonb_build_object('approved_unit_price_kobo',pr.requested_unit_price_kobo::text);
      approved_ids:=approved_ids||pr.id;
    end if;
    jobs:=jobs||jsonb_build_array(job);
    flags:=flags||jsonb_build_array(jsonb_build_object('typed',case when mat.id is not null then price end,'list',mat.selling_price_per_sqft_kobo,'approved',pr.id is not null));
    total:=total+unit_price*q; idx:=idx+1;
  end loop;
  if total<>bomedia.kobo(payload->>'totalKobo') or paid>total then raise exception 'Total or payment changed; review the order' using errcode='22023'; end if;
  if payload->>'operation'='quote' then
    result:=bomedia.api_quote('screen-quote/'||request_id,jsonb_build_object('actor_id',actor,'customer_id',customer_id_value,'business_date',payload->>'businessDate','items',quote_items));
    if (result->>'total_kobo')::bigint<>total then raise exception 'Catalog price changed; refresh the estimate before saving' using errcode='22023'; end if;
  else
    result:=bomedia.post_tracked_sale('screen-sale/'||request_id,jsonb_strip_nulls(jsonb_build_object('actor_id',actor,'customer_id',customer_id_value,
      'business_date',payload->>'businessDate','jobs',jobs,'initial_payment_kobo',paid::text,'payment_method',method->>'label','cash_account_code',method->>'account_code')));
    select array_agg(v::uuid order by n) into job_ids from jsonb_array_elements_text(result->'job_ids') with ordinality t(v,n);
    for idx in 0..array_length(job_ids,1)-1 loop
      update bomedia.jobs set job_status=payload->>'jobStatus',price_per_sqft_kobo=(flags->idx->>'typed')::bigint where id=job_ids[idx+1];
      if (flags->idx->>'typed')::bigint<>(flags->idx->>'list')::bigint and not (flags->idx->>'approved')::boolean then
        insert into bomedia.sale_reviews(job_id,kind,details,created_by) values(job_ids[idx+1],'price',
          jsonb_build_object('typed_per_sqft_kobo',flags->idx->'typed','list_per_sqft_kobo',flags->idx->'list'),actor);
      end if;
    end loop;
    for item in select value from jsonb_array_elements(result->'stock_shortfalls') loop
      insert into bomedia.sale_reviews(job_id,kind,details,created_by) values(job_ids[(item->>'index')::integer+1],'stock',item,actor);
    end loop;
    if e.id is not null then
      update bomedia.estimates set used_order_id=(result->>'order_id')::uuid where id=e.id;
      update bomedia.orders set estimate_id=e.id where id=(result->>'order_id')::uuid;
      update bomedia.price_requests set status='used',used_order_id=(result->>'order_id')::uuid where id=any(approved_ids);
    end if;
  end if;
  if payload->>'operation'='sale' then
    result:=result||jsonb_build_object('sales_id',(select reference from bomedia.orders where id=(result->>'order_id')::uuid));
  end if;
  result:=result||jsonb_build_object('request_id',request_id,'actor_id',actor,'business_date',payload->>'businessDate',
    'initial_payment_kobo',paid::text,'customer_id',customer_id_value);
  insert into bomedia.idempotency_requests(operation,request_key,payload_sha256,actor_id,response)
    values('screen_order',request_id,encode(sha256(convert_to(payload::text,'UTF8')),'hex'),actor,result);
  return result;
end $$;
revoke all on function bomedia.api_screen_order(text,jsonb),bomedia.api_order_catalog(text,jsonb) from public;
grant execute on function bomedia.api_screen_order(text,jsonb),bomedia.api_order_catalog(text,jsonb) to bomedia_financial_runtime;
-- Older legacy-sale retries also need to stop before re-reading changed catalog data.
alter function bomedia.api_legacy_sale(text,jsonb) rename to legacy_sale_before_stage2;
revoke all on function bomedia.legacy_sale_before_stage2(text,jsonb) from bomedia_financial_runtime;
create function bomedia.api_legacy_sale(request_id text,payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,bomedia as $$
declare previous jsonb; result jsonb; actor uuid;
begin
 actor:=(payload->>'actor_id')::uuid;
 if not exists(select 1 from bomedia.staff where id=actor and disabled_at is null) then raise exception 'Enabled actor required' using errcode='42501'; end if;
 previous:=bomedia.prior_result('legacy_screen_sale',request_id,payload);
 if previous is not null then return previous; end if;
 result:=bomedia.legacy_sale_before_stage2(request_id,payload);
 insert into bomedia.idempotency_requests(operation,request_key,payload_sha256,actor_id,response)
 values('legacy_screen_sale',request_id,encode(sha256(convert_to(payload::text,'UTF8')),'hex'),actor,result);
 return result;
end $$;
revoke all on function bomedia.api_legacy_sale(text,jsonb) from public;
grant execute on function bomedia.api_legacy_sale(text,jsonb) to bomedia_financial_runtime;
-- Quote numbers also grow rather than truncating when the sequence reaches six digits.
create function bomedia.next_quote_number() returns text language sql volatile set search_path=pg_catalog,bomedia as $$
 select 'QT-'||lpad(n,greatest(5,length(n)),'0') from (select nextval('bomedia.quote_number_seq')::text n) value
$$;
revoke all on function bomedia.next_quote_number() from public;
do $$ begin
 execute replace(pg_get_functiondef('bomedia.api_quote(text,jsonb)'::regprocedure),
   $needle$'QT-'||lpad(nextval('bomedia.quote_number_seq')::text,5,'0')$needle$, 'bomedia.next_quote_number()');
end $$;
commit;

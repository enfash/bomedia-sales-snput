-- Accounted stock writes through the restricted financial role (local only).
-- Restock: owner buys whole rolls of an existing material, paid at once.
--   Each roll keeps the Sheets 10 ft setup reserve; cost is spread over the
--   usable length. Dr 1200 Inventory / Cr the payment method's account.
-- Waste: staff write off length from a roll at its purchase cost per usable
--   foot. Dr 5100 Material waste / Cr 1200.
-- Count correction: owner sets a roll to its measured length; the value
--   difference moves between 1200 and 5100.
-- Costs use the same rounded-remaining-value method as tracked sales, so a
-- roll's journals sum to its purchase cost exactly when it is used up.
begin;
do $$ begin
  if exists(select 1 from bomedia.idempotency_requests where operation in ('api_restock','api_waste','api_stock_count')) then
    raise exception 'Existing stock retries require an explicit compatibility migration';
  end if;
end $$;
insert into bomedia.ledger_accounts(code,name,category,normal_side,purpose) values
  ('5100','Material waste','expense','debit','general');

create function bomedia.roll_value(roll bomedia.inventory_rolls,remaining numeric) returns bigint
language plpgsql immutable set search_path=pg_catalog,bomedia as $$
begin
  if roll.purchase_cost_kobo is null or roll.total_length_ft<=0 then
    raise exception 'Roll cost needs review before accounting' using errcode='23514'; end if;
  return round(remaining/roll.total_length_ft*roll.purchase_cost_kobo)::bigint;
end $$;

create function bomedia.roll_status(remaining numeric,threshold numeric) returns text
language sql immutable set search_path=pg_catalog as $$
  select case when remaining<=0 then 'Out of Stock' when remaining<=threshold then 'Low Stock' else 'Active' end
$$;

create function bomedia.stock_actor(request_id text,payload jsonb,allowed text[]) returns uuid
language plpgsql set search_path=pg_catalog,bomedia as $$
declare actor uuid;
begin
  if jsonb_typeof(payload) is distinct from 'object' then
    raise exception 'Stock payload is required' using errcode='22023'; end if;
  if exists(select 1 from jsonb_object_keys(payload) k where k<>all(allowed)) then
    raise exception 'Unexpected stock field' using errcode='22023'; end if;
  actor:=(payload->>'actor_id')::uuid;
  if not exists(select 1 from bomedia.staff where id=actor and disabled_at is null) then
    raise exception 'An enabled staff member is required' using errcode='42501'; end if;
  if request_id is null or btrim(request_id)='' or length(request_id)>200 then
    raise exception 'Invalid operation key' using errcode='22023'; end if;
  return actor;
end $$;

create function bomedia.lock_active_books() returns void
language plpgsql set search_path=pg_catalog,bomedia as $$
begin
  perform singleton from bomedia.bookkeeping_settings where singleton and state='active' for update;
  if not found then raise exception 'Active accounting books required' using errcode='23514'; end if;
end $$;

create function bomedia.check_business_date(value text) returns date
language plpgsql set search_path=pg_catalog as $$
begin
  if coalesce(value,'') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Business date required' using errcode='22023'; end if;
  return value::date;
end $$;

create function bomedia.api_restock(request_id text,payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,bomedia as $$
declare previous jsonb; result jsonb; actor uuid; mat bomedia.materials%rowtype; method_value jsonb;
  roll_count integer; raw_length numeric; usable numeric; total_cost bigint; base_cost bigint; extra bigint;
  date_value date; prefix text; next_number integer; roll_id uuid; roll_ids jsonb:='[]'; journal jsonb; cost bigint; i integer;
begin
  actor:=bomedia.stock_actor(request_id,payload,array['actor_id','material_id','roll_count','raw_length_ft','total_cost_kobo','payment_method','business_date','supplier','reference']);
  previous:=bomedia.prior_result('api_restock',request_id,payload);
  if previous is not null then return previous; end if;
  perform bomedia.lock_active_books();
  date_value:=bomedia.check_business_date(payload->>'business_date');
  select * into mat from bomedia.materials where id=(payload->>'material_id')::uuid for update;
  if not found then raise exception 'Unknown material' using errcode='22023'; end if;
  if coalesce(payload->>'roll_count','') !~ '^[1-9][0-9]?$' then raise exception 'Roll count must be 1 to 99' using errcode='22023'; end if;
  roll_count:=(payload->>'roll_count')::integer;
  raw_length:=bomedia.feet(payload->>'raw_length_ft');
  if raw_length<=10 or raw_length>10000 then raise exception 'Roll length must exceed the 10 ft setup reserve' using errcode='22023'; end if;
  usable:=raw_length-10;
  total_cost:=bomedia.kobo(payload->>'total_cost_kobo');
  if total_cost<roll_count then raise exception 'Total cost must be positive for every roll' using errcode='22023'; end if;
  if length(coalesce(payload->>'supplier',''))>200 or length(coalesce(payload->>'reference',''))>100 then
    raise exception 'Supplier and reference are bounded' using errcode='22023'; end if;
  method_value:=bomedia.resolve_payment_method(payload->>'payment_method');
  base_cost:=total_cost/roll_count; extra:=total_cost-base_cost*roll_count;
  prefix:=mat.name||' '||trim_scale(mat.width_ft)::text||'ft - Roll ';
  select coalesce(max(substring(legacy_roll_id from length(prefix)+1)::integer),0) into next_number
    from bomedia.inventory_rolls where legacy_roll_id like prefix||'%' and substring(legacy_roll_id from length(prefix)+1) ~ '^[0-9]{1,6}$';
  for i in 1..roll_count loop
    cost:=base_cost+case when i<=extra then 1 else 0 end;
    insert into bomedia.inventory_rolls(material_id,legacy_roll_id,item_name,category,width_ft,raw_length_ft,total_length_ft,
        remaining_length_ft,original_unit,purchase_cost_kobo,cost_per_sqft_kobo,cost_per_sqft_kobo_exact,waste_factor,
        low_stock_threshold_ft,status,business_date)
      values(mat.id,prefix||lpad((next_number+i)::text,3,'0'),mat.name,mat.category,mat.width_ft,raw_length,usable,usable,'ft',cost,
        round(cost/(mat.width_ft*usable))::bigint,round(cost/(mat.width_ft*usable),6),10,mat.low_stock_threshold_ft,
        bomedia.roll_status(usable,mat.low_stock_threshold_ft),date_value)
      returning id into roll_id;
    insert into bomedia.inventory_movements(roll_id,kind,length_delta_ft,reason,business_date,created_by)
      values(roll_id,'restock',usable,left('Restock'||coalesce(' from '||nullif(btrim(payload->>'supplier'),''),'')
        ||coalesce(' ref '||nullif(btrim(payload->>'reference'),''),''),300),date_value,actor);
    roll_ids:=roll_ids||jsonb_build_array(roll_id);
  end loop;
  if mat.active_roll_id is null then update bomedia.materials set active_roll_id=(roll_ids->>0)::uuid where id=mat.id; end if;
  journal:=bomedia.post_journal('api-restock/'||(roll_ids->>0),jsonb_build_object('actor_id',actor,'kind','adjustment',
    'memo','Restock: '||roll_count||' x '||mat.name||' '||trim_scale(mat.width_ft)::text||'ft','business_date',date_value::text,
    'source_type','restock','source_id',roll_ids->>0,'evidence_reference',nullif(btrim(payload->>'reference'),''),
    'lines',jsonb_build_array(jsonb_build_object('account_code','1200','debit_kobo',total_cost::text),
      jsonb_build_object('account_code',method_value->>'account_code','credit_kobo',total_cost::text))));
  result:=jsonb_build_object('stock_entry_id',roll_ids->>0,'roll_ids',roll_ids,'journal_entry_id',journal->>'journal_entry_id',
    'usable_length_ft',(usable*roll_count)::text,'total_cost_kobo',total_cost::text);
  insert into bomedia.idempotency_requests(operation,request_key,payload_sha256,actor_id,response)
    values('api_restock',request_id,encode(sha256(convert_to(payload::text,'UTF8')),'hex'),actor,result);
  insert into bomedia.audit_events(actor_id,action,entity_type,entity_id) values(actor,'stock_restocked','material',mat.id);
  return result;
end $$;

-- Shared by waste (negative only) and count corrections (either direction).
create function bomedia.move_roll_stock(request_id text,operation_name text,payload jsonb,actor uuid,new_remaining numeric,
  roll bomedia.inventory_rolls,kind_value text,reason_value text,date_value date) returns jsonb
language plpgsql set search_path=pg_catalog,bomedia as $$
declare value_change bigint; movement uuid; journal jsonb; lines jsonb; result jsonb; inventory_value numeric;
begin
  value_change:=bomedia.roll_value(roll,new_remaining)-bomedia.roll_value(roll,roll.remaining_length_ft);
  update bomedia.inventory_rolls set remaining_length_ft=new_remaining,
    waste_length_ft=waste_length_ft+case when kind_value='waste' then roll.remaining_length_ft-new_remaining else 0 end,
    status=bomedia.roll_status(new_remaining,low_stock_threshold_ft) where id=roll.id;
  insert into bomedia.inventory_movements(roll_id,kind,length_delta_ft,reason,business_date,created_by)
    values(roll.id,kind_value,new_remaining-roll.remaining_length_ft,reason_value,date_value,actor) returning id into movement;
  if value_change<0 then
    select coalesce(sum(l.debit_kobo::numeric-l.credit_kobo),0) into inventory_value from bomedia.journal_lines l
      join bomedia.journal_entries e on e.id=l.entry_id where l.account_code='1200' and e.status='posted' and e.business_date<=date_value;
    if -value_change>inventory_value then
      raise exception 'Inventory accounting value needs reconciliation first' using errcode='23514'; end if;
    lines:=jsonb_build_array(jsonb_build_object('account_code','5100','debit_kobo',(-value_change)::text),
      jsonb_build_object('account_code','1200','credit_kobo',(-value_change)::text));
  elsif value_change>0 then
    lines:=jsonb_build_array(jsonb_build_object('account_code','1200','debit_kobo',value_change::text),
      jsonb_build_object('account_code','5100','credit_kobo',value_change::text));
  end if;
  if lines is not null then
    journal:=bomedia.post_journal('api-stock/'||movement::text,jsonb_build_object('actor_id',actor,'kind','adjustment',
      'memo',left(initcap(kind_value)||': '||roll.item_name||' - '||reason_value,500),'business_date',date_value::text,
      'source_type','stock_'||kind_value,'source_id',movement,'lines',lines));
  end if;
  result:=jsonb_build_object('stock_entry_id',movement,'roll_id',roll.id,'journal_entry_id',journal->>'journal_entry_id',
    'remaining_length_ft',new_remaining::text,'value_change_kobo',value_change::text);
  insert into bomedia.idempotency_requests(operation,request_key,payload_sha256,actor_id,response)
    values(operation_name,request_id,encode(sha256(convert_to(payload::text,'UTF8')),'hex'),actor,result);
  insert into bomedia.audit_events(actor_id,action,entity_type,entity_id) values(actor,'stock_'||kind_value,'inventory_roll',roll.id);
  return result;
end $$;

create function bomedia.api_waste(request_id text,payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,bomedia as $$
declare previous jsonb; actor uuid; roll bomedia.inventory_rolls%rowtype; waste numeric; date_value date; reason_value text;
begin
  actor:=bomedia.stock_actor(request_id,payload,array['actor_id','roll_id','length_ft','reason','responsible','note','business_date']);
  previous:=bomedia.prior_result('api_waste',request_id,payload);
  if previous is not null then return previous; end if;
  perform bomedia.lock_active_books();
  date_value:=bomedia.check_business_date(payload->>'business_date');
  if coalesce(length(btrim(payload->>'reason')),0) not between 1 and 200 or length(coalesce(payload->>'responsible',''))>100
    or length(coalesce(payload->>'note',''))>500 then raise exception 'Reason required; details are bounded' using errcode='22023'; end if;
  select * into roll from bomedia.inventory_rolls where id=(payload->>'roll_id')::uuid for update;
  if not found or lower(roll.status) not in ('active','low stock') then
    raise exception 'Choose a roll that is in stock' using errcode='22023'; end if;
  waste:=bomedia.feet(payload->>'length_ft');
  if waste<=0 or waste>roll.remaining_length_ft then
    raise exception 'Waste must be positive and no more than the roll has left' using errcode='22023'; end if;
  reason_value:=left(btrim(payload->>'reason')||coalesce(' - '||nullif(btrim(payload->>'note'),''),'')
    ||coalesce(' (responsible: '||nullif(btrim(payload->>'responsible'),'')||')',''),800);
  return bomedia.move_roll_stock(request_id,'api_waste',payload,actor,roll.remaining_length_ft-waste,roll,'waste',reason_value,date_value);
end $$;

create function bomedia.api_stock_count(request_id text,payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,bomedia as $$
declare previous jsonb; actor uuid; roll bomedia.inventory_rolls%rowtype; counted numeric; date_value date;
begin
  actor:=bomedia.stock_actor(request_id,payload,array['actor_id','roll_id','counted_length_ft','reason','business_date']);
  previous:=bomedia.prior_result('api_stock_count',request_id,payload);
  if previous is not null then return previous; end if;
  perform bomedia.lock_active_books();
  date_value:=bomedia.check_business_date(payload->>'business_date');
  if coalesce(length(btrim(payload->>'reason')),0) not between 3 and 500 then
    raise exception 'Explain the difference' using errcode='22023'; end if;
  select * into roll from bomedia.inventory_rolls where id=(payload->>'roll_id')::uuid for update;
  if not found then raise exception 'Unknown roll' using errcode='22023'; end if;
  counted:=bomedia.feet(payload->>'counted_length_ft');
  if counted>roll.total_length_ft then raise exception 'Count cannot exceed the roll''s usable length' using errcode='22023'; end if;
  if counted=roll.remaining_length_ft then raise exception 'Count matches; nothing to correct' using errcode='22023'; end if;
  return bomedia.move_roll_stock(request_id,'api_stock_count',payload,actor,counted,roll,'adjustment','Count: '||btrim(payload->>'reason'),date_value);
end $$;

revoke all on function bomedia.roll_value(bomedia.inventory_rolls,numeric),bomedia.roll_status(numeric,numeric),
  bomedia.stock_actor(text,jsonb,text[]),bomedia.lock_active_books(),bomedia.check_business_date(text),
  bomedia.move_roll_stock(text,text,jsonb,uuid,numeric,bomedia.inventory_rolls,text,text,date) from public;
revoke all on function bomedia.api_restock(text,jsonb),bomedia.api_waste(text,jsonb),bomedia.api_stock_count(text,jsonb) from public;
grant execute on function bomedia.api_restock(text,jsonb),bomedia.api_waste(text,jsonb),bomedia.api_stock_count(text,jsonb) to bomedia_financial_runtime;
commit;

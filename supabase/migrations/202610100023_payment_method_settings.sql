-- Owner settings for payment methods: rename a method, turn it on or off.
-- The ledger account a method posts to stays fixed (accounting setup), so no change here can misroute money.
begin;

create function bomedia.api_payment_methods_admin() returns jsonb
language sql security definer set search_path=pg_catalog,bomedia as $$
  select jsonb_build_object('data',coalesce(jsonb_agg(jsonb_build_object('method',m.method,'label',m.label,'enabled',m.enabled,
    'account_code',m.account_code,'account_name',a.name,'account_active',a.active) order by m.method='cash' desc,m.method='transfer' desc,m.method),'[]'),
    'next_after_id',null)
  from bomedia.payment_methods m join bomedia.ledger_accounts a on a.code=m.account_code
$$;

create function bomedia.api_payment_method_save(request_id text, payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,bomedia as $$
declare previous jsonb; result jsonb; actor uuid; target text; new_label text; new_enabled boolean; old_row bomedia.payment_methods%rowtype; changed text[]:='{}';
begin
  if jsonb_typeof(payload) is distinct from 'object' then raise exception 'A payment method is required' using errcode='22023'; end if;
  if exists(select 1 from jsonb_object_keys(payload) k where k not in ('actor_id','method','label','enabled')) then
    raise exception 'Unexpected payment method field' using errcode='22023'; end if;
  if jsonb_typeof(payload->'label') is distinct from 'string' or jsonb_typeof(payload->'enabled') is distinct from 'boolean'
     or jsonb_typeof(payload->'method') is distinct from 'string' then
    raise exception 'Method, name and availability are required' using errcode='22023'; end if;
  actor:=(payload->>'actor_id')::uuid; target:=payload->>'method'; new_label:=btrim(payload->>'label'); new_enabled:=(payload->>'enabled')::boolean;
  if length(new_label) not between 1 and 40 then raise exception 'The name must be 1 to 40 characters' using errcode='22023'; end if;
  if not exists(select 1 from bomedia.staff where id=actor and disabled_at is null) then
    raise exception 'An enabled staff member is required' using errcode='42501'; end if;
  previous:=bomedia.prior_result('api_payment_method_save',request_id,payload);
  if previous is not null then return previous; end if;

  perform 1 from bomedia.payment_methods order by method for update;
  select * into old_row from bomedia.payment_methods where method=target;
  if not found then raise exception 'Unknown payment method' using errcode='22023'; end if;
  if exists(select 1 from bomedia.payment_methods where method<>target and lower(btrim(label))=lower(new_label)) then
    raise exception 'Another method already uses that name' using errcode='23505'; end if;
  update bomedia.payment_methods set label=new_label, enabled=new_enabled where method=target;
  -- Staff must always have a way to record a payment.
  if not exists(select 1 from bomedia.payment_methods m join bomedia.ledger_accounts a on a.code=m.account_code
      where m.enabled and a.active and a.purpose='cash_bank') then
    raise exception 'At least one payment method must stay on' using errcode='23514'; end if;

  if old_row.label is distinct from new_label then changed:=array_append(changed,'label'::text); end if;
  if old_row.enabled is distinct from new_enabled then changed:=array_append(changed,'enabled'::text); end if;
  result:=jsonb_build_object('method',target,'changed',to_jsonb(changed));
  insert into bomedia.idempotency_requests(operation,request_key,payload_sha256,actor_id,response)
    values('api_payment_method_save',request_id,encode(sha256(convert_to(payload::text,'UTF8')),'hex'),actor,result);
  if cardinality(changed)>0 then
    insert into bomedia.audit_events(actor_id,action,entity_type,details)
      values(actor,'payment_method_saved','payment_method',jsonb_build_object('method',target,'changed',to_jsonb(changed),'label',new_label,'enabled',new_enabled));
  end if;
  return result;
end $$;

revoke all on function bomedia.api_payment_methods_admin(), bomedia.api_payment_method_save(text, jsonb) from public;
grant execute on function bomedia.api_payment_methods_admin(), bomedia.api_payment_method_save(text, jsonb) to bomedia_financial_runtime;
commit;

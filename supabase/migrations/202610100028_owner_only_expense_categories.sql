-- Owner-only expense categories: a category can be marked so only the owner may log it.
-- Staff never see it in their list, and the write functions refuse it unless the server says the owner is acting.
-- Server-set field: payload by_owner / byOwner. Only the restricted runtime role can call these functions.
begin;

alter table bomedia.expense_categories add column owner_only boolean not null default false;

create or replace function bomedia.api_expense_categories() returns jsonb
language sql security definer set search_path=pg_catalog,bomedia as $$
  select jsonb_build_object('data',coalesce(jsonb_agg(jsonb_build_object('name',c.name,'capital',c.account_code='1500','owner_only',c.owner_only) order by c.name),'[]'),
    'next_after_id',null) from bomedia.expense_categories c join bomedia.ledger_accounts a on a.code=c.account_code
    where c.enabled and a.active
$$;

drop function bomedia.api_expense_categories_admin();
create function bomedia.api_expense_categories_admin() returns jsonb
language sql security definer set search_path=pg_catalog,bomedia as $$
  select jsonb_build_object('data',coalesce(jsonb_agg(jsonb_build_object('name',c.name,
      'kind',case when c.account_code='1500' then 'capital' else 'everyday' end,'enabled',c.enabled,'owner_only',c.owner_only,
      'expense_count',(select count(*) from bomedia.expenses e where e.category=c.name))
      order by c.enabled desc, lower(c.name)),'[]'),'next_after_id',null)
  from bomedia.expense_categories c
$$;
revoke all on function bomedia.api_expense_categories_admin() from public;
grant execute on function bomedia.api_expense_categories_admin() to bomedia_financial_runtime;

create or replace function bomedia.api_expense_category_save(request_id text, payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,bomedia as $$
declare previous jsonb; result jsonb; actor uuid; action_value text; name_value text; kind_value text; enabled_value boolean; owner_only_value boolean:=false;
  target bomedia.expense_categories%rowtype; account text; changed text[]:='{}';
begin
  if jsonb_typeof(payload) is distinct from 'object' then raise exception 'An expense category is required' using errcode='22023'; end if;
  if exists(select 1 from jsonb_object_keys(payload) k where k not in ('actor_id','action','name','kind','enabled','owner_only')) then
    raise exception 'Unexpected expense category field' using errcode='22023'; end if;
  if jsonb_typeof(payload->'action') is distinct from 'string' or jsonb_typeof(payload->'name') is distinct from 'string' then
    raise exception 'An action and a name are required' using errcode='22023'; end if;
  actor:=(payload->>'actor_id')::uuid; action_value:=payload->>'action'; name_value:=btrim(payload->>'name');
  if length(name_value) not between 1 and 100 then raise exception 'The name must be 1 to 100 characters' using errcode='22023'; end if;
  if action_value='add' then
    if jsonb_typeof(payload->'kind') is distinct from 'string' or payload ? 'enabled'
      or (payload ? 'owner_only' and jsonb_typeof(payload->'owner_only') is distinct from 'boolean') then
      raise exception 'Adding needs a kind and nothing else' using errcode='22023'; end if;
    owner_only_value:=coalesce((payload->>'owner_only')::boolean,false);
    kind_value:=payload->>'kind';
    if kind_value not in ('everyday','capital') then raise exception 'Choose everyday cost or equipment' using errcode='22023'; end if;
  elsif action_value='set_enabled' then
    if jsonb_typeof(payload->'enabled') is distinct from 'boolean' or payload ? 'kind' or payload ? 'owner_only' then
      raise exception 'Choose on or off and nothing else' using errcode='22023'; end if;
    enabled_value:=(payload->>'enabled')::boolean;
  elsif action_value='set_owner_only' then
    if jsonb_typeof(payload->'owner_only') is distinct from 'boolean' or payload ? 'kind' or payload ? 'enabled' then
      raise exception 'Choose owner only or staff and nothing else' using errcode='22023'; end if;
    owner_only_value:=(payload->>'owner_only')::boolean;
  else raise exception 'Unknown action' using errcode='22023'; end if;
  if not exists(select 1 from bomedia.staff where id=actor and disabled_at is null) then
    raise exception 'An enabled staff member is required' using errcode='42501'; end if;
  previous:=bomedia.prior_result('api_expense_category_save',request_id,payload);
  if previous is not null then return previous; end if;

  perform 1 from bomedia.expense_categories order by name for update;
  if action_value='add' then
    if exists(select 1 from bomedia.expense_categories where lower(btrim(name))=lower(name_value)) then
      raise exception 'That category already exists' using errcode='23505'; end if;
    account:=case kind_value when 'capital' then '1500' else '6000' end;
    if not exists(select 1 from bomedia.ledger_accounts where code=account and active) then
      raise exception 'The ledger account for that kind is not available' using errcode='22023'; end if;
    insert into bomedia.expense_categories(name,account_code,enabled,owner_only) values(name_value,account,true,owner_only_value);
    changed:=array['added'];
  else
    select * into target from bomedia.expense_categories where lower(btrim(name))=lower(name_value);
    if not found then raise exception 'Unknown expense category' using errcode='22023'; end if;
    name_value:=target.name;
    if action_value='set_owner_only' then
      if target.owner_only is distinct from owner_only_value then
        update bomedia.expense_categories set owner_only=owner_only_value where name=target.name;
        changed:=array[case when owner_only_value then 'owner_only_on' else 'owner_only_off' end];
      end if;
    elsif target.enabled is distinct from enabled_value then
      update bomedia.expense_categories set enabled=enabled_value where name=target.name;
      changed:=array['enabled'];
    end if;
    -- Staff must always have a way to log an expense: one category that is on and not owner only.
    if not exists(select 1 from bomedia.expense_categories c join bomedia.ledger_accounts a on a.code=c.account_code
        where c.enabled and not c.owner_only and a.active) then
      raise exception 'At least one expense category must stay on for staff' using errcode='23514'; end if;
  end if;

  result:=jsonb_build_object('name',name_value,'changed',to_jsonb(changed));
  insert into bomedia.idempotency_requests(operation,request_key,payload_sha256,actor_id,response)
    values('api_expense_category_save',request_id,encode(sha256(convert_to(payload::text,'UTF8')),'hex'),actor,result);
  if cardinality(changed)>0 then
    insert into bomedia.audit_events(actor_id,action,entity_type,details)
      values(actor,'expense_category_saved','expense_category',jsonb_build_object('name',name_value,'changed',to_jsonb(changed),
        'enabled',coalesce(enabled_value,true)));
  end if;
  return result;
end $$;

revoke all on function bomedia.api_expense_category_save(text, jsonb) from public;
grant execute on function bomedia.api_expense_category_save(text, jsonb) to bomedia_financial_runtime;

do $$
declare definition text; needle text;
begin
  definition:=pg_get_functiondef('bomedia.api_expense(text,jsonb)'::regprocedure);
  needle:=$t$'paid_to','status','payment_method')) then$t$;
  if strpos(definition,needle)=0 then raise exception 'Expense payload check changed'; end if;
  definition:=replace(definition,needle,$t$'paid_to','status','payment_method','by_owner')) then$t$);
  needle:=$t$  if category_value is null then$t$;
  if strpos(definition,needle)=0 then raise exception 'Expense category check changed'; end if;
  definition:=replace(definition,needle,$t$  if category_value is not null and coalesce(payload->>'by_owner','')<>'true'
    and exists(select 1 from bomedia.expense_categories c where c.name=category_value and c.owner_only) then
    raise exception 'Only the owner can log that category' using errcode='22023'; end if;
  if category_value is null then$t$);
  execute definition;
  definition:=pg_get_functiondef('bomedia.api_screen_expense(text,jsonb)'::regprocedure);
  needle:=$t$'paid_to',item->>'paidTo'$t$;
  if strpos(definition,needle)=0 then raise exception 'Screen expense items changed'; end if;
  execute replace(definition,needle,$t$'by_owner',payload->>'byOwner','paid_to',item->>'paidTo'$t$);
end $$;
commit;

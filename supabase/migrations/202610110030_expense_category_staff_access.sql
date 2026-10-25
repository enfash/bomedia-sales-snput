-- Who can log each expense category: everyone, only the owner, or the owner plus chosen staff.
-- Stored as the existing owner_only flag plus a list of allowed staff:
--   owner_only=false                      -> everyone
--   owner_only=true, no staff rows        -> owner only
--   owner_only=true, one or more staff    -> owner and those staff
begin;

create table bomedia.expense_category_staff (
  category text not null references bomedia.expense_categories(name) on delete cascade,
  staff_id uuid not null references bomedia.staff(id),
  primary key (category, staff_id)
);
alter table bomedia.expense_category_staff enable row level security;
revoke all on bomedia.expense_category_staff from public;

create or replace function bomedia.api_expense_categories() returns jsonb
language sql security definer set search_path=pg_catalog,bomedia as $$
  select jsonb_build_object('data',coalesce(jsonb_agg(jsonb_build_object('name',c.name,'capital',c.account_code='1500','owner_only',c.owner_only,
      'staff_ids',coalesce((select jsonb_agg(s.staff_id order by s.staff_id) from bomedia.expense_category_staff s where s.category=c.name),'[]'::jsonb))
      order by c.name),'[]'),'next_after_id',null)
  from bomedia.expense_categories c join bomedia.ledger_accounts a on a.code=c.account_code
  where c.enabled and a.active
$$;

create or replace function bomedia.api_expense_categories_admin() returns jsonb
language sql security definer set search_path=pg_catalog,bomedia as $$
  select jsonb_build_object('data',coalesce(jsonb_agg(jsonb_build_object('name',c.name,
      'kind',case when c.account_code='1500' then 'capital' else 'everyday' end,'enabled',c.enabled,'owner_only',c.owner_only,
      'staff_ids',coalesce((select jsonb_agg(s.staff_id order by s.staff_id) from bomedia.expense_category_staff s where s.category=c.name),'[]'::jsonb),
      'expense_count',(select count(*) from bomedia.expenses e where e.category=c.name))
      order by c.enabled desc, lower(c.name)),'[]'),'next_after_id',null)
  from bomedia.expense_categories c
$$;

create or replace function bomedia.api_expense_category_save(request_id text, payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,bomedia as $$
declare previous jsonb; result jsonb; actor uuid; action_value text; name_value text; kind_value text; enabled_value boolean;
  access_value text:='everyone'; staff_value uuid[]:='{}'; current_staff uuid[];
  target bomedia.expense_categories%rowtype; account text; changed text[]:='{}'; staff_item text;
begin
  if jsonb_typeof(payload) is distinct from 'object' then raise exception 'An expense category is required' using errcode='22023'; end if;
  if exists(select 1 from jsonb_object_keys(payload) k where k not in ('actor_id','action','name','kind','enabled','access','staff_ids')) then
    raise exception 'Unexpected expense category field' using errcode='22023'; end if;
  if jsonb_typeof(payload->'action') is distinct from 'string' or jsonb_typeof(payload->'name') is distinct from 'string' then
    raise exception 'An action and a name are required' using errcode='22023'; end if;
  actor:=(payload->>'actor_id')::uuid; action_value:=payload->>'action'; name_value:=btrim(payload->>'name');
  if length(name_value) not between 1 and 100 then raise exception 'The name must be 1 to 100 characters' using errcode='22023'; end if;
  if action_value in ('add','set_access') then
    if payload ? 'access' then
      if jsonb_typeof(payload->'access') is distinct from 'string' or payload->>'access' not in ('everyone','owner','chosen') then
        raise exception 'Choose everyone, owner only or chosen staff' using errcode='22023'; end if;
      access_value:=payload->>'access';
    elsif action_value='set_access' then raise exception 'Choose who can log it' using errcode='22023'; end if;
    if payload ? 'staff_ids' then
      if jsonb_typeof(payload->'staff_ids') is distinct from 'array' or jsonb_array_length(payload->'staff_ids')>100 then
        raise exception 'Staff must be a short list' using errcode='22023'; end if;
      for staff_item in select jsonb_array_elements_text(payload->'staff_ids') loop
        staff_value:=array_append(staff_value,staff_item::uuid);
      end loop;
      select coalesce(array_agg(distinct x),'{}') into staff_value from unnest(staff_value) x;
    end if;
    if access_value='chosen' and cardinality(staff_value)=0 then raise exception 'Choose at least one staff member' using errcode='22023'; end if;
    if access_value<>'chosen' and cardinality(staff_value)>0 then raise exception 'Staff are only chosen with chosen access' using errcode='22023'; end if;
    if cardinality(staff_value)>0 and exists(select 1 from unnest(staff_value) x where not exists(select 1 from bomedia.staff p where p.id=x and p.disabled_at is null)) then
      raise exception 'Choose active staff members' using errcode='22023'; end if;
  end if;
  if action_value='add' then
    if jsonb_typeof(payload->'kind') is distinct from 'string' or payload ? 'enabled' then
      raise exception 'Adding needs a kind and nothing else' using errcode='22023'; end if;
    kind_value:=payload->>'kind';
    if kind_value not in ('everyday','capital') then raise exception 'Choose everyday cost or equipment' using errcode='22023'; end if;
  elsif action_value='set_enabled' then
    if jsonb_typeof(payload->'enabled') is distinct from 'boolean' or payload ? 'kind' or payload ? 'access' or payload ? 'staff_ids' then
      raise exception 'Choose on or off and nothing else' using errcode='22023'; end if;
    enabled_value:=(payload->>'enabled')::boolean;
  elsif action_value='set_access' then
    if payload ? 'kind' or payload ? 'enabled' then raise exception 'Choose who can log it and nothing else' using errcode='22023'; end if;
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
    insert into bomedia.expense_categories(name,account_code,enabled,owner_only) values(name_value,account,true,access_value<>'everyone');
    insert into bomedia.expense_category_staff(category,staff_id) select name_value,x from unnest(staff_value) x;
    changed:=array['added'];
  else
    select * into target from bomedia.expense_categories where lower(btrim(name))=lower(name_value);
    if not found then raise exception 'Unknown expense category' using errcode='22023'; end if;
    name_value:=target.name;
    if action_value='set_access' then
      select coalesce(array_agg(staff_id order by staff_id),'{}') into current_staff from bomedia.expense_category_staff where category=target.name;
      if target.owner_only is distinct from (access_value<>'everyone') or current_staff is distinct from (select coalesce(array_agg(x order by x),'{}') from unnest(staff_value) x) then
        update bomedia.expense_categories set owner_only=(access_value<>'everyone') where name=target.name;
        delete from bomedia.expense_category_staff where category=target.name;
        insert into bomedia.expense_category_staff(category,staff_id) select target.name,x from unnest(staff_value) x;
        changed:=array['access_'||access_value];
      end if;
    elsif target.enabled is distinct from enabled_value then
      update bomedia.expense_categories set enabled=enabled_value where name=target.name;
      changed:=array['enabled'];
    end if;
  end if;
  -- Staff must always have a way to log an expense: one category that is on and open to everyone.
  if not exists(select 1 from bomedia.expense_categories c join bomedia.ledger_accounts a on a.code=c.account_code
      where c.enabled and not c.owner_only and a.active) then
    raise exception 'At least one expense category must stay on for staff' using errcode='23514'; end if;

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

-- Chosen staff may log an owner-only category; everyone else still needs the server to say the owner is acting.
do $$
declare definition text; needle text;
begin
  definition:=pg_get_functiondef('bomedia.api_expense(text,jsonb)'::regprocedure);
  needle:=$t$c.name=category_value and c.owner_only) then$t$;
  if strpos(definition,needle)=0 then raise exception 'Owner-only category check changed'; end if;
  execute replace(definition,needle,$t$c.name=category_value and c.owner_only)
    and not exists(select 1 from bomedia.expense_category_staff s where s.category=category_value and s.staff_id=actor) then$t$);
end $$;
commit;

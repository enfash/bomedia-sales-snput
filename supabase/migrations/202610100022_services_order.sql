-- Services: owner-chosen order. Staff see services in this order; removed (hidden) services keep their place for when they are put back.
begin;
alter table bomedia.services add column sort_order integer not null default 0;

-- Existing services keep today's order (alphabetical) so nothing moves until the owner reorders.
update bomedia.services s set sort_order = r.position
  from (select id, row_number() over (order by lower(name)) as position from bomedia.services) r where r.id = s.id;

-- A new service joins the end of the list, whichever path inserts it.
create function bomedia.services_set_order() returns trigger
language plpgsql security definer set search_path = pg_catalog, bomedia as $$
begin
  new.sort_order := coalesce((select max(sort_order) from bomedia.services), 0) + 1;
  return new;
end $$;
create trigger services_set_order before insert on bomedia.services for each row execute function bomedia.services_set_order();

create or replace function bomedia.api_services(include_hidden boolean) returns jsonb
language sql security definer set search_path=pg_catalog,bomedia as $$
  select jsonb_build_object('data',coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'pricing',s.pricing,
    'unit_price_kobo',s.unit_price_kobo::text,'visible',s.visible) order by s.visible desc,s.sort_order,lower(s.name)),'[]'),'next_after_id',null)
  from bomedia.services s where s.visible or include_hidden
$$;

-- Reorder: the payload lists every service staff can currently see, in the new order.
-- If the list changed since the owner loaded it (one added, removed or hidden), nothing is saved.
create function bomedia.api_services_reorder(request_id text, payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,bomedia as $$
declare previous jsonb; result jsonb; actor uuid; ids uuid[]; current_ids uuid[];
begin
  if jsonb_typeof(payload) is distinct from 'object' then raise exception 'A service order is required' using errcode='22023'; end if;
  if exists(select 1 from jsonb_object_keys(payload) k where k not in ('actor_id','service_ids')) then
    raise exception 'Unexpected service order field' using errcode='22023'; end if;
  if jsonb_typeof(payload->'service_ids') is distinct from 'array' then raise exception 'A service order is required' using errcode='22023'; end if;
  actor:=(payload->>'actor_id')::uuid;
  if not exists(select 1 from bomedia.staff where id=actor and disabled_at is null) then
    raise exception 'An enabled staff member is required' using errcode='42501'; end if;
  previous:=bomedia.prior_result('api_services_reorder',request_id,payload);
  if previous is not null then return previous; end if;

  select array_agg(value::uuid order by ordinality) into ids from jsonb_array_elements_text(payload->'service_ids') with ordinality;
  perform 1 from bomedia.services where visible for update;
  select array_agg(id order by id) into current_ids from bomedia.services where visible;
  if coalesce(cardinality(ids),0)<>coalesce(cardinality(current_ids),0)
     or (select array_agg(i order by i) from unnest(ids) i) is distinct from current_ids then
    raise exception 'The service list changed. Reload it and try again' using errcode='22023'; end if;

  -- Visible services take positions 1..n in the given order; removed ones follow, in their old order.
  update bomedia.services s set sort_order=r.position
    from (select id, row_number() over (order by (case when id=any(ids) then array_position(ids,id) else 100000 end), sort_order, lower(name)) as position
          from bomedia.services) r where r.id=s.id and s.sort_order<>r.position;

  result:=jsonb_build_object('reordered',coalesce(cardinality(ids),0));
  insert into bomedia.idempotency_requests(operation,request_key,payload_sha256,actor_id,response)
    values('api_services_reorder',request_id,encode(sha256(convert_to(payload::text,'UTF8')),'hex'),actor,result);
  insert into bomedia.audit_events(actor_id,action,entity_type,details)
    values(actor,'services_reordered','service',jsonb_build_object('service_ids',payload->'service_ids'));
  return result;
end $$;

revoke all on function bomedia.api_services_reorder(text, jsonb), bomedia.services_set_order() from public;
grant execute on function bomedia.api_services_reorder(text, jsonb) to bomedia_financial_runtime;
commit;

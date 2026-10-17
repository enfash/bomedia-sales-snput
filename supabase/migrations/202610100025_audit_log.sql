-- Owner-facing read of the audit log: filtered, newest first, paged. Read-only, and details are cut
-- down to a short list of safe keys so nothing sensitive can leak through a future audit entry.
begin;

create function bomedia.audit_category(action_value text) returns text
language sql immutable set search_path=pg_catalog as $$
  select case
    when action_value in ('staff_login','staff_logout') then 'signins'
    when action_value like 'staff\_%' then 'staff'
    when action_value in ('sale_recorded','payment_recorded','quote_saved','customer_created')
      or action_value like 'price\_%' or action_value like 'job\_%' then 'sales'
    when action_value like 'expense\_%' then 'expenses'
    when action_value like 'stock\_%' or action_value like 'waste\_%' then 'stock'
    when action_value in ('business_details_saved','payment_method_saved','service_saved','services_reordered') then 'settings'
    else 'other' end
$$;

create function bomedia.api_audit_log(request_key text, payload jsonb) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,bomedia as $$
declare category_value text; staff_value uuid; since_value timestamptz; before_at timestamptz; before_id uuid;
  limit_value integer; rows_found jsonb; has_more boolean; last_row jsonb;
begin
  if jsonb_typeof(payload) is distinct from 'object' then raise exception 'A filter object is required' using errcode='22023'; end if;
  if exists(select 1 from jsonb_object_keys(payload) k where k not in ('category','staff_id','since','before_at','before_id','limit')) then
    raise exception 'Unexpected audit filter' using errcode='22023'; end if;
  category_value := nullif(payload->>'category','');
  if category_value is not null and category_value not in ('signins','staff','sales','expenses','stock','settings','other') then
    raise exception 'Unknown audit category' using errcode='22023'; end if;
  staff_value := nullif(payload->>'staff_id','')::uuid;
  since_value := nullif(payload->>'since','')::timestamptz;
  before_at := nullif(payload->>'before_at','')::timestamptz;
  before_id := nullif(payload->>'before_id','')::uuid;
  if (before_at is null) <> (before_id is null) then raise exception 'Both cursor fields are required' using errcode='22023'; end if;
  limit_value := coalesce(nullif(payload->>'limit','')::integer, 50);
  if limit_value not between 1 and 100 then raise exception 'Page size must be 1 to 100' using errcode='22023'; end if;

  select coalesce(jsonb_agg(row_json order by created_at desc, id desc),'[]'::jsonb) into rows_found
  from (
    select e.created_at, e.id, jsonb_build_object('id',e.id,'at',e.created_at,'action',e.action,
      'category',bomedia.audit_category(e.action),'actor_id',e.actor_id,'actor_name',s.display_name,
      'entity_type',e.entity_type,'details',(select coalesce(jsonb_object_agg(d.k,d.v),'{}'::jsonb)
        from jsonb_each(e.details) as d(k,v)
        where d.k in ('changed','admin_identity','enabled','method','label','sessions','status','from','to','name','amount_kobo')
          and jsonb_typeof(d.v) in ('string','number','boolean','array') and length(d.v::text) <= 300)) as row_json
    from bomedia.audit_events e left join bomedia.staff s on s.id=e.actor_id
    where (category_value is null or bomedia.audit_category(e.action)=category_value)
      and (staff_value is null or e.actor_id=staff_value)
      and (since_value is null or e.created_at >= since_value)
      and (before_at is null or (e.created_at,e.id) < (before_at,before_id))
    order by e.created_at desc, e.id desc limit limit_value + 1
  ) page;

  has_more := jsonb_array_length(rows_found) > limit_value;
  if has_more then rows_found := rows_found - limit_value; end if;
  last_row := case when has_more then rows_found->(jsonb_array_length(rows_found)-1) end;
  return jsonb_build_object('data',rows_found,
    'next_before', case when has_more then jsonb_build_object('at',last_row->'at','id',last_row->'id') end,
    'people',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name) order by p.display_name),'[]'::jsonb) from bomedia.staff p));
end $$;

revoke all on function bomedia.audit_category(text), bomedia.api_audit_log(text,jsonb) from public;
grant execute on function bomedia.api_audit_log(text,jsonb) to bomedia_financial_runtime;
commit;

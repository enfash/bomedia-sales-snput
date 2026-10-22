-- Owner's Materials screen. One price per material (every size of "Flex" shares it), changeable only here.
-- A "material" for the owner is a name; each width of that name is a row in bomedia.materials (a "size").
begin;

alter table bomedia.materials add column available boolean not null default true;

-- Sizes belong to the same material when their names match ignoring case and extra spaces.
create function bomedia.material_group(name_value text) returns text
language sql immutable set search_path = pg_catalog as $$
  select lower(btrim(regexp_replace(name_value, '\s+', ' ', 'g')))
$$;

-- Price guard. Sales used to copy the active roll's price onto the material after every sale, which would silently undo an
-- owner's price. Now a material's price changes only while api_material_save has switched this setting on for the statement.
create function bomedia.guard_material_price() returns trigger
language plpgsql set search_path = pg_catalog, bomedia as $$
begin
  if new.selling_price_per_sqft_kobo is distinct from old.selling_price_per_sqft_kobo
     and coalesce(current_setting('bomedia.material_price_edit', true), '') <> 'on' then
    new.selling_price_per_sqft_kobo := old.selling_price_per_sqft_kobo;
  end if;
  return new;
end $$;
create trigger guard_material_price before update on bomedia.materials
  for each row execute function bomedia.guard_material_price();

-- Turned-off guard: no new job, price request or saved quote may use a turned-off size. Existing rows are untouched.
create function bomedia.guard_material_available() returns trigger
language plpgsql set search_path = pg_catalog, bomedia as $$
begin
  if new.material_id is not null and exists (select 1 from bomedia.materials m where m.id = new.material_id and not m.available) then
    raise exception 'This material is turned off' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger guard_job_material before insert on bomedia.jobs for each row execute function bomedia.guard_material_available();
create trigger guard_price_request_material before insert on bomedia.price_requests for each row execute function bomedia.guard_material_available();

create function bomedia.guard_estimate_materials() returns trigger
language plpgsql set search_path = pg_catalog, bomedia as $$
begin
  if exists (select 1 from jsonb_path_query(new.cart_data, 'lax $.**.material_id') as found(value)
             join bomedia.materials m on m.id::text = (found.value #>> '{}') where not m.available) then
    raise exception 'This material is turned off' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger guard_estimate_materials before insert on bomedia.estimates for each row execute function bomedia.guard_estimate_materials();

-- Owner read: every material with its one price (null when its sizes disagree) and its sizes.
create function bomedia.api_materials_admin() returns jsonb
language sql stable security definer set search_path = pg_catalog, bomedia as $$
  with sized as (
    select m.*, bomedia.material_group(m.name) as gkey,
      coalesce((select sum(r.remaining_length_ft) from bomedia.inventory_rolls r where r.material_id = m.id and r.remaining_length_ft > 0), 0) as remaining,
      (select count(*) from bomedia.inventory_rolls r where r.material_id = m.id and r.remaining_length_ft > 0)::integer as rolls
    from bomedia.materials m),
  grouped as (
    select gkey, (array_agg(name order by created_at, id))[1] as name,
      count(distinct selling_price_per_sqft_kobo)::integer as price_count, min(selling_price_per_sqft_kobo) as price,
      jsonb_agg(jsonb_build_object('id', id, 'code', bomedia.material_code(legacy_material_id, name, width_ft),
        'width_ft', trim_scale(width_ft)::text, 'remaining_ft', trim_scale(remaining)::text, 'roll_count', rolls,
        'low_stock_ft', trim_scale(low_stock_threshold_ft)::text, 'notes', notes, 'available', available,
        'price_kobo', selling_price_per_sqft_kobo::text) order by width_ft) as sizes
    from sized group by gkey)
  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'price_kobo', case when price_count = 1 then price::text end,
    'prices_differ', price_count > 1, 'sizes', sizes) order by lower(name)), '[]'::jsonb) from grouped
$$;

-- Used by the feeds so selling screens never offer a turned-off size.
create function bomedia.api_unavailable_materials() returns jsonb
language sql stable security definer set search_path = pg_catalog, bomedia as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'code', bomedia.material_code(m.legacy_material_id, m.name, m.width_ft))), '[]'::jsonb)
  from bomedia.materials m where not m.available
$$;

create function bomedia.api_material_save(request_id text, payload jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, bomedia as $$
declare
  previous jsonb; result jsonb; actor uuid; action_value text; gkey text; display_name text; target bomedia.materials%rowtype;
  price_value bigint; width_value numeric; low_value numeric; old_prices bigint[]; updated integer; new_name text; new_gkey text;
  changed text[] := '{}'; code_value text; notes_value text;
begin
  if jsonb_typeof(payload) is distinct from 'object' then raise exception 'A material change is required' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_object_keys(payload) k where k not in
      ('actor_id', 'action', 'name', 'new_name', 'price_kobo', 'width_ft', 'low_stock_ft', 'notes', 'material_id', 'available')) then
    raise exception 'Unexpected material field' using errcode = '22023'; end if;
  actor := (payload ->> 'actor_id')::uuid;
  if not exists (select 1 from bomedia.staff where id = actor and disabled_at is null) then
    raise exception 'An enabled staff member is required' using errcode = '42501'; end if;
  action_value := payload ->> 'action';
  if action_value is null or action_value not in ('set_price', 'rename', 'add_material', 'add_size', 'update_size') then
    raise exception 'Choose a material action' using errcode = '22023'; end if;
  previous := bomedia.prior_result('api_material_save', request_id, payload);
  if previous is not null then return previous; end if;

  -- Shared field checks, so a bad value is refused before anything is locked or written.
  if payload ? 'price_kobo' then
    if jsonb_typeof(payload -> 'price_kobo') is distinct from 'string' or payload ->> 'price_kobo' !~ '^[1-9][0-9]{0,9}$'
       or (payload ->> 'price_kobo')::bigint > 10000000 then
      raise exception 'Enter a price between 1 kobo and 100,000 naira per sq ft' using errcode = '22023'; end if;
    price_value := (payload ->> 'price_kobo')::bigint;
  end if;
  if payload ? 'width_ft' then
    if jsonb_typeof(payload -> 'width_ft') is distinct from 'string' or payload ->> 'width_ft' !~ '^[0-9]{1,3}(\.[0-9]{1,3})?$'
       or (payload ->> 'width_ft')::numeric <= 0 or (payload ->> 'width_ft')::numeric > 100 then
      raise exception 'Enter a width above 0 and up to 100 ft' using errcode = '22023'; end if;
    width_value := (payload ->> 'width_ft')::numeric;
  end if;
  if payload ? 'low_stock_ft' then
    if jsonb_typeof(payload -> 'low_stock_ft') is distinct from 'string' or payload ->> 'low_stock_ft' !~ '^[0-9]{1,5}(\.[0-9]{1,3})?$' then
      raise exception 'Enter a low-stock level in feet' using errcode = '22023'; end if;
    low_value := (payload ->> 'low_stock_ft')::numeric;
  end if;
  if payload ? 'notes' then
    if jsonb_typeof(payload -> 'notes') not in ('string', 'null') or length(coalesce(payload ->> 'notes', '')) > 500 then
      raise exception 'Notes are at most 500 characters' using errcode = '22023'; end if;
    notes_value := nullif(btrim(coalesce(payload ->> 'notes', '')), '');
  end if;

  -- All material changes lock the same way, one at a time.
  perform pg_advisory_xact_lock(hashtextextended('bomedia:materials', 0));

  if action_value = 'update_size' then
    if payload ->> 'material_id' is null then raise exception 'Choose a size' using errcode = '22023'; end if;
    select * into target from bomedia.materials where id = (payload ->> 'material_id')::uuid for update;
    if not found then raise exception 'Unknown size' using errcode = '22023'; end if;
    if payload ? 'available' and jsonb_typeof(payload -> 'available') is distinct from 'boolean' then
      raise exception 'Choose on or off' using errcode = '22023'; end if;
    update bomedia.materials set
      low_stock_threshold_ft = coalesce(low_value, low_stock_threshold_ft),
      notes = case when payload ? 'notes' then notes_value else notes end,
      available = coalesce((payload ->> 'available')::boolean, available)
    where id = target.id;
    if low_value is not null and low_value is distinct from target.low_stock_threshold_ft then changed := array_append(changed, 'low_stock'::text); end if;
    if payload ? 'notes' and notes_value is distinct from target.notes then changed := array_append(changed, 'notes'::text); end if;
    result := jsonb_build_object('id', target.id, 'changed', to_jsonb(changed));
    if payload ? 'available' and (payload ->> 'available')::boolean is distinct from target.available then
      insert into bomedia.audit_events(actor_id, action, entity_type, entity_id, details)
        values (actor, 'material_size_saved', 'material', target.id, jsonb_build_object(
          'name', target.name || ' ' || trim_scale(target.width_ft)::text || ' ft', 'enabled', (payload ->> 'available')::boolean));
      result := result || jsonb_build_object('availability_changed', true);
    end if;
    if cardinality(changed) > 0 then
      insert into bomedia.audit_events(actor_id, action, entity_type, entity_id, details)
        values (actor, 'material_size_saved', 'material', target.id, jsonb_build_object(
          'name', target.name || ' ' || trim_scale(target.width_ft)::text || ' ft', 'changed', to_jsonb(changed)));
    end if;

  elsif action_value = 'set_price' then
    if price_value is null or payload ->> 'name' is null then raise exception 'A material and a price are required' using errcode = '22023'; end if;
    gkey := bomedia.material_group(payload ->> 'name');
    select array_agg(distinct m.selling_price_per_sqft_kobo), (array_agg(m.name order by m.created_at, m.id))[1]
      into old_prices, display_name from bomedia.materials m where bomedia.material_group(m.name) = gkey;
    if display_name is null then raise exception 'Unknown material' using errcode = '22023'; end if;
    perform 1 from bomedia.materials m where bomedia.material_group(m.name) = gkey for update;
    perform set_config('bomedia.material_price_edit', 'on', true);
    update bomedia.materials set selling_price_per_sqft_kobo = price_value where bomedia.material_group(name) = gkey;
    get diagnostics updated = row_count;
    perform set_config('bomedia.material_price_edit', 'off', true);
    result := jsonb_build_object('price_kobo', price_value::text, 'sizes_updated', updated);
    if not (cardinality(old_prices) = 1 and old_prices[1] = price_value) then
      insert into bomedia.audit_events(actor_id, action, entity_type, details)
        values (actor, 'material_price_changed', 'material', case when cardinality(old_prices) = 1
          then jsonb_build_object('name', display_name, 'from', old_prices[1]::text, 'to', price_value::text)
          else jsonb_build_object('name', display_name, 'to', price_value::text) end);
    end if;

  elsif action_value = 'rename' then
    new_name := btrim(regexp_replace(coalesce(payload ->> 'new_name', ''), '\s+', ' ', 'g'));
    if payload ->> 'name' is null or length(new_name) not between 1 and 100 then
      raise exception 'Enter a name of 1 to 100 characters' using errcode = '22023'; end if;
    gkey := bomedia.material_group(payload ->> 'name'); new_gkey := bomedia.material_group(new_name);
    select (array_agg(m.name order by m.created_at, m.id))[1] into display_name from bomedia.materials m where bomedia.material_group(m.name) = gkey;
    if display_name is null then raise exception 'Unknown material' using errcode = '22023'; end if;
    if new_gkey <> gkey and exists (select 1 from bomedia.materials m where bomedia.material_group(m.name) = new_gkey) then
      raise exception 'A material with that name already exists' using errcode = '22023'; end if;
    perform 1 from bomedia.materials m where bomedia.material_group(m.name) = gkey for update;
    update bomedia.inventory_rolls r set item_name = new_name
      where r.material_id in (select id from bomedia.materials where bomedia.material_group(name) = gkey) and r.item_name = display_name;
    update bomedia.materials set name = new_name where bomedia.material_group(name) = gkey;
    get diagnostics updated = row_count;
    result := jsonb_build_object('name', new_name, 'sizes_updated', updated);
    if new_name is distinct from display_name then
      insert into bomedia.audit_events(actor_id, action, entity_type, details)
        values (actor, 'material_renamed', 'material', jsonb_build_object('from', display_name, 'to', new_name));
    end if;

  elsif action_value = 'add_material' then
    new_name := btrim(regexp_replace(coalesce(payload ->> 'name', ''), '\s+', ' ', 'g'));
    if length(new_name) not between 1 and 100 or price_value is null or width_value is null then
      raise exception 'A name, a price and a width are required' using errcode = '22023'; end if;
    if exists (select 1 from bomedia.materials m where bomedia.material_group(m.name) = bomedia.material_group(new_name)) then
      raise exception 'A material with that name already exists' using errcode = '22023'; end if;
    code_value := bomedia.material_code(null, new_name, width_value);
    if exists (select 1 from bomedia.materials m where bomedia.material_code(m.legacy_material_id, m.name, m.width_ft) = code_value) then
      raise exception 'That material code is already in use' using errcode = '22023'; end if;
    insert into bomedia.materials(legacy_material_id, name, category, width_ft, selling_price_per_sqft_kobo, low_stock_threshold_ft, notes)
      values (code_value, new_name, 'Materials', width_value, price_value, coalesce(low_value, 20), notes_value) returning * into target;
    result := jsonb_build_object('id', target.id, 'code', code_value);
    insert into bomedia.audit_events(actor_id, action, entity_type, entity_id, details)
      values (actor, 'material_added', 'material', target.id, jsonb_build_object('name', new_name, 'to', price_value::text));

  else -- add_size
    if payload ->> 'name' is null or width_value is null then raise exception 'A material and a width are required' using errcode = '22023'; end if;
    gkey := bomedia.material_group(payload ->> 'name');
    select array_agg(distinct m.selling_price_per_sqft_kobo), (array_agg(m.name order by m.created_at, m.id))[1]
      into old_prices, display_name from bomedia.materials m where bomedia.material_group(m.name) = gkey;
    if display_name is null then raise exception 'Unknown material' using errcode = '22023'; end if;
    if cardinality(old_prices) <> 1 then raise exception 'Choose one price for this material first' using errcode = '23514'; end if;
    if exists (select 1 from bomedia.materials m where bomedia.material_group(m.name) = gkey and m.width_ft = width_value) then
      raise exception 'That size already exists' using errcode = '22023'; end if;
    code_value := bomedia.material_code(null, display_name, width_value);
    if exists (select 1 from bomedia.materials m where bomedia.material_code(m.legacy_material_id, m.name, m.width_ft) = code_value) then
      raise exception 'That material code is already in use' using errcode = '22023'; end if;
    insert into bomedia.materials(legacy_material_id, name, category, width_ft, selling_price_per_sqft_kobo, low_stock_threshold_ft, notes)
      values (code_value, display_name, 'Materials', width_value, old_prices[1], coalesce(low_value, 20), notes_value) returning * into target;
    result := jsonb_build_object('id', target.id, 'code', code_value);
    insert into bomedia.audit_events(actor_id, action, entity_type, entity_id, details)
      values (actor, 'material_size_added', 'material', target.id, jsonb_build_object('name', display_name || ' ' || trim_scale(width_value)::text || ' ft'));
  end if;

  insert into bomedia.idempotency_requests(operation, request_key, payload_sha256, actor_id, response)
    values ('api_material_save', request_id, encode(sha256(convert_to(payload::text, 'UTF8')), 'hex'), actor, result);
  return result;
end $$;

-- Same rule as before, plus the new material actions under Settings.
create or replace function bomedia.audit_category(action_value text) returns text
language sql immutable set search_path=pg_catalog as $$
  select case
    when action_value in ('staff_login','staff_logout') then 'signins'
    when action_value like 'staff\_%' then 'staff'
    when action_value in ('sale_recorded','payment_recorded','quote_saved','customer_created')
      or action_value like 'price\_%' or action_value like 'job\_%' then 'sales'
    when action_value like 'expense\_%' then 'expenses'
    when action_value like 'stock\_%' or action_value like 'waste\_%' then 'stock'
    when action_value in ('business_details_saved','payment_method_saved','service_saved','services_reordered','books_closed',
      'material_price_changed','material_renamed','material_added','material_size_added','material_size_saved') then 'settings'
    else 'other' end
$$;

revoke all on function bomedia.material_group(text), bomedia.guard_material_price(), bomedia.guard_material_available(), bomedia.guard_estimate_materials(),
  bomedia.api_materials_admin(), bomedia.api_unavailable_materials(), bomedia.api_material_save(text, jsonb) from public;
grant execute on function bomedia.api_materials_admin(), bomedia.api_unavailable_materials(), bomedia.api_material_save(text, jsonb) to bomedia_financial_runtime;
commit;

begin;

-- Restore a removed cashier. The PIN must be set again so the old one is never reused.
create or replace function bomedia.auth_manage_staff(operation_value text, name_value text, encoded_pin text, admin_identity text) returns uuid
language plpgsql security definer set search_path = pg_catalog, bomedia as $$
declare login_value text; person_id uuid;
begin
  if name_value is null or length(btrim(name_value)) not between 1 and 200 or coalesce(btrim(admin_identity),'')='' then
    raise exception 'Staff name and verified admin identity are required' using errcode='22023'; end if;
  perform singleton from bomedia.access_settings where singleton for update;
  login_value := lower(regexp_replace(btrim(name_value),'\s+',' ','g'));
  if operation_value in ('create','reset','restore') and (encoded_pin is null or encoded_pin !~ '^scrypt\$32768\$8\$3\$[a-f0-9]{32}\$[a-f0-9]{64}$') then
    raise exception 'A valid hashed PIN is required' using errcode='22023'; end if;
  if operation_value='create' then
    insert into bomedia.staff(display_name,login_name,pin_hash) values (btrim(name_value),login_value,encoded_pin) returning id into person_id;
  elsif operation_value in ('reset','disable') then
    select id into person_id from bomedia.staff where login_name=login_value and disabled_at is null for update;
    if not found then raise exception 'Staff account not found' using errcode='22023'; end if;
    update bomedia.staff set credential_revision=credential_revision+1,
      pin_hash=case when operation_value='reset' then encoded_pin else pin_hash end,
      disabled_at=case when operation_value='disable' then clock_timestamp() else disabled_at end,
      last_active_at=null where id=person_id;
    update bomedia.sessions set revoked_at=clock_timestamp() where staff_id=person_id and revoked_at is null;
  elsif operation_value='restore' then
    select id into person_id from bomedia.staff where login_name=login_value and disabled_at is not null for update;
    if not found then raise exception 'Staff account not found' using errcode='22023'; end if;
    update bomedia.staff set credential_revision=credential_revision+1, pin_hash=encoded_pin,
      disabled_at=null, last_active_at=null where id=person_id;
    update bomedia.sessions set revoked_at=clock_timestamp() where staff_id=person_id and revoked_at is null;
  else raise exception 'Invalid staff operation' using errcode='22023'; end if;
  update bomedia.access_settings set staff_revision=staff_revision+1 where singleton;
  insert into bomedia.audit_events(action,entity_type,entity_id,details)
    values ('staff_' || operation_value,'staff',person_id,jsonb_build_object('admin_identity',admin_identity));
  return person_id;
end $$;

-- Admin view: active staff with live device counts, the sign-in rule, and removed staff.
create function bomedia.auth_staff_overview() returns jsonb
language sql security definer set search_path = pg_catalog, bomedia as $$
  select jsonb_build_object(
    'single_session', a.single_session,
    'staff', coalesce((select jsonb_agg(jsonb_build_object('Name',p.display_name,'StaffId',p.id,
      'HasPasscode',p.pin_hash is not null,'RequiresPinReset',p.pin_hash is null,
      'Status',case when p.last_active_at > clock_timestamp()-interval '7 minutes' and live.devices > 0 then 'Online' else 'Offline' end,
      'Devices',case when a.single_session then least(live.devices,1) else live.devices end,
      'Last Login',p.last_login_at,'Last Active',p.last_active_at) order by p.display_name)
      from bomedia.staff p
      cross join lateral (select count(*)::int as devices from bomedia.sessions s
        where s.staff_id=p.id and s.revoked_at is null and s.expires_at > clock_timestamp()
          and s.credential_revision=p.credential_revision and s.policy_revision=a.policy_revision) live
      where p.disabled_at is null),'[]'::jsonb),
    'removed', coalesce((select jsonb_agg(jsonb_build_object('Name',p.display_name,'StaffId',p.id,'RemovedAt',p.disabled_at)
      order by p.disabled_at desc, p.display_name) from bomedia.staff p where p.disabled_at is not null),'[]'::jsonb))
  from bomedia.access_settings a where a.singleton
$$;

-- Sign a cashier out of every device without changing their PIN.
create function bomedia.auth_sign_out_staff(name_value text, admin_identity text) returns integer
language plpgsql security definer set search_path = pg_catalog, bomedia as $$
declare person_id uuid; ended integer;
begin
  if name_value is null or length(btrim(name_value)) not between 1 and 200 or coalesce(btrim(admin_identity),'')='' then
    raise exception 'Staff name and verified admin identity are required' using errcode='22023'; end if;
  select id into person_id from bomedia.staff
    where login_name=lower(regexp_replace(btrim(name_value),'\s+',' ','g')) and disabled_at is null for update;
  if not found then raise exception 'Staff account not found' using errcode='22023'; end if;
  update bomedia.sessions set revoked_at=clock_timestamp() where staff_id=person_id and revoked_at is null;
  get diagnostics ended = row_count;
  update bomedia.staff set last_active_at=null where id=person_id;
  insert into bomedia.audit_events(action,entity_type,entity_id,details)
    values ('staff_sign_out','staff',person_id,jsonb_build_object('admin_identity',admin_identity,'sessions',ended));
  return ended;
end $$;

-- One-device rule. Reads already honour the setting live, so no one is signed out by the switch itself
-- beyond older devices of cashiers who have several.
create function bomedia.auth_set_single_session(enabled_value boolean, admin_identity text) returns boolean
language plpgsql security definer set search_path = pg_catalog, bomedia as $$
declare previous boolean;
begin
  if enabled_value is null or coalesce(btrim(admin_identity),'')='' then
    raise exception 'A value and verified admin identity are required' using errcode='22023'; end if;
  select single_session into previous from bomedia.access_settings where singleton for update;
  if previous is distinct from enabled_value then
    update bomedia.access_settings set single_session=enabled_value where singleton;
    if enabled_value then
      update bomedia.sessions s set revoked_at=clock_timestamp()
        where s.revoked_at is null and s.id <> coalesce((select n.id from bomedia.sessions n
          where n.staff_id=s.staff_id and n.revoked_at is null and n.expires_at > clock_timestamp()
          order by n.created_at desc, n.id desc limit 1), gen_random_uuid());
    end if;
    insert into bomedia.audit_events(action,entity_type,details)
      values ('staff_single_session','access_settings',jsonb_build_object('admin_identity',admin_identity,'enabled',enabled_value));
  end if;
  return enabled_value;
end $$;

revoke all on function bomedia.auth_staff_overview(), bomedia.auth_sign_out_staff(text,text), bomedia.auth_set_single_session(boolean,text) from public;
grant execute on function bomedia.auth_staff_overview(), bomedia.auth_sign_out_staff(text,text), bomedia.auth_set_single_session(boolean,text) to bomedia_auth_runtime;
commit;

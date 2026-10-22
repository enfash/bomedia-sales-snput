-- Owner can hide a person from the Staff Manager lists. Hiding is not removing: the person can still sign in.
begin;

alter table bomedia.staff add column hidden_from_lists boolean not null default false;

-- Same overview as before, plus each active person's Hidden flag.
create or replace function bomedia.auth_staff_overview() returns jsonb
language sql security definer set search_path = pg_catalog, bomedia as $$
  select jsonb_build_object(
    'single_session', a.single_session,
    'staff', coalesce((select jsonb_agg(jsonb_build_object('Name',p.display_name,'StaffId',p.id,
      'HasPasscode',p.pin_hash is not null,'RequiresPinReset',p.pin_hash is null,
      'Status',case when p.last_active_at > clock_timestamp()-interval '7 minutes' and live.devices > 0 then 'Online' else 'Offline' end,
      'Devices',case when a.single_session then least(live.devices,1) else live.devices end,
      'Hidden',p.hidden_from_lists,
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

-- Hide or show one active person. Only a real change is audited. Their PIN, sessions and access are untouched.
create function bomedia.auth_set_staff_hidden(name_value text, hidden_value boolean, admin_identity text) returns boolean
language plpgsql security definer set search_path = pg_catalog, bomedia as $$
declare person_id uuid; shown_name text; previous boolean;
begin
  if name_value is null or length(btrim(name_value)) not between 1 and 200 or hidden_value is null or coalesce(btrim(admin_identity),'')='' then
    raise exception 'A staff name, a value and verified admin identity are required' using errcode='22023'; end if;
  select id, display_name, hidden_from_lists into person_id, shown_name, previous from bomedia.staff
    where login_name=lower(regexp_replace(btrim(name_value),'\s+',' ','g')) and disabled_at is null for update;
  if not found then raise exception 'Staff account not found' using errcode='22023'; end if;
  if previous is distinct from hidden_value then
    update bomedia.staff set hidden_from_lists=hidden_value where id=person_id;
    insert into bomedia.audit_events(action,entity_type,entity_id,details)
      values (case when hidden_value then 'staff_hidden' else 'staff_unhidden' end,'staff',person_id,
        jsonb_build_object('admin_identity',admin_identity,'name',shown_name));
  end if;
  return hidden_value;
end $$;

revoke all on function bomedia.auth_set_staff_hidden(text,boolean,text) from public;
grant execute on function bomedia.auth_set_staff_hidden(text,boolean,text) to bomedia_auth_runtime;
commit;

begin;

-- Narrow server-only capability role. No browser role or direct table access.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'bomedia_auth_runtime') then
    create role bomedia_auth_runtime nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
  end if;
end $$;
create table bomedia.auth_login_tickets (
  ticket_hash text primary key check (ticket_hash ~ '^[a-f0-9]{64}$'),
  attempt_key text not null references bomedia.login_attempts(key_hash),
  staff_id uuid references bomedia.staff(id),
  credential_revision bigint,
  expires_at timestamptz not null
);
alter table bomedia.auth_login_tickets enable row level security;

create function bomedia.auth_reserve_login(login_value text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, bomedia as $$
declare login_key text; attempt bomedia.login_attempts%rowtype; person bomedia.staff%rowtype;
  ticket text; moment timestamptz := clock_timestamp();
begin
  if login_value is null or length(login_value) not between 1 and 200 then return jsonb_build_object('status','invalid'); end if;
  login_value := lower(regexp_replace(btrim(login_value), '\s+', ' ', 'g'));
  select * into person from bomedia.staff where login_name=login_value and disabled_at is null;
  -- Unknown names share a bucket so arbitrary input cannot grow this table.
  login_key := encode(sha256(convert_to(case when person.id is null then 'staff:unknown' else 'staff:' || login_value end,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended('login:' || login_key,0));
  insert into bomedia.login_attempts(key_hash,window_started_at) values (login_key,moment) on conflict do nothing;
  select * into attempt from bomedia.login_attempts where key_hash=login_key for update;
  if attempt.window_started_at <= moment - interval '15 minutes' then
    update bomedia.login_attempts set attempts=0,window_started_at=moment,blocked_until=null where key_hash=login_key;
    attempt.attempts := 0; attempt.blocked_until := null;
  end if;
  if attempt.attempts >= 5 then return jsonb_build_object('status','limited'); end if;
  update bomedia.login_attempts set attempts=attempts+1,
    blocked_until=case when attempts+1 >= 5 then window_started_at+interval '15 minutes' else null end where key_hash=login_key;
  delete from bomedia.auth_login_tickets where attempt_key=login_key and expires_at <= moment;
  ticket := gen_random_uuid()::text;
  insert into bomedia.auth_login_tickets(ticket_hash,attempt_key,staff_id,credential_revision,expires_at)
    values (encode(sha256(convert_to(ticket,'UTF8')),'hex'),login_key,person.id,person.credential_revision,moment+interval '2 minutes');
  -- This result is only for the trusted server; never return it to the browser.
  return jsonb_build_object('status','ready','ticket',ticket,'pin_hash',person.pin_hash);
end $$;

create function bomedia.auth_claim_session(ticket_value text, verified_hash text, token_hash_value text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, bomedia as $$
declare ticket bomedia.auth_login_tickets%rowtype; person bomedia.staff%rowtype;
  policy bomedia.access_settings%rowtype; session_id uuid; moment timestamptz := clock_timestamp();
begin
  if token_hash_value is null or token_hash_value !~ '^[a-f0-9]{64}$' then raise exception 'Invalid token hash' using errcode='22023'; end if;
  select * into policy from bomedia.access_settings where singleton for share;
  delete from bomedia.auth_login_tickets where ticket_hash=encode(sha256(convert_to(ticket_value,'UTF8')),'hex') returning * into ticket;
  if not found or ticket.expires_at <= moment or ticket.staff_id is null then return jsonb_build_object('status','invalid'); end if;
  select * into person from bomedia.staff where id=ticket.staff_id for update;
  if not found or person.disabled_at is not null or person.pin_hash is null or verified_hash is distinct from person.pin_hash
    or person.credential_revision is distinct from ticket.credential_revision then return jsonb_build_object('status','invalid'); end if;
  if policy.phone_scope='all' or (policy.phone_scope='selected' and exists (select 1 from bomedia.phone_required_staff where staff_id=person.id)) then
    return jsonb_build_object('status','device_required');
  end if;
  if policy.single_session then update bomedia.sessions set revoked_at=moment where staff_id=person.id and revoked_at is null; end if;
  insert into bomedia.sessions(staff_id,token_hash,credential_revision,policy_revision,created_at,expires_at)
    values (person.id,token_hash_value,person.credential_revision,policy.policy_revision,moment,moment+interval '7 days') returning id into session_id;
  update bomedia.staff set last_login_at=moment,last_active_at=moment where id=person.id;
  -- Do not reset the reserved-attempt counter: concurrent correct/incorrect
  -- attempts must not create an unlimited verification window.
  insert into bomedia.audit_events(actor_id,action,entity_type,entity_id) values (person.id,'staff_login','session',session_id);
  return jsonb_build_object('status','ok','staff_id',person.id,'name',person.display_name,'session_id',session_id);
end $$;

create function bomedia.auth_read_session(token_hash_value text) returns jsonb
language sql security definer set search_path = pg_catalog, bomedia as $$
  select jsonb_build_object('staff_id',p.id,'name',p.display_name,'session_id',s.id)
  from bomedia.sessions s join bomedia.staff p on p.id=s.staff_id cross join bomedia.access_settings a
  where a.singleton and s.token_hash=token_hash_value and s.revoked_at is null and s.expires_at > clock_timestamp()
    and p.disabled_at is null and p.pin_hash is not null and s.credential_revision=p.credential_revision
    and s.policy_revision=a.policy_revision and a.phone_scope <> 'all'
    and not (a.phone_scope='selected' and exists (select 1 from bomedia.phone_required_staff where staff_id=p.id))
    and (not a.single_session or s.id=(select newest.id from bomedia.sessions newest where newest.staff_id=p.id
      and newest.revoked_at is null and newest.expires_at > clock_timestamp() order by newest.created_at desc,newest.id desc limit 1))
$$;

create function bomedia.auth_revoke_session(token_hash_value text) returns void
language plpgsql security definer set search_path = pg_catalog, bomedia as $$
declare ended bomedia.sessions%rowtype;
begin
  update bomedia.sessions set revoked_at=clock_timestamp() where token_hash=token_hash_value and revoked_at is null returning * into ended;
  if found then insert into bomedia.audit_events(actor_id,action,entity_type,entity_id)
    values (ended.staff_id,'staff_logout','session',ended.id); end if;
end $$;

create function bomedia.auth_presence(token_hash_value text, online_value boolean) returns boolean
language plpgsql security definer set search_path = pg_catalog, bomedia as $$
declare identity_value jsonb;
begin
  identity_value := bomedia.auth_read_session(token_hash_value);
  if identity_value is null then return false; end if;
  -- Browser unload is presence only, not logout/session revocation.
  update bomedia.staff set last_active_at=case when online_value then clock_timestamp() else null end
    where id=(identity_value->>'staff_id')::uuid;
  return true;
end $$;

create function bomedia.auth_list_staff() returns jsonb
language sql security definer set search_path = pg_catalog, bomedia as $$
  select coalesce(jsonb_agg(jsonb_build_object('Name',p.display_name,'HasPasscode',p.pin_hash is not null,
    'RequiresPinReset',p.pin_hash is null,'StaffId',p.id,
    'Status',case when p.last_active_at > clock_timestamp()-interval '7 minutes'
      and exists (select 1 from bomedia.sessions s where s.staff_id=p.id and s.revoked_at is null and s.expires_at > clock_timestamp())
      then 'Online' else 'Offline' end,
    'Last Login',p.last_login_at,'Last Active',p.last_active_at) order by p.display_name),'[]'::jsonb)
  from bomedia.staff p where p.disabled_at is null
$$;

-- Trusted server must enforce the configured admin session before invoking.
create function bomedia.auth_manage_staff(operation_value text, name_value text, encoded_pin text, admin_identity text) returns uuid
language plpgsql security definer set search_path = pg_catalog, bomedia as $$
declare login_value text; person_id uuid;
begin
  if name_value is null or length(btrim(name_value)) not between 1 and 200 or coalesce(btrim(admin_identity),'')='' then
    raise exception 'Staff name and verified admin identity are required' using errcode='22023'; end if;
  perform singleton from bomedia.access_settings where singleton for update;
  login_value := lower(regexp_replace(btrim(name_value),'\s+',' ','g'));
  if operation_value in ('create','reset') and (encoded_pin is null or encoded_pin !~ '^scrypt\$32768\$8\$3\$[a-f0-9]{32}\$[a-f0-9]{64}$') then
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
  else raise exception 'Invalid staff operation' using errcode='22023'; end if;
  update bomedia.access_settings set staff_revision=staff_revision+1 where singleton;
  insert into bomedia.audit_events(action,entity_type,entity_id,details)
    values ('staff_' || operation_value,'staff',person_id,jsonb_build_object('admin_identity',admin_identity));
  return person_id;
end $$;

revoke all on bomedia.auth_login_tickets from public;
revoke all on all functions in schema bomedia from public;
grant usage on schema bomedia to bomedia_auth_runtime;
grant execute on function bomedia.auth_reserve_login(text), bomedia.auth_claim_session(text,text,text),
  bomedia.auth_read_session(text), bomedia.auth_revoke_session(text), bomedia.auth_presence(text,boolean),
  bomedia.auth_list_staff(), bomedia.auth_manage_staff(text,text,text,text) to bomedia_auth_runtime;
-- Capability grants do not include tables, accounting writes or generic journal functions.
commit;

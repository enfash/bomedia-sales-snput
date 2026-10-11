-- Staff audit entries now record which cashier the action was about (display name only, never a PIN or hash).
begin;

create or replace function bomedia.auth_manage_staff(operation_value text, name_value text, encoded_pin text, admin_identity text) returns uuid
language plpgsql security definer set search_path = pg_catalog, bomedia as $$
declare login_value text; person_id uuid; shown_name text;
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
  select display_name into shown_name from bomedia.staff where id=person_id;
  update bomedia.access_settings set staff_revision=staff_revision+1 where singleton;
  insert into bomedia.audit_events(action,entity_type,entity_id,details)
    values ('staff_' || operation_value,'staff',person_id,jsonb_build_object('admin_identity',admin_identity,'name',shown_name));
  return person_id;
end $$;

create or replace function bomedia.auth_sign_out_staff(name_value text, admin_identity text) returns integer
language plpgsql security definer set search_path = pg_catalog, bomedia as $$
declare person_id uuid; shown_name text; ended integer;
begin
  if name_value is null or length(btrim(name_value)) not between 1 and 200 or coalesce(btrim(admin_identity),'')='' then
    raise exception 'Staff name and verified admin identity are required' using errcode='22023'; end if;
  select id, display_name into person_id, shown_name from bomedia.staff
    where login_name=lower(regexp_replace(btrim(name_value),'\s+',' ','g')) and disabled_at is null for update;
  if not found then raise exception 'Staff account not found' using errcode='22023'; end if;
  update bomedia.sessions set revoked_at=clock_timestamp() where staff_id=person_id and revoked_at is null;
  get diagnostics ended = row_count;
  update bomedia.staff set last_active_at=null where id=person_id;
  insert into bomedia.audit_events(action,entity_type,entity_id,details)
    values ('staff_sign_out','staff',person_id,jsonb_build_object('admin_identity',admin_identity,'sessions',ended,'name',shown_name));
  return ended;
end $$;

commit;

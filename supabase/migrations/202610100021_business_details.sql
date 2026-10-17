-- Owner-editable business details printed on invoices and receipts.
-- One row, seeded with the values that were hard-coded in lib/constants.ts so
-- printed output is unchanged until the owner edits them. Earlier migrations are untouched.
begin;

create table bomedia.business_details (
  singleton boolean primary key default true check (singleton),
  account_name text not null check (length(btrim(account_name)) between 1 and 120),
  account_number text not null check (account_number ~ '^[0-9]{10}$'),
  bank text not null check (length(btrim(bank)) between 1 and 80),
  phone text not null check (phone ~ '^\+?[0-9][0-9 ()-]*$'
    and length(regexp_replace(phone, '[^0-9]', '', 'g')) between 7 and 15 and length(phone) <= 30),
  email text not null check (length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  address text not null check (length(btrim(address)) between 1 and 300),
  updated_by uuid references bomedia.staff(id),
  updated_at timestamptz not null default now()
);
alter table bomedia.business_details enable row level security;
revoke all on bomedia.business_details from public;

create function bomedia.guard_business_details() returns trigger
language plpgsql set search_path = pg_catalog, bomedia as $$
begin
  raise exception 'Business details cannot be deleted' using errcode = '23514';
end $$;
create trigger guard_business_details before delete on bomedia.business_details
  for each row execute function bomedia.guard_business_details();

insert into bomedia.business_details(account_name, account_number, bank, phone, email, address)
values ('Broad Options Media / Fasugba Elijah Niyi', '5236650819', 'Moniepoint MFB', '+234 802 224 7567',
  'info@bomedia.com.ng', '65, New Ipaja Road, Alaguntan BRT Bus Stop, Alimosho, Lagos.');

-- Read: everything the receipt needs, plus the dialable phone form (derived, never stored).
create function bomedia.api_business_details() returns jsonb
language sql security definer set search_path = pg_catalog, bomedia as $$
  select jsonb_build_object('account_name', b.account_name, 'account_number', b.account_number, 'bank', b.bank,
    'phone', b.phone, 'phone_dial', case when left(b.phone, 1) = '+' then '+' else '' end || regexp_replace(b.phone, '[^0-9]', '', 'g'),
    'email', b.email, 'address', b.address, 'updated_at', b.updated_at, 'updated_by', s.display_name)
  from bomedia.business_details b left join bomedia.staff s on s.id = b.updated_by
  where b.singleton
$$;

-- Save: replaces all six fields. The route checks the caller is the owner; this checks
-- the actor is an enabled staff member, validates through the table constraints, and
-- records which fields changed (names only) in the audit trail.
create function bomedia.api_business_details_save(request_id text, payload jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, bomedia as $$
declare previous jsonb; result jsonb; actor uuid; old_row bomedia.business_details%rowtype; new_row bomedia.business_details%rowtype;
  changed text[] := '{}';
begin
  if jsonb_typeof(payload) is distinct from 'object' then raise exception 'Business details are required' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_object_keys(payload) k
      where k not in ('actor_id', 'account_name', 'account_number', 'bank', 'phone', 'email', 'address')) then
    raise exception 'Unexpected business details field' using errcode = '22023'; end if;
  if exists (select 1 from unnest(array['account_name', 'account_number', 'bank', 'phone', 'email', 'address']) f
      where jsonb_typeof(payload -> f) is distinct from 'string') then
    raise exception 'Every business detail is required' using errcode = '22023'; end if;
  actor := (payload->>'actor_id')::uuid;
  if not exists (select 1 from bomedia.staff where id = actor and disabled_at is null) then
    raise exception 'An enabled staff member is required' using errcode = '42501'; end if;
  previous := bomedia.prior_result('api_business_details_save', request_id, payload);
  if previous is not null then return previous; end if;

  select * into old_row from bomedia.business_details where singleton for update;
  update bomedia.business_details set account_name = btrim(payload->>'account_name'), account_number = btrim(payload->>'account_number'),
    bank = btrim(payload->>'bank'), phone = btrim(payload->>'phone'), email = btrim(payload->>'email'), address = btrim(payload->>'address'),
    updated_by = actor, updated_at = now()
  where singleton returning * into new_row;

  if old_row.account_name is distinct from new_row.account_name then changed := array_append(changed, 'account_name'::text); end if;
  if old_row.account_number is distinct from new_row.account_number then changed := array_append(changed, 'account_number'::text); end if;
  if old_row.bank is distinct from new_row.bank then changed := array_append(changed, 'bank'::text); end if;
  if old_row.phone is distinct from new_row.phone then changed := array_append(changed, 'phone'::text); end if;
  if old_row.email is distinct from new_row.email then changed := array_append(changed, 'email'::text); end if;
  if old_row.address is distinct from new_row.address then changed := array_append(changed, 'address'::text); end if;

  result := jsonb_build_object('changed', to_jsonb(changed));
  insert into bomedia.idempotency_requests(operation, request_key, payload_sha256, actor_id, response)
    values ('api_business_details_save', request_id, encode(sha256(convert_to(payload::text, 'UTF8')), 'hex'), actor, result);
  if cardinality(changed) > 0 then
    insert into bomedia.audit_events(actor_id, action, entity_type, details)
      values (actor, 'business_details_saved', 'business_details', jsonb_build_object('changed', to_jsonb(changed)));
  end if;
  return result;
end $$;

revoke all on function bomedia.api_business_details(), bomedia.api_business_details_save(text, jsonb), bomedia.guard_business_details() from public;
grant execute on function bomedia.api_business_details(), bomedia.api_business_details_save(text, jsonb) to bomedia_financial_runtime;
commit;

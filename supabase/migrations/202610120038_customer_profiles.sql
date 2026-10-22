-- Customer profiles (owner request, 12 Oct): every customer gets a readable ID (CUS-0001, like BOM-, PAY- and EXP-),
-- the list and a profile come from the database, and staff can correct a customer's phone and notes while every
-- change is kept on the profile (and in the audit log). Only the owner can rename a customer. Local only.
begin;

create sequence bomedia.customer_reference_seq;
alter table bomedia.customers add column reference text unique;
update bomedia.customers c set reference = 'CUS-' || lpad(r.n::text, 4, '0')
  from (select id, nextval('bomedia.customer_reference_seq') as n from (select id from bomedia.customers order by created_at, id) x) r
  where r.id = c.id;
create function bomedia.set_customer_reference() returns trigger
language plpgsql set search_path = pg_catalog, bomedia as $$
begin
  if new.reference is null then new.reference := 'CUS-' || lpad(nextval('bomedia.customer_reference_seq')::text, 4, '0'); end if;
  return new;
end $$;
create trigger customers_reference before insert on bomedia.customers for each row execute function bomedia.set_customer_reference();
alter table bomedia.customers alter column reference set not null;

create table bomedia.customer_changes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references bomedia.customers(id),
  changed_by uuid not null references bomedia.staff(id),
  changes jsonb not null check (jsonb_typeof(changes) = 'object' and changes <> '{}'::jsonb),
  created_at timestamptz not null default now()
);
create index customer_changes_customer on bomedia.customer_changes(customer_id, created_at desc);
alter table bomedia.customer_changes enable row level security;

-- One row per customer with what they have bought, paid and still owe (the same sums the Records feed uses).
create function bomedia.customer_rows(only_id uuid) returns jsonb
language sql stable security definer set search_path = pg_catalog, bomedia as $$
  with adj as (select job_id, sum(amount_kobo) as kobo from bomedia.job_adjustments group by job_id),
  jt as (select j.customer_id, count(distinct j.order_id) as orders, sum(j.amount_kobo + coalesce(adj.kobo, 0)) as total, max(j.business_date) as last_date
    from bomedia.jobs j left join adj on adj.job_id = j.id group by j.customer_id),
  pt as (select customer_id, sum(amount_kobo) as paid from bomedia.payment_allocations group by customer_id)
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'reference', c.reference, 'name', c.display_name, 'contact', coalesce(c.contact, ''), 'notes', coalesce(c.notes, ''),
    'orders', coalesce(jt.orders, 0), 'total_kobo', coalesce(jt.total, 0)::text, 'paid_kobo', coalesce(pt.paid, 0)::text,
    'owed_kobo', greatest(0, coalesce(jt.total, 0) - coalesce(pt.paid, 0))::text, 'last_order_date', jt.last_date, 'created_at', c.created_at)
    order by lower(c.display_name), c.id), '[]'::jsonb)
  from bomedia.customers c left join jt on jt.customer_id = c.id left join pt on pt.customer_id = c.id
  where only_id is null or c.id = only_id
$$;

create function bomedia.api_customers() returns jsonb
language sql stable security definer set search_path = pg_catalog, bomedia as $$
  select jsonb_build_object('data', bomedia.customer_rows(null))
$$;

create function bomedia.api_customer_profile(customer_value text) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, bomedia as $$
declare cid uuid; rows jsonb; sales jsonb; payments jsonb; changes jsonb;
begin
  if coalesce(customer_value, '') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'Customer not found' using errcode = 'P0002'; end if;
  cid := customer_value::uuid;
  rows := bomedia.customer_rows(cid);
  if jsonb_array_length(rows) = 0 then raise exception 'Customer not found' using errcode = 'P0002'; end if;

  with adj as (select job_id, sum(amount_kobo) as kobo from bomedia.job_adjustments group by job_id),
  al as (select job_id, sum(amount_kobo) as paid from bomedia.payment_allocations group by job_id),
  per as (
    select coalesce(o.legacy_sales_id, o.reference) as sales_id, o.id as order_id, min(j.business_date) as business_date, count(*) as jobs,
      sum(j.amount_kobo + coalesce(adj.kobo, 0)) as total, coalesce(sum(al.paid), 0) as paid,
      string_agg(j.description, ', ' order by j.created_at) as what
    from bomedia.jobs j join bomedia.orders o on o.id = j.order_id left join adj on adj.job_id = j.id left join al on al.job_id = j.id
    where j.customer_id = cid group by o.id, o.legacy_sales_id, o.reference)
  select coalesce(jsonb_agg(jsonb_build_object('sales_id', sales_id, 'date', business_date, 'jobs', jobs, 'what', what,
    'total_kobo', total::text, 'paid_kobo', paid::text, 'owed_kobo', greatest(0, total - paid)::text) order by business_date desc nulls last, order_id), '[]')
  into sales from (select * from per order by business_date desc nulls last, order_id limit 100) x;

  select coalesce(jsonb_agg(jsonb_build_object('reference', coalesce(p.legacy_payment_id, p.reference), 'date', p.business_date,
    'amount_kobo', p.amount_kobo::text, 'method', coalesce(p.method, ''), 'by', coalesce(s.display_name, p.collected_by_snapshot, ''))
    order by p.business_date desc nulls last, p.created_at desc), '[]')
  into payments from (select * from bomedia.payments where customer_id = cid order by business_date desc nulls last, created_at desc limit 100) p
    left join bomedia.staff s on s.id = p.collected_by;

  select coalesce(jsonb_agg(jsonb_build_object('at', h.created_at, 'by', coalesce(s.display_name, 'Staff'), 'changes', h.changes) order by h.created_at desc), '[]')
  into changes from (select * from bomedia.customer_changes where customer_id = cid order by created_at desc limit 50) h left join bomedia.staff s on s.id = h.changed_by;

  return jsonb_build_object('customer', rows -> 0, 'sales', sales, 'payments', payments, 'changes', changes);
end $$;

-- Staff may correct phone and notes; only the owner (by_owner, set by the server) may rename. Every real change is kept.
create function bomedia.api_customer_save(request_id text, payload jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, bomedia as $$
declare previous jsonb; result jsonb; actor uuid; cid uuid; current_row bomedia.customers%rowtype; by_owner boolean; diff jsonb := '{}'::jsonb;
  new_name text; new_contact text; new_notes text; fields text[] := '{}';
begin
  if jsonb_typeof(payload) is distinct from 'object' then raise exception 'A customer change is required' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_object_keys(payload) k where k not in ('actor_id', 'customer_id', 'name', 'contact', 'notes', 'by_owner')) then
    raise exception 'Unexpected customer field' using errcode = '22023'; end if;
  actor := (payload ->> 'actor_id')::uuid;
  if not exists (select 1 from bomedia.staff where id = actor and disabled_at is null) then
    raise exception 'An enabled staff member is required' using errcode = '42501'; end if;
  previous := bomedia.prior_result('api_customer_save', request_id, payload);
  if previous is not null then return previous; end if;
  by_owner := coalesce(payload -> 'by_owner' = 'true'::jsonb, false);
  if coalesce(payload ->> 'customer_id', '') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'Customer not found' using errcode = 'P0002'; end if;
  cid := (payload ->> 'customer_id')::uuid;
  select * into current_row from bomedia.customers where id = cid for update;
  if not found then raise exception 'Customer not found' using errcode = 'P0002'; end if;

  if payload ? 'name' then
    new_name := btrim(coalesce(payload ->> 'name', ''));
    if new_name = '' or length(new_name) > 200 then raise exception 'Enter a name up to 200 characters' using errcode = '22023'; end if;
    if new_name <> current_row.display_name then
      if not by_owner then raise exception 'Only the owner can change a customer’s name' using errcode = '22023'; end if;
      diff := diff || jsonb_build_object('name', jsonb_build_object('from', current_row.display_name, 'to', new_name));
    end if;
  end if;
  if payload ? 'contact' then
    new_contact := nullif(btrim(coalesce(payload ->> 'contact', '')), '');
    if length(coalesce(new_contact, '')) > 100 then raise exception 'The phone number is too long' using errcode = '22023'; end if;
    if new_contact is distinct from current_row.contact then
      diff := diff || jsonb_build_object('contact', jsonb_build_object('from', current_row.contact, 'to', new_contact)); end if;
  end if;
  if payload ? 'notes' then
    new_notes := nullif(btrim(coalesce(payload ->> 'notes', '')), '');
    if length(coalesce(new_notes, '')) > 2000 then raise exception 'Keep notes under 2000 characters' using errcode = '22023'; end if;
    if new_notes is distinct from current_row.notes then
      diff := diff || jsonb_build_object('notes', jsonb_build_object('from', current_row.notes, 'to', new_notes)); end if;
  end if;

  if diff = '{}'::jsonb then
    result := jsonb_build_object('changed', false, 'customer', bomedia.customer_rows(cid) -> 0);
  else
    update bomedia.customers set display_name = coalesce(new_name, display_name),
      contact = case when diff ? 'contact' then new_contact else contact end,
      notes = case when diff ? 'notes' then new_notes else notes end where id = cid;
    insert into bomedia.customer_changes(customer_id, changed_by, changes) values (cid, actor, diff);
    select array_agg(k order by k) into fields from jsonb_object_keys(diff) k;
    insert into bomedia.audit_events(actor_id, action, entity_type, entity_id, details)
      values (actor, 'customer_updated', 'customer', cid, jsonb_build_object('customer', current_row.reference, 'name', coalesce(new_name, current_row.display_name), 'fields', to_jsonb(fields)));
    result := jsonb_build_object('changed', true, 'customer', bomedia.customer_rows(cid) -> 0);
  end if;
  insert into bomedia.idempotency_requests(operation, request_key, payload_sha256, actor_id, response)
    values ('api_customer_save', request_id, encode(sha256(convert_to(payload::text, 'UTF8')), 'hex'), actor, result);
  return result;
end $$;

create or replace function bomedia.audit_category(action_value text) returns text
language sql immutable set search_path = pg_catalog as $$
  select case
    when action_value in ('staff_login','staff_logout') then 'signins'
    when action_value like 'staff\_%' then 'staff'
    when action_value like 'approval\_%' then 'approvals'
    when action_value in ('sale_recorded','payment_recorded','quote_saved','customer_created','customer_updated')
      or action_value like 'price\_%' or action_value like 'job\_%' then 'sales'
    when action_value like 'expense\_%' then 'expenses'
    when action_value like 'stock\_%' or action_value like 'waste\_%' then 'stock'
    when action_value in ('business_details_saved','payment_method_saved','service_saved','services_reordered','books_closed',
      'material_price_changed','material_renamed','material_added','material_size_added','material_size_saved') then 'settings'
    else 'other' end
$$;

revoke all on function bomedia.set_customer_reference(), bomedia.customer_rows(uuid), bomedia.api_customers(), bomedia.api_customer_profile(text),
  bomedia.api_customer_save(text, jsonb) from public;
grant execute on function bomedia.api_customers(), bomedia.api_customer_profile(text), bomedia.api_customer_save(text, jsonb) to bomedia_financial_runtime;
commit;

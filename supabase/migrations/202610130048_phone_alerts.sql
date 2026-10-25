-- Phone alerts (Stage 4). The database records what should be told to whom the moment it happens (`notification_outbox`); the app server
-- sends it to the phones that have been turned on (`push_subscriptions`) and reports back. Nothing here sends anything itself, and an alert
-- never carries money: only who, what and where to open.
-- Audience: 'owner' (the server knows the owner's staff id) or 'staff' (a named recipient). The person who caused an alert is never told about it.
begin;

create table bomedia.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references bomedia.staff(id),
  endpoint text not null unique check (length(endpoint) between 20 and 2000),
  p256dh text not null check (length(p256dh) between 20 and 200),
  auth text not null check (length(auth) between 8 and 100),
  label text not null default 'Phone' check (length(label) <= 100),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  last_error text
);
create index push_subscriptions_staff on bomedia.push_subscriptions(staff_id);
alter table bomedia.push_subscriptions enable row level security;

create table bomedia.notification_preferences (
  staff_id uuid not null references bomedia.staff(id),
  kind text not null check (kind in ('approval_waiting', 'approval_decided', 'customer_changed', 'stock_low')),
  enabled boolean not null,
  primary key (staff_id, kind)
);
alter table bomedia.notification_preferences enable row level security;

create table bomedia.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('approval_waiting', 'approval_decided', 'customer_changed', 'stock_low')),
  audience text not null check (audience in ('owner', 'staff')),
  recipient_staff_id uuid references bomedia.staff(id),
  actor_staff_id uuid references bomedia.staff(id),
  title text not null check (length(title) <= 120),
  body text not null check (length(body) <= 240),
  url text not null check (url like '/%'),
  attempts integer not null default 0,
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  check ((audience = 'staff') = (recipient_staff_id is not null))
);
create index notification_outbox_pending on bomedia.notification_outbox(created_at) where sent_at is null;
alter table bomedia.notification_outbox enable row level security;

-- What a request is, in a few words without money: "Zed Events (sale)", "Ink Depot (expense change)".
create function bomedia.alert_phrase(req bomedia.approval_requests) returns text
language sql immutable set search_path = pg_catalog, bomedia as $$
  select left(case req.operation
    when 'screen_order' then coalesce(nullif(req.summary ->> 'client', ''), 'A sale') || ' (sale)'
    when 'screen_expense' then coalesce(nullif(req.summary -> 'items' -> 0 ->> 'paid_to', ''), nullif(req.summary -> 'items' -> 0 ->> 'category', ''), 'An expense') || ' (expense)'
    when 'sale_correction' then coalesce(nullif(req.summary ->> 'client', ''), 'A sale') || case when 'cancellation' = any (req.kinds) then ' (sale cancellation)' else ' (sale change)' end
    when 'expense_correction' then coalesce(nullif(req.summary ->> 'paid_to', ''), nullif(req.summary ->> 'category', ''), 'An expense') || case when 'cancellation' = any (req.kinds) then ' (expense cancellation)' else ' (expense change)' end
    else 'A request' end, 120)
$$;

create function bomedia.alert_on_approval() returns trigger
language plpgsql security definer set search_path = pg_catalog, bomedia as $$
declare who text;
begin
  if tg_op = 'INSERT' then
    if new.status = 'pending' then
      select display_name into who from bomedia.staff where id = new.requested_by;
      insert into bomedia.notification_outbox(kind, audience, actor_staff_id, title, body, url)
        values ('approval_waiting', 'owner', new.requested_by, 'Needs your approval', coalesce(who, 'A cashier') || ': ' || bomedia.alert_phrase(new), '/bom03/approvals');
    end if;
  elsif old.status = 'pending' and new.status in ('approved', 'declined') then
    insert into bomedia.notification_outbox(kind, audience, recipient_staff_id, actor_staff_id, title, body, url)
      values ('approval_decided', 'staff', new.requested_by, new.decided_by, case when new.status = 'approved' then 'Approved' else 'Declined' end,
        bomedia.alert_phrase(new) || case when new.status = 'approved' then ' was approved' else ' was declined' end, '/cashier');
  end if;
  return new;
end $$;
create trigger alert_on_approval_insert after insert on bomedia.approval_requests for each row execute function bomedia.alert_on_approval();
create trigger alert_on_approval_update after update of status on bomedia.approval_requests for each row execute function bomedia.alert_on_approval();

create function bomedia.alert_on_customer_change() returns trigger
language plpgsql security definer set search_path = pg_catalog, bomedia as $$
declare who text; cu bomedia.customers%rowtype; names text;
begin
  select display_name into who from bomedia.staff where id = new.changed_by;
  select * into cu from bomedia.customers where id = new.customer_id;
  select string_agg(case k when 'contact' then 'phone number' when 'notes' then 'notes' when 'name' then 'name' else 'details' end, ' and ' order by k)
    into names from jsonb_object_keys(new.changes) k;
  insert into bomedia.notification_outbox(kind, audience, actor_staff_id, title, body, url)
    values ('customer_changed', 'owner', new.changed_by, 'Customer details changed', left(coalesce(who, 'Staff') || ' changed the ' || coalesce(names, 'details') || ' of ' || cu.display_name, 240),
      '/bom03/customers?open=' || coalesce(cu.reference, ''));
  return new;
end $$;
create trigger alert_on_customer_change after insert on bomedia.customer_changes for each row execute function bomedia.alert_on_customer_change();

create function bomedia.alert_on_roll_status() returns trigger
language plpgsql security definer set search_path = pg_catalog, bomedia as $$
begin
  if new.status is distinct from old.status and new.status in ('Low Stock', 'Out of Stock') then
    insert into bomedia.notification_outbox(kind, audience, title, body, url)
      values ('stock_low', 'owner', case when new.status = 'Out of Stock' then 'Stock is out' else 'Stock is running low' end,
        left(new.item_name || case when new.status = 'Out of Stock' then ' is out of stock' else ' is running low' end, 240), '/bom03/inventory');
  end if;
  return new;
end $$;
create trigger alert_on_roll_status after update of status on bomedia.inventory_rolls for each row execute function bomedia.alert_on_roll_status();

-- ── What the app calls ───────────────────────────────────────────────────────────────────────────────────────────────────────────
create function bomedia.api_push_subscribe(request_id text, payload jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, bomedia as $$
declare actor uuid; sub_id uuid;
begin
  if jsonb_typeof(payload) is distinct from 'object' then raise exception 'A phone is required' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_object_keys(payload) k where k not in ('actor_id', 'endpoint', 'p256dh', 'auth', 'label')) then
    raise exception 'Unexpected phone field' using errcode = '22023'; end if;
  actor := (payload ->> 'actor_id')::uuid;
  if not exists (select 1 from bomedia.staff where id = actor and disabled_at is null) then raise exception 'An enabled staff member is required' using errcode = '42501'; end if;
  insert into bomedia.push_subscriptions(staff_id, endpoint, p256dh, auth, label)
    values (actor, payload ->> 'endpoint', payload ->> 'p256dh', payload ->> 'auth', left(coalesce(nullif(btrim(payload ->> 'label'), ''), 'Phone'), 100))
    on conflict (endpoint) do update set staff_id = excluded.staff_id, p256dh = excluded.p256dh, auth = excluded.auth, label = excluded.label, last_error = null
    returning id into sub_id;
  return jsonb_build_object('id', sub_id, 'subscribed', true);
end $$;

create function bomedia.api_push_unsubscribe(request_id text, payload jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, bomedia as $$
declare actor uuid; removed integer;
begin
  if jsonb_typeof(payload) is distinct from 'object' then raise exception 'A phone is required' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_object_keys(payload) k where k not in ('actor_id', 'endpoint', 'device_id')) then raise exception 'Unexpected phone field' using errcode = '22023'; end if;
  actor := (payload ->> 'actor_id')::uuid;
  if not exists (select 1 from bomedia.staff where id = actor) then raise exception 'An enabled staff member is required' using errcode = '42501'; end if;
  delete from bomedia.push_subscriptions where staff_id = actor
    and ((payload ? 'endpoint' and endpoint = payload ->> 'endpoint') or (payload ? 'device_id' and id = (payload ->> 'device_id')::uuid));
  get diagnostics removed = row_count;
  return jsonb_build_object('removed', removed);
end $$;

-- This person's phones, which of them is the one asking, and which alerts they have switched off.
create function bomedia.api_push_state(actor_value uuid, endpoint_value text) returns jsonb
language sql stable security definer set search_path = pg_catalog, bomedia as $$
  select jsonb_build_object(
    'this_phone', exists (select 1 from bomedia.push_subscriptions where staff_id = actor_value and endpoint = endpoint_value),
    'devices', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'label', s.label, 'added', s.created_at, 'last_used', s.last_used_at, 'this_phone', s.endpoint = endpoint_value) order by s.created_at) from bomedia.push_subscriptions s where s.staff_id = actor_value), '[]'::jsonb),
    'off', coalesce((select jsonb_agg(p.kind order by p.kind) from bomedia.notification_preferences p where p.staff_id = actor_value and not p.enabled), '[]'::jsonb))
$$;

create function bomedia.api_push_preference_save(request_id text, payload jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, bomedia as $$
declare actor uuid;
begin
  if jsonb_typeof(payload) is distinct from 'object' or exists (select 1 from jsonb_object_keys(payload) k where k not in ('actor_id', 'kind', 'enabled')) then
    raise exception 'Choose an alert and switch it on or off' using errcode = '22023'; end if;
  actor := (payload ->> 'actor_id')::uuid;
  if not exists (select 1 from bomedia.staff where id = actor and disabled_at is null) then raise exception 'An enabled staff member is required' using errcode = '42501'; end if;
  if jsonb_typeof(payload -> 'enabled') is distinct from 'boolean' or payload ->> 'kind' not in ('approval_waiting', 'approval_decided', 'customer_changed', 'stock_low') then
    raise exception 'Choose an alert and switch it on or off' using errcode = '22023'; end if;
  insert into bomedia.notification_preferences(staff_id, kind, enabled) values (actor, payload ->> 'kind', (payload ->> 'enabled')::boolean)
    on conflict (staff_id, kind) do update set enabled = excluded.enabled;
  return jsonb_build_object('kind', payload ->> 'kind', 'enabled', (payload ->> 'enabled')::boolean);
end $$;

-- The sender asks for alerts still to be sent, with the phones each should go to. The owner's staff id comes from the server.
create function bomedia.api_push_claim(owner_value uuid, batch_value integer) returns jsonb
language plpgsql security definer set search_path = pg_catalog, bomedia as $$
declare r bomedia.notification_outbox%rowtype; target uuid; targets jsonb; result jsonb := '[]';
begin
  for r in select * from bomedia.notification_outbox where sent_at is null and attempts < 5 and (claimed_at is null or claimed_at < now() - interval '2 minutes')
    order by created_at limit least(greatest(coalesce(batch_value, 20), 1), 100) for update skip locked loop
    target := case when r.audience = 'owner' then owner_value else r.recipient_staff_id end;
    update bomedia.notification_outbox set attempts = attempts + 1, claimed_at = now() where id = r.id;
    select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb) into targets
      from bomedia.push_subscriptions s join bomedia.staff st on st.id = s.staff_id
      where s.staff_id = target and st.disabled_at is null and target is distinct from r.actor_staff_id
        and not exists (select 1 from bomedia.notification_preferences p where p.staff_id = s.staff_id and p.kind = r.kind and not p.enabled);
    if jsonb_array_length(targets) = 0 then
      update bomedia.notification_outbox set sent_at = now() where id = r.id;   -- nobody to tell: done
    else
      result := result || jsonb_build_array(jsonb_build_object('id', r.id, 'title', r.title, 'body', r.body, 'url', r.url, 'kind', r.kind, 'targets', targets));
    end if;
  end loop;
  return result;
end $$;

-- The sender says how it went: [{id, delivered: 1, gone: [subscription ids], error: "..."}]
create function bomedia.api_push_report(results jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, bomedia as $$
declare item jsonb; gone_id text;
begin
  if jsonb_typeof(results) is distinct from 'array' then raise exception 'Results are required' using errcode = '22023'; end if;
  for item in select value from jsonb_array_elements(results) loop
    for gone_id in select value from jsonb_array_elements_text(coalesce(item -> 'gone', '[]'::jsonb)) loop
      delete from bomedia.push_subscriptions where id = gone_id::uuid;
    end loop;
    update bomedia.push_subscriptions set last_used_at = now(), last_error = null where id in (select value::uuid from jsonb_array_elements_text(coalesce(item -> 'delivered_to', '[]'::jsonb)));
    if coalesce((item ->> 'delivered')::integer, 0) > 0 or coalesce(item ->> 'error', '') = '' then
      update bomedia.notification_outbox set sent_at = now(), last_error = null where id = (item ->> 'id')::uuid;
    else
      update bomedia.notification_outbox set last_error = left(item ->> 'error', 500), claimed_at = null where id = (item ->> 'id')::uuid;
    end if;
  end loop;
  return jsonb_build_object('reported', jsonb_array_length(results));
end $$;

revoke all on function bomedia.alert_phrase(bomedia.approval_requests), bomedia.alert_on_approval(), bomedia.alert_on_customer_change(), bomedia.alert_on_roll_status(),
  bomedia.api_push_subscribe(text, jsonb), bomedia.api_push_unsubscribe(text, jsonb), bomedia.api_push_state(uuid, text), bomedia.api_push_preference_save(text, jsonb),
  bomedia.api_push_claim(uuid, integer), bomedia.api_push_report(jsonb) from public;
grant execute on function bomedia.api_push_subscribe(text, jsonb), bomedia.api_push_unsubscribe(text, jsonb), bomedia.api_push_state(uuid, text), bomedia.api_push_preference_save(text, jsonb),
  bomedia.api_push_claim(uuid, integer), bomedia.api_push_report(jsonb) to bomedia_financial_runtime;
commit;

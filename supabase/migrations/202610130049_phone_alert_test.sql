-- "Send a test alert": queues one alert to the person who asks, so they can see their phone works. It carries no business data.
begin;
alter table bomedia.notification_outbox drop constraint notification_outbox_kind_check;
alter table bomedia.notification_outbox add constraint notification_outbox_kind_check check (kind in ('approval_waiting', 'approval_decided', 'customer_changed', 'stock_low', 'test'));

create function bomedia.api_push_test(request_id text, payload jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, bomedia as $$
declare actor uuid; phones integer; home text;
begin
  if jsonb_typeof(payload) is distinct from 'object' or exists (select 1 from jsonb_object_keys(payload) k where k not in ('actor_id', 'url')) then
    raise exception 'Choose who to test' using errcode = '22023'; end if;
  actor := (payload ->> 'actor_id')::uuid;
  if not exists (select 1 from bomedia.staff where id = actor and disabled_at is null) then raise exception 'An enabled staff member is required' using errcode = '42501'; end if;
  select count(*)::integer into phones from bomedia.push_subscriptions where staff_id = actor;
  if phones = 0 then raise exception 'Turn on alerts for a phone first' using errcode = '22023'; end if;
  home := case when payload ->> 'url' like '/%' then left(payload ->> 'url', 200) else '/' end;
  insert into bomedia.notification_outbox(kind, audience, recipient_staff_id, title, body, url)
    values ('test', 'staff', actor, 'Phone alerts are on', 'This is a test alert from BOMedia.', home);
  return jsonb_build_object('queued', phones);
end $$;
revoke all on function bomedia.api_push_test(text, jsonb) from public;
grant execute on function bomedia.api_push_test(text, jsonb) to bomedia_financial_runtime;
commit;

-- Owner closes finished months. Closing sets bookkeeping_settings.closed_through, which the ledger already enforces
-- ("This accounting period is closed") and which can never move back (guard_bookkeeping_settings). Month-ends only.
begin;

-- The last day of every finished month on or after the books started that is not closed yet, as of a Lagos date.
create function bomedia.closable_month_ends(starts_on_value date, closed_through_value date, today_value date) returns date[]
language sql immutable set search_path = pg_catalog as $$
  select coalesce(array_agg(month_end order by month_end), '{}'::date[]) from (
    select (date_trunc('month', month_start) + interval '1 month' - interval '1 day')::date as month_end
    from generate_series(date_trunc('month', starts_on_value)::date, today_value, interval '1 month') as month_start
  ) months
  where month_end >= starts_on_value and month_end < today_value
    and (closed_through_value is null or month_end > closed_through_value)
$$;

create function bomedia.api_bookkeeping_period() returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, bomedia as $$
declare settings bomedia.bookkeeping_settings%rowtype; today_value date := (now() at time zone 'Africa/Lagos')::date;
begin
  select * into settings from bomedia.bookkeeping_settings where singleton;
  if not found then return jsonb_build_object('configured', false, 'today', today_value); end if;
  return jsonb_build_object('configured', true, 'starts_on', settings.starts_on, 'state', settings.state,
    'closed_through', settings.closed_through, 'today', today_value,
    'closable', (select coalesce(jsonb_agg(d order by d desc), '[]'::jsonb) from (
      select unnest(bomedia.closable_month_ends(settings.starts_on, settings.closed_through, today_value)) as d order by d desc limit 60) latest));
end $$;

create function bomedia.api_close_books(request_id text, payload jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, bomedia as $$
declare previous jsonb; result jsonb; actor uuid; through_value date; settings bomedia.bookkeeping_settings%rowtype;
begin
  if jsonb_typeof(payload) is distinct from 'object' then raise exception 'A closing date is required' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_object_keys(payload) k where k not in ('actor_id', 'through')) then
    raise exception 'Unexpected bookkeeping field' using errcode = '22023'; end if;
  if jsonb_typeof(payload -> 'through') is distinct from 'string' or payload ->> 'through' !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Choose the month to close' using errcode = '22023'; end if;
  through_value := (payload ->> 'through')::date;
  actor := (payload ->> 'actor_id')::uuid;
  if not exists (select 1 from bomedia.staff where id = actor and disabled_at is null) then
    raise exception 'An enabled staff member is required' using errcode = '42501'; end if;
  previous := bomedia.prior_result('api_close_books', request_id, payload);
  if previous is not null then return previous; end if;

  select * into settings from bomedia.bookkeeping_settings where singleton for update;
  if not found or settings.state <> 'active' then raise exception 'The books are not active yet' using errcode = '23514'; end if;
  if not (through_value = any (bomedia.closable_month_ends(settings.starts_on, settings.closed_through,
      (now() at time zone 'Africa/Lagos')::date))) then
    raise exception 'Only a finished month-end that is not already closed can be chosen' using errcode = '22023'; end if;

  update bomedia.bookkeeping_settings set closed_through = through_value where singleton;
  result := jsonb_build_object('closed_through', through_value);
  insert into bomedia.idempotency_requests(operation, request_key, payload_sha256, actor_id, response)
    values ('api_close_books', request_id, encode(sha256(convert_to(payload::text, 'UTF8')), 'hex'), actor, result);
  insert into bomedia.audit_events(actor_id, action, entity_type, details)
    values (actor, 'books_closed', 'bookkeeping_settings', jsonb_build_object('to', through_value));
  return result;
end $$;

-- Same rule as before, plus the new action under Settings.
create or replace function bomedia.audit_category(action_value text) returns text
language sql immutable set search_path=pg_catalog as $$
  select case
    when action_value in ('staff_login','staff_logout') then 'signins'
    when action_value like 'staff\_%' then 'staff'
    when action_value in ('sale_recorded','payment_recorded','quote_saved','customer_created')
      or action_value like 'price\_%' or action_value like 'job\_%' then 'sales'
    when action_value like 'expense\_%' then 'expenses'
    when action_value like 'stock\_%' or action_value like 'waste\_%' then 'stock'
    when action_value in ('business_details_saved','payment_method_saved','service_saved','services_reordered','books_closed') then 'settings'
    else 'other' end
$$;

revoke all on function bomedia.closable_month_ends(date, date, date), bomedia.api_bookkeeping_period(), bomedia.api_close_books(text, jsonb) from public;
grant execute on function bomedia.api_bookkeeping_period(), bomedia.api_close_books(text, jsonb) to bomedia_financial_runtime;
commit;

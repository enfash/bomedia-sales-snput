-- Owner's System status page: one read-only snapshot of how the database is doing. It writes nothing.
begin;

create function bomedia.api_system_status() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,bomedia as $$
declare ledger_present boolean; applied_count integer; latest_name text; today_start timestamptz;
begin
  -- Lagos has no daylight saving; its day starts at local midnight.
  today_start := date_trunc('day', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos';
  ledger_present := to_regclass('migration_control.applied_migrations') is not null;
  if ledger_present then
    execute 'select count(*)::integer, max(name) from migration_control.applied_migrations' into applied_count, latest_name;
  end if;
  return jsonb_build_object(
    'schema', jsonb_build_object('tracked', ledger_present, 'applied', applied_count, 'latest', latest_name),
    'last_sale', (select jsonb_build_object('reference', o.reference, 'at', o.created_at) from bomedia.orders o order by o.created_at desc, o.id desc limit 1),
    'last_payment', (select jsonb_build_object('reference', p.reference, 'at', p.created_at) from bomedia.payments p order by p.created_at desc, p.id desc limit 1),
    'last_expense', (select jsonb_build_object('reference', e.reference, 'at', e.created_at) from bomedia.expenses e order by e.created_at desc, e.id desc limit 1),
    'today', jsonb_build_object(
      'sales', (select count(*)::integer from bomedia.orders where created_at >= today_start),
      'payments', (select count(*)::integer from bomedia.payments where created_at >= today_start),
      'expenses', (select count(*)::integer from bomedia.expenses where created_at >= today_start)));
end $$;

revoke all on function bomedia.api_system_status() from public;
grant execute on function bomedia.api_system_status() to bomedia_financial_runtime;
commit;

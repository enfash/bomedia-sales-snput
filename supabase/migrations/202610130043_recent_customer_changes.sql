-- The owner's recent customer edits (phone, notes, name), newest first, for the bell. Read only: the history itself was already kept in
-- `customer_changes` and the audit log; this just lists the latest of it with the customer and who changed it.
begin;
create function bomedia.api_recent_customer_changes(days_value integer) returns jsonb
language sql stable security definer set search_path = pg_catalog, bomedia as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'at', c.created_at, 'customer_id', cu.id, 'reference', cu.reference, 'name', cu.display_name,
    'by_id', c.changed_by, 'by', s.display_name, 'changes', c.changes) order by c.created_at desc), '[]'::jsonb)
  from (select * from bomedia.customer_changes where created_at >= now() - make_interval(days => least(greatest(coalesce(days_value, 14), 1), 60))
        order by created_at desc limit 50) c
    join bomedia.customers cu on cu.id = c.customer_id join bomedia.staff s on s.id = c.changed_by
$$;
revoke all on function bomedia.api_recent_customer_changes(integer) from public;
grant execute on function bomedia.api_recent_customer_changes(integer) to bomedia_financial_runtime;
commit;

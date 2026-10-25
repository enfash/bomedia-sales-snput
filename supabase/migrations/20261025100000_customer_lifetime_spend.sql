-- Customer lifetime spend (owner request, 25 Oct 2026).
-- A customer's "Spent" used to count only the new books, where an old sale appears as just the part still owed (the opening job).
-- Lifetime spend is now the Sheet history (bomedia.legacy_sales, every old sale at its full amount) plus sales made in the new app.
-- Opening jobs are left out of the new-app part, because the history already holds those same sales: adding both would count them twice.
-- What a customer owes is unchanged: it still comes only from the books (total_kobo less paid_kobo).
begin;

create or replace function bomedia.customer_rows(only_id uuid) returns jsonb
language sql stable security definer set search_path = pg_catalog, bomedia as $$
  with adj as (select job_id, sum(amount_kobo) as kobo from bomedia.job_adjustments group by job_id),
  jt as (select j.customer_id, count(distinct j.order_id) as orders, sum(j.amount_kobo + coalesce(adj.kobo, 0)) as total, max(j.business_date) as last_date,
      -- Sales made in the new app: everything except the opening jobs, which only restate part of an old sale.
      count(distinct j.order_id) filter (where j.logged_by_snapshot is distinct from 'Sheet opening balance') as orders_since,
      coalesce(sum(j.amount_kobo + coalesce(adj.kobo, 0)) filter (where j.logged_by_snapshot is distinct from 'Sheet opening balance'), 0) as total_since
    from bomedia.jobs j left join adj on adj.job_id = j.id group by j.customer_id),
  pt as (select customer_id, sum(amount_kobo) as paid from bomedia.payment_allocations group by customer_id),
  lt as (select customer_id, count(distinct coalesce(sales_id, 'row-' || sheet_row::text)) as orders, sum(amount_kobo) as total from bomedia.legacy_sales group by customer_id)
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'reference', c.reference, 'name', c.display_name, 'contact', coalesce(c.contact, ''), 'notes', coalesce(c.notes, ''),
    'orders', coalesce(jt.orders, 0), 'total_kobo', coalesce(jt.total, 0)::text, 'paid_kobo', coalesce(pt.paid, 0)::text,
    'owed_kobo', greatest(0, coalesce(jt.total, 0) - coalesce(pt.paid, 0))::text, 'last_order_date', jt.last_date, 'created_at', c.created_at,
    'spent_before_kobo', coalesce(lt.total, 0)::text, 'orders_before', coalesce(lt.orders, 0),
    'spent_since_kobo', coalesce(jt.total_since, 0)::text, 'orders_since', coalesce(jt.orders_since, 0),
    'spent_kobo', (coalesce(lt.total, 0) + coalesce(jt.total_since, 0))::text, 'orders_lifetime', coalesce(lt.orders, 0) + coalesce(jt.orders_since, 0))
    order by lower(c.display_name), c.id), '[]'::jsonb)
  from bomedia.customers c left join jt on jt.customer_id = c.id left join pt on pt.customer_id = c.id left join lt on lt.customer_id = c.id
  where only_id is null or c.id = only_id
$$;

commit;

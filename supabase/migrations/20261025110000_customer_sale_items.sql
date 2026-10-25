-- Customer profile: each order now carries its items (migration 56, 25 Oct 2026), so the Sales tab can open an order and list them.
-- Nothing else changes: same fields, same totals, same limits.
begin;

create or replace function bomedia.api_customer_profile(customer_value text) returns jsonb
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
      string_agg(j.description, ', ' order by j.created_at) as what,
      -- Each item of the order, so the profile can list them one by one (the sale's own words and size, and what it cost).
      jsonb_agg(jsonb_build_object('description', j.description, 'material', j.material_name_snapshot, 'quantity', j.quantity::text,
        'width_ft', j.width_ft::text, 'height_ft', j.height_ft::text, 'amount_kobo', (j.amount_kobo + coalesce(adj.kobo, 0))::text) order by j.created_at, j.id) as items
    from bomedia.jobs j join bomedia.orders o on o.id = j.order_id left join adj on adj.job_id = j.id left join al on al.job_id = j.id
    where j.customer_id = cid group by o.id, o.legacy_sales_id, o.reference)
  select coalesce(jsonb_agg(jsonb_build_object('sales_id', sales_id, 'date', business_date, 'jobs', jobs, 'what', what, 'items', items,
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

commit;

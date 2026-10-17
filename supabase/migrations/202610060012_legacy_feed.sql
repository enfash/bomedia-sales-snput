-- Legacy feed: the old screens (dashboard, Records, job board, customers,
-- notifications, shift report, digest) read Google Sheets rows. When the
-- Postgres runtime is on, the old GET routes return the same row shapes from
-- Postgres instead, so those screens keep working without a redesign. Read
-- only. Every value is text, as Sheets returned it. Local only.
--
-- Payments follow the old sheet model: money collected on the job's own day is
-- the job's INITIAL PAYMENT; later money is ADDITIONAL PAYMENT 1 and appears as
-- a Payments row. AMOUNT includes adjustments, so AMOUNT minus the payment
-- columns is always the real balance.
begin;
create function bomedia.naira_text(kobo_value numeric) returns text
language sql immutable set search_path=pg_catalog as $$ select trim_scale(round(kobo_value/100.0,2))::text $$;

create function bomedia.api_legacy_feed(resource_value text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,bomedia as $$
declare result jsonb;
begin
  if resource_value='sales' then
    with alloc as (
      select a.job_id,
        sum(a.amount_kobo) filter (where p.business_date is not distinct from j.business_date) as initial_kobo,
        sum(a.amount_kobo) filter (where p.business_date is distinct from j.business_date) as later_kobo
      from bomedia.payment_allocations a join bomedia.payments p on p.id=a.payment_id join bomedia.jobs j on j.id=a.job_id
      group by a.job_id),
    adj as (select job_id,sum(amount_kobo) as kobo from bomedia.job_adjustments group by job_id),
    rows as (
      select j.collection_sequence as seq, j.business_date, j.created_at,
        coalesce(j.client_name_snapshot,c.display_name) as client, coalesce(j.contact_snapshot,c.contact,'') as contact,
        j.description, coalesce(sv.name,m.name,j.material_name_snapshot,'') as material,
        j.price_per_sqft_kobo, j.legacy_size_values, j.width_ft, j.height_ft, j.quantity, j.unit_price_kobo,
        j.amount_kobo+coalesce(adj.kobo,0) as total_kobo, coalesce(al.initial_kobo,0) as initial_kobo,
        coalesce(al.later_kobo,0) as later_kobo, j.job_status,
        coalesce(s.display_name,j.logged_by_snapshot,'') as logged_by,
        coalesce(o.legacy_sales_id,j.id::text) as sales_id, coalesce(o.legacy_transaction_id,o.id::text) as transaction_id
      from bomedia.jobs j join bomedia.orders o on o.id=j.order_id join bomedia.customers c on c.id=j.customer_id
      left join bomedia.materials m on m.id=j.material_id left join bomedia.services sv on sv.id=j.service_id
      left join bomedia.staff s on s.id=j.logged_by left join alloc al on al.job_id=j.id left join adj on adj.job_id=j.id)
    select coalesce(jsonb_agg(jsonb_build_object(
      'DATE',coalesce(r.business_date::text,''),'CLIENT NAME',r.client,'JOB DESCRIPTION',r.description,'CONTACT',r.contact,
      'MATERIAL',r.material,'Cost Per SQRFT',coalesce(bomedia.naira_text(r.price_per_sqft_kobo),''),
      '3FT',coalesce(r.legacy_size_values->>'3FT',''),'4FT',coalesce(r.legacy_size_values->>'4FT',''),
      '5FT',coalesce(r.legacy_size_values->>'5FT',''),'6FT',coalesce(r.legacy_size_values->>'6FT',''),
      '7FT',coalesce(r.legacy_size_values->>'7FT',''),'8FT',coalesce(r.legacy_size_values->>'8FT',''),
      '10FT',coalesce(r.legacy_size_values->>'10FT',''),
      'custom',coalesce(r.legacy_size_values->>'custom',
        case when r.width_ft is not null and r.height_ft is not null then trim_scale(r.width_ft)::text||'x'||trim_scale(r.height_ft)::text else '' end),
      'QTY',trim_scale(r.quantity)::text,'UNIT COST (₦)',bomedia.naira_text(r.unit_price_kobo),
      'INITIAL PAYMENT (₦)',bomedia.naira_text(r.initial_kobo),'AMOUNT (₦)',bomedia.naira_text(r.total_kobo),
      'ADDITIONAL PAYMENT 1',case when r.later_kobo>0 then bomedia.naira_text(r.later_kobo) else '' end,
      'ADDITIONAL PAYMENT 2','',
      'AMOUNT DIFFERENCES',bomedia.naira_text(r.total_kobo-r.initial_kobo-r.later_kobo),
      'PAYMENT STATUS',case when r.total_kobo-r.initial_kobo-r.later_kobo<=0 then 'Paid'
        when r.initial_kobo+r.later_kobo>0 then 'Part-payment' else 'Unpaid' end,
      'JOB STATUS',r.job_status,'Logged By',r.logged_by,'Sales ID',r.sales_id,
      'TIMESTAMP',r.created_at::text,'TRANSACTION ID',r.transaction_id,'_rowIndex',r.seq::text)
      order by r.seq),'[]') into result from rows r;
  elsif resource_value='payments' then
    select coalesce(jsonb_agg(x.doc order by x.rn),'[]') into result from (select jsonb_build_object(
      'PAYMENT ID',coalesce(p.legacy_payment_id,p.id::text),'SALES ID',coalesce(o.legacy_sales_id,j.id::text),
      'CLIENT NAME',coalesce(j.client_name_snapshot,c.display_name),'DATE',coalesce(p.business_date::text,''),
      'AMOUNT',bomedia.naira_text(a.amount_kobo),'PAYMENT TYPE',case a.kind when 'rounding' then 'Rounding' else 'Settlement' end,
      'BALANCE BEFORE','','BALANCE AFTER','','COLLECTED BY',coalesce(s.display_name,p.collected_by_snapshot,''),
      'NOTES',coalesce(p.notes,''),'TIMESTAMP',p.created_at::text,'BATCH ID',coalesce(p.legacy_batch_id,p.id::text),
      'PAYMENT METHOD',coalesce(p.method,''),'_rowIndex',(row_number() over (order by p.created_at,p.id,a.job_id))::text)
      as doc, row_number() over (order by p.created_at,p.id,a.job_id) as rn
    from bomedia.payment_allocations a join bomedia.payments p on p.id=a.payment_id
      join bomedia.jobs j on j.id=a.job_id join bomedia.orders o on o.id=j.order_id
      join bomedia.customers c on c.id=p.customer_id left join bomedia.staff s on s.id=p.collected_by
    where p.business_date is distinct from j.business_date) x;
  elsif resource_value='expenses' then
    select coalesce(jsonb_agg(x.doc order by x.rn),'[]') into result from (select jsonb_build_object(
      'DATE',coalesce(e.business_date::text,''),'EXPENSE ID',coalesce(e.legacy_expense_id,e.id::text),
      'AMOUNT',bomedia.naira_text(e.amount_kobo),'CATEGORY',e.category,'DESCRIPTION',coalesce(e.description,''),
      'PAID TO',coalesce(e.paid_to,''),'PAYMENT METHOD',coalesce(e.payment_method,''),
      'RECEIPT URL',coalesce((select rr.url from bomedia.receipt_references rr where rr.expense_id=e.id order by rr.id limit 1),''),
      'Logged By',coalesce(l.display_name,e.logged_by_snapshot,''),'STATUS',e.status,
      'PAID BY',coalesce(pb.display_name,e.paid_by_snapshot,''),'PAID AT',coalesce(e.paid_at::text,''),
      'TIMESTAMP',e.created_at::text,'_rowIndex',(row_number() over (order by e.created_at,e.id))::text)
      as doc, row_number() over (order by e.created_at,e.id) as rn
    from bomedia.expenses e left join bomedia.staff l on l.id=e.logged_by left join bomedia.staff pb on pb.id=e.paid_by) x;
  elsif resource_value='inventory' then
    select coalesce(jsonb_agg(x.doc order by x.rn),'[]') into result from (select jsonb_build_object(
      'Roll ID',coalesce(i.legacy_roll_id,i.id::text),'Item Name',i.item_name,'Category',coalesce(i.category,m.category,''),
      'Width (ft)',trim_scale(i.width_ft)::text,'Raw Length (ft)',coalesce(trim_scale(i.raw_length_ft)::text,''),
      'Total Length (ft)',trim_scale(i.total_length_ft)::text,'Remaining Length (ft)',trim_scale(i.remaining_length_ft)::text,
      'Waste Logged (ft)',trim_scale(i.waste_length_ft)::text,'Unit',coalesce(i.original_unit,'ft'),
      'Price',bomedia.naira_text(m.selling_price_per_sqft_kobo),'Cost',coalesce(bomedia.naira_text(i.purchase_cost_kobo),''),
      'Waste Factor',coalesce(trim_scale(i.waste_factor)::text,''),
      'Cost per Sqft',coalesce(bomedia.naira_text(coalesce(i.cost_per_sqft_kobo_exact,i.cost_per_sqft_kobo)),''),
      'Low Stock Threshold (ft)',trim_scale(i.low_stock_threshold_ft)::text,
      'Status',case when i.remaining_length_ft<=0 then 'Out of Stock' when i.remaining_length_ft<=i.low_stock_threshold_ft then 'Low Stock' else 'Active' end,
      'Date Added',coalesce(i.business_date::text,''),'Material ID',coalesce(m.legacy_material_id,m.id::text),
      '_rowIndex',(row_number() over (order by i.created_at,i.id))::text)
      as doc, row_number() over (order by i.created_at,i.id) as rn
    from bomedia.inventory_rolls i join bomedia.materials m on m.id=i.material_id) x;
  elsif resource_value='materials' then
    with agg as (
      select material_id, sum(remaining_length_ft) as remaining, sum(total_length_ft) as capacity, count(*) as rolls,
        sum(coalesce(purchase_cost_kobo,0)) as spent,
        sum(case when total_length_ft>0 then remaining_length_ft/total_length_ft*coalesce(purchase_cost_kobo,0) else 0 end) as asset_kobo,
        sum(width_ft*remaining_length_ft) as remaining_sqft, sum(width_ft*greatest(total_length_ft-remaining_length_ft,0)) as used_sqft,
        max(created_at) as updated
      from bomedia.inventory_rolls group by material_id)
    select coalesce(jsonb_agg(jsonb_build_object(
      'Material ID',coalesce(m.legacy_material_id,m.id::text),'Material Name',m.name,'Width (ft)',trim_scale(m.width_ft)::text,
      'Selling Price',bomedia.naira_text(m.selling_price_per_sqft_kobo),
      'Total Remaining (ft)',trim_scale(coalesce(g.remaining,0))::text,'Total Capacity (ft)',trim_scale(coalesce(g.capacity,0))::text,
      'Active Roll ID',coalesce(ar.legacy_roll_id,ar.id::text,''),'Roll Count',coalesce(g.rolls,0)::text,
      'Status',case when coalesce(g.remaining,0)<=0 then 'Out of Stock' when g.remaining<=m.low_stock_threshold_ft then 'Low Stock' else 'Active' end,
      'Low Stock Threshold (ft)',trim_scale(m.low_stock_threshold_ft)::text,'Last Updated',coalesce(g.updated::text,''),
      'Notes',coalesce(m.notes,''),'Total Spent',bomedia.naira_text(coalesce(g.spent,0)),
      'Total Remaining Asset Value',bomedia.naira_text(coalesce(g.asset_kobo,0)),
      'Total Remaining Revenue',bomedia.naira_text(coalesce(g.remaining_sqft,0)*m.selling_price_per_sqft_kobo),
      'Total Realised Revenue',bomedia.naira_text(coalesce(g.used_sqft,0)*m.selling_price_per_sqft_kobo))
      order by m.name,m.id),'[]') into result
    from bomedia.materials m left join agg g on g.material_id=m.id left join bomedia.inventory_rolls ar on ar.id=m.active_roll_id;
  else raise exception 'Unsupported legacy resource' using errcode='22023';
  end if;
  return result;
end $$;
revoke all on function bomedia.naira_text(numeric),bomedia.api_legacy_feed(text) from public;
grant execute on function bomedia.api_legacy_feed(text) to bomedia_financial_runtime;
commit;

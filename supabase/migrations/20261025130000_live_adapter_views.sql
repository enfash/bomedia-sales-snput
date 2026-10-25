-- Reviewed read-only views for the BOMedia Intelligence live adapter (lib/live/ in that app).
-- Implements docs/LIVE-VIEWS-PROPOSAL.md in bomedia-intelligence, with the owner options it recommends:
--   * the views are owned by intelligence_owner, a login-less role with column-level grants only;
--   * intelligence_owner reads the tables through one RLS policy per table, not BYPASSRLS;
--   * the reader login (bomedia_intelligence_read) can select the v_ views and nothing else.
-- The first version of the views (migration 20261025120000) is retired here. The app never read it.
begin;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'intelligence_owner') then
    create role intelligence_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'bomedia_intelligence_read') then
    create role bomedia_intelligence_read nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
  end if;
end $$;
alter role bomedia_intelligence_read set default_transaction_read_only = on;
alter role bomedia_intelligence_read set statement_timeout = '15s';

drop view if exists intelligence.customers, intelligence.orders, intelligence.jobs, intelligence.payments,
  intelligence.payment_allocations, intelligence.job_adjustments, intelligence.customer_changes,
  intelligence.expenses, intelligence.daily_cost_of_goods_sold, intelligence.job_costs, intelligence.books,
  intelligence.last_change;

-- Column-level read access for the view owner. Nothing else in bomedia is visible to it (staff PINs, sessions,
-- devices, approvals, audit events, receipts and inventory stay out).
grant usage on schema bomedia to intelligence_owner;
grant select (id, reference, display_name, contact, notes, created_at) on bomedia.customers to intelligence_owner;
grant select (id, reference, legacy_sales_id, customer_id) on bomedia.orders to intelligence_owner;
grant select (id, order_id, customer_id, description, material_name_snapshot, material_id, quantity, amount_kobo,
  job_status, business_date, created_at) on bomedia.jobs to intelligence_owner;
grant select (id, name) on bomedia.materials to intelligence_owner;
grant select (id, reference, legacy_payment_id, customer_id, amount_kobo, business_date, method, collected_by,
  collected_by_snapshot, created_at) on bomedia.payments to intelligence_owner;
grant select (id, display_name) on bomedia.staff to intelligence_owner;
grant select (payment_id, job_id, amount_kobo, kind, created_at) on bomedia.payment_allocations to intelligence_owner;
grant select (id, job_id, amount_kobo, kind, reason, business_date, created_at) on bomedia.job_adjustments to intelligence_owner;
grant select (customer_id, changed_by, changes, created_at) on bomedia.customer_changes to intelligence_owner;
grant select (id, business_date, category, amount_kobo, status, created_at) on bomedia.expenses to intelligence_owner;
grant select (name, account_code) on bomedia.expense_categories to intelligence_owner;
grant select (id, business_date, status, source_type, source_id, reverses_entry_id, posted_at) on bomedia.journal_entries to intelligence_owner;
grant select (entry_id, account_code, debit_kobo, credit_kobo) on bomedia.journal_lines to intelligence_owner;
grant select (job_id, new_entry_id) on bomedia.job_revisions to intelligence_owner;
grant select (starts_on, state) on bomedia.bookkeeping_settings to intelligence_owner;

-- RLS is enabled on these tables. The owner gets a read policy of its own, so it sees every row without BYPASSRLS.
do $$
declare t text;
begin
  foreach t in array array['customers', 'orders', 'jobs', 'materials', 'payments', 'staff', 'payment_allocations',
    'job_adjustments', 'customer_changes', 'expenses', 'expense_categories', 'journal_entries', 'journal_lines',
    'job_revisions', 'bookkeeping_settings'] loop
    execute format('create policy intelligence_owner_read on bomedia.%I for select to intelligence_owner using (true)', t);
  end loop;
end $$;

create schema if not exists intelligence;

-- Bump contract_version whenever any view's columns change. The app refuses to run against a different version.
create view intelligence.v_contract as
select '1'::text as contract_version;

create view intelligence.v_customers as
select c.id::text as id, c.reference, c.display_name as name,
       to_char(c.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at
from bomedia.customers c;

create view intelligence.v_customer_contacts as
select c.id::text as customer_id, coalesce(c.contact, '') as contact, c.notes
from bomedia.customers c;

create view intelligence.v_orders as
select o.id::text as id, coalesce(o.reference, o.legacy_sales_id) as reference, o.customer_id::text as customer_id
from bomedia.orders o;

create view intelligence.v_jobs as
select j.id::text as id, j.order_id::text as order_id, j.customer_id::text as customer_id, j.description,
       coalesce(j.material_name_snapshot, m.name) as material,
       j.quantity::text as quantity, j.amount_kobo::text as amount_kobo, j.job_status as status,
       to_char(coalesce(j.business_date, (j.created_at at time zone 'UTC')::date), 'YYYY-MM-DD') as business_date,
       (j.business_date is null) as date_from_created
from bomedia.jobs j
left join bomedia.materials m on m.id = j.material_id;

create view intelligence.v_payments as
select p.id::text as id, coalesce(p.reference, p.legacy_payment_id) as reference, p.customer_id::text as customer_id,
       p.amount_kobo::text as amount_kobo,
       to_char(coalesce(p.business_date, (p.created_at at time zone 'UTC')::date), 'YYYY-MM-DD') as business_date,
       p.method, coalesce(s.display_name, p.collected_by_snapshot) as collected_by,
       (p.business_date is null) as date_from_created
from bomedia.payments p
left join bomedia.staff s on s.id = p.collected_by;

create view intelligence.v_payment_allocations as
select a.payment_id::text as payment_id, a.job_id::text as job_id, a.amount_kobo::text as amount_kobo, a.kind
from bomedia.payment_allocations a;

create view intelligence.v_job_adjustments as
select a.id::text as id, a.job_id::text as job_id, a.amount_kobo::text as amount_kobo, a.kind, a.reason,
       to_char(coalesce(a.business_date, (a.created_at at time zone 'UTC')::date), 'YYYY-MM-DD') as business_date
from bomedia.job_adjustments a;

create view intelligence.v_customer_changes as
select h.customer_id::text as customer_id, coalesce(s.display_name, 'Staff') as changed_by,
       to_char(h.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as at,
       h.changes::text as changes
from bomedia.customer_changes h
left join bomedia.staff s on s.id = h.changed_by;

-- account_code tells the app how the category is posted: 6000 operating expense, 1500 capital (Equipment).
-- A category missing from expense_categories (older rows) shows a null account_code and is set aside by the app.
create view intelligence.v_expenses as
select e.id::text as id,
       to_char(coalesce(e.business_date, (e.created_at at time zone 'UTC')::date), 'YYYY-MM-DD') as business_date,
       e.category, e.amount_kobo::text as amount_kobo, e.status, c.account_code,
       (e.business_date is null) as date_from_created
from bomedia.expenses e
left join bomedia.expense_categories c on c.name = e.category;

-- Net cost of goods sold (account 5000) per business date, posted entries only; a reversal cancels the original.
create view intelligence.v_daily_cost as
select to_char(e.business_date, 'YYYY-MM-DD') as business_date,
       sum(l.debit_kobo::numeric - l.credit_kobo::numeric)::text as cost_kobo
from bomedia.journal_entries e
join bomedia.journal_lines l on l.entry_id = e.id
where e.status = 'posted' and l.account_code = '5000'
group by e.business_date
having sum(l.debit_kobo::numeric - l.credit_kobo::numeric) <> 0;

-- Net cost the ledger ties to one job: its sale entry, any corrected-sale entry (job_revisions), and the reversals of both.
-- Cost posted without a job link (for example some services) appears only in v_daily_cost.
create view intelligence.v_job_cost as
with job_entries as (
  select e.id as entry_id, e.source_id as job_id
  from bomedia.journal_entries e
  where e.status = 'posted' and e.source_type = 'job' and e.source_id is not null
  union all
  select r.new_entry_id as entry_id, r.job_id
  from bomedia.job_revisions r
  where r.new_entry_id is not null
), tied as (
  select entry_id, job_id from job_entries
  union all
  select rev.id as entry_id, je.job_id
  from bomedia.journal_entries rev
  join job_entries je on rev.reverses_entry_id = je.entry_id
  where rev.status = 'posted'
)
select t.job_id::text as job_id,
       sum(l.debit_kobo::numeric - l.credit_kobo::numeric)::text as cost_kobo
from tied t
join bomedia.journal_entries e on e.id = t.entry_id and e.status = 'posted'
join bomedia.journal_lines l on l.entry_id = e.id and l.account_code = '5000'
group by t.job_id;

create view intelligence.v_books as
select to_char(b.starts_on, 'YYYY-MM-DD') as starts_on, b.state
from bomedia.bookkeeping_settings b;

-- Newest change the sales app has recorded. Edits that create no row (for example a job status change) are not seen.
create view intelligence.v_freshness as
select to_char(greatest(
         (select max(created_at) from bomedia.jobs),
         (select max(created_at) from bomedia.payments),
         (select max(created_at) from bomedia.payment_allocations),
         (select max(created_at) from bomedia.job_adjustments),
         (select max(created_at) from bomedia.expenses),
         (select max(created_at) from bomedia.customer_changes),
         (select max(posted_at) from bomedia.journal_entries)
       ) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at;

-- The views run with the privileges of their owner, so each one is owned by intelligence_owner.
alter view intelligence.v_contract owner to intelligence_owner;
alter view intelligence.v_customers owner to intelligence_owner;
alter view intelligence.v_customer_contacts owner to intelligence_owner;
alter view intelligence.v_orders owner to intelligence_owner;
alter view intelligence.v_jobs owner to intelligence_owner;
alter view intelligence.v_payments owner to intelligence_owner;
alter view intelligence.v_payment_allocations owner to intelligence_owner;
alter view intelligence.v_job_adjustments owner to intelligence_owner;
alter view intelligence.v_customer_changes owner to intelligence_owner;
alter view intelligence.v_expenses owner to intelligence_owner;
alter view intelligence.v_daily_cost owner to intelligence_owner;
alter view intelligence.v_job_cost owner to intelligence_owner;
alter view intelligence.v_books owner to intelligence_owner;
alter view intelligence.v_freshness owner to intelligence_owner;

-- The reader login can read these views and nothing else. It has no privilege on the bomedia schema.
revoke all on schema intelligence from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on schema intelligence from %I', r);
    end if;
  end loop;
end $$;
grant usage on schema intelligence to bomedia_intelligence_read;
grant select on intelligence.v_contract, intelligence.v_customers, intelligence.v_customer_contacts,
  intelligence.v_orders, intelligence.v_jobs, intelligence.v_payments, intelligence.v_payment_allocations,
  intelligence.v_job_adjustments, intelligence.v_customer_changes, intelligence.v_expenses, intelligence.v_daily_cost,
  intelligence.v_job_cost, intelligence.v_books, intelligence.v_freshness to bomedia_intelligence_read;

commit;

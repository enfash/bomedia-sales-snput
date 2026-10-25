-- Read-only views for BOMedia Intelligence (25 Oct 2026).
-- Intelligence connects as bomedia_intelligence_read. That login can SELECT the views in the intelligence schema and
-- nothing else: no base tables, no functions, no writes. The schema is not exposed through the Supabase Data API.
-- The views are plain projections of the books. Business rules (status names, what counts as history) live in the
-- Intelligence adapter, where they are tested. The views run as their owner, so they read the tables past row-level
-- security on purpose; the views are the only surface the reader can see.
begin;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'bomedia_intelligence_read') then
    create role bomedia_intelligence_read nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
  end if;
end $$;
alter role bomedia_intelligence_read set default_transaction_read_only = on;
alter role bomedia_intelligence_read set statement_timeout = '8s';

create schema if not exists intelligence;

create view intelligence.customers as
select c.id, c.reference, c.display_name,
  coalesce(c.contact, '') as contact, coalesce(c.notes, '') as notes, c.created_at
from bomedia.customers c;

-- Orders have no business date of their own; the day they were made (Lagos time) stands in for it.
create view intelligence.orders as
select o.id, o.reference, o.customer_id, (o.created_at at time zone 'Africa/Lagos')::date as business_date
from bomedia.orders o;

-- Cancelled jobs keep their row (amount 0, status Cancelled) and are flagged here.
-- Opening balances carried over from the Sheet are flagged too, so the adapter can decide how to show them.
create view intelligence.jobs as
select j.id, j.order_id, j.customer_id, j.description,
  coalesce(sv.name, m.name, j.material_name_snapshot, '') as material_name,
  j.quantity::numeric as quantity, j.amount_kobo, j.job_status,
  j.cancelled_at is not null as cancelled,
  j.logged_by_snapshot is not distinct from 'Sheet opening balance' as opening_balance,
  j.business_date, j.created_at
from bomedia.jobs j
left join bomedia.materials m on m.id = j.material_id
left join bomedia.services sv on sv.id = j.service_id;

create view intelligence.payments as
select p.id, p.reference, p.customer_id, p.amount_kobo, p.business_date, p.method,
  coalesce(s.display_name, p.collected_by_snapshot, '') as collected_by, p.created_at
from bomedia.payments p
left join bomedia.staff s on s.id = p.collected_by;

create view intelligence.payment_allocations as
select a.payment_id, a.job_id, a.customer_id, a.amount_kobo, a.kind, a.created_at
from bomedia.payment_allocations a;

create view intelligence.job_adjustments as
select a.id, a.job_id, a.amount_kobo, a.kind, a.reason, a.business_date, a.created_at
from bomedia.job_adjustments a;

-- Same shape the customer page uses: { field: { from, to } }. The changer's name is the staff display name.
create view intelligence.customer_changes as
select h.customer_id, coalesce(s.display_name, 'Staff') as changed_by, h.created_at, h.changes
from bomedia.customer_changes h
left join bomedia.staff s on s.id = h.changed_by;

-- Cancelled expenses keep their row (amount 0, status Cancelled) and are flagged here.
create view intelligence.expenses as
select e.id, e.reference, e.business_date, e.category, e.amount_kobo, e.status,
  e.cancelled_at is not null as cancelled, e.created_at
from bomedia.expenses e;

-- Net cost of goods sold (ledger account 5000) per business date: posted entries only, reversals netted.
create view intelligence.daily_cost_of_goods_sold as
select e.business_date, sum(l.debit_kobo - l.credit_kobo)::bigint as cost_kobo
from bomedia.journal_lines l
join bomedia.journal_entries e on e.id = l.entry_id
where l.account_code = '5000' and e.status = 'posted'
group by e.business_date;

-- Cost of goods sold the ledger ties to one job (journal lines with a job), netted the same way.
create view intelligence.job_costs as
select l.job_id, sum(l.debit_kobo - l.credit_kobo)::bigint as cost_kobo
from bomedia.journal_lines l
join bomedia.journal_entries e on e.id = l.entry_id
where l.account_code = '5000' and e.status = 'posted' and l.job_id is not null
group by l.job_id;

create view intelligence.books as
select s.starts_on, s.state, s.closed_through
from bomedia.bookkeeping_settings s;

-- The newest change the books show. Corrections and cancellations edit rows in place, so their revision rows and
-- cancellation times count too. A payment edited in place without a revision row would not show here.
create view intelligence.last_change as
select max(t.at) as updated_at
from (
  select created_at as at from bomedia.customers
  union all select created_at from bomedia.customer_changes
  union all select created_at from bomedia.orders
  union all select created_at from bomedia.jobs
  union all select cancelled_at from bomedia.jobs
  union all select created_at from bomedia.job_revisions
  union all select created_at from bomedia.payments
  union all select created_at from bomedia.payment_allocations
  union all select created_at from bomedia.job_adjustments
  union all select created_at from bomedia.expenses
  union all select cancelled_at from bomedia.expenses
  union all select created_at from bomedia.expense_revisions
  union all select posted_at from bomedia.journal_entries
) t;

-- Views are read through the reader's own grants only. Nothing else in the schema is granted.
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
grant select on intelligence.customers, intelligence.orders, intelligence.jobs, intelligence.payments,
  intelligence.payment_allocations, intelligence.job_adjustments, intelligence.customer_changes,
  intelligence.expenses, intelligence.daily_cost_of_goods_sold, intelligence.job_costs, intelligence.books,
  intelligence.last_change to bomedia_intelligence_read;

commit;

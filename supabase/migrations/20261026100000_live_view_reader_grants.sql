-- Gives the reader login its access to the live adapter views (follow-up to 20261025130000_live_adapter_views.sql).
-- The first apply of that migration did not give the reader any access: PostgreSQL silently skips a grant on a view
-- made by a role that does not own it, and the migration account does not own these views. So the grant is made as
-- the view owner, intelligence_owner. The membership and schema privileges that allow this are removed again in the
-- same migration. Running it again changes nothing.
begin;

grant usage on schema intelligence to bomedia_intelligence_read;
grant intelligence_owner to current_user with set true;
grant usage on schema intelligence to intelligence_owner;

set local role intelligence_owner;
grant select on intelligence.v_contract, intelligence.v_customers, intelligence.v_customer_contacts,
  intelligence.v_orders, intelligence.v_jobs, intelligence.v_payments, intelligence.v_payment_allocations,
  intelligence.v_job_adjustments, intelligence.v_customer_changes, intelligence.v_expenses, intelligence.v_daily_cost,
  intelligence.v_job_cost, intelligence.v_books, intelligence.v_freshness to bomedia_intelligence_read;
reset role;

revoke usage on schema intelligence from intelligence_owner;
revoke intelligence_owner from current_user;

commit;

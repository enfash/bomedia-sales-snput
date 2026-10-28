-- A single counter that moves whenever the data behind the sales, expense, inventory and material feeds changes.
-- Devices read this small number every 30 seconds and download the full feeds only when it has moved.
-- Statement-level triggers: one bump per write statement, even when it touches many rows.
begin;

create table bomedia.data_revision (
  id smallint primary key default 1 check (id = 1),
  revision bigint not null default 0
);
insert into bomedia.data_revision (id, revision) values (1, 0);
alter table bomedia.data_revision enable row level security;
revoke all on bomedia.data_revision from public;

create function bomedia.bump_data_revision() returns trigger
language plpgsql security definer set search_path = pg_catalog, bomedia as $$
begin
  update bomedia.data_revision set revision = revision + 1 where id = 1;
  return null;
end $$;
revoke all on function bomedia.bump_data_revision() from public;

-- Every table that legacy_feed_rows, api_legacy_feed, api_unavailable_materials or api_material_sales reads.
do $$
declare table_name text;
begin
  foreach table_name in array array['customers','orders','jobs','job_adjustments','job_revisions','payments','payment_allocations',
    'expenses','expense_revisions','expense_recoveries','receipt_references','journal_entries','journal_lines',
    'inventory_rolls','materials','services','staff'] loop
    execute format('create trigger %I after insert or update or delete on bomedia.%I for each statement execute function bomedia.bump_data_revision()',
      'bump_revision_' || table_name, table_name);
  end loop;
end $$;

create function bomedia.api_data_revision() returns jsonb
language sql stable security definer set search_path = pg_catalog, bomedia as $$
  select jsonb_build_object('revision', revision) from bomedia.data_revision where id = 1
$$;
revoke all on function bomedia.api_data_revision() from public;
grant execute on function bomedia.api_data_revision() to bomedia_financial_runtime;

commit;

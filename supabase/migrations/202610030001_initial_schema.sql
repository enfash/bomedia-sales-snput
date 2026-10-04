-- Foundation only: no application routes use this schema yet.
-- Apply to an empty TEST database, through a migration owner, in one transaction.
-- Runtime grants, transactional write functions and import reconciliation follow.
begin;

create schema bomedia;
create schema migration;
revoke all on schema bomedia, migration from public;

-- Bounded decimals reject NaN as well as negative measurements.
create domain bomedia.measurement as numeric(18,6)
  check (value >= 0 and value < 'Infinity'::numeric);

create table migration.snapshots (
  id uuid primary key default gen_random_uuid(),
  workbook_id text not null,
  sha256 text not null unique check (sha256 ~ '^[a-f0-9]{64}$'),
  captured_at timestamptz not null,
  -- Reference to the separately encrypted workbook archive, not its contents.
  archive_reference text not null,
  created_at timestamptz not null default now()
);
create table migration.source_sheets (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references migration.snapshots(id),
  sheet_id bigint not null,
  title text not null,
  position integer not null check (position >= 0),
  metadata jsonb not null default '{}'::jsonb,
  unique (snapshot_id, sheet_id)
);
create table migration.source_rows (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references migration.source_sheets(id),
  row_number integer not null check (row_number > 0),
  -- Redacted cells: preserve raw/formula/effective values; NEVER staff PINs.
  cells jsonb not null check (jsonb_typeof(cells) = 'array'),
  disposition text not null default 'pending'
    check (disposition in ('pending', 'imported', 'quarantined', 'reference', 'header')),
  review_notes text,
  unique (sheet_id, row_number)
);
create table migration.import_runs (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references migration.snapshots(id),
  importer_version text not null,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'reconciling', 'verified', 'failed')),
  reconciliation jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table bomedia.staff (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (btrim(display_name) <> ''),
  -- Login name is deliberately separate from the human display name.
  login_name text not null unique check (login_name = lower(btrim(login_name)) and login_name <> ''),
  pin_hash text,
  disabled_at timestamptz,
  last_login_at timestamptz,
  last_active_at timestamptz,
  credential_revision bigint not null default 0 check (credential_revision >= 0),
  source_row_id uuid unique references migration.source_rows(id),
  created_at timestamptz not null default now()
);
create table bomedia.customers (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (btrim(display_name) <> ''),
  contact text,
  notes text,
  created_at timestamptz not null default now()
);
-- Matching names are candidates for review, never an automatic UNIQUE key.
create index customers_name_lookup on bomedia.customers (lower(btrim(display_name)));

create table bomedia.materials (
  id uuid primary key default gen_random_uuid(),
  legacy_material_id text,
  name text not null,
  category text,
  width_ft bomedia.measurement not null check (width_ft > 0),
  selling_price_per_sqft_kobo bigint not null check (selling_price_per_sqft_kobo >= 0),
  low_stock_threshold_ft bomedia.measurement not null default 20,
  notes text,
  source_row_id uuid unique references migration.source_rows(id),
  created_at timestamptz not null default now()
);
create table bomedia.inventory_rolls (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references bomedia.materials(id),
  legacy_roll_id text,
  item_name text not null,
  width_ft bomedia.measurement not null check (width_ft > 0),
  raw_length_ft bomedia.measurement,
  total_length_ft bomedia.measurement not null,
  remaining_length_ft bomedia.measurement not null,
  waste_length_ft bomedia.measurement not null default 0,
  original_unit text,
  purchase_cost_kobo bigint check (purchase_cost_kobo >= 0),
  selling_price_kobo bigint check (selling_price_kobo >= 0),
  cost_per_sqft_kobo bigint check (cost_per_sqft_kobo >= 0),
  waste_factor bomedia.measurement,
  low_stock_threshold_ft bomedia.measurement not null default 20,
  status text not null default 'Active',
  business_date date,
  source_row_id uuid unique references migration.source_rows(id),
  created_at timestamptz not null default now(),
  check (remaining_length_ft <= total_length_ft),
  unique (id, material_id)
);
create index rolls_material on bomedia.inventory_rolls(material_id);
-- An active roll must belong to its material.
alter table bomedia.materials add column active_roll_id uuid;
alter table bomedia.materials add constraint materials_active_roll_fk
  foreign key (active_roll_id, id) references bomedia.inventory_rolls(id, material_id);

create table bomedia.estimates (
  id uuid primary key default gen_random_uuid(),
  legacy_quote_id text,
  customer_id uuid references bomedia.customers(id),
  client_name_snapshot text,
  business_date date,
  cart_data jsonb not null,
  source_row_id uuid unique references migration.source_rows(id),
  created_at timestamptz not null default now()
);
create table bomedia.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references bomedia.customers(id),
  legacy_sales_id text,
  legacy_transaction_id text,
  estimate_id uuid references bomedia.estimates(id),
  created_by uuid references bomedia.staff(id),
  created_at timestamptz not null default now(),
  unique (id, customer_id)
);
create table bomedia.jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  customer_id uuid not null references bomedia.customers(id),
  material_id uuid references bomedia.materials(id),
  description text not null,
  client_name_snapshot text,
  contact_snapshot text,
  material_name_snapshot text,
  quantity bomedia.measurement not null check (quantity > 0),
  width_ft bomedia.measurement,
  height_ft bomedia.measurement,
  tiled_length_ft bomedia.measurement,
  -- Preserve all eight historical width-slot values, not a guessed dimension.
  legacy_size_values jsonb not null default '{}'::jsonb,
  unit_price_kobo bigint not null check (unit_price_kobo >= 0),
  price_per_sqft_kobo bigint check (price_per_sqft_kobo >= 0),
  amount_kobo bigint not null check (amount_kobo >= 0),
  job_status text not null,
  business_date date,
  occurred_at timestamptz,
  logged_by uuid references bomedia.staff(id),
  logged_by_snapshot text,
  source_row_id uuid unique references migration.source_rows(id),
  created_at timestamptz not null default now(),
  foreign key (order_id, customer_id) references bomedia.orders(id, customer_id),
  unique (id, customer_id)
);
create index jobs_order on bomedia.jobs(order_id);
create index jobs_customer_date on bomedia.jobs(customer_id, business_date);
create index jobs_date on bomedia.jobs(business_date);

-- One row per amount actually received, not per allocation or repeated BATCH TOTAL.
create table bomedia.payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references bomedia.customers(id),
  legacy_payment_id text,
  legacy_batch_id text,
  amount_kobo bigint not null check (amount_kobo > 0),
  business_date date,
  occurred_at timestamptz,
  method text,
  collected_by uuid references bomedia.staff(id),
  collected_by_snapshot text,
  notes text,
  source_row_id uuid unique references migration.source_rows(id),
  created_at timestamptz not null default now(),
  unique (id, customer_id)
);
create table bomedia.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null,
  job_id uuid not null,
  customer_id uuid not null,
  amount_kobo bigint not null check (amount_kobo > 0),
  kind text not null check (kind in ('settlement', 'rounding')),
  source_row_id uuid unique references migration.source_rows(id),
  created_at timestamptz not null default now(),
  foreign key (payment_id, customer_id) references bomedia.payments(id, customer_id),
  foreign key (job_id, customer_id) references bomedia.jobs(id, customer_id),
  unique (payment_id, job_id, kind)
);
create index allocations_job on bomedia.payment_allocations(job_id);
create index payments_customer_date on bomedia.payments(customer_id, business_date);
create table bomedia.job_adjustments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references bomedia.jobs(id),
  -- Positive increases debt; negative reduces it. Never counted as cash received.
  amount_kobo bigint not null check (amount_kobo <> 0),
  kind text not null check (kind in ('legacy_opening_balance', 'write_off', 'correction')),
  reason text not null check (btrim(reason) <> ''),
  business_date date,
  source_row_id uuid references migration.source_rows(id),
  created_by uuid references bomedia.staff(id),
  created_at timestamptz not null default now()
);
create index adjustments_job on bomedia.job_adjustments(job_id);

create table bomedia.expenses (
  id uuid primary key default gen_random_uuid(),
  legacy_expense_id text,
  batch_id text,
  amount_kobo bigint not null check (amount_kobo >= 0),
  business_date date,
  category text not null,
  description text,
  paid_to text,
  payment_method text,
  status text not null,
  logged_by uuid references bomedia.staff(id),
  logged_by_snapshot text,
  paid_by uuid references bomedia.staff(id),
  paid_by_snapshot text,
  paid_at timestamptz,
  occurred_at timestamptz,
  source_row_id uuid unique references migration.source_rows(id),
  created_at timestamptz not null default now()
);
create index expenses_date on bomedia.expenses(business_date);
create table bomedia.receipt_references (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references bomedia.expenses(id),
  storage_provider text not null default 'google_drive',
  external_file_id text,
  url text not null,
  created_at timestamptz not null default now()
);
create index receipts_expense on bomedia.receipt_references(expense_id);
create table bomedia.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  roll_id uuid not null references bomedia.inventory_rolls(id),
  job_id uuid references bomedia.jobs(id),
  expense_id uuid references bomedia.expenses(id),
  kind text not null check (kind in ('opening', 'restock', 'sale', 'waste', 'adjustment', 'reversal')),
  length_delta_ft numeric(18,6) not null
    check (length_delta_ft <> 0 and length_delta_ft > '-Infinity'::numeric and length_delta_ft < 'Infinity'::numeric),
  reason text not null,
  business_date date,
  created_by uuid references bomedia.staff(id),
  source_row_id uuid references migration.source_rows(id),
  created_at timestamptz not null default now(),
  check (kind not in ('sale', 'waste') or length_delta_ft < 0),
  check (kind <> 'restock' or length_delta_ft > 0),
  check (kind <> 'sale' or job_id is not null)
);
create index movements_roll on bomedia.inventory_movements(roll_id, created_at);
create index movements_job on bomedia.inventory_movements(job_id);

-- Account/device fields mirror the preserved phone-access implementation.
-- Atomic session claim/revocation functions will be added before enabling it.
create table bomedia.access_settings (
  singleton boolean primary key default true check (singleton),
  phone_scope text not null default 'off' check (phone_scope in ('off', 'selected', 'all')),
  single_session boolean not null default false,
  policy_revision bigint not null default 0 check (policy_revision >= 0),
  staff_revision bigint not null default 0 check (staff_revision >= 0)
);
insert into bomedia.access_settings(singleton) values (true);
create table bomedia.phone_required_staff (
  staff_id uuid primary key references bomedia.staff(id)
);
create table bomedia.approved_devices (
  id uuid primary key default gen_random_uuid(),
  certificate_sha256 text not null unique check (certificate_sha256 ~ '^[a-f0-9]{64}$'),
  label text not null check (btrim(label) <> ''),
  blocked_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);
create table bomedia.device_assignments (
  device_id uuid not null references bomedia.approved_devices(id),
  staff_id uuid not null references bomedia.staff(id),
  primary key (device_id, staff_id)
);
create index assignments_staff on bomedia.device_assignments(staff_id);
create table bomedia.sessions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references bomedia.staff(id),
  device_id uuid references bomedia.approved_devices(id),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  credential_revision bigint not null check (credential_revision >= 0),
  policy_revision bigint not null check (policy_revision >= 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  check (expires_at > created_at)
);
create index sessions_staff on bomedia.sessions(staff_id) where revoked_at is null;
create index sessions_device on bomedia.sessions(device_id) where revoked_at is null;
create table bomedia.gateway_nonces (
  nonce_hash text primary key check (nonce_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null
);
create index nonces_expiry on bomedia.gateway_nonces(expires_at);
create table bomedia.login_attempts (
  key_hash text primary key check (key_hash ~ '^[a-f0-9]{64}$'),
  attempts integer not null default 0 check (attempts >= 0),
  window_started_at timestamptz not null,
  blocked_until timestamptz
);
create table bomedia.idempotency_requests (
  operation text not null,
  request_key text not null check (btrim(request_key) <> ''),
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  actor_id uuid references bomedia.staff(id),
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (operation, request_key)
);
create table bomedia.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references bomedia.staff(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  -- Redacted changes only: no credentials, tokens or raw request headers.
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_entity on bomedia.audit_events(entity_type, entity_id, created_at);

-- Additional workbook tabs remain source_sheets/source_rows until their formulas
-- and active workflows are mapped. Do not discard empty templates or invent data.
-- No browser role can access these schemas, even if accidentally exposed in API settings.
do $$
declare
  schema_name text;
  role_name text;
  table_row record;
begin
  foreach schema_name in array array['bomedia', 'migration'] loop
    execute format('revoke all on all tables in schema %I from public', schema_name);
    execute format('revoke all on all sequences in schema %I from public', schema_name);
    execute format('revoke all on all functions in schema %I from public', schema_name);
    execute format('alter default privileges in schema %I revoke all on tables from public', schema_name);
    execute format('alter default privileges in schema %I revoke execute on functions from public', schema_name);
    foreach role_name in array array['anon', 'authenticated', 'service_role'] loop
      if exists (select 1 from pg_roles where rolname = role_name) then
        execute format('revoke all on schema %I from %I', schema_name, role_name);
        execute format('revoke all on all tables in schema %I from %I', schema_name, role_name);
        execute format('revoke all on all sequences in schema %I from %I', schema_name, role_name);
        execute format('revoke all on all functions in schema %I from %I', schema_name, role_name);
        execute format('alter default privileges in schema %I revoke all on tables from %I', schema_name, role_name);
        execute format('alter default privileges in schema %I revoke execute on functions from %I', schema_name, role_name);
      end if;
    end loop;
  end loop;
  for table_row in select schemaname, tablename from pg_tables where schemaname in ('bomedia', 'migration') loop
    execute format('alter table %I.%I enable row level security', table_row.schemaname, table_row.tablename);
  end loop;
end $$;

commit;

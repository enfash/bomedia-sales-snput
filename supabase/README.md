# Supabase database work

Status: private Supabase schemas, sale/payment primitives, source staging, scoped expense/estimate/stock/staff rehearsal imports and private accounting-ledger primitives, inactive authentication adapters and restricted collection/read/report APIs. The application still uses Google Sheets. The hosted schemas and private migration ledger were applied on 4 October 2026. All 32 tables have RLS enabled; hosted checks found no schema, table, function or sequence privileges for `anon`, `authenticated` or `service_role` in our three private schemas.

## Files

- `migrations/202610030001_initial_schema.sql`: PostgreSQL foundation. Future revisions go in additional ordered migration files once this version has been applied to a shared database.
- `migrations/202610030002_business_transactions.sql`: atomic sale/stock and payment/allocation functions with locking, computed request hashes and retry protection.
- `migrations/202610040001_inventory_source_precision.sql`: roll categories and fractional-kobo costing rates retained from the source.
- `../scripts/migration/`: read-only export, encryption, inspection, archive verification and staging tools.
- `tests/`: synthetic PostgreSQL and migration tests. No database credentials or live workbook are read.
- `../docs/database-migration-plan.md`: migration, reconciliation and cutover requirements.
- `../docs/database-migration-scope.md`: seven app-backed tabs, retained manual workflows and the current mapping review.

## Verify locally

```sh
npm ci
npm run test:db
```

PGlite runs PostgreSQL locally without Docker. These tests validate SQL execution, foreign keys, money representation, rollback and access restrictions. They do not validate hosted Supabase configuration, simultaneous sessions, pooling, backup recovery or production performance. Hosted schema/access checks have passed; the remaining checks are required before cutover.

## Configure the migration project

1. Use one Supabase project, for example `bomedia`. It is a real PostgreSQL database used for rehearsal while the app stays on Sheets, and can become production after reconciliation and a final import. A second project is not required for this stage. Select a region near the Next.js server deployment. Store the database password in your password manager.
2. Keep the `bomedia` and `migration` schemas out of the Data API's exposed schemas. They are intended for our Next.js server, not browser clients.
3. Copy the direct (or IPv4 session-pooler) connection from **Connect** into `SUPABASE_MIGRATION_DATABASE_URL` in your local, ignored `.env.local`. Never paste the password or URL into chat. This administrative connection is not a runtime app credential.
4. Set `SUPABASE_MIGRATION_PROJECT_REF` to the project's reference. `SUPABASE_DATABASE_URL` is reserved for a future dedicated runtime role; any administrative value currently there must be replaced before connecting app routes. Setting these variables does not switch the app.
5. Run `npm run migration:apply -- --confirm-project YOUR_PROJECT_REF`. The runner applies ordered files and their SHA-256 ledger entries in one transaction, in the private `migration_control` schema. Repeated runs skip identical applied files; changed/missing/backdated history is rejected. It refuses to adopt pre-existing business schemas without a ledger. Never use `db reset` on this hosted project. Applied migration files are immutable: add new files for subsequent changes.
6. Run hosted role/access checks before staging. These passed on 4 October 2026. Reusable hosted authentication/financial verification runners are available; multi-connection transaction tests remain pending.

Connection guidance: [Supabase connections](https://supabase.com/docs/guides/database/connecting-to-postgres). Runtime serverless connections will use transaction pooling without prepared statements. Enforce verified TLS; do not use `rejectUnauthorized: false`.

## Export and stage a workbook

Use Node 22.9 or newer for the CLI. It loads `.env.local` only for commands needing credentials. The inspector never loads credentials or makes network calls. Choose a new name for each export; existing archive directories cannot be overwritten.

Set `MIGRATION_ARCHIVE_PASSPHRASE` privately to a random value of at least 32 characters. Save a copy in your password manager: losing it makes the original archive unrecoverable. The exporter uses existing Google service-account settings with the **spreadsheets.readonly** scope and never calls helpers that can update sheet headers.

```sh
npm run migration:export -- rehearsal-001
npm run migration:verify-archive -- rehearsal-001
npm run migration:inspect -- rehearsal-001
npm run migration:plan -- rehearsal-001
npm run migration:reconcile -- rehearsal-001
npm run migration:rehearse -- rehearsal-001
```

Files go into ignored `migration-data/rehearsal-001/`, with a private directory and owner-only files:

- `workbook.encrypted.json`: the complete Sheets API response, encrypted using AES-256-GCM and a scrypt-derived key. It retains formulas, values, metadata and empty sheets. This is an API snapshot, not a native Google file/revision-history backup.
- `snapshot.json`: staging cells with known credential columns and direct Cashiers formula references redacted. It still contains private business/customer data. The redaction is not a general-purpose secret detector; review the snapshot before upload.
- `manifest.json`: checksums of the snapshot and encrypted archive.
- `inspection.json`: row numbers and issue codes, plus independent monetary column totals. Repeated IDs are flagged, including legitimate multi-job groups, without removing rows. Totals are not certified reconciliation and may be incomplete for missing/invalid source amounts.

`verify-archive` decrypts in memory and verifies that the original reproduces the snapshot, without writing plaintext credentials. `rehearse` applies the migrations to an in-memory PostgreSQL engine and stages the snapshot twice to check repeatability; it makes no network calls and writes no local database. Before the final cutover export, freeze direct workbook edits and application writes; a rehearsal read is not guaranteed consistent while other people edit. Receipt file bytes and unsynced phone queues are separate.

`plan` analyzes the seven current app tabs and writes a new private `mapping-plan-*.json` with candidate IDs, key fields, review blockers, source arithmetic and formula dependencies. It never inserts business data. Other tabs are retained for manual-workflow review because the owner uses them outside the app; they are not treated as unused. Reports are incomplete import plans until customer identity, payment allocations, stock and credentials are reconciled. See the scope document before retiring any spreadsheet workflow.

`reconcile` writes a private `payment-reconciliation-*.json` containing unique full-history payment/job candidates and unresolved groups. It uses exact balances, slot evidence and final totals, refuses ambiguous or incomplete histories and makes no database writes. A unique mathematical reconstruction does not certify receipt identity or customer identity.

After reviewing the inspection, stage to the configured project before live cutover:

```sh
npm run migration:stage -- rehearsal-001 --confirm-project YOUR_PROJECT_REF
```

The confirmation must match `SUPABASE_MIGRATION_PROJECT_REF` and the project encoded in the URL. Use the administrative direct or session-pooler URL on port 5432 without query parameters. TLS verification is enforced; configure `SUPABASE_CA_CERT_PATH` with the Supabase-provided CA if necessary. Never disable verification.

Staging writes only `migration` tables in one transaction. It uploads at most 200 source rows per batch, preserves row numbers, empty sheets and review notes, checks every stored cell on repeat runs and quarantines ambiguous rows. The Postgres.js adapter handles JSON-text parameters without double encoding. Staging does **not** create business sales, payments or staff accounts. Mapping and financial reconciliation follow separately. The original archive stays local; independently back it up before cutover.

## Import reconciled expenses and estimates

```sh
npm run migration:rehearse-independent -- rehearsal-001
npm run migration:import-independent -- rehearsal-001 --confirm-project YOUR_PROJECT_REF
```

The first command runs in local memory, staging and importing twice to check repeatability. The second writes only `bomedia.expenses`, `bomedia.estimates` and one scoped `migration.import_runs` evidence record. It compares the hosted source cells to the verified snapshot, then compares every imported field and the exact expense total before committing. All target rows keep source lineage. Repeated legacy IDs remain separate; absent timestamps are not invented. Staff/customer links remain null with original display names preserved for later matching.

The importer locks its target tables and refuses live runtime transaction history, another snapshot's business rows, changed imported fields, mapping blockers, ambiguous timestamps or unimplemented receipt-link mappings. The current snapshot has no expense receipt links. Replay validates existing data without inserting duplicates or a second evidence record. Existing source dispositions/review notes are preserved. This is a preparatory historical import, not a live backend switch or a general-purpose synchronization command.

## Import reconciled materials and inventory

```sh
npm run migration:rehearse-stock -- rehearsal-001
npm run migration:apply -- --confirm-project YOUR_PROJECT_REF
npm run migration:import-stock -- rehearsal-001 --confirm-project YOUR_PROJECT_REF
```

The local rehearsal includes the expenses/estimates import, then imports stock twice. The hosted importer writes materials, rolls, opening inventory movements and one scoped evidence record. It checks staged source cells, every mapped field, roll/material/active-roll links, per-material capacity/remaining/cost totals, and movement balances before committing. Replays preserve existing data and refuse changed fields, unknown records or mixed snapshots. A runtime transaction record blocks rehearsal imports.

Source lengths are already feet even though `Unit` may say `m`; retain the original unit label without applying a second conversion. Preserve each roll's category and source status. `cost_per_sqft_kobo_exact` retains fractional-kobo rates; the rounded integer column is retained for compatibility. Future costing adapters must use the exact column.

Opening movements represent **remaining stock at the snapshot date**, not original purchases. Only positive balances get a movement; depleted rolls remain without zero movements. Historical sales must be imported without deducting this stock again. Derived revenue formulas are not stock balances: their errors stay in source staging and scoped evidence while future reporting recomputes from stored quantities/prices. This does not certify physical stock or switch the app backend.

## Transaction interfaces

`bomedia.record_sale(request_id, payload)` accepts a customer UUID, optional actor UUID, business date, jobs and optional `initial_payment_kobo`. Each job supplies description, quantity, unit price and amount in integer kobo, optional material/dimensions, and explicit stock allocations (`roll_id`, `length_ft`). Tracked jobs need matching `tiled_length_ft`. The function validates totals, locks rolls in a consistent order and records the sale, deductions, movements, optional receipt and retry result together.

`bomedia.record_payment(request_id, payload)` accepts a customer UUID, selected `job_ids`, positive integer-string `amount_kobo`, business date and optional actor/method/notes. It locks jobs and calculates allocation from authoritative balances in `collection_sequence` order. Import historical jobs in original sheet-row order to preserve that order. Excess is rounding on the last selected job and never offsets unrelated job debt.

Identical retries return the saved result; changed payloads using the same key are rejected. Returned money uses decimal strings. These security-invoker functions have no browser/API grants and are not authentication endpoints. The future server adapter must authenticate every call, including retries, authorize the actor/customer and calculate trusted prices/tiling. Runtime grants must not allow arbitrary table writes to bypass aggregate checks. Other stock mutations and import writes still require their own validation and reconciliation.

## Recorded rehearsal

On 4 October 2026, the saved snapshot below was uploaded to the private hosted `migration` schema. All 5,851 source rows were compared with the local snapshot before committing. The seven SQL migrations are recorded with checksums in `migration_control.applied_migrations`. This is a source-staging import, not a business-data cutover; later Sheets entries are not included in this snapshot.

The private `migration-data/rehearsal-20261003-01/` snapshot contains 16 tabs and 5,851 populated rows, including headers and reference tabs. Its archive decrypts and reproduces the snapshot. Both local staging passes produced the same counts without duplicate source rows. Snapshot files are owner-only and ignored by Git. The generated archive passphrase is in the ignored `.env.local`; save a recovery copy privately.

The inspector flags 2,303 rows, mostly repeated identifiers/timestamps that include legitimate multi-job groups. It preserves these rows for mapping and review, not deletion. Four rows have source formula errors (three Inventory, one Materials). The private inspection report identifies their row numbers. Tiny numeric formula residuals are rounded to integer kobo using decimal-text arithmetic. Sales/payment balances remain uncertified; scoped expense/stock checks establish correspondence with the snapshot, not independent verification of the business records or physical stock.

The expenses/estimates local rehearsal passed field/total checks and repeat import. On 4 October 2026, the hosted import committed 146 expenses and 3 estimates with all field/total comparisons passing. A hosted replay also passed without duplicate records or duplicate scoped import evidence. Overall migration remains `reconciling`; business sales/payments are still empty. Payment reconstruction produced 1,300 unique-history candidates and 845 unresolved payment rows; no candidate allocations were imported.

The stock import also committed on 4 October: 14 materials, 176 rolls and 31 opening movements from the October 3 snapshot. Full field, per-material aggregate and opening-balance comparisons passed locally and on Supabase. Hosted replay passed without duplicate data or evidence. Seven derived-revenue error cells across four source rows remain recorded, while their underlying quantities are preserved and reconciled. The live app and manual spreadsheet workflows remain on Sheets.

## Remaining work before use

- Copy the encrypted archive and manifest to an independent backup destination; preserve the passphrase in a password manager.
- Complete the remaining customer/sales/payment mappings beyond the imported expenses, estimates, materials, rolls and staff. Resolve customer/payment ambiguity and verify financial and stock workflows before cutover.
- Verify hosted concurrent transactions. Add expense, waste, restock and status-change transactions before switching those routes.
- Production activation/acceptance for the implemented PIN hashing, throttling and revocable sessions; physical-device gateway enforcement and nonce expiration remain pending.
- Least-privilege runtime role/policies, Next.js data adapters, bigint-safe serialization, stable IDs in offline queues and parity testing.
- Automated encrypted backups, tested restoration, usage monitoring and reconciled cutover.

Keep the independent phone-access checkpoint until its implementation has been ported and verified. Do not merge its Redis backend blindly into the PostgreSQL implementation.

## Prepare the sales/payment review packet

```sh
npm run migration:review -- rehearsal-20261003-01
```

This local-only command validates the snapshot checksums, then writes a new owner-only directory containing `start-here.md`, `review.md` and `evidence.json`. The current snapshot produces 334 cases: 301 payment-history cases covering 845 unresolved payment rows, plus 33 additional incomplete-sales cases. Receipt and duplicate-ID evidence is linked across cases. No source or database records change, and review answers cannot execute imports or adjustments. See `docs/database-migration-scope.md` for the review boundary and remaining identity/receipt work.

## Accounting foundation

The fourth migration adds private accounts, settings, journals and journal lines, plus exact job/account balance views. `record_accounted_payment` records a receipt, allocations and balanced accounting lines atomically, retaining all unpaid kobo. No opening date is configured or journals posted by the migration. The current app still uses Sheets. See `docs/accounting-foundation.md` for the tested behavior, approval boundaries and remaining runtime/cutover work. Do not grant these security-invoker primitives to browser/API roles or use an administrative connection as the live app runtime.

## Staff import

```sh
npm run migration:rehearse-staff -- rehearsal-20261003-01
npm run migration:import-staff -- rehearsal-20261003-01 --confirm-project <project-ref>
```

These commands verify the encrypted staff source and import only salted PIN hashes, never plaintext credentials. Local rehearsal runs twice without contacting Supabase. The hosted import has migrated two staff accounts; both source PINs verified. See `docs/staff-migration.md` for the pre-cutover guard, missing-PIN behavior and implemented but inactive login/session adapters.

## Runtime and recovery checkpoint

Seven migrations are now applied, including staff authentication, financial capabilities and accounted tracked sales. Restricted auth/financial server logins are provisioned privately. Hosted synthetic authentication, collection and tracked-sale checks passed with all test changes rolled back. See [financial runtime](../docs/financial-runtime.md) for the new inactive API contracts and remaining screen/write integration, and [database recovery](../docs/database-recovery.md) for encrypted local backup/restore verification and independent-backup requirements. The live app still uses Sheets; no opening journals or accounting activation have occurred.

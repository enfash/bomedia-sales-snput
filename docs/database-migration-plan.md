# Supabase migration plan

Updated 4 October 2026. Decision: Supabase PostgreSQL, starting on Free and budgeting for Pro as the business grows. Neon is out of scope. The user's Supabase project is connected through its IPv4 session pooler with certificate-verified TLS. Seven schema/capability migrations have been applied; no application route has been switched.

## Monday start priority

On 4 October the owner requested completion of the migration that day to support accounting from Monday, 5 October, with historical corrections continuing afterward. Prioritize verified opening balances and reliable new transactions; full reconstruction of old payment allocation history is not required where outstanding balances can be established independently. Uncertain amounts remain identified and unconfirmed, never silently zeroed or treated as reconciled. The target does not remove runtime, transaction, backup or cutover checks. See [the Monday cutover plan](monday-accounting-cutover.md) for scope, inputs and remaining work. No production switch has occurred.

## Current implementation status

- Scope clarified on 4 October: the owner actively uses extra tabs manually. Prioritize the seven app-backed tabs, but retain the remaining nine for manual-workflow review and future features. Do not classify them as unused. See `database-migration-scope.md` for tab mappings, dependency/cutover requirements and reconciliation findings.
- Added a local-only mapping planner with deterministic source IDs, field validation, payment/job candidates and batch/audit comparisons. It writes private review reports without creating business records or certifying balances.
- Added exact payment-history reconstruction using before/after balances, slot evidence, source chronology and final slot totals. It found unique candidate histories for 1,300 payment rows (890 initially ambiguous); 845 remain unresolved. This is review evidence, not approval to import payments or merge customers.
- Imported 146 expenses and 3 estimates from the staged October 3 snapshot into Supabase on October 4. Every mapped field, source lineage and the expense total matched before commit. Missing historical timestamps remain null; repeated expense IDs remain separate rows. Customer/staff links remain unset pending identity migration. Sales and payments are not imported yet; staff migration is recorded below.
- Imported 14 materials, 176 rolls and 31 opening stock movements from the same snapshot. Every mapped field, per-material stock/cost total, active-roll link/price and opening balance matched. Depleted rolls remain without zero movements. Source feet values and original unit labels are both preserved. `202610040001_inventory_source_precision.sql` adds roll categories and exact fractional-kobo cost rates; integer-kobo cash fields are unchanged. Historical sales import must not deduct the opening stock again.
- Imported the two staff accounts from the encrypted October 3 source, with salted scrypt PIN hashes and source lineage. Both configured PINs verified; neither requires a reset. No plaintext credentials are persisted by the importer. Staff authentication/session adapters and restricted hosted authentication are implemented but inactive; see [staff migration boundaries](staff-migration.md).
- Added and applied the private accounting foundation: 15 chart accounts, inactive bookkeeping configuration, balanced/immutable journals, linked standalone reversals and atomic receipt-to-ledger posting. Underpayments remain exact debt down to one kobo. No opening balances or journals have been posted; authenticated adapters, other business journals and reporting remain pending. See [accounting rules and implementation boundaries](accounting-foundation.md).
- Prepared `supabase/migrations/202610030001_initial_schema.sql`: private business and migration schemas, relational keys, exact integer-kobo money, source lineage and staff/device tables.
- Added a local PostgreSQL-engine test suite using PGlite. It uses synthetic fixtures and never connects to Supabase or Google Sheets.
- Added `202610030002_business_transactions.sql`: sale/stock and payment/allocation functions with row locks, payload hashing and atomic retry protection. They are server-only primitives, not yet connected to application routes.
- Added read-only workbook export with an encrypted raw archive, checksums, PIN redaction, inspection and repeatable staging to the private migration schema. On 4 October 2026, the saved 3 October snapshot was staged on Supabase: 16 tabs, 5,851 rows and 2,303 review-flagged rows. Business mapping beyond expenses/estimates/materials/rolls and full financial reconciliation remain pending; business sales/payments have not been imported.
- Added an atomic migration runner with a private checksum ledger. All seven SQL migrations are applied on Supabase; repeated application skips unchanged files and refuses conflicting history. Hosted checks verified RLS on all 32 tables and no access for anonymous, authenticated or service API roles to the private schemas/tables/functions/sequences.
- Restricted authentication and financial collection/read/report capabilities are implemented and hosted-tested without activation. Trusted tracked-sale pricing/tiling and sale/material-cost/initial-receipt journals are also implemented and hosted-tested. Remaining expense/stock/estimate/non-stock mutations, correction journals, screen integration, hosted concurrency, independent backups/monitoring and cutover remain. The administrative connection and downloaded CA certificate are configured privately; separate restricted authentication and financial runtime logins are now provisioned privately.
- Existing phone-access code and the original assessment are preserved locally on `codex/phone-access-checkpoint`. That branch is not merged into this migration branch. The new access tables account for its policy, session, device and replay-protection requirements.
- The live Next.js app continues using Google Sheets and Google Drive.

The local rehearsal at `migration-data/rehearsal-20261003-01/` captured 16 tabs and 5,851 populated rows, including headers/reference data. Archive decryption, two repeatable in-memory staging passes and the hosted staging upload succeeded. Hosted staging compares every stored source cell before committing. There are 2,303 review-flagged rows, including legitimate repeated job IDs and timestamps; four source rows have formula errors (three Inventory, one Materials). These are structural observations, not certified balances. The encrypted archive and its manifest need an independent backup, and the locally generated passphrase in `.env.local` needs a private recovery copy. The October 3 snapshot is for rehearsal and does not include subsequent live entries. See `supabase/README.md` for commands and boundaries.

## Architecture decision

Keep the existing screens, server authentication and offline queue. Use Supabase as managed PostgreSQL through server-side database connections. Initially keep receipt files in Google Drive and retain their references. The browser continues calling our Next.js APIs; a Supabase Auth account or client-side database key is not needed for this phase.

A transaction must create a sale, its jobs and all stock movements together. A payment transaction must create the cash receipt and its job allocations together. Offline request keys and payload hashes must be persisted in that same transaction. Using separate REST writes does not provide this guarantee.

The `bomedia` schema contains business and access data; `migration` contains redacted source records and import evidence. Neither schema should be exposed through the Supabase Data API. All initial tables have RLS enabled with no client policies, and browser/service API roles have no schema grants. A dedicated, least-privilege server database role and its policies will be introduced with the authenticated server adapter; the migration owner is for setup, not normal app requests. [Private schemas](https://supabase.com/docs/guides/database/tables), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

Use the shared transaction pooler for serverless application connections, with prepared statements disabled. Use the direct connection for migrations/backups where IPv6 is available, or the session pooler on IPv4-only machines. Copy the actual connection details from the project's Connect dialog. Enable certificate-verified TLS and keep all credentials server-only. [Connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres).

## Budget, capacity and backups

As checked on 3 October 2026, Free includes a 500 MB database, unlimited API requests, and 5 GB egress. Unlimited requests still share finite CPU, memory, connection and bandwidth capacity. Free projects may pause after a week of inactivity and do not include automatic backups. Pro starts at USD 25/month with one Micro project covered by compute credits, 8 GB database disk and daily backups retained for seven days. Add-ons, larger compute and overages can increase that total. [Supabase pricing](https://supabase.com/pricing).

Start on Free for implementation and a measured trial. Before using Free for live business records, automate daily encrypted database exports to an independent destination, retain them, alert on failures and successfully restore one. Drive receipt files need their own retention/recovery process; database backups preserve references, not those files. [Supabase backup guidance](https://supabase.com/docs/guides/platform/backups).

Our proposed review thresholds are 350 MB of database size or 3.5 GB monthly egress (70% of the Free allowances), recurring slow queries/connection pressure, or a business requirement for managed backups. Measure actual usage after import and over a representative working week; do not infer capacity from row count alone. Upgrade ahead of exhaustion. These are internal review thresholds, not provider limits, and monitoring automation is not implemented yet.

## Initial schema design and boundaries

- UUIDs are canonical IDs. Legacy sales, transaction and expense IDs are retained without uniqueness assumptions; repeated IDs must not silently merge rows.
- Money uses signed/unsigned-as-constrained `bigint` kobo. API adapters must serialize bigint safely as decimal strings or explicitly range-check before conversion to JavaScript numbers. Dimensions use bounded decimal feet. Existing width-slot source values remain available when a dimension cannot be reconstructed.
- Orders group jobs; each job retains its own amount, business date, status and customer snapshot. Names are not customer primary keys.
- Payments represent actual cash received once. Allocations split it across jobs and distinguish settlement from rounding. Composite foreign keys prevent assigning one customer's money to another customer's job. The new payment function locks jobs and reconciles allocation totals; arbitrary direct table writes bypass those aggregate checks and must not be granted to the future runtime role.
- Adjustments change a job's balance with an explicit reason; they are not cash receipts. Establish opening balances from supporting evidence; unresolved legacy payment allocations remain preserved for review. An opening balance is not permission to invent cash or post an unexplained adjustment. Do not count a Sales payment cell again when its Payments audit record is imported.
- Inventory rolls retain an opening quantity and subsequent signed movements. The scoped importer now reconciles and imports opening quantities from the snapshot; the new sale function atomically maintains subsequent stock deductions and movements. Waste, restock and adjustments still need dedicated write functions and reconciliation. Fractional-kobo costing rates are retained separately from rounded compatibility values.
- Unknown historical dates remain null with their source evidence. `created_at` is the database insertion time, never a fabricated historical transaction time. Preserve known Africa/Lagos business dates as `date`.
- No credential is imported verbatim. Hash PINs with an appropriate password KDF in the importer; null hashes require a PIN reset. Session tokens and gateway nonces are represented by hashes. Login throttling and revocable-session enforcement are implemented but inactive; external physical-device verification is still pending.
- Preserve all extra workbook tabs as redacted source rows and archived formulas first. Dedicated assets/consumables/budget tables and editable workflows follow only after their business rules are mapped.

## Historical read-only inventory (16 September 2026)

The earlier Google Sheets API audit used read-only credentials/scopes and returned these counts of nonempty rows after the first row. Counts are a live observation, not a frozen migration snapshot; irregular layout tabs need separate interpretation. No customer records, PINs, or credentials are included here.

| Tab | Nonempty rows |
| --- | ---: |
| Sales | 2,800 |
| Payments | 1,865 |
| Expenses | 131 |
| Inventory | 155 |
| Materials | 14 |
| Cashiers | 2 |
| Estimates | 3 |
| Consumables & Inventory | 15 |
| Assets | 17 |
| Capital Injections | 4 |
| Budget & Profit/Loss (P&L) | 13 |
| Sheet1 | 7 |
| Cost of materials from supplier | 17 |
| Calculator | 14 |
| Dashboard | 0 |
| Power & Maintenance Log | 0 |

Preserve all 16 tabs, including empty templates and irregular calculation/reference tabs. These row counts do not measure database bytes, request volume, or file storage.

Observed identifier issues:

- Sales: 48 rows lack Sales ID; 187 lack TRANSACTION ID; 108 lack TIMESTAMP. Existing IDs and timestamps also repeat. Some repeated IDs intentionally group line items, so they must not be deduplicated blindly.
- Payments: PAYMENT ID has one repeated occurrence. Inspect the associated records before deciding whether it represents a duplicate payment, an identifier collision, or another legitimate case.
- Expenses: 29 rows lack EXPENSE ID and 11 lack TIMESTAMP; both also repeat.
- Inventory Roll IDs and Materials Material IDs were complete and unique in this observation.

This is a structural audit, not a completed reconciliation of cash, debt, or inventory. No financial totals have yet been certified for migration.

## Proposed data model and behavior

Use UUID primary keys; retain original identifiers separately for traceability. Suggested groups:

| Group | Tables / purpose |
| --- | --- |
| Sales | customers, sales/orders, sale_items/jobs; preserve multi-line grouping |
| Collections | payments, payment_allocations, adjustments; distinguish money received from rounding |
| Stock | materials, inventory_rolls, inventory_movements |
| Operations | expenses, estimates, receipt_references |
| Additional workbook data | assets, consumables, capital_injections, budgets; retain reference/calculator snapshots until their intended behavior is mapped |
| Access | staff, sessions, approved_devices, device_assignments, access_settings, gateway_nonces |
| Reliability | idempotency_requests, audit_events, import_runs, legacy_record_mappings |

Implementation requirements:

- Use exact decimal money values or integer kobo, appropriate decimal stock units, and explicit dates/time zones. Preserve Africa/Lagos business dates; do not reinterpret date-only fields as arbitrary UTC timestamps.
- Preserve raw cells, formulas, and evaluated results in a restricted migration snapshot. Implement calculations as tested server logic or database views. A CSV-only import is insufficient for preserving workbook behavior.
- Do not double-count existing Sales payment columns plus the Payments audit history. Reconcile both first. Where historical detail is absent, use explicitly labeled legacy adjustments/opening balances without inventing transaction dates.
- Do not sum BATCH TOTAL once per payment allocation. Preserve existing rules for rounding, job debt, and customer credit unless a separate business change is approved.
- Review customer name matches; names alone are not safe permanent identifiers.
- Hash staff PINs during import, enforce server-side attempt limits, and avoid plaintext credentials in reports or application logs. Restrict access to any historical backup containing PINs.
- Use one database transaction for sale creation plus stock deductions, and for payment creation plus allocations. Lock affected stock/job rows and enforce request uniqueness so simultaneous requests and offline retries do not apply twice.
- Replace row-index identifiers in API payloads and offline queues with stable IDs. Retain a source-tab/row mapping tied to a known snapshot; reject ambiguous old references instead of guessing after sheet rows have moved.
- Use pooled server-side connections and transaction-capable database access. A series of independent HTTP database writes is not automatically one transaction. Browser clients must never receive privileged database credentials.
- Implement session claims atomically per staff member, enforce blocked-device checks on protected requests, and store one-use gateway nonces with expiry. This can replace the Upstash implementation preserved on `codex/phone-access-checkpoint`; Redis is not inherently required. Physical-phone identity still requires the separately documented enrollment/gateway setup.

## Migration sequence

1. **Preserve and map.** Export the complete workbook, including formulas and irregular tabs. Inventory Drive receipt links and any other configured spreadsheets/files. Record checksums and source mappings. Confirm whether people edit Sheets directly and which extra tabs need editable app screens.
2. **Prepare PostgreSQL while Sheets stays live.** Use the same real Supabase project for rehearsal and eventual production; a second project is not required now. Add schema migrations, repeatable import scripts, and a server data layer. Keep current UI behavior initially. Import every source row once with lineage; quarantine ambiguous mappings for review. Replace rehearsal data with a final reconciled import before cutover, with no live PostgreSQL writes during that replacement.
3. **Reconcile and exercise workflows.** Compare source/import row counts, monthly sales and expenses, job/customer balances, collections, rounding, and stock per roll. Account for every discrepancy. Test simultaneous sales, duplicate payment requests, offline retries, staff session conflicts, phone blocking, and receipt access. Restore a backup into a separate database successfully.
4. **Validate cost and operational readiness.** Measure realistic usage including session checks and admin screens. Configure restore retention plus an independent encrypted export/backup, and test recovery. Decide acceptable data-loss and recovery-time windows before going live.
5. **Cut over in a planned quiet window.** Sync pending entries on every staff device, freeze application and writes to the app-backed source tabs, take a final consistent snapshot, import/reconcile it, then switch server reads and writes to PostgreSQL. Account for any manual-sheet dependencies during the freeze. Hold any unreachable phone's old queue for validated migration rather than silently discarding it. Release staff after acceptance checks.
6. **Retain and monitor.** Make migrated core tabs read-only to staff; keep manual-workflow tabs editable until their features are ported. The manual budget and calculator depend on core tabs, so implement those features or verified one-way reporting exports before cutover. PostgreSQL is authoritative for migrated records. Monitor failed requests, payment totals, balances, stock, and database usage. Avoid two independently editable masters.

Rollback is simple only before PostgreSQL receives new business writes. After that, stop writes and reconcile/export the new records before reverting; switching back to the old sheet alone would lose those records.

Receipt file contents are separate from database rows. Initially retaining Drive and working links is a deliberate part of the architecture. If a complete exit from Google is wanted, separately copy and verify file bytes, permissions, and replacement links. Likewise, unsynced sales on phones must be collected or explicitly accounted for; they are not present in the workbook export.

## Decisions remaining before implementation/cutover

- The owner edits extra tabs directly because their features are absent from the app. Review priorities and detailed requirements for those manual workflows, and resolve the budget/calculator dependencies before core cutover.
- What are actual working hours, always-open dashboard usage, and acceptable backup/recovery windows?
- The Supabase project and secure administrative connection are ready. Check latency against the eventual Next.js deployment region before production use.
- Decide how the preserved phone-access feature should be integrated before production cutover.

The user provisioned the project. This work has not purchased a paid service or switched live application traffic to PostgreSQL.

Latest execution checkpoint: [migration handoff](migration-handoff.md).

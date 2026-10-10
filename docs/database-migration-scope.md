# Migration scope and manual workflows

Updated 4 October 2026. The owner confirmed that the extra tabs are used manually because their workflows are not implemented in the app. They must not be classified as unused or deleted. Preserve all 16 tabs; migrate the current app workflows first, while keeping the manual workflows available.

## Current app scope

These seven tabs are directly referenced by the API routes and inventory helpers. The saved October 3 snapshot has 5,750 populated rows across them, including seven header rows (5,743 data rows).

| Source tab | Data rows | PostgreSQL mapping |
| --- | ---: | --- |
| Sales | 3,257 | Orders, individual jobs, customer identity candidates |
| Payments | 2,145 | Cash receipts and job allocations, preserving batch grouping |
| Expenses | 146 | Expenses and Drive receipt references |
| Inventory | 176 | Material rolls and reconciled opening stock movements |
| Materials | 14 | Material definitions and active-roll relationships |
| Cashiers | 2 | Staff accounts; credentials require a separate secure migration |
| Estimates | 3 | Quotes with preserved cart JSON |

Evidence: `app/api/sales`, `payments`, `payments/batch`, `expenses`, `inventory`, `materials`, `cashiers`, `auth/cashier-login`, `estimates`, `digest`, and `lib/inventory-deduction.ts`. The database is relational; a source tab need not correspond to one database table.

## Manual workflows to retain and review

The remaining nine tabs have 101 populated rows including headers. Their full contents are already in the encrypted archive and private staging tables. Their names and headers suggest the areas below; these are scope candidates, not approved UI specifications.

| Source tab | Workflow to review |
| --- | --- |
| Consumables & Inventory | Consumable purchases, stock and reorder levels |
| Power & Maintenance Log | Power, fuel, generator hours and maintenance |
| Assets | Equipment costs, acquisition costs and maintenance |
| Capital Injections | Owner/investor funding recorded separately from sales |
| Budget & Profit/Loss (P&L) | Budgets and actual income/expense reporting |
| Sheet1 | Recurring-cost calculations |
| Cost of materials from supplier | Supplier cost reference |
| Calculator | Stock and supplier-price calculations |
| Dashboard | Empty in this snapshot; determine whether a dedicated sheet is still needed |

Do not bulk-promote these sheets into generic business tables or mark their manual workflows retired. Review the required fields, formulas and screens before implementing each area. Empty templates do not justify inventing records.

## Dependencies at eventual cutover

The current app tabs contain no detected explicit references to the manual tabs. However, the manual budget tab references Sales and Expenses, and Calculator references Inventory and the supplier-cost tab. Those tools would become stale if their source tabs stopped updating.

Before switching the app, either implement the dependent manual workflows in the app or provide reconciled, one-way PostgreSQL-to-Sheets reporting exports for the core tabs they use. Core exported tabs must become read-only to staff; manual tabs may remain editable. Do not make the entire workbook read-only while manual workflows still depend on it. Formula scanning is a dependency aid, not a complete formula interpreter; dynamic/external references and manual copying need review too.

## Mapping review

Run `npm run migration:plan -- rehearsal-20261003-01`. This is a local-only analysis of the checksum-verified snapshot. It does not load credentials, contact Supabase, modify the source snapshot or insert business records. Each run writes a new owner-only `mapping-plan-*.json` alongside the private snapshot, preserving earlier reviewed reports.

The report creates deterministic candidate IDs per snapshot/source row, maps key fields, validates dates and integer-kobo amounts, proposes material/roll references, and records candidate payment/job links. Repeated Sales IDs are retained as separate jobs. Matching names are not merged into customer accounts automatically. Credential data is not restored into the report.

In the current snapshot:

- 1,593 payment rows reference a Sales ID shared by multiple jobs. These need allocation resolution, not deletion of repeated jobs.
- 10 payment rows have no matching Sales ID; 30 have zero amounts; two share a payment ID. Categories can overlap.
- One of 222 payment batches differs by **one kobo** between its declared total and the sum of its 31 allocations. Preserve the discrepancy for an explicit rounding decision.
- Among 1,800 Sales-ID groups, 87 have different Sales additional-payment and audit totals (86 exceed half a naira); one other group has ambiguous customer identity. Matching group totals alone do not prove individual allocations or customer identity.
- 48 Sales rows have missing required customer/description fields; some rows lack both.
- Expenses, materials, rolls, estimates and staff passed the current field-level checks. This is not proof that complete import mappings, credentials, stock balances or business rules are ready for cutover.

The report separates initial payments, additional-payment columns and payment-audit allocations. Audit rows can describe cash already included in Sales; adding these totals would double count collections. Batch totals are compared once per batch. Overpayments remain separate from other jobs' debt. No opening adjustment, customer merge or allocation is invented to make totals match.

## Payment history reconstruction

`npm run migration:reconcile -- rehearsal-20261003-01` writes a private, local-only review report. The solver follows exact before/after balances, payment-slot annotations/types, chronology and final per-job slot totals. Settlement and rounding rows emitted for one step share a balance transition; they are paired only with matching batch metadata and consecutive IDs. Legacy after-balances clamped to zero are recorded explicitly; their unsplit rows are not automatically classified as pure settlement.

For this snapshot, 1,300 of 2,145 payment rows have one complete candidate history, including 890 of the 1,593 initially ambiguous rows. No row-order tie-breaker is used to pick between multiple valid histories. The other 845 rows remain unresolved:

| Reason | Payment rows |
| --- | ---: |
| Complete balance/slot history does not match | 481 |
| Duplicate identity, zero amount or batch discrepancy needs review | 129 |
| Multiple complete histories fit | 119 |
| Audit total differs from Sales additional-payment totals | 104 |
| No matching Sales reference | 10 |
| Conflicting customer names | 2 |

This reconstruction is evidence for review, not independent certification of the source. Customer identity, initial receipt grouping and receipt identity for old unbatched payments remain separate requirements. No payment or balance has been changed.

## Grouped review packet

`npm run migration:review -- rehearsal-20261003-01` generates a new private `payment-review-<timestamp>/` directory from the checksum-verified snapshot. `start-here.md` presents the receipt discrepancy and five small cases; `review.md` contains the case index, source rows, exact amounts, questions and linked receipt/duplicate-ID evidence. `evidence.json` retains full mapped fields, source UUIDs, warnings and candidate histories. The command runs locally without loading credentials or contacting Sheets/Supabase. Files are owner-only and excluded from Git.

The October 3 snapshot produces **334 cases**: **301 payment-history cases covering all 845 unresolved payment rows exactly once**, plus **33 additional cases for incomplete Sales details**. The 48 Sales rows with field blockers are included across these cases. There are 18 related receipt batches and one duplicate-payment-ID group; their full rows are repeated only as linked context, not additional money to sum. The batch discrepancy is ₦173,450.00 recorded versus ₦173,449.99 allocated, a one-kobo difference requiring an explicit evidence-backed decision.

Case IDs are stable for a snapshot and its source rows. Missing Sales IDs remain separate; equal customer names do not merge cases or establish customer identity. Responses should cite a case ID, confirmed facts and supporting evidence. Review notes do not authorize corrections, resolve flags automatically or make the 1,300 candidate payment histories import-ready. Snapshot row numbers must not be applied blindly to a live sheet that may have been sorted or edited since capture.

## Imported independent records

On 4 October, 146 expenses and 3 estimates were imported from the October 3 snapshot into Supabase. The scoped importer checked every mapped field against source lineage and verified the exact expense total in the same transaction. Hosted replay confirmed no duplicate records or scoped import evidence. Duplicate legacy expense IDs were preserved as distinct source rows. It retained null historical timestamps and original staff/customer display names; identity links are still pending. Cart JSON is retained unchanged, with legacy material references pending the app adapter.

The current snapshot has no expense receipt URLs. The importer refuses a snapshot with receipt links until their mapping is implemented, rather than silently dropping them. Rehearsal imports are blocked after runtime transaction records exist, or when expenses/estimates from another source or snapshot are present. Existing changed business fields cause rollback. Import evidence is scoped to these two tabs and does not resolve other source-review flags.

## Imported materials and inventory

On 4 October, 14 materials, 176 rolls and 31 opening movements from the October 3 snapshot were imported into Supabase. Source-to-row comparison passed for every mapped field; material counts, capacity, remaining length, purchase costs and active-roll links/prices matched their source rolls. The movement ledger equals each roll's remaining quantity. Zero-balance rolls stay present without zero movements.

The original `m` unit label is retained, but the source lengths are already feet (for example, 164.04 ft), so no second unit conversion is applied. Roll categories and statuses are preserved. Cost-per-square-foot rates retain fractional kobo in a new exact-rate column, alongside the rounded compatibility column. Future costing code must read the exact rate.

Seven revenue-formula error cells across four source rows remain in the preserved source and evidence. These are calculated reporting values, not physical-stock inputs; importing quantities does not erase them or claim to repair Sheets. Reporting adapters must recompute revenue values from valid quantities and prices.

Opening movements represent remaining stock on the snapshot's Lagos business date. Historical sales must be imported without consuming that stock again. This verifies the copied snapshot, not a physical stocktake or entries logged after October 3.

Next: establish opening balances and customer/job identity, preserve unresolved payment history for continued review, complete runtime accounting mappings and adapters, then resolve manual-feature cutover dependencies. Remaining business imports stay gated on their reconciliation; the live application still uses Sheets.

## Staff credentials

The two staff accounts from the October 3 snapshot were imported on October 4 with salted scrypt PIN hashes. Both PINs verified; no reset is required for this snapshot. Historical presence is preserved in source staging, not treated as account-disable status or an active login. Staff runtime login and session enforcement remain pending. See `staff-migration.md` for verification and replay safeguards.

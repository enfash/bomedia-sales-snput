# Monday accounting start and PostgreSQL cutover

Updated 4 October 2026, Africa/Lagos. The owner wants to begin new accounting on Monday, 5 October 2026, and complete the migration on Sunday. This is the target, not a declaration that production is ready or a guarantee of completion. Historical corrections may continue afterward with an audit trail.

## Changed priority

Preserve the entire legacy workbook and its evidence. Reconstructing all 334 historical review cases is no longer a prerequisite to building the new accounting workflow. Prioritize cases affecting outstanding customer debts, customer deposits/credits, supplier debts, cash, bank balances and stock at the opening date. Do not interpret unresolved records as zero, confirmed settlement, bad debt or authorization for an automatic adjustment.

Opening balances require explicit amounts and supporting evidence or an explicitly recorded provisional status. A report calculated from Sheets is a proposal, not a verified opening balance. Any provisional balance must remain visible as such and cannot be presented as a reconciled account. Matching names alone must not merge customers. Carry forward outstanding jobs separately where their identity is known, including credits and deposits without silently netting unrelated debt.

The October 3 snapshot is rehearsal evidence. The hosted expense, estimate and stock imports are not final opening books. Take a fresh snapshot at the actual handover; reconcile movements since rehearsal and account for pending phone queues. Historical expenses and collections must not become new-period expenses or collections merely because they were imported. Historical jobs must not deduct the opening stock a second time.

## Essential work before live PostgreSQL writes

- [ ] Implement the PostgreSQL runtime connection and least-privilege server access; keep administrative credentials out of normal app requests.
- [ ] Move staff authentication and required account management to PostgreSQL, preserving login access and secure PIN handling.
- [ ] Implement and test read/write adapters for sales, collections, expenses, estimates, stock and the reports used in daily work.
- [ ] Use stable job/customer IDs, atomic sale/stock and receipt/allocation writes, and persistent retry protection. Migrate or safely hold legacy offline queue entries rather than guessing row references.
- [ ] Implement the opening-balance model and reports, distinguishing old history, opening amounts and new transactions. Resolve or explicitly track disputed opening amounts.
- [ ] Complete accounting integration. Private accounts, balanced journals, immutable posting, standalone reversals and atomic collection journals are implemented; bank setup, authenticated adapters, sale/expense/stock journals, valuation and business correction workflows remain. See `accounting-foundation.md`.
- [ ] Map real cash/bank accounts and establish closing cash, bank balances, customer debts/credits, supplier debts, inventory quantities/value, equipment, loans and owner balances to the extent required for the opening books. Unavailable amounts stay unconfirmed.
- [ ] Preserve manual-sheet workflows and supply current data for Budget/Calculator dependencies through implemented features or verified one-way core-data exports.
- [ ] Complete meaningful end-to-end checks: login, new sale, part payment, collection of an old debt, customer credit handling, expense, stock movement, simultaneous writes and repeated offline submission. Verify reports do not double-count receipt allocations or legacy history.
- [ ] Back up the final data and verify recovery. Test deployment configuration and hosted runtime permissions.

## Handover sequence

1. Agree the quiet window and Monday opening time with the owner. Do not freeze staff activity prematurely.
2. Sync pending entries on each available staff device; account explicitly for unavailable devices and their queues.
3. Freeze writes to the migrated app workflows, take a final consistent snapshot and reconcile it with the agreed opening position.
4. Load the final records and verify source lineage, row coverage, opening balances and stock. Preserve historical uncertainties without fictional receipts or adjustments.
5. Deploy the tested adapters and confirm production configuration. One system is authoritative for each migrated workflow; do not allow two independent financial masters.
6. Run live acceptance checks and release staff. Retain the manual tabs and archive/source access needed for unfinished workflows.
7. Review the first day's receipts, cash/bank activity, customer balances and stock. Correct posted accounting with linked, attributable reversals/corrections; preserve the original record.

After PostgreSQL receives business writes, reverting to the old Sheet alone would lose those new records. Stop writes and reconcile/export new activity before any rollback.

## Inputs still needed from the owner

- Monday opening is 9:00 a.m. Africa/Lagos; the owner says customers sometimes arrive earlier. The last expected use of the app/Sheets on Sunday and earliest possible transaction time are still needed.
- Which staff devices may contain unsynced entries.
- Cash and bank account names and balances at close, without passwords or login credentials.
- Confirmation/evidence for outstanding customer debts, deposits/credits and supplier debts; identify disputed or unknown amounts explicitly.
- Inventory count/value and other opening account details where the historical records are insufficient.

The accounting start date and technical switch are separate milestones. If deployment checks are unfinished, retain an auditable record of every Monday transaction in the working system, then migrate those records exactly once. Do not label an untested or unreconciled cutover complete merely to meet the date.

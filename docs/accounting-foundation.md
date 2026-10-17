# Accounting foundation and short-payments

Updated 4 October 2026. Private PostgreSQL primitives are implemented and tested. The live screens are not connected yet. A restricted server capability now wraps accounted collections; generic journal and legacy payment primitives remain private. Sheets remains the live backend.

## Default collection rule

Record the amount actually received. Keep every positive unpaid balance outstanding, including one kobo; do not treat a customer's decision to pay a round number as permission for a discount or write-off.

| Bill | Actual receipt | Remaining debt |
| --- | --- | --- |
| ₦173,449.99 | ₦173,000.00 | ₦449.99 |
| ₦173,449.99 | ₦173,090.00 | ₦359.99 |
| ₦173,449.99 | ₦173,449.98 | ₦0.01 |

A later collection reduces the same debt; it is not another sale. A future owner-approved discount or write-off must be a distinct, attributable balance reduction and journal, with its reason and authorizer. The approval workflow is not implemented by this foundation. No automatic forgiveness threshold has been introduced.

The current Sheets UI hides balances within 50 kobo and describes excess collections as rounding margin. Those legacy conventions are not activated in the new accounted-payment function. UI adapters must display exact PostgreSQL balances. Excess receipts are rejected by the new function until an explicit deposit/rounding policy and its accounting treatment are implemented. The old private transaction primitive still retains its original overpayment behavior; it must not be granted as a standalone production accounting write path.

## Implemented database primitives

Migration `202610040002_accounting_ledger.sql` adds:

- A starter chart of 15 accounts, with no balances. Bank accounts must be configured using the owner's actual accounts. No tax, depreciation, valuation or revenue-recognition policy is inferred from the account names.
- Bookkeeping configuration for the start date, setup/active state and closed-through date. No configuration row is created by the migration, so the books remain inactive.
- Draft and posted journal entries with integer-kobo lines, source references, staff attribution and optional customer/job identities. Receivables require both customer and job identity. All posted journals require at least two lines and equal positive debit and credit totals.
- Immutable posted headers and lines, account-classification protection, and exact linked reversals for standalone journals. Business-linked journals cannot be reversed in isolation; their operational records need a separate coordinated reversal function.
- `post_journal` for atomic posting and persistent request replay checks. Opening journals must be dated immediately before the accounting start, while in setup, and carry confirmation and an evidence reference. Balanced opening journals are not independent proof that the owner's supplied figures are correct.
- `record_accounted_payment` for one atomic receipt, job allocations, cash/bank debit and customer-receivable credits. The selected jobs' exact operational balances must match their posted receivable ledger as of the collection date. New collections cannot predate a selected job. The receiving account must be an active cash/bank account. Underpayments create no adjustment, discount or write-off.
- Private views for exact job balances and posted account totals. Account totals include opening journals and all posted dates; period-specific profit/loss and reconciliation reports still need implementation.

The payment function locks bookkeeping settings first, then jobs in stable order, and uses request/payload checks so an offline retry cannot count money twice. Any failure to post the journal rolls back the receipt, allocations and retry claims together. Hosted concurrent-connection behavior remains a required cutover check; local tests use PGlite.

All four new tables have RLS enabled. No browser/Supabase API roles receive schema, table, view or function access. Functions are private security-invoker primitives: the future trusted adapter must derive actor identity from verified sessions, enforce owner-only journal/configuration actions and expose only the allowed operations. Supplying an actor UUID is not authentication. Do not grant runtime direct-write access or claim the accounting API is production-ready yet.

## Verification and next work

The 20 accounting tests cover exact money, the owner's short-payment examples, one-kobo balances, repeated requests, multi-job receipts, later collection, atomic rollback, opening confirmation, period locks, immutable posting, reversals, wrong customers/accounts, disabled collectors and API-role denial. Authentication, financial API and recovery tests have since expanded the suite; see the handoff for the latest full-suite count. TypeScript, targeted lint and production build passed.

Next: final-source/opening-balance preparation, remaining business server adapters and screen integration (authentication and collection/read/report APIs are implemented but inactive), remaining expense/restock/waste journal integration (tracked-sale and consumption journals are implemented), approved corrections/deposits, real bank-account setup, period reports, backup recovery and hosted workflow/concurrency checks. Opening balances must be posted after final migration data is in place; posting creates runtime/idempotency evidence that deliberately stops rehearsal importers from rewriting operational tables.

References: [Xero on part/full invoice payments](https://central.xero.com/s/article/Record-payment-of-a-sales-invoice), [double-entry bookkeeping](https://www.xero.com/au/guides/double-entry-bookkeeping/), and [outstanding balances at conversion](https://central.xero.com/0/article/Enter-unpaid-invoices-and-bills-for-your-conversion-balances).

The hosted financial verifier passed exact underpayment, one-kobo balance, excess rejection, idempotent replay and restricted-role checks. Synthetic fixtures and the temporary test role membership were rolled back and verified absent afterward. See [financial runtime](financial-runtime.md).

Tracked-sale server capabilities now post revenue, receivables, per-roll material cost and initial receipts atomically using authoritative catalog prices and tiling. Local tests and hosted rollback-only verification passed. They remain disabled and require screen/offline integration and verified opening inventory values before use.

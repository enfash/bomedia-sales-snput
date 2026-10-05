# Financial runtime implementation

Updated 4 October 2026. This is an inactive server API, not a completed replacement for the current screens or Sheets routes. Enable only after final import, verified opening books and acceptance checks. No silent fallback to Sheets is provided.

## Implemented interfaces

- `GET /api/accounting/records?resource=...`: authenticated, explicit projections for customers, jobs, payments, expenses, materials, inventory, estimates and cash_accounts. Page with `limit` (1–500, default 100) and `after_id`; the response supplies `next_after_id`. Customer/job/payment lists may filter `customer_id`. Iterate all pages for complete results.
- `POST /api/accounting/payments`: one actual receipt, its selected-job allocations and its balanced journal in one transaction. Body fields: `requestId`, `customerId`, `jobIds`, `amountKobo`, `businessDate`, `cashAccountCode`, optional `method` and `notes`. Money is a positive integer decimal string in kobo. Identity comes from the verified session, never the request.
- `GET /api/accounting/report?from=YYYY-MM-DD&through=YYYY-MM-DD`: verified owner only. Returns posted ledger totals through the end date, period movement/profit, actual receipts counted once, and separately labelled recorded expenses. Null bookkeeping configuration means books are not configured; zero posted profit is not a claim of zero historical profit.

The payment response includes stable `payment_id`, `journal_entry_id`, `amount_kobo` and `allocations`. The same request ID/payload returns the original result; changed payload is rejected. Jobs are allocated in the established collection order, regardless of caller array order. Every unpaid kobo remains debt. Excess collections and legacy row-index payloads are refused for explicit review. This endpoint must replace the old two-request payment flow when the UI is connected; never call both for one receipt.

Requests fail with 401 for absent/revoked sessions, 403 for denied actor/owner access, 400 for invalid request format, 409 for accounting conflicts needing review, and 503 for unavailable/configuration errors. Preserve pending financial entries and request IDs on every failure. No API error contains raw PostgreSQL exception text or credentials.

## Deployment requirements

`POSTGRES_FINANCIAL_API_ENABLED` defaults off. It requires `AUTH_BACKEND=postgres` and a dedicated `SUPABASE_FINANCIAL_DATABASE_URL` using `bomedia_financial_server`, verified TLS and a configured project reference. `SUPABASE_ADMIN_STAFF_ID` explicitly binds the verified configured owner email to the owner's enabled staff identity for financial writes; never reuse another employee's identity. Without that mapping, owner writes fail closed.

The login inherits only `bomedia_financial_runtime`, which can execute `api_read`, `api_collect` and `api_report`. It cannot directly read/write private tables, manage staff, invoke generic journals or call the old payment primitive. The two later tracked-sale/customer capabilities are described below. The Next.js server enforces caller authentication and owner-only reporting; the capability login itself is a trusted server credential, not a browser identity.

```sh
npm run migration:apply -- --confirm-project <project-ref>
npm run migration:provision-financial -- --confirm-project <project-ref>
node --env-file-if-exists=.env.local scripts/migration/verify-financial.mjs --confirm-project <project-ref>
```

The provisioner reuses existing credentials without rotating them and keeps a private recovery copy until `.env.local` is updated atomically. It never enables an API flag. The verifier uses the actual runtime login for reads and the exact role inside a rolled-back owner transaction for synthetic collection and tracked-sale fixtures. Supabase requires a temporary SET membership for this test; it is granted only inside that same transaction and verified unchanged after rollback. No synthetic staff, customer, journal, payment, settings or retry record commits. It deliberately refuses fixture setup after live books/jobs/payments exist. This is not a hosted concurrent-write test or a backup/restore test.

## Remaining before cutover

Connect screens and offline queues to these stable IDs and endpoints, keeping old queued references held for review unless unambiguously mapped. Tracked-sale/customer writes are implemented below; finish expense/stock/estimate and non-stock writes and their accounting integrations; owner account/setup workflows; opening balances; historical/opening imports; manual-tab exports; hosted concurrency and backup recovery. Existing app routes still use Sheets. The new payment endpoint is not usable for real collections until imported jobs and their receivable ledger agree.

## Tracked sales and customer identity

Migration `202610040005_accounted_sales.sql` adds two inactive server capabilities:

- `POST /api/accounting/customers`: `{requestId, name, contact?}` explicitly creates an identity. Identical retries return the same UUID. Matching names never merge customers. Active books and a verified, enabled actor are required.
- `POST /api/accounting/sales`: `{requestId, customerId, businessDate, jobs, initialPaymentKobo?, cashAccountCode?, paymentMethod?}`. Each job supplies `{materialId, description, quantity, widthFt, heightFt, expectedUnitPriceKobo}`. Dimensions are positive decimal feet with at most six decimal places; quantity is a whole-number string from 1 to 10,000. A request contains 1–100 tracked jobs. Money remains integer-kobo strings. A receiving account is required when initial payment is positive.

Catalog price and tiling are computed inside the locked database transaction. Either job orientation may be used; the smaller positive required length wins. Each unit price is rounded to a kobo before multiplying by quantity, consistent with the stored job model. `expectedUnitPriceKobo` confirms the quoted unit price; a stale quote fails rather than changing the customer's bill silently. Browser-supplied stock allocations, actor IDs and authoritative amounts are not accepted.

Stock uses the active eligible roll first, then remaining rolls in legacy-ID/UUID order. Materials and rolls lock in stable UUID order after bookkeeping settings. Multiple jobs share one remaining-stock calculation. Only matching-width Active/Low Stock rolls are consumed. Missing costs, insufficient eligible stock, missing inventory ledger value, closed periods and excess receipts reject the entire operation.

Each job posts receivables/revenue plus material cost/inventory together, then any initial receipt uses the exact accounted-payment path. No stock, job, journal, receipt or idempotency claim survives a failure. Retries return the saved result even if the catalog price has since changed. Customer, material and staff names are snapshotted for traceability.

Material valuation uses each roll's actual purchase cost divided across its total length. Each deduction takes the difference between rounded before/after remaining values, so full depletion consumes exactly the roll's total cost without accumulating rounding drift. Final opening inventory values must be verified against this basis before activation; the code does not certify the historical costs or physical stock. Non-stock/custom-priced services, discounts, returns, waste/restock accounting and correction workflows are not implemented by this tracked-sale endpoint and remain cutover work.

The financial capability allowlist now includes `api_customer` and `api_sale` as well as the three earlier functions. Neither capability grants direct table writes or generic journal access.

## Expenses (migration 0008, local only)

Migration `202610040008_expense_writes.sql` adds two inactive capabilities and ledger account `2010 Expenses awaiting payment`. It has passed local PGlite tests only; it is **not applied to the hosted project**.

- `POST /api/accounting/expenses`: `{requestId, businessDate, amountKobo, category, description?, paidTo?, status: 'paid'|'unpaid', paymentMethod?}`. Any verified staff session. Category must be an enabled `bomedia.expense_categories` row (debit 6000, or 1500 for Equipment); stock categories are refused. Paid: Dr category account / Cr the method's account (Cash 1000, Transfer 1010, POS 1020). Unpaid: Dr category account / Cr 2010. `GET /api/accounting/records?resource=expense_categories` lists the allowed categories. `paymentMethod` is required when paid and refused when unpaid. Stored status uses the Sheets vocabulary (`Paid`/`Unpaid`).
- `POST /api/accounting/expense-payments`: `{requestId, expenseId, businessDate, paymentMethod}`. Verified owner only (matches today's Expenses screen). Dr 2010 / Cr method account; the payment date cannot precede the expense. An expense is paid once.

Imported legacy unpaid expenses have no accrual journal and are refused by the payment capability; they must be settled through evidence-backed opening balances. Restock and waste expenses (written today by the inventory screens) are not covered yet: they belong to the stock workflow so inventory and the ledger move together. Receipt uploads are not linked yet.

## Stock (migration 0009, local only)

Migration `202610040009_stock_writes.sql` adds ledger account `5100 Material waste` and three inactive capabilities. Local PGlite tests only; **not applied to hosted**. Screen: `/cashier/stock` (staff: waste only) and `/bom03/stock` (owner: restock, waste, count).

- `POST /api/accounting/restocks` (owner): `{requestId, materialId, rollCount '1'-'99', rawLengthFt, totalCostKobo, paymentMethod, businessDate, supplier?, reference?}`. Creates whole rolls of an existing material, each keeping the 10 ft setup reserve; cost is split per roll to the kobo (first rolls take the remainder) and spread over usable length. Rolls are labelled `<name> <width>ft - Roll NNN`, continuing the Sheets numbering. Dr 1200 / Cr payment method account. Paid at once only; supplier credit is not supported yet. No `expenses` row is written (Sheets did): a restock is stock, not a running cost.
- `POST /api/accounting/waste` (any staff): `{requestId, rollId, lengthFt, reason, responsible?, note?, businessDate}`. Only in-stock rolls; no more than what is left. Dr 5100 / Cr 1200 at the roll's purchase cost per usable foot.
- `POST /api/accounting/stock-counts` (owner): `{requestId, rollId, countedLengthFt, reason, businessDate}`. Sets a roll to its measured length (up to its usable length; must differ). Loss: Dr 5100 / Cr 1200; gain: Dr 1200 / Cr 5100.

Waste and count costs use the same rounded-remaining-value method as tracked sales, so all journals for a roll sum to its purchase cost exactly. Write-offs are refused while 1200 holds less value than the write-off, so imported rolls cannot be wasted or corrected until opening balances are posted. Responses carry `stock_entry_id`.

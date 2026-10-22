# BOMedia migration stages

Agreement: finish one stage, present evidence and a sandbox check, and wait for the owner's acceptance before starting the next. Sheets remains authoritative until the approved final switch. Existing screens and readable references stay in use.

Status sequence: **Not started → In progress → Ready for your review → Accepted**.

| Stage | Work | Status |
| --- | --- | --- |
| 1 | Payment persistence, exact dates/identity, atomic payment/status, readable references, one-kobo balances | Accepted |
| 2 | Existing sales, customers, quotes, services, Records and Job Board | Accepted |
| 3 | Existing expense entry, mark-paid and receipt links | Ready for your review |
| 4 | Existing inventory, restock, waste and stock correction | Not started |
| 5 | Accounting reports and owner review/correction controls | Not started |
| 6 | Historical imports, opening balances and manual-sheet dependencies | Not started |
| 7 | Hosted/device acceptance, permissions, independent backup restore and deployment readiness | Not started |
| 8 | Explicitly approved final snapshot, reconciliation and live switch | Not started |

## Stage 1 implementation and boundaries

- PostgreSQL payment submissions persist in a dedicated browser outbox before dispatch. Each entry stores version/backend, request ID, original Lagos date, staff ID, job IDs, exact kobo, method and optional status.
- New context endpoint derives the backend and accounting staff identity from the server. Login clears the cached context. Cached PostgreSQL identity allows offline capture; the server verifies the expected identity again before applying money.
- Single-job Manage, customer debtor payment and Records Pay Batch share the durable path. Pending overlapping jobs cannot receive a second queued payment. Pending state is shown; failed/review entries have no automatic delete action.
- Both existing payment routes accept the versioned contract in PostgreSQL mode. Old row-based payment submissions are held for review. Existing Sheets routes retain their current write behaviour.
- Migration `202610070017_durable_payments.sql` adds a restricted atomic collection/status capability and fixes reference counters beyond 9,999. Applied migration files are unchanged.
- Successful responses must match the request, staff, date and amount and contain payment/journal identities before removing the saved entry.
- Existing queues carry backend/version metadata. Unknown or mismatched queues cannot cross into PostgreSQL; ambiguous older payment entries are preserved for owner review. This stage does not automatically reconcile them.
- PostgreSQL debt displays/filters retain one-kobo balances; the existing Sheets tolerance stays unchanged.

## Verification — 8 October 2026

- `npm test`: **299 tests in 42 files passed**.
- `npx tsc --noEmit --incremental false`: passed.
- `NEXT_DIST_DIR=.next-stage1 npm run build`: passed, including TypeScript and route generation. The first attempt could not fetch the existing Google font in the restricted environment; the network-enabled retry and final verification build succeeded. Generated changes to `tsconfig.json` and `next-env.d.ts` were restored; build output is ignored.
- Focused ESLint on the new payment code and tests: passed. An ESLint comparison of modified tracked code against HEAD found **17 existing errors and 17 current errors**, with no increased per-file error counts. The repository is not being claimed lint-clean.
- `git diff --check`: passed.
- Local tests cover lost confirmation, persistent storage/reload, repeated submissions, original business date across midnight, actor/backend changes, malformed confirmations, old-queue holds, amount precision, atomic payment/status rollback, replay after later status changes, duplicate dispatch, one-kobo debt and growing reference counters.
- **Not performed:** hosted migration application, signed-in browser/physical-phone acceptance, or concurrency across independent hosted connections. No production deployment, live data write or activation change was made. The stage is ready for owner sandbox review, not accepted or production-approved.

## Review checks in the separate sandbox

Apply the pending migrations, including 0017, to **bomedia-sandbox only**, then start it:

```sh
npm run sandbox:setup
npm run sandbox:dev
```

The setup runner uses `.env.sandbox.local` and rejects the live project's ID. Stop the normal dev server first. Use the existing sandbox login and open `/bom03/records` or `/cashier/records` on port 3001. Never use the rehearsal/live migration project for click-testing.

1. On an unpaid job, enter a partial payment through Manage with Cash/Transfer/POS and a status. Confirm one payment, one matching journal and the expected balance/status.
2. Record a customer payment and a Pay Batch payment. Confirm their allocations and payment methods.
3. Go offline after signing in and loading jobs. Save a payment, close/reopen the page, reconnect and confirm it applies once. Repeated clicks while pending must not create another payment.
4. Interrupt a response after the server receives the payment. Retry and verify one receipt. Repeat across Lagos midnight; the original business date must stay unchanged.
5. Queue under one staff account, then sign in as another. Confirm the payment stays held; return to the original account and retry.
6. Try a refused status transition/permission condition with a payment. Confirm neither the receipt nor status is saved.
7. Leave one kobo outstanding; confirm it appears in Records/debt totals and can be collected.
8. Preserve older queue examples: missing method/date/identity and Sheets-era row references must be held, never guessed or discarded.

Local PGlite duplicate-dispatch checks do not prove contention across independent hosted PostgreSQL connections. Real hosted concurrency and staff-phone behaviour must be reported separately, never inferred from local results.

## Stage 1 review follow-up — payment method visibility, 8 October 2026

- Owner checked the sandbox and requested payment methods in waterfall, New Sale and other money-receiving forms. This is a Stage 1 amendment; acceptance and Stage 2 remain pending.
- Cash / Transfer / POS now stays visible alongside the amount in New Sale, customer waterfall, Pay Batch, Manage Sale (while a payment slot is available), and the existing accounting job/service form. The shared label is **Payment method**, including the New Sale confirmation. The accounting collection form already displays its method selector.
- No method is preselected. Positive payments require a choice; unpaid new sales and status-only updates do not. Job/service entry retains the server's enabled-method list. PostgreSQL payload/outbox and ledger method storage are unchanged. Sheets storage/schema is unchanged; this follow-up does not add payment-method columns to the live workbook.
- Follow-up verification: TypeScript passed; 25 payment, sale-adapter and durable-database tests in five files passed. Browser/phone interaction with these amended forms still requires owner review. Earlier full-suite/build evidence above predates this small UI amendment.
- Sandbox check: refresh port 3001, open each payment form before typing an amount, select Cash/Transfer/POS and verify the selection in a test payment. Check New Sale with zero initial payment, then with a positive payment and missing method (must refuse), and confirm the method in its review step.

## Stage 1 review follow-up — shared responsive sheets, 8 October 2026

- Added `components/responsive-sheet.tsx`, with shared geometry in `app/theme.ts`. Replaced duplicated mobile/desktop wrappers in customer history, customer payment/waterfall, Pay Batch, Manage Sale, material selection and waste entry. This is an interface fix, not the start of the inventory or sales migration stages.
- Mobile handle supports touch/pointer drag, tap and keyboard resize between compact, normal and expanded heights. Dragging changes size without dismissing. Outside tap, Escape and the close button dismiss; saving blocks dismissal. The viewport follows the phone's visible area, content scrolls internally, and actions include bottom safe-area space.
- One dialog tree stays mounted across breakpoints and closes. Customer payment drafts stay separate per customer; waste drafts stay separate per roll. The owner's inventory screen retains the waste form while closed. Draft preservation covers closing/reopening on the current page and rotation, not refreshing or navigating away; submitted PostgreSQL payments still use their independent durable outbox.
- Validation: TypeScript passed. Headless Chrome with actual components and synthetic data passed touch/pointer dragging, keyboard resize, rotation, reduced viewport/footer bounds, outside-tap dismissal, busy guards, nested customer/payment dismissal, amount/method restoration, customer isolation, material-search and underlying-sale draft retention, and desktop switching, with no runtime errors. Mobile and desktop screenshots inspected. No real payment or stock submission was made. Physical-phone keyboard behavior and signed-in sandbox interaction remain owner acceptance checks.
- New shared component/theme pass ESLint. Changed existing files have no increased lint-error counts (waste entry's pre-existing render-created component errors removed). The 25 targeted payment regression tests still pass. This follow-up did not repeat the earlier isolated production build.
- Review on port 3001: open a customer, open Pay Debt, enter an amount/method, drag the top dash down/up, tap outside, and reopen Pay Debt. Confirm both fields remain. Repeat with the material picker during New Sale and waste entry; rotate the phone and open its keyboard, then verify you can scroll and reach the action buttons. Drafts do not carry between customers or rolls.

## Owner inputs to prepare

Real cash/bank account mapping and opening figures with evidence; outstanding customer/supplier balances and disputed items; inventory count/value; devices with pending entries; final handover window. These are for later stages and do not authorize activation now.

## Stage 2 — started 8 October 2026

Owner explicitly accepted Stage 1 and authorized the next stage. Stage 1 acceptance does not replace the separate hosted concurrency, physical-phone and production-readiness checks. Preserve the existing New Sale and Estimator screens. Complete durable sale/quote submissions, customer selection, initial receipts, typed-price review flags, quote conversion and service sales; verify Records, Job Board and stock before requesting Stage 2 acceptance.


## Stage 2 — ready for owner review, 8 October 2026

### What changed

- New Sale retains its existing form and multi-item order review. Print items and services save together, including initial Cash / Transfer / POS receipts, job status, customer identity and exact integer-kobo totals.
- Shared version-3 order contract/outbox persists before dispatch, including online saves. Web Locks serialize browser submissions. Retries retain the original request, date, staff, items and payment; only matching order/job/journal/receipt confirmations remove entries. Login, backend and business-review refusals preserve entries. Earlier ambiguous sale queues are held for review.
- Customer suggestions now use saved customer identities and contacts. Ambiguous same-name customers require selection; historical customer rows are not merged. Material references are resolved without guessing ambiguous matches.
- Estimator saves durable quotes with server-issued readable numbers. New Sale loads native quotes and retains their identity when converting. A used quote cannot produce another order. Current catalog prices are reviewed on loading; owner-approved per-job prices retain their approval identity. Historical/ambiguous quotes remain blocked for review.
- Fixed-price services use the shared service-entry component. Per-job services still use the existing owner-approved quote workflow. Services do not deduct rolls. Typed print prices retain review flags and stock shortages retain review records.
- Quote handoffs carry their originating backend; unversioned historical handoffs into PostgreSQL are preserved for review. No item is silently dropped. New Sale and Estimator refresh only the cache resource they fetched, fixing a race that could clear materials.
- Corrective migration `202610080018_screen_orders.sql` is applied **only to the separate sandbox**. The migration runner confirmed 0017 and all predecessors already applied there. Previously applied files were preserved. No live activation, production deployment or Sheets writes occurred.

### Evidence

- `npm test`: **316 tests / 45 files passed**. Added database tests cover atomic mixed orders, service-only stock invariance, typed prices, one-time quote conversion, approved per-job services, disabled actors, rejection/rollback and quote numbering beyond 99,999. Added browser-storage/server tests cover lost confirmations, reload/midnight retry, repeated saves, original identity/backend, incomplete receipts, corrupt/full storage and exact inch/kobo calculations.
- TypeScript passed. Final `NEXT_DIST_DIR=.next-stage2 npm run build` passed, including route generation. Output is separate from the running sandbox; generated TypeScript config changes were restored. Initial font download required network access; both subsequent builds passed.
- Focused ESLint passes on all new runtime files and new TypeScript unit tests. Existing Sales Entry/Estimator effect lint findings remain; this repository is not claimed lint-clean. `git diff --check` passed.
- Signed-in browser check on `localhost:3001`: New Sale refused a positive payment with no method. The trial mixed order **BOM-20261008-0004** contains two 2×3 ft Flex prints (₦3,000) plus Graphic design (₦5,000); ₦3,000 POS received, ₦5,000 outstanding. Displayed Flex stock changed from 206 ft to 204 ft.
- Existing Estimator saved **QT-00001**, then handed it to New Sale with its customer and full item intact. Conversion produced **BOM-20261008-0005**, ₦1,500 total, ₦1,500 Cash received, zero balance. A second load displayed the already-converted refusal.
- Records shows both orders with readable references, correct totals, item counts and balances. Job Board shows all three jobs. The converted quote job moved to **Ready**, surviving reload. The previously reviewed one-kobo debt remains visible.
- Browser evidence: [Records screenshot](migration-evidence/stage2-records.jpg).
- Remaining verification boundaries: browser review used the signed-in owner sandbox session. Physical staff phones, network-loss browser automation and concurrency across independent hosted connections remain Stage 7 acceptance work; local outbox/transaction tests cover the retry/atomicity contracts. No production readiness claim is made.

### Short owner sandbox check

1. Open **http://localhost:3001/cashier/records**. Inspect `Stage 2 Review 8 Oct` (₦8,000 total / ₦5,000 balance) and `Stage 2 Quote Review` (₦1,500 / zero balance). Expand each to check its items.
2. In **New Sale**, enter a test customer, add print dimensions and quantity, optionally add a fixed-price service, then enter any initial payment and select Cash / Transfer / POS. Review and save; wait for the confirmed readable reference.
3. In **Estimator**, save a test quote, wait for its QT number, and use “Ready to log as a sale?” Review the loaded items and save. Confirm it appears once in Records and Job Board.
4. Check New Sale and its sheets on your staff phone. Confirm the inputs, payment-method controls and review summary remain usable.

**Stage 2 accepted by the owner on 9 October 2026; Stage 3 authorized. No deployment authorized.**

## Stage 2 follow-up — Settings and free services, 8 October 2026

- Owner requested a Settings area and explicitly authorized free catalog services. Shared navigation and a section registry link Services and Staff Manager. The existing Staff Manager component moved without changing its account/access behavior; `/bom03/staff` redirects to `/bom03/settings/staff`. Settings remains owner-only.
- Services management uses the existing durable service API/pending queue. Each service can be Free, Fixed price or Owner approves, with an availability switch. Hidden services remain in historical jobs and cannot be selected for new sales. No global service-section switch was added.
- Service editing uses the shared responsive sheet. Unsaved drafts remain per service when closing/reopening on the same page. The New Sale shared service entry is an accordion, collapsed initially; staff expand it only when needed.
- Corrective migration `202610080019_free_services.sql` permits a zero catalog price and skips zero-value sale journals while retaining the job/order and retry confirmation. This does not authorize free print jobs or staff discounts. Existing applied migration files were preserved. Only the sandbox database was updated.
- Validation: **318 tests / 45 files passed**, including free-only and mixed orders, idempotent replay, no stock/receipt/zero journal for a free-only service, and rejection of hidden services, free print overrides and excess initial payments. TypeScript, focused lint and isolated `.next-stage2` production build pass. A navigation type error found during the first build was corrected; the final build passed. Generated TypeScript config changes were restored. Existing unrelated lint findings remain.
- Browser check: created a synthetic fixed-price service at ₦12.34, retained its sheet draft after outside-close/reopen, changed it to Free and verified the saved price after reload. Saved `BOM-20261008-0006`, customer `Settings free service review`, total/balance ₦0. Records shows the order. Toggled the synthetic service off again. The Staff Manager redirect renders the existing screen. Mobile 375×812 layout and selected-pricing contrast were checked; actual staff-phone keyboard acceptance remains pending.
- Evidence: [mobile free-service editor](migration-evidence/settings-free-service.jpg), [free order in Records](migration-evidence/settings-free-order.jpg).

Review on the sandbox: open **Settings → Services**, add/edit a service, choose **Free** or **Fixed price**, and save. Turn **Available to staff** on, then open New Sale and expand **Add a service** to select it. Turn it off and reopen New Sale to check it is hidden. Existing orders remain visible. Check **Settings → Staff Manager** as well. Accepted by the owner on 9 October 2026.

## Stage 3 — ready for review 10 October 2026

Owner accepted Stage 2 and authorized expenses/receipts. Existing expense entry and owner's mark-paid now use durable PostgreSQL requests, exact kobo, original business dates and verified staff identity. Batch saves are atomic. Imported unpaid expenses stay blocked until supported by an evidenced opening liability; final openings remain deferred until the final import.

The owner changed new receipt storage from Drive to private Supabase Storage. The configured sandbox bucket is private and limited to 1 MB per JPEG/PNG/WebP. Browser compression targets about 350 KB without enlarging smaller images, and preserves the original device photo. Historical Drive links are retained.

Validation: 335 tests / 50 files, TypeScript and isolated production build passed. Tests cover duplicate/lost-confirmation retry, exact dates/amounts, batch rollback, receipt ownership/content checks, unauthorized mark-paid refusal and opening-liability settlement without a second expense. Desktop sandbox check saved EXP-20261010-0001 (₦1,234.56 Transfer with receipt) and EXP-20261010-0002 (₦2,000.01 unpaid, then Cash paid). Read-only ledger verification confirms exactly ₦3,234.57 cost and no unpaid balance for these two records. A synthetic 19.8 MB PNG compressed to 81,586 bytes, reopened clearly, and was refused through public or logged-out access. [Expense evidence](migration-evidence/stage3-expenses.png), [receipt evidence](migration-evidence/stage3-receipt.png).

### Your sandbox check

1. On **http://localhost:3001/bom03/expenses**, expand the two test expenses. Confirm amounts, methods, payees and receipt link; reload and reopen the receipt.
2. On your phone, create a small **Paid** test expense, choose its method and attach a real test receipt photo. Use **Check receipt readability** before saving. Wait for the confirmed EXP reference, then reopen the saved receipt.
3. Create an **Unpaid** test expense. Confirm that it has no payment method yet. Use **Mark as Paid**, choose date and method, and verify its Paid status after reloading.
4. If you use batches, add two test expenses to a batch and review both before confirming.

Actual phone/camera acceptance is pending; the browser viewport override did not take effect, so no mobile check is claimed. The five older job-status errors were resolved on 10 October by sharing the board/database status mapping: all five preserved updates synced successfully and the queue is idle with zero pending items. Full validation after that fix: 341 tests / 52 files, TypeScript and isolated production build passed. [Recovered queue evidence](migration-evidence/status-queue-recovered.png). Independent hosted expense concurrency and independent Storage backup/restore remain later readiness checks. **Wait for owner acceptance before Stage 4.** Sheets remains live.

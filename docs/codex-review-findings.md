# Independent review findings — 17 October 2026

> Subsequent user-authorized local fixes are documented in [codex-review-remediation.md](codex-review-remediation.md). The findings and check results below preserve the original review baseline; they do not describe the later working-tree fixes as still unaddressed.

Reviewed `codex/supabase-migration` at `c40dc356018f2aa0c9c53cddebc9d7b5136c0a10`, 97 commits ahead of `origin/main`. Read the requested handover and project/history documents in order, screened the latest 25 commits, and concentrated on the ten requested areas. Findings refer to this checkout, not to verified production behaviour.

**Result: five High and seven Medium confirmed code defects, plus five conditional risks. No Critical finding established.** The High findings should be resolved before the 18 October cutover. Passing tests do not establish cutover readiness.

“Confirmed” below means the failure follows from the inspected implementation and its callers. These are source-traced scenarios, not claims that I reproduced an exploit against a running app or database. No hosted service was contacted, no secrets were read, and no application code was changed. This report is the only file created by the review. The pre-existing untracked `docs/review-handover.md` was left untouched.

## Checks performed

| Check | Result |
| --- | --- |
| `npm test` | Passed: 122 test files, 849 tests; 24.34 seconds. |
| `npx tsc --noEmit --incremental false` | Passed. Disabled incremental output to avoid creating/updating a build-info file under the read-only rule. |
| `npx eslint .` | Failed: 33,616 problems — 3,003 errors, 30,613 warnings. Generated `.next-prod` files are included by the current ignore configuration. |
| Follow-up ESLint with `.next*/**` ignored | Still failed: 22 source errors and 12 warnings. This is substantially more than the four problems described in the handover. |

Source lint errors occur in both estimator pages, `app/mui-providers.tsx`, expenses, legacy inventory/waste, manage-sale-action, mobile-nav, name-prompt, sales-entry, sidebar, sync-manager, theme-toggle, and `lib/useMediaQuery.ts`. Most are React hook rules; the report does not count them as separate financial/security findings. The source-only follow-up piped JSON into a read-only summary command; the summarizer's successful exit is not an ESLint pass.

The passing suite includes meaningful in-memory PGlite SQL tests. Those execute migrations locally with synthetic roles/data; they do not prove Supabase Auth, hosted role configuration, pooler behaviour, or Vercel concurrency.

## Confirmed bugs

### F1 — High: older write endpoints bypass owner approval rules

- **Locations:** `lib/server/expense-service.ts:63`; `lib/server/expense-routes.ts:9`; `lib/server/sales-service.ts:75`; `lib/server/legacy-sale.ts:72`. Compare the gates in `supabase/migrations/202610120037_owner_approvals.sql:89` and `202610120039_expense_limit_approval.sql:75`.
- **Problem:** approval checks wrap `api_screen_order` and `api_screen_expense`, but authenticated HTTP routes still call the older `api_expense`, `api_sale`, and `api_legacy_sale` functions directly. Category restrictions and authentication do not enforce these newer amount/date/price approval rules.
- **Failing scenario:** enable the expense approval limit at `5000000` kobo (₦50,000), with Ink allowed for the cashier. A signed-in cashier posts to `/api/accounting/expenses` with `{"requestId":"separate-request","businessDate":"2026-10-18","amountKobo":"6000000","category":"Ink","status":"paid","paymentMethod":"cash"}`. The old service records the ₦60,000 expense directly rather than holding it for approval. The server supplies the cashier's identity; forging an owner flag is unnecessary. The older sales routes similarly avoid the screen-order gate.
- **Suggested fix:** retire these write routes or route every supported write through one common approval boundary. Enforce the invariant in the database entry points that remain callable, not just in the new screen. Test every public write route under enabled rules.
- **Confidence:** high; route-to-service-to-SQL gate comparison.

### F2 — High: cashier expense privacy restrictions can be bypassed through other reads

- **Locations:** `lib/server/financial-routes.ts:57–75`; `supabase/migrations/202610040004_financial_runtime.sql:59–65`; `lib/server/expense-corrections-routes.ts:11,21`; `supabase/migrations/202610090020_screen_expenses.sql:32–36`; `app/api/digest/route.ts:44–48`.
- **Problem:** the legacy expense feed applies the intended cashier visibility restriction, but the generic accounting records endpoint does not. It only specially protects `expenses_awaiting`. Correction history/preview likewise accept another expense's reference without enforcing object ownership. Attached receipt reads allow a signed-in user without checking whether that user can see the associated expense. The digest reads unfiltered expense rows too.
- **Failing scenario:** owner records a confidential Equipment expense with a payee and description. A cashier requests `/api/accounting/records?resource=expenses&limit=500` and receives expenses outside their permitted own/today view. With a readable reference, they can also request another person's correction preview/history; preview mode returns the existing expense without applying a correction. Receipt references provide another read path.
- **Suggested fix:** centralize expense visibility and enforce it before SQL pagination, and on each history, preview, receipt and digest read. An authorized write capability or a valid session does not imply permission to read every expense. Add negative tests with two cashiers and an owner-only category.
- **Confidence:** high; explicit filtering in one feed and absent filtering in alternative reachable reads.

### F3 — High: offline deduplication silently discards a second legitimate transaction

- **Locations:** `lib/order-outbox.ts:24–27`; `lib/expense-outbox.ts:27–30`.
- **Problem:** persistence removes `requestId` before comparing payloads and returns the old queued entry when the remaining values match. Distinct business operations are collapsed into one solely because their fields match.
- **Failing scenario:** while offline, the same cashier records two separate ₦1,000 Design service sales for the same customer on the same date, both fully paid Cash, with otherwise identical fields and different request IDs. Both save actions appear successful, but only one order is queued and eventually posted. Two separate ₦500 Transport fares with identical details suffer the same problem. One receipt/payment or expense disappears permanently.
- **Suggested fix:** use the stable operation ID to deduplicate retries of a single save. Allocate a new ID for an intentional new sale/expense even if its content is identical. Keep the same ID through double-clicks and uncertain acknowledgements. If desired, warn about similar entries rather than silently merging them.
- **Confidence:** high. Existing outbox tests actually assert this collapse for different request IDs; they preserve the defect rather than prove the desired business behaviour.

### F4 — High: approval decisions and successful sale replays depend on current rules

- **Locations:** `supabase/migrations/202610120037_owner_approvals.sql:101–115`; `supabase/migrations/202610120039_expense_limit_approval.sql:87–101`.
- **Problem:** both gates take the “no rule violation now” path before looking up an existing pending/declined approval. The sale gate also evaluates current rules before returning an already-completed operation. The expense gate has a completed-result lookup, but still bypasses existing unposted approval decisions when rules cease to apply.
- **Failing scenarios:**
  1. A ₦60,000 expense is declined under a ₦50,000 limit. Later the owner raises the limit to ₦100,000. Resending the original request ID and payload posts the formerly declined expense, despite its stored decision. Turning a rule off produces the same bypass. A future-dated sale can cease violating the date rule merely because that date arrives.
  2. A sale dated 17 October succeeds just before Lagos midnight, but its acknowledgement is lost. With date approval enabled and zero days of grace, replaying that exact successful request on 18 October now hits the approval gate. With no approval reason it errors instead of returning the original receipt; with a reason it can create an unnecessary approval request for an already-posted sale.
- **Suggested fix:** under a consistent request lock, resolve the original operation result and existing approval state before evaluating present-day rules. Enforce the original payload hash. Pending/declined/expired requests must not silently become new writes. Evaluate current rules only for a genuinely new operation. Add rule-change and midnight replay SQL tests through the final wrapper functions.
- **Confidence:** high; ordering is explicit. Existing decline tests keep the rule unchanged, and mocked outbox midnight tests do not exercise this SQL gate.

### F5 — High: cancelling a historical job can leave its opening receivable in the ledger

- **Locations:** `supabase/migrations/202610120040_sale_corrections.sql:51–57,185–208`; balance calculation in `supabase/migrations/202610040002_accounting_ledger.sql:256–261`.
- **Problem:** `job_current_entry` only finds a journal of kind `sale`. When an imported job has debt represented by an opening journal, no sale journal is found. The cancellation skips the reversal but still sets the job's amount to zero and marks it cancelled. Operational job debt and the general ledger then disagree. There is no historical-job refusal equivalent to the expense correction safeguard.
- **Failing scenario:** an imported job has ₦10,000 outstanding, no payment allocations, and an opening entry debiting account 1100 by `1000000` kobo for that job/customer and crediting opening equity. The owner cancels it. Its operational balance becomes zero and the sale disappears from the normal feed, while account 1100 still contains the ₦10,000 receivable. Correcting rather than cancelling can likewise layer a replacement sale journal over an unreversed opening receivable.
- **Suggested fix:** refuse normal correction/cancellation of historical jobs lacking a reversible sale journal, or implement an explicit audited adjustment of their opening receivable. Do not reverse an entire opening journal containing multiple unrelated jobs. Test imported debt with actual opening-journal shapes before cutover.
- **Confidence:** high for this supported data shape; whether particular production imports have this shape was not verified. No live opening balances were inspected.

### F6 — Medium: Shift Report cash figures do not represent money movement for the selected shift

- **Locations:** `components/shift-report-modal.tsx:204–267`; `lib/server/legacy-feed.ts:54,64`; `supabase/migrations/202610070016_readable_references.sql:56–58,91–104`.
- **Problem:** the report subtracts all expense amounts on the expense's date, without testing whether or when they were paid. It combines all payment methods under cash labels. Selecting a cashier filters sales but leaves later payments and expenses unfiltered. The feed represents same-day receipts inside sales and later receipts separately, so removing a cancelled sale can also remove real collected money from this calculation.
- **Failing scenarios:**
  - An unpaid ₦5,000 Ink expense on 18 October reduces that day's Net cash by ₦5,000 even though no money left the shop. An expense dated 17 October and paid on 18 October is attributed to the wrong day.
  - Ada has ₦1,000 in same-day collections; Bola collects ₦2,000 of an older debt. Selecting Ada still includes Bola's ₦2,000. Same-day collections are attributed to the sale logger rather than necessarily the person taking payment.
  - A ₦10,000 sale is fully paid and cancelled on the same day, with the cash retained as customer credit. The sale is excluded and its same-day payment is absent from the later-payment feed. Reported collections fall to zero although ₦10,000 was received.
- **Outstanding definition:** the implementation sums the **current positive balances of the selected day's sales**, not all customer debt and not the balance as of that historical shift. Revisiting an older report after a later collection changes that figure. It also excludes credit balances. This needs an explicit label or a different calculation.
- **Suggested fix:** compute the report server-side from actual receipt/payment and paid-expense movements, filtered by business date and collecting/paying actor. Separate Cash, Transfer and POS. Preserve receipts through cancellation; expose customer credit separately. Define whether outstanding is current or as-of. Use exact kobo throughout.
- **Confidence:** high; arithmetic and feed semantics traced together. This does not imply the underlying journals are wrong in these examples.

### F7 — Medium: failed report requests become apparently valid zero totals

- **Location:** `components/shift-report-modal.tsx:172–179`.
- **Problem:** responses are parsed without checking HTTP status or validating the data arrays. A normal JSON error body falls back to an empty array, and the report can still be downloaded/shared.
- **Failing scenario:** sales returns 200, while payments returns 503 with `{"error":"Database unavailable"}`. The payment total becomes zero, with no failure notification. A PDF now understates collections. If all three return JSON errors, the report appears to show no activity.
- **Suggested fix:** require all responses to succeed and match the expected shape before replacing report state. Display an incomplete-report error and disable export/share until a complete fetch succeeds. Test partial HTTP failure, not just rejected fetch promises.
- **Confidence:** high.

### F8 — Medium: the daily digest drops PostgreSQL later-payment amounts

- **Locations:** `app/api/digest/route.ts:82–85`; `supabase/migrations/202610070016_readable_references.sql:96`.
- **Problem:** the digest reads `Amount` or `Amount (₦)`, while the PostgreSQL payment feed emits uppercase `AMOUNT`. These values therefore parse as zero.
- **Failing scenario:** no new sales today, but a customer pays ₦25,000 against yesterday's job. The PostgreSQL feed contains that later payment with `AMOUNT`; the digest reports zero new payments and understates net collection by ₦25,000.
- **Suggested fix:** use a shared, typed feed normalizer or a dedicated kobo-based report query. Add an integration fixture containing the actual PostgreSQL field names. The digest's expense treatment also needs the paid-movement correction described in F6.
- **Confidence:** high.

### F9 — Medium: cold-start connection errors bypass the new saturation retry

- **Locations:** `lib/server/financial-db.ts:48`; `lib/server/auth-db.ts:39–41`; classifier in `lib/server/db-pool.ts:8–19`.
- **Problem:** the initial connection/role-verification catch replaces the database error with a generic “database is unavailable” error. The outer retry classifier no longer receives the pool-capacity code/message and does not retry that failure.
- **Failing scenario:** a cold Vercel instance's first role query receives `53300` or the session-pooler capacity error. A slot becomes free shortly afterward, but this request immediately fails through the generic unavailable error instead of performing the configured retries. Authentication and financial calls have the same gap.
- **Suggested fix:** retain the internal error code/cause for retry classification while sanitizing the external response. Test the real adapter's connection/role-check failure path; a fake callback passed directly to `withConnectionRetry` does not cover it.
- **Confidence:** high. No live pool exhaustion was induced.

### F10 — Medium: the secret-authenticated push dispatcher is blocked by the proxy

- **Locations:** `proxy.ts:94–111`; `lib/server/push-routes.ts:27–32`.
- **Problem:** the dispatch handler explicitly supports a scheduler authenticated by `x-push-secret`, but the proxy requires an owner/cashier session before that handler can run. Dispatch is absent from the narrow public-route exceptions.
- **Failing scenario:** a scheduler posts to `/api/push/dispatch` with the correct dispatch secret and no browser cookie. It receives 401 from the proxy. Notifications left for retry after a restart cannot be drained this way while the app is idle.
- **Suggested fix:** exempt precisely the dispatch route/method from browser-session enforcement, preserving the handler's strong secret check; alternatively use an explicitly authenticated scheduler path. Do not exempt the whole push namespace. Test the proxy and route together.
- **Confidence:** high. The existing direct handler test bypasses the proxy; no assertion is made that a scheduler is currently configured.

### F11 — Medium: partial push delivery permanently loses the failed device's alert

- **Locations:** `lib/server/push.ts:109`; `supabase/migrations/202610130048_phone_alerts.sql:194–195`.
- **Problem:** any successful target clears the aggregated error and causes the entire outbox item to be marked sent. Transient failures for other active targets are then no longer eligible for retry.
- **Failing scenario:** the owner has desktop and phone subscriptions. Desktop delivery succeeds, while the phone's provider returns 503. The outbox item becomes sent and the phone never receives that alert, even after the provider recovers.
- **Suggested fix:** track completion/retry per subscription, retaining failed targets and avoiding repeat delivery to targets already successful. Cover one item with both a successful target and a transiently failing target; success plus a permanently gone endpoint is a different case.
- **Confidence:** high.

### F12 — Medium: a successful PostgreSQL sale can leave a stale unsaved draft

- **Locations:** `components/sales-entry.tsx:504–506,613–618`; `lib/sale-draft.ts:31–34`.
- **Problem:** the PostgreSQL save branch clears the cart/customer metadata but not the job-input fields or `nlText`. The persistence effect writes those remaining values; `isEmptyDraft` explicitly treats them as an unsaved draft. The Sheets save branch resets more of the form.
- **Failing scenario:** use the natural-language entry box to describe a customer's order, add the resulting item, and successfully save the sale to the PostgreSQL outbox. The original natural-language text remains. Returning to New entry restores a draft and shows its indicator despite the sale already being saved; customer details typed in that text also remain stored. Unadded job fields can preserve a draft in the same way.
- **Suggested fix:** use one explicit successful-save reset for all draft state, and clear the draft once durable outbox persistence succeeds. Keep the financial outbox intact. Test the mounted component's save/persist/return lifecycle; testing an already-empty draft object does not establish this behaviour.
- **Confidence:** high for the retained-state path; not browser-reproduced in this review.

## Risks / suspicions requiring confirmation

### R1 — High: password-only owner cookies may survive the Supabase/MFA cutover

- **Locations:** `lib/server/admin-session.ts:14–18`; `lib/server/postgres-auth-routes.ts:24–28`.
- **Observed:** old signed admin cookies without a refresh token are deliberately never rechecked. Owner identity accepts the signed role/email without requiring a Supabase-tracked session in Supabase mode.
- **Conditional scenario:** a password-only cookie issued before cutover remains unexpired and the signing secret is retained. It can continue authorizing owner actions without the new MFA login or refresh-token revocation checks. Disabling the Supabase account cannot revoke a cookie that is never checked there.
- **Suggested fix:** require a tracked cookie when Supabase owner auth is selected, or introduce an explicit session-version/cutover invalidation boundary. Verify existing-session migration deliberately; do not assume the mode switch invalidates cookies.
- **Confidence:** high about compatibility behaviour, conditional about exposure. Existing production cookies and configuration were not inspected.

### R2 — Medium: draft retention is not a reliable shared-phone privacy boundary

- **Locations:** `lib/sale-draft.ts:26–27,50–65`; `components/session-guard.tsx:9`; `lib/store.ts:299`.
- **Observed:** drafts are stored in plain localStorage under a display name, not a stable staff ID/backend. Expiration is enforced when that draft is read, not by removing all expired drafts. Sign-out cache cleanup does not purge these keys. Other persisted app caches share the origin too.
- **Conditional scenario:** Ada saves a customer's phone number, signs out, and the device is handed to Bola. Ada's bytes remain in origin storage beyond 24 hours if her draft is never read. Reusing the display name, or accessing browser storage on the shared device, can expose it. This is not evidence of a remote cross-origin exploit.
- **Suggested fix:** agree the shared-device retention policy, key drafts by stable staff ID plus backend, and purge expired drafts and inappropriate read caches on identity transitions. Keep pending financial operations recoverable rather than indiscriminately clearing localStorage. Consider storing less customer information.
- **Confidence:** high about persistence; whether it meets the shop's privacy policy needs owner confirmation.

### R3 — Medium: restored print carts retain old prices without a fresh confirmation

- **Locations:** `components/sales-entry.tsx:604`; `lib/order-cart.ts:7`.
- **Observed:** restoration retains saved cart items, and an existing `orderItem` is returned unchanged rather than reconciled with the current catalogue.
- **Conditional scenario:** a 10 sq ft print draft is saved at ₦150/sq ft. The owner changes the list price to ₦200 before restoration. With price approvals disabled, the restored sale can still post at ₦1,500 rather than ₦2,000, without a specific stale-price decision. The system intentionally allows typed print prices, so retaining an explicit override is not inherently a bug.
- **Suggested fix:** compare restored drafts with the current catalogue and require confirmation of changed prices, clearly distinguishing a deliberate override from an old default. Do not recalculate a frozen order already in the outbox.
- **Confidence:** high about retained prices; business-policy risk rather than an unconditional arithmetic defect.

### R4 — Medium: an unbounded auth refresh can prevent the grace-period fallback

- **Locations:** `lib/server/admin-auth.ts:43–49`; `lib/server/admin-session.ts:26–38`; `proxy.ts:19`.
- **Observed:** the auth fetch has no explicit deadline. The proxy awaits refresh before choosing the unavailable-within-grace fallback; in-flight deduplication is process-local and its cleanup waits for settlement.
- **Conditional scenario:** a cookie last checked at 10:00 reaches its recheck at 10:06, but the refresh connection stalls without resolving/rejecting. Requests wait on that promise instead of promptly continuing within the allowed grace, until an external runtime/network timeout intervenes.
- **Suggested fix:** impose a short bounded refresh timeout and classify timeout as unavailable, still enforcing the original 30-minute last-good boundary. Test a nonsettling fetch and independent instance behaviour.
- **Confidence:** medium about user-visible duration because deployed network/runtime limits were not tested. Process-local refresh deduplication also deserves multi-instance testing, but concurrent refresh is **not** by itself proof of revocation: Supabase documents reuse-interval and parent-token exceptions in its [session documentation](https://supabase.com/docs/guides/auth/sessions).

### R5 — Medium: test alerts and subscription growth have no application quota

- **Locations:** `lib/server/push-routes.ts:21–23`; `lib/server/push.ts:87–90`; `supabase/migrations/202610130049_phone_alert_test.sql:17`; `supabase/migrations/202610130048_phone_alerts.sql:116`.
- **Observed:** each signed-in test request gets a new random operation ID and queues work; there is no visible per-staff cooldown/quota or subscription-count cap. Tests target the requesting staff member, which limits cross-user spam but not resource consumption.
- **Conditional scenario:** a valid cashier session sends 1,000 test requests or registers many valid provider subscriptions. This creates database and outbound delivery work competing with normal shop activity and limited database connections.
- **Suggested fix:** add per-staff cooldown/rate limits, cap active subscriptions, and bound request sizes. As defence in depth, restrict allowed endpoint ports and reject credentials in URLs. The anchored HTTPS hostname allow-list and the restricted `jmt17.google.com` paths did not reveal a confirmed SSRF bypass in this review.
- **Confidence:** high about missing application limits; actual load impact and any external platform controls were not verified.

## Coverage of all ten requested areas

| Area | Review result |
| --- | --- |
| 1. Money correctness | Traced exact-kobo conversion, BigInt/string boundaries, SQL totals, collection and status updates, corrections, opening receivables and reports. F1, F4–F6 and F8 are material findings. No additional confirmed core rounding, short-payment, excess-payment, or same-key duplicate-collection defect found in the inspected paths. The durable collection path preserves the original request/date and updates payment plus job status atomically. |
| 2. Authentication/session | Inspected HMAC cookies, owner MFA flow, pending versus admin role, refresh recheck, 5/30-minute boundaries and forwarding renewed cookies to the route. R1 and R4 remain. No new forged-cookie or direct MFA bypass established for newly issued tracked sessions. Real owner login/revocation was not exercised. |
| 3. Authorization/RLS/definer functions | Traced route identity into runtime-role functions; inspected private-schema grants/revokes, security-definer search paths and selected owner-only stock/report/settings/approval operations. F1 and F2 are confirmed application-boundary gaps. No additional anon/authenticated direct SQL grant bypass found in the inspected migrations. Runtime-supplied actor/owner values require trustworthy route checks; table RLS does not replace them. |
| 4. Push | Reviewed hostname/path checks, subscribe/test identities, dispatch authentication and claim/report lifecycle: F10, F11 and R5. No confirmed allow-list SSRF bypass or ability to request another person's test alert found. No real push provider was contacted. |
| 5. Database connections | Reviewed pool options, cached initialization, cleanup and retry classification: F9. No connection leak established. Auth and financial modules each create their own pool: max 1 means up to two connections per instance when both are used, not one across the entire application; instance scaling increases that total. Hosted pool exhaustion and long query/lock behaviour remain unverified. |
| 6. Offline outboxes | Inspected order/payment/expense persistence, expected staff/backend identity, replay, response confirmation and queue retention: F3 and F4. No new same-frozen-ID duplicate posting found in the core inspected collection path. Different-intent identical payloads and changed-rule replay are missing business cases. |
| 7. Unsaved-sale draft | Inspected storage validation, expiration, restore date, save reset and cart restoration: F12, R2, R3. No mounted UI/save verification was performed. |
| 8. Shift Report | Traced all three feeds and the date/cashier/amount calculations: F6 and F7. Existing “Outstanding” means current positive balances of that day's selected sales; it does not establish a historical debt snapshot. PDF layout and device download were not retested. |
| 9. Sheets shutdown | Traced PostgreSQL branches for core sale/payment/expense/material/inventory feeds and cashier auth, plus the digest. No additional confirmed mandatory live Sheets request found for the inspected core workflows when the PostgreSQL flags are correctly set. F8 is a legacy field-contract incompatibility. Explicitly unsupported legacy quote/estimator paths and historical quote handling still need operational acceptance; actual deployment flags were not read. |
| 10. Test quality | 849 tests pass, including substantial local SQL coverage. Specific gaps: alternative write/read authorization paths; imported opening-balance cancellation; declined requests after rule changes; successful sale replay through the final approval gate after midnight; two identical but distinct offline operations; partial report HTTP failure; actual feed casing; adapter initialization retry; proxy plus dispatch integration; mixed transient push delivery; mounted draft save lifecycle. Existing outbox assertions encode the F3 behaviour. No production readiness claim follows from this suite. |

The latest 25 commits were screened for affected paths. Substantive draft, Shift Report, push, auth and pool changes received the most attention; cosmetic/loading/navigation changes received lighter inspection. Exact money-input formatting was inspected without identifying another confirmed defect worth reporting.

## What was NOT reviewed or verified

- An exhaustive line-by-line review of all 576 changed files, every migration/function, every route, or every UI workflow.
- Any live or sandbox Supabase project, Vercel deployment, hosted grants/RLS/catalogue state, production configuration, credentials, environment files, or existing cookies.
- Actual final Sheet snapshots, imported customer mappings, opening balances, backup/restore results, or the execution of migration/import/backup scripts.
- Production load, privileged concurrency, network failure injection, real session-pooler saturation, cross-instance refresh races, or Vercel execution limits.
- Browser/phone testing, real MFA/SMTP/password recovery, operating-system notification behaviour, live push delivery, PDF download/layout, or localStorage inspection on a shared device.
- A production build, dependency/security audit, or commands outside the permitted test/type/lint checks and read-only source/history inspection.

This review identifies cutover blockers; it does not certify that the remaining system is free of defects. No code fixes, deployment changes or database mutations were made.

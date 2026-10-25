# Review remediation — 17 October 2026

The user authorized local fixes after the independent read-only review. These are uncommitted changes on `codex/supabase-migration`; nothing was pushed, deployed or applied to a hosted database. The original findings remain in `codex-review-findings.md` as the review baseline.

## Confirmed findings addressed

| Finding | Local fix | Regression evidence |
| --- | --- | --- |
| F1: alternative writes bypass approval | Older sale and expense write routes require the verified owner. Cashiers use the existing gated screen-order/screen-expense endpoints. Existing saved legacy entries are retained for review. | Older sale/expense route authorization tests; current gated SQL suites. |
| F2: expense read privacy | Unfiltered accounting expense lists and the shop-wide digest are owner-only. History and preview use a new database capability enforcing owner or originating cashier/today visibility; the old unrestricted read capabilities lose runtime grants. Receipt reads enforce the same visibility. | Two-cashier SQL history/preview/receipt tests, HTTP-handler tests and digest denial test. |
| F3: lost identical offline transactions | Only the same operation ID and frozen payload are a retry. Separate operation IDs preserve two identical sales/expenses. Quote conversion and payment-of-the-same-expense guards remain. | Outbox tests for separate identical operations, same-ID retry and changed-payload refusal. |
| F4: approvals and replay | Completed results and stored approval decisions take precedence over current rules. Submissions and decisions share an approval lock before locking receipt/request state. | SQL tests for successful replay after a date-rule change and declined sales/expenses after rules are disabled/relaxed. Existing approval decision suites pass. |
| F5: opening receivable mismatch | Ordinary correction/cancellation refuses historical jobs with no reversible sale journal. Opening balances remain unchanged; an explicit opening-balance adjustment remains an owner bookkeeping task. | Imported-job/opening-journal fixture proves cancellation is refused without changing the job or receivable. |
| F6: Shift Report money semantics | PostgreSQL reporting reads actual receipts and original expense-payment/recovery movements, independent of cancelled sales and mutable expense amounts. All movements are scoped to the collecting/paying staff ID. Kobo totals remain exact; cash, transfer and POS are distinguished using journal accounts even if method labels change. Outstanding is labelled as current debt on those sales. | SQL tests for same-day cancellation with retained cash, unpaid expenses, later payment dates, cashier scope; exact aggregate/format tests. |
| F7: silent incomplete reports | Every fetch must succeed and match the report shape. Failed or superseded fetches cannot produce an exportable report. Errors replace the totals view; PDF/share require a complete response for the selected date. | HTTP-error/malformed-data tests; source review of fetch sequence, date and export guards. |
| F8: digest payment omission | PostgreSQL digest collections use the same movement totals as Shift Report. The legacy casing fallback includes `AMOUNT`. Report-day selection uses Lagos time. | Digest test with ₦25,000 of old-debt receipts and no new sales, with Sheets access mocked to fail if called. |
| F9: pool initialization retry | Initialization preserves the internal error cause; the retry classifier follows it. HTTP handlers still sanitize database errors. | Both auth and financial adapter tests simulate first-connection saturation, successful retry and failed-pool cleanup. |
| F10: dispatcher blocked by proxy | Only POST `/api/push/dispatch` bypasses browser-session enforcement. Its secret authentication remains mandatory. | Proxy plus handler test: correct secret succeeds, missing secret fails, neighbouring paths and GET remain protected. |
| F11: partial push loss | The outbox remembers successfully delivered subscription IDs, retains transient failures and retries only remaining targets. | Mixed-success/transient sender test and real local SQL claim/report/retry test. |
| F12: stale saved-sale draft | PostgreSQL save uses the complete form reset and explicitly removes the draft after durable outbox persistence, including natural-language text and unfinished item fields. | Outbox/draft tests and source review of the save/reset effect. Mounted browser/phone verification remains required. |

## Additional risk mitigations

- **R1:** selecting Supabase owner authentication rejects old password-only cookies at both the proxy and verified-owner boundary. Password mode remains compatible until the mode is deliberately changed. Tests cover the mode transition.
- **R2:** PostgreSQL drafts use verified staff IDs rather than display names. Sign-out, expired-session cleanup and successful sign-in purge unsaved drafts, customer catalogues and read caches. A regression test proves that an unhydrated persisted financial queue survives this cleanup. Old display-name draft keys are not automatically assigned to a new identity.
- **R3:** restored drafts require confirmation before retaining print prices that differ from the available catalogue, or when current prices cannot be checked offline. Dismissing the restored-draft notice does not skip this check. Already-queued financial payloads are never repriced.
- **R4:** owner-auth requests, including response-body reads, have a five-second deadline and an abort signal. Timeout is treated as unavailable, without extending the original 30-minute grace. A nonsettling-fetch test covers this.
- **R5:** test alerts have a database-enforced 30-second per-person cooldown; active subscriptions are capped at five per person. Push request bodies are bounded, endpoint credentials/nonstandard ports are refused, and mixed delivery remains retryable. Local SQL and service tests cover the controls.

These controls do **not** encrypt browser storage or make an unlocked shared device a strong privacy boundary. Financial outboxes and confirmation evidence intentionally remain available for recovery and can contain customer data. Unsaved drafts are cleared on sign-out/session expiry. Local expiration cannot physically delete bytes while the browser is closed. This tradeoff needs shared-phone operational acceptance.

## Migration and release boundary

The new migration is `supabase/migrations/202610170050_review_safety.sql`; expected schema metadata is now **52 migrations**. Existing migration files were not edited. The CLI created the file locally; its filename was then adapted to the repository's existing twelve-digit migration convention. No `npm run migration:*` command was run.

The migration and application changes must be released together through the approved cutover process. The new expense-read/report capabilities and push-delivery tracking depend on this migration; deploying only the application is insufficient. No production activation, credential changes or migration application was authorized or attempted in this task.

The PostgreSQL Shift Report uses the new movement query. The existing Sheets report path remains available before cutover, with stricter fetch/error handling; historical Sheets data quality is not repaired by these changes.

## Verification

- `npm test`: **128 files, 877 tests passed** (20.60 seconds), including local PGlite migration, authorization, accounting and backup/restore tests.
- TypeScript (`tsc --noEmit --incremental false`): **passed**. Incremental output was disabled to avoid an unrelated build-info change.
- Full ESLint: **22 errors, 12 warnings**, matching the review's source baseline. Generated `.next*` build directories are now excluded, eliminating the 33,616-problem generated-output noise. The pre-existing hook errors were not suppressed or mechanically rewritten.
- Focused lint on the new report, auth/proxy, session cleanup, login and associated test files: **zero errors**, two pre-existing cashier-navigation warnings.
- `git diff --check`: clean.

The final sign-in cleanup and catalogue-clearing adjustment received an additional focused test/typecheck pass after the full suite. No browser, real phone, hosted database, live push provider or production-load test was run. No production build was run because the task retains the no-secret/no-hosted-access boundary.

## Before cutover acceptance

1. Apply the reviewed migration and matching app build through the owner's approved deployment process; verify expected schema version 52.
2. On a phone, save a natural-language sale, leave and return: no stale draft. Save two identical offline sales and two identical expenses: both operations must sync once each.
3. Verify cashier expense visibility, an over-limit expense, a declined-request retry after a rule change, and a lost-acknowledgement sale retry across Lagos midnight.
4. Reconcile a shift containing old-debt receipts, Cash/Transfer/POS, an unpaid expense, a prior-day expense paid today, a cancelled paid sale and an expense recovery. Check cashier filters, PDF and sharing against the ledger.
5. Verify owner MFA/revocation and the bounded outage grace on the deployed runtime, and test dispatch without a browser cookie plus partial delivery to two devices.
6. Confirm the shared-phone draft/cache cleanup policy and historical opening-balance adjustment workflow. Hosted pooler/concurrency and physical-device checks remain acceptance work, not claims established by the local suite.

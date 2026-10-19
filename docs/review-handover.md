# Handover note — BOMedia sales app (updated 19 October 2026)

For the owner and any reviewer. It says what exists, what changed, what has been checked, and what is still open. It contains no secrets and no secret values; only environment variable names.

## 1. What this is

An internal tool for BOMedia (large-format printing) to log daily sales, payments, expenses, stock and customer debt. Staff and cashiers use it on phones; the owner (Elijah) uses an admin side. It is not public.

- Stack: Next.js 16 (App Router) + TypeScript, MUI v9 (migrating off Tailwind), Supabase (Postgres + Auth), deployed on Vercel.
- `main` = the OLD live app (Google Sheets backend). Vercel deploys production only from `main`. Do not push to `main`.
- `codex/supabase-migration` = the Supabase rewrite, many commits ahead of `main`. Vercel Previews build from it against a SANDBOX Supabase project.
- Planned cutover: Sunday 18 October 2026 was the plan. It has NOT happened; the date is an open decision (see section 7). Until then production still runs on Sheets.
- Project rules are in `CLAUDE.md` (theme.ts is the single source of styling truth; business logic is not rewritten during UI work; no ALL-CAPS buttons; cashier portal keeps amber/orange identity).
- Next.js in this repo has breaking changes versus common knowledge; the guides are in `node_modules/next/dist/docs/`.

## 2. Architecture in one page

- Screens: `app/bom03/*` (owner) and `app/cashier/*` (cashiers). Shared pieces in `components/`. All styling in `app/theme.ts`.
- API routes: `app/api/*`. Server logic in `lib/server/*`: auth, accounting, approvals, corrections, stock, phone alerts, database access.
- Database: `supabase/migrations/*` (52 migrations; the newest is `202610170050_review_safety.sql`) and `supabase/tests/*`. Money is kept in kobo as strings/bigint.
- Offline: sales, payments and expenses go through outboxes (`lib/order-outbox.ts`, `payment-outbox.ts`, `expense-outbox.ts`) so a phone can save while offline and sync later.
- Owner sign-in: Supabase Auth over REST. Password, then authenticator code. `ADMIN_AUTH=supabase`. Cookie `admin_session`; `proxy.ts` re-checks the Supabase refresh token every 5 minutes, with a 30-minute grace if Supabase is unreachable (now with a 5-second request deadline).
- Cashier sign-in: staff name + PIN against the database.
- Phone alerts: Web Push (VAPID). Alerts are queued in the database and sent after the response using Next `after()`. The push address must be on an allow-list (`PUSH_HOSTS` in `lib/server/push.ts`); test alerts have a 30-second cooldown and at most five phones per person.
- Database connection: session pooler on port 5432, one short-lived connection per Vercel instance, retry on connection-limit errors (`lib/server/db-pool.ts`). Port 6543 (transaction pooler) HANGS with this app. Do not use it.
- Legacy: Google Sheets code (`lib/google-sheets.ts`, `sheet-cache.ts`, legacy routes) is still present. It is to be removed after cutover. The harmless log line "Google Sheets environment variables are missing." comes from it.

## 3. What has been done (high level)

Owner approvals; correct/cancel a sale and an expense; expense categories; staff access; audit log; business details; services and payment method settings; opening-balance tooling; phone alerts; owner sign-in through Supabase Auth; sign-in safety; records, debt tiles and the collected-today bar; the new New-sale flow; and the UI migration to shared MUI components. Detailed history: `docs/migration-handoff.md`, `docs/claude-code-start-here.md`, `docs/migration-stages.md` (some headings there still say "uncommitted"; everything listed is committed).

## 4. Latest changes (newest first)

- **Shift Report PDF redesign (`d98fbc9`)**: BOMedia logo; collected cash and net cash first; payment-method bar; facts; jobs, materials, expenses; signature lines; a footer with page numbers. Rows have fixed heights and are split over as many A4 pages as needed (`lib/shift-report-pages.ts`, tested), with the table heading repeated. Files: `components/shift-report-pdf.tsx`, `components/shift-report-modal.tsx`, styles in `app/theme.ts` (`shiftReportPdfStyles`).
- **Shift Report padding (`88bf53c`)**: the Cash/Transfer/POS line moved inside the padded body; shorter subtitle.
- **Review fixes (`1770b23`, by Codex)**: an independent read-only review found 12 problems and 5 risks; Codex fixed them. Details: `docs/codex-review-findings.md` (what was found) and `docs/codex-review-remediation.md` (what was changed and how). Highlights: older sale/expense routes are owner-only so cashiers cannot bypass approvals; expense reads are filtered by who may see them; two identical offline sales are no longer merged into one; approval decisions and completed sales replay correctly even after rules change; cancelling an imported job with no reversible sale entry is refused; Shift Report totals now come from real receipts and paid expenses split by Cash/Transfer/POS; failed report requests can no longer produce a zero PDF; the digest counts later payments; first-connection pool errors are retried; the push dispatcher is reachable with its secret; a delivered alert is tracked per phone; old password-only owner cookies are rejected in Supabase mode; drafts are keyed by staff ID and purged at sign-out.
- **Unsaved-sale draft (`51462e6`)**: New entry keeps what is typed on the phone, restores it with a "Start fresh" bar and a dot on the New entry tab. Confirmations use an in-page dialog because the browser pop-up is blocked in some app windows.
- **Test alert and phone alert host (`cdb3cda`, `6d7de5e`, `4adc83c`)**: the test alert now sends; vivo/Chrome's `jmt17.google.com` alert address is allowed for alert paths only.
- **Cleanup (`c40dc35`)**: removed ten one-off codemod scripts, three outdated notes, and the Sheets-era `e2e/` runner.

## 5. How it was checked, and what was not

Run yourself:
- `npm test`: 129 files, 882 tests passed at last run (includes local database tests).
- `npx tsc --noEmit`: clean.
- `npx eslint .`: 22 errors and 12 warnings across the project, all older than the recent changes (for example `set-state-in-effect` in `components/sales-entry.tsx`). Codex's note says the same baseline. The files changed this session lint clean.
- `npm run sandbox:dev`: runs the app against the sandbox database (see `docs/sandbox.md`).

Checked by hand on the Vercel Preview (commit `1770b23`, sandbox database), phone width:
- Cashier (Ada): sign-in; home; records; a full test sale (₦1,500 cash) saved on the device and synced with a reference; the draft cleared after saving.
- Owner: dashboard; the new server-side Shift Report (Cash ₦9,500 + Transfer ₦6,000 = ₦15,500 collected; four jobs add up to ₦21,500) and its PDF; Expenses; Records; the Phone alerts page.
- Owner-confirmed on a real phone earlier: phone alerts, the Shift Report and the draft behaviour.
- The PDF page design was checked with sample data (3 pages, logo, fonts). Not yet seen through the real button after the redesign.

NOT verified: two cashiers and an owner-only expense category (expense visibility); two identical offline sales; approval replay across Lagos midnight; partial push delivery to two devices; the Shift Report cashier filter; anything against the live Supabase project; production load; the owner sign-in flow driven by anyone but the owner.

## 6. Known risks and observations

- **Speed (the main one).** On the Preview, warm requests took 1.5 to 8 seconds, and cold ones were much slower: four feeds took exactly 25 seconds and three identical `/api/accounting/context` calls took exactly 31 seconds. Identical durations suggest many requests waiting on one slow database connection. It may be the region (Vercel `cpt1` versus the Supabase region) or the pooler, not recent code; this is unproven. Fix before cutover: put the Vercel function region close to Supabase and recheck cold starts.
- The Preview has no Gemini key, so "Describe it (AI)" falls back to basic reading there.
- Unsaved drafts and financial outboxes live in browser storage on shared phones. This is not encrypted; it is cleared at sign-out except pending financial operations, which are kept so no sale is lost. The shop must accept this.
- The Shift Report PDF is an image of each page (text is not selectable), made the same way as the invoice. Long job descriptions are cut at two lines in the PDF.
- The migration `202610170050_review_safety.sql` must be applied together with the matching app build at cutover. The sandbox already has it.
- Sandbox data contains test records (for example "CODEX QA 18OCT A", "ZZ Review Test23"). Do not carry them to production.

## 7. Open decisions and next steps

1. **Cutover date.** Decide whether to go now or move it until the slow cold starts are fixed.
2. **Cutover runbook:** live Supabase project (session pooler 5432, one connection per instance, retry), production environment variables (private keys marked Sensitive; a new `SESSION_SECRET` signs everyone out once), migrations, data load, opening balances from a final Sheet snapshot (the Sales row is the truth for what customers owe; the Payments tab is unreliable), the ₦670,000 loan record, switching off Sheets, backups, a paid Supabase plan so it does not pause, and a Vercel region near Supabase.
3. **Money boxes with commas** on the remaining screens (expense log/correct/recover, stock "Total paid", prices, approval limits, correct-sale price).
4. **After cutover:** remove the Sheets code, Tailwind and unused pages; move the three planning notes (`database-migration-plan.md`, `database-migration-scope.md`, `monday-accounting-cutover.md`) into `docs/archive/`; rewrite `README.md`.

## 8. Rules for any reviewer

- Read-only: do not change app code, push, merge, or touch `main`, Vercel or any Supabase project.
- Do not print or request secrets. Environment files (`.env.local`, `.env.sandbox.local`) are private.
- Do not run migration, import or backup scripts (`npm run migration:*`).

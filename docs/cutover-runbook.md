# Cutover runbook — Google Sheets to Supabase (draft, 19 October 2026)

Status: DRAFT for the owner's review. The cutover date is NOT fixed (see "Go / no-go gates"). Nothing in this document has been run. Only the owner may set production secrets, apply anything to the live Supabase project, or merge to `main`.

Order agreed with the owner: **cutover first (customers, materials, opening debts, loan), then history import ("B") afterwards.**

## 0. Words used

- **Live Supabase project**: the real project that already holds the 4 Oct imports (14 materials, 176 rolls, 31 opening stock movements, 146 expenses, 3 estimates, staff). Do not click-test on it.
- **Sandbox**: `bomedia-sandbox`, for rehearsals only.
- **`main`**: the old Sheets app, currently live on Vercel. `codex/supabase-migration`: the new app (about 100 commits ahead).
- **Cutover**: the shop starts using the new app and stops using the Sheet.

## 1. Go / no-go gates (all must be yes)

1. **Speed.** Warm requests under about 3 s and a cold start under about 8 s, measured on a Vercel Preview against the sandbox after the region change in step 2.1. (Seen on 18 Oct: cold calls of 25 s and 31 s.)
2. **Rehearsal.** The full sequence in section 4 has been run once end to end on the sandbox.
3. **Tests.** `npm test` and `npx tsc --noEmit` pass on the commit that will be released.
4. **Missing pieces built and approved** (section 3).
5. **Owner decisions given** (section 5).
6. **Backup verified** (step 4.3) and a copy kept off this Mac.
7. **Quiet shop.** Sunday (or any closed day); all phones synced; nobody mid-sale.

## 2. Before the day (preparation)

2.1 **Fix speed.** Check the Supabase region of the live project; set the Vercel function region to the nearest one (Project Settings > Functions > Region; or `regions` in `vercel.json`, which does not exist yet). Keep one short-lived database connection per instance and the session pooler on **port 5432**. Never use 6543 (it hangs with this app). Re-measure.

2.2 **Paid Supabase plan** for the live project, so it never pauses.

2.3 **Off-device backup destination** chosen (a second drive or cloud storage) and a place to keep `MIGRATION_ARCHIVE_PASSPHRASE` independently.

2.4 **Production environment variables** prepared in Vercel (Production target only; the owner enters them). Names only here:

| Group | Variables |
| --- | --- |
| Mode flags | `AUTH_BACKEND=postgres`, `POSTGRES_FINANCIAL_API_ENABLED=true`, `ADMIN_AUTH=supabase` |
| Owner sign-in | `ADMIN_EMAIL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_ADMIN_STAFF_ID`, a NEW `SESSION_SECRET` |
| Database (session pooler, port 5432) | `SUPABASE_AUTH_DATABASE_URL`, `SUPABASE_FINANCIAL_DATABASE_URL`, `SUPABASE_PROJECT_REF`, `SUPABASE_CA_CERT_PEM` (one line, `\n` escaped) |
| Receipts | `SUPABASE_STORAGE_KEY` |
| Phone alerts | `PUSH_VAPID_PUBLIC_KEY`, `PUSH_VAPID_PRIVATE_KEY`, `PUSH_VAPID_SUBJECT`, `PUSH_DISPATCH_SECRET` |
| AI | `GEMINI_API_KEY` |
| Old Sheets (keep only until the final read) | `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SHEET_ID` |

Mark as Sensitive: every key, URL with a password, the VAPID private key, `SESSION_SECRET`, `GOOGLE_PRIVATE_KEY`, `GEMINI_API_KEY`. A new `SESSION_SECRET` signs everyone out once, which also kills any old password-only owner cookie. Remove `ADMIN_PASSWORD` only after the owner login with the authenticator code is proven on production. `NEXT_PUBLIC_ACCOUNTING_LIVE` appears only in older notes and is not referenced by the current code: confirm before relying on it.

2.5 **Supabase Auth settings** (owner, in the Supabase dashboard): the redirect URL for `/bom03/login/reset` on the production domain; email confirmation and authenticator (MFA) on; the owner account exists and its authenticator is set up.

2.6 **Physical stock count** (rule from 14 Oct: hand-edited sizes do not move stock, so confirm stock against a count, not against the Sheet).

2.7 **Names**: the owner's yes/no on every look-alike customer pair (`migration-data/opening-balances/NAME-LIST-look-alikes.csv`). Decisions already given are recorded in the project memory.

## 3. Build status

1. **Opening-balance command: BUILT and tested (19 Oct), not yet run on any real database.** `scripts/migration/opening-balances.mjs`, wired into `cli.mjs`; tests in `supabase/tests/opening-balances.test.ts` (13). It reads the owner-approved CSV files in `migration-data/opening-balances/` (start date, optional `2-name-decisions.csv` with the owner's same-person decisions, customers who owe, credits, loans) and does four things. A name decision (`name_in_sheet,same_person_as`) merges two spellings into one customer and is shown in the summary; without a decision, only spaces and capitals are ignored:
   - `npm run opening:check` reads the files only and prints the totals. It refuses anything unclear (blank or zero amounts, bad dates, clashing phone numbers, credits, other loan types).
   - `npm run opening:post -- --confirm-project <ref>` creates the customers, one order per Sales ID, one opening job per debt (the amount still owed), the opening entry (debit Customer receivables per job, credit Owner capital) and the loan entry (debit Owner capital, credit Loans payable). It creates the bookkeeping settings row in "setup" mode. Safe to repeat with the same files.
   - `npm run opening:verify -- --confirm-project <ref>` reads the database back and compares it with the files.
   - `npm run opening:activate -- --confirm-project <ref>` starts the books, only if every check passes. One way.
   Decisions applied: opening job = amount still owed; one combined debts entry. Not supported (it refuses): customer credits (nothing in the app uses account 2100 yet) and loan types other than "loan you owe".
2. **Customer import**: done by the command above (customers come with their debts). Customers with no debt are NOT created; they arrive with history import "B" later.
3. **Materials refresh: not built.** The existing `import-stock` refuses a second snapshot, and every importer is blocked once any runtime write exists. So materials must be refreshed BEFORE `opening:post`. The cheapest route is probably updating prices and remaining lengths on the existing rolls; needs a short plan and approval.
4. **Final Sheet report from the exports**: to be produced on the day by me from the CSV exports (the owing file must contain only real debts, one row per owing sale).

## 4. The day (shop closed). Owner steps are marked (O), mine (C)

4.1 (O) Tell all cashiers to stop. Make sure every phone shows nothing waiting to sync ("saved on this device" queue empty). Lock the Sheet by agreement: nobody edits it from now.

4.2 (O) Export the Sheet tabs Sales, Payments, Expenses, Inventory, Materials as CSV into the private folder `migration-data/` (git-ignored). Keep a dated copy.

4.3 (O+C) Back up the live Supabase project and verify the restore:
```sh
npm run migration:backup-db -- postgres-recovery-YYYYMMDD-01 --confirm-project <live-project-ref>
npm run migration:verify-backup -- postgres-recovery-YYYYMMDD-01
```
Copy the encrypted folder off this Mac (step 2.3). This is a local encrypted copy, not a disaster-recovery plan; see `docs/database-recovery.md`.

4.4 (C) From the exports, produce the final owing list, mismatch report and customer list. (O) review and confirm every figure before anything is loaded. Unknown amounts stay blank with a note; they are never treated as zero.

4.5 (O) Apply migrations to the live project (target: 52, latest `202610170050_review_safety.sql`), then re-provision the two restricted database logins and verify:
```sh
npm run migration:apply -- --confirm-project <live-project-ref>
npm run migration:provision-auth
npm run migration:provision-financial
npm run migration:verify-auth
npm run migration:verify-financial
```
The app checks the schema count itself (`EXPECTED_MIGRATION_COUNT = 52`).

4.6 (O+C) Load the data, in this order, each step verified before the next: (1) materials and rolls refresh, FIRST, because importers stop working once anything is posted; (2) `opening:check`, then `opening:post`, then `opening:verify`, then `opening:activate` with `--confirm-project <live-project-ref>` (see section 3). The evidence reference is built from the fingerprints of the approved files. Compare totals against the approved report: number of customers, total owing (about ₦695,000 on 14 Oct, will differ), loan ₦670,000.

4.7 (O) Set the production environment variables (step 2.4) in Vercel, then release: merge `codex/supabase-migration` into `main` through a pull request (PR #2 exists). Vercel builds production. Wait for the build to be READY and for production to show the new login.

4.8 Smoke test on production, owner and cashier (create only clearly named test records and reverse them straight away; the reversal also tests corrections):
- Owner sign-in with the authenticator code; sign-out; forgot-password link opens the production reset page.
- Cashier sign-in (name + PIN) for each real cashier.
- New sale with a small payment; the record, the customer debt and the Shift Report agree.
- A payment against an old debt; an expense; a correction; an approval request and decision.
- Receipt photo upload; phone alerts turned on from the owner's phone and a test alert received.
- Job board status change; stock screen shows the refreshed lengths.
- Check the Vercel runtime logs: no errors, and requests answer within the speed gate.

4.9 (O) If everything passes: tell the cashiers; the shop opens (Monday 9:00).

## 5. Owner decisions needed

1. The cutover date (see the gates). 2. The look-alike customer yes/no list. 3. Confirm the ₦670,000 loan is still owed in full (14 Oct: yes). 4. Approve the materials refresh plan (section 3, item 3) when I send it. 5. Where the off-device backup goes. 6. Whether a short evening check-in on the first day is wanted.

## 6. Rollback

- **Before the shop reopens**: in Vercel, promote the previous production deployment (the old Sheets app) back to production. The Sheet was not changed, so nothing is lost. The new database keeps the loaded data and can be reset from the step 4.3 backup.
- **After the shop has reopened**: a rollback loses anything entered in the new app since. Sales and payments from that time would have to be entered into the Sheet by hand. Decide an explicit "point of no return" with the owner (suggest: end of the first trading day) and watch closely until then.
- Never disable database guards or row-level security to "fix" something during cutover.

## 7. After cutover (in order)

1. Watch the first day: Vercel logs, phone alerts, queue status, speed.
2. Remove `ADMIN_PASSWORD` (after the authenticator login is proven) and, once the final Sheet read is archived, the Google variables. Rotate any secret that was ever pasted into a chat or terminal.
3. **History import "B"** (read-only history of old sales and payments on each customer's profile, plus a lifetime-spend figure). Separate plan and approval; never posted to the books.
4. Cleanup: remove the old Sheets code, Tailwind and unused pages; archive the three planning notes into `docs/archive/`; rewrite `README.md`.
5. Money boxes with thousands commas on the remaining screens.

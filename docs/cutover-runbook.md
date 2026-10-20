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

2.3 **Off-device backup destination: Google Drive (decided 19 Oct)**, private folder `BOMedia backups`, not shared and a place to keep `MIGRATION_ARCHIVE_PASSPHRASE` independently.

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

2.4b **Receipt storage on live: DONE (20 Oct).** `npm run receipts:setup-live -- --confirm-project <live-ref>` created the private `expense-receipts` bucket (1 MB, jpeg/png/webp). It only reads and creates, never changes or deletes a bucket, and is safe to repeat.

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
3. **Opening stock: BUILT and tested (19 Oct), not yet run on any real database.** `scripts/migration/stock-opening.mjs` (14 tests in `supabase/tests/stock-opening.test.ts`). It loads current prices and the owner's physical count BEFORE the opening entries, because the app refuses every sale while the Inventory account is empty, and every importer stops once anything is posted. Files in `migration-data/stock-opening/`: `materials.csv` (`material_id,name,width_ft,selling_price_naira_per_sqft,low_stock_threshold_ft`) and `rolls.csv` (`roll_id,material_id,item_name,width_ft,raw_length_ft,total_length_ft,remaining_ft,purchase_cost_naira,selling_price_naira,date_added,note`; `remaining_ft` is the physical count, one row for every roll including empty ones). I produce both from the Sheet exports and your count.
   - `npm run stock:check` reads the files only.
   - `npm run stock:diff -- --confirm-project <ref>` compares with the database and changes nothing. Blocks on: a roll whose total length or purchase cost differs from the database (you decide which is right), a roll with stock that is not in `rolls.csv`, a roll with no purchase cost.
   - `npm run stock:apply -- --confirm-project <ref>` updates prices and thresholds (the app's price guard is switched on for this step only), adds new materials and rolls, and sets counted lengths as dated "Opening count" movements. Nothing is posted to the books. A second run changes nothing. It refuses once any journal entry or runtime write exists.
   - `opening:post` then adds the **opening stock entry** (debit Inventory, credit Owner capital) valued by the app's own roll-value function, and `opening:verify` checks Inventory equals the counted stock at cost.
   Order on the day: `stock:diff`, `stock:apply`, `opening:check`, `opening:post`, `opening:verify`, `opening:activate`.
3b. **Customer history ("Before the new app"): BUILT, rehearsed 19 Oct.** The whole Sales tab becomes read-only history on each customer's profile (owner and cashiers can see it). It never touches the books, stock or what anyone owes today. Files in a folder such as `migration-data/sheet-export-<date>/`: `Sales.csv` (the export), `2-name-decisions.csv` (same file as the opening balances) and `ignore-payments.csv` (`sheet_row,payment,reason`: payments the owner called mistakes, currently row 2762 payment 2 and row 2948 payment 1). Customers are matched to the opening customers by name ignoring spaces and capitals; the rest are created with no debt. Rows with no customer name (7) are listed and not imported.
   - `npm run migration -- history-check <folder>` style: `node scripts/migration/cli.mjs history-check <folder>` reads files only; `history-import <folder> --confirm-project <ref>` loads in about a minute (batched); `history-verify` compares row count, customer count and totals with the file. Safe to repeat; refuses a different file or active books.
   - Order on the day: `opening:post`, **`history-import`**, `history-verify`, `opening:verify`, `opening:activate`. Rehearsal result: 3,693 rows, 223 customers (72 already existed from the opening balances, 151 created), 2,055 orders, ₦31,966,219.23 sold, ₦30,885,449.02 paid, verify passed.
   - **Re-run with 8 more name decisions (19 Oct):** 215 customers (71 with debts), same totals and debts. Lessons: (1) stop the local app/Preview before re-creating database logins on a project, or its stale logins fail repeatedly and Supabase's circuit breaker blocks every new connection for about 5 minutes (`ECIRCUITBREAKER`); wait, do not retry in a loop. (2) If `provision-auth`/`provision-financial` fail on a re-run, remove the old `SUPABASE_AUTH_DATABASE_URL` / `SUPABASE_FINANCIAL_DATABASE_URL` lines and any `*-runtime-credential.pending.json` file first.
4. **Final Sheet report from the exports**: to be produced on the day by me from the CSV exports (the owing file must contain only real debts, one row per owing sale).

## 3b. Rehearsal result (19 Oct 2026) and what it taught us

The whole data sequence was run on a fresh test project (Ireland, nothing shared with live or the sandbox) and passed:
1. All 52 migrations applied. 2. The 3 Oct snapshot staged and the 4 Oct imports loaded (146 expenses, 3 estimates, 14 materials, 176 rolls, 31 stock movements, 2 staff), with the same numbers as the live project. 3. Owner staff record created. 4. `stock:apply` with the count (4 new rolls, 25 recounts including 22 set to zero, value ₦770,835.30). 5. `opening:post`: 65 customers, 140 orders, 166 debts (₦695,075.99), the ₦670,000 loan, and the stock value. 6. `opening:verify`: all 10 checks passed. 7. `opening:activate`. 8. Real activity: a ₦10,000 cash payment against a customer's old debts reduced receivables by exactly ₦10,000; a new ₦1,080 Flex sale took ₦1,038.69 out of Inventory (2 ft of roll 004, 23.06 to 21.06 ft); no unbalanced entries; the Shift Report showed ₦10,500 of receipts as expected.

**Second rehearsal (19 Oct, with the refreshed Sheet export)** passed the same way after wiping the rehearsal project with the new `rehearsal-reset` command (it refuses the live project and the old sandbox): 72 customers, 162 orders, 230 debts totalling ₦1,109,926.20, the ₦670,000 loan, stock ₦770,835.30; all 10 verification checks passed; a ₦50,000 transfer reduced debts by exactly ₦50,000, a ₦2,160 Flex 10 ft sale took ₦2,823.94 out of Inventory, and the Shift Report showed ₦51,000 for 20 Oct. The rehearsal can be repeated from nothing at any time: `rehearsal-reset`, then apply, stage, the three imports, `owner:create`, the provisioning scripts, `stock:apply`, and the four opening commands.

**Facts about the LIVE project found while preparing (read-only checks, 19 Oct):**
- Only **9 of 52 migrations** are applied (latest `202610040007_payment_methods.sql`). `apply` must bring it to 52 before anything else. This can be done days ahead, because it touches no business data.
- There is **no owner staff record** (only the two cashiers, Itunu and Lateef). Run `npm run owner:create -- --confirm-project <live-project-ref>` once; it prints the id to use as `SUPABASE_ADMIN_STAFF_ID` in Vercel. Safe to repeat.
- No bookkeeping settings and no journal entries yet, as expected.
- It was **paused** (free plan) and had to be restored; move it to a paid plan before cutover so it cannot pause again.

**Traps to avoid**
- `provision-auth` and `provision-financial` write the two generated database logins into `.env.local` (live) unless pointed at the sandbox file. Run them only on purpose for the live project, then copy the two URLs into Vercel (marked Sensitive). The rehearsal skipped them.
- Previews use the sandbox project. Pausing the sandbox (free-plan limit of 2 active projects) takes Previews down until it is restored.
- When running rehearsal commands, load `.env.local` first and `.env.rehearsal.local` second so the rehearsal project wins, and always pass its own `--confirm-project`.

## 3c. Daily backup routine (free Supabase plan has no automatic backups)

Until the project moves to a paid plan, Supabase does not keep daily backups for us, so the owner makes one each working day. Takes about a minute.
1. **At the end of each working day** (after the last sale), in the project folder:
   ```sh
   npm run migration:backup-db -- postgres-recovery-$(date +%Y%m%d)-01 --confirm-project <live-project-ref>
   npm run migration:verify-backup -- postgres-recovery-$(date +%Y%m%d)-01
   ```
   The first makes an encrypted copy of the whole database in `migration-data/postgres-recovery-YYYYMMDD-01/`; the second restores it into a throwaway database and checks it matches. Only trust a backup whose verify step passed. If a second backup is made on the same day, change `-01` to `-02`.
2. **Copy that folder off this Mac to Google Drive** (decision 19 Oct: owner's Google Drive, in a private folder named `BOMedia backups` that is not shared with anyone). Drag the folder in with Google Drive for desktop or upload it in the browser, and check it appears in Drive. A copy that only lives on this Mac is lost with the Mac.
3. **Keep `MIGRATION_ARCHIVE_PASSPHRASE` somewhere separate** from the backups (for example a password manager). The backup cannot be opened without it, and nobody can recover it.
4. **Keep the last 14 daily copies**, plus the first backup of each month. Older ones may be deleted.
5. **Keep the project awake**: the free plan pauses a project after about a week of no activity. Open the app at least every few days, including over holidays. If it pauses, restore it from the Supabase dashboard (data is kept) before opening the shop.
6. **Restore** is described in `docs/database-recovery.md`. Do a practice restore once a month so the routine is proven before it is needed.
7. Move to a paid plan when the shop can afford it; daily backups then come from Supabase as well, and this routine stays as a second copy.

## 4. The day (shop closed). Owner steps are marked (O), mine (C)

> The click-by-click version with exact commands is `docs/cutover-day-runsheet.md`. Use that on the day.

4.1 (O) Tell all cashiers to stop. Make sure every phone shows nothing waiting to sync ("saved on this device" queue empty). Lock the Sheet by agreement: nobody edits it from now.

4.2 (O) Export the Sheet tabs Sales, Payments, Expenses, Inventory, Materials as CSV into the private folder `migration-data/` (git-ignored). Keep a dated copy.

4.3 (O+C) Back up the live Supabase project and verify the restore:
```sh
npm run migration:backup-db -- postgres-recovery-YYYYMMDD-01 --confirm-project <live-project-ref>
npm run migration:verify-backup -- postgres-recovery-YYYYMMDD-01
```
Copy the encrypted folder off this Mac (step 2.3). This is a local encrypted copy, not a disaster-recovery plan; see `docs/database-recovery.md`.

4.4 (C) From the exports, produce the final owing list, mismatch report and customer list. (O) review and confirm every figure before anything is loaded. Unknown amounts stay blank with a note; they are never treated as zero.

4.5 (O) **DONE on 20 Oct (all 53 applied, owner record and both logins created on live).** Migrations should already be applied (see section 3b: the live project had only 9). Confirm 53, create the owner record, then provision the two restricted database logins and verify:
```sh
npm run migration:apply -- --confirm-project <live-project-ref>   # skip if already at 52
npm run owner:create -- --confirm-project <live-project-ref>
npm run migration:provision-auth
npm run migration:provision-financial
npm run migration:verify-auth
npm run migration:verify-financial
```
The app checks the schema count itself (`EXPECTED_MIGRATION_COUNT = 53`).

4.6 (O+C) Load the data, in this order, each step verified before the next: (1) stock first (`stock:diff`, then `stock:apply`) because stock cannot be loaded once anything is posted; (2) `opening:check`, then `opening:post`, then `history-import` and `history-verify` (section 3b), then `opening:verify`, then `opening:activate` with `--confirm-project <live-project-ref>` (see section 3). The evidence reference is built from the fingerprints of the approved files. Compare totals against the approved report: number of customers, total owing (about ₦695,000 on 14 Oct, will differ), loan ₦670,000.

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

1. The cutover date (see the gates). 2. The look-alike customer yes/no list. 3. Confirm the ₦670,000 loan is still owed in full (14 Oct: yes). 4. Provide the physical stock count and decide any roll that has no purchase cost or whose length or cost differs between the Sheet and the database. 5. Where the off-device backup goes. 6. Whether a short evening check-in on the first day is wanted.

## 6. Rollback

- **Before the shop reopens**: in Vercel, promote the previous production deployment (the old Sheets app) back to production. The Sheet was not changed, so nothing is lost. The new database keeps the loaded data and can be reset from the step 4.3 backup.
- **After the shop has reopened**: a rollback loses anything entered in the new app since. Sales and payments from that time would have to be entered into the Sheet by hand. Decide an explicit "point of no return" with the owner (suggest: end of the first trading day) and watch closely until then.
- Never disable database guards or row-level security to "fix" something during cutover.

## 7. After cutover (in order)

1. Watch the first day: Vercel logs, phone alerts, queue status, speed.
2. Remove `ADMIN_PASSWORD` (after the authenticator login is proven) and, once the final Sheet read is archived, the Google variables. Rotate any secret that was ever pasted into a chat or terminal.
3. ~~History import "B"~~ built and rehearsed (section 3b); runs in step 4.6 on the day.
4. Cleanup: remove the old Sheets code, Tailwind and unused pages; archive the three planning notes into `docs/archive/`; rewrite `README.md`.
5. Money boxes with thousands commas on the remaining screens.

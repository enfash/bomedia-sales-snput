# Cutover day run-sheet (Sunday 25 Oct 2026)

Follow it top to bottom. Each step says who does it, the exact command, and what a good result looks like. Stop at the first thing that does not match and tell Claude; do not retry in a loop (repeated failed database logins make Supabase block connections for ~5 minutes).

`(O)` = owner, `(C)` = Claude. Commands are run by the owner in the project folder, in one terminal tab.

## Before you start (Friday or Saturday)

- [ ] Supabase Auth set up on the live project (owner user = `elijahfasugba@gmail.com`; email on, sign-ups off, owner user created and auto-confirmed, authenticator on, redirect `https://bomedia-sales.vercel.app/bom03/login/reset`).
- [ ] Vercel Production variables entered (runbook 2.4) and checked against the list: the three mode flags, `SUPABASE_ADMIN_STAFF_ID`, `SUPABASE_PROJECT_REF`, `SUPABASE_CA_CERT_PEM`, both database URLs, publishable and storage keys, the four `PUSH_` values, `SESSION_SECRET` (new), `GEMINI_API_KEY`.
- [ ] `.env.local` keeps `SUPABASE_MIGRATION_DATABASE_URL`, `SUPABASE_MIGRATION_PROJECT_REF`, and `SUPABASE_ADMIN_STAFF_ID` (once). It has no mode flags.
- [ ] Google Drive folder `BOMedia backups` exists; passphrase kept separately.
- [ ] Cashiers' PINs tested on live (they are imported staff; reset any that fail).
- [ ] Cashiers told: Saturday 24 Oct is the last trading day on the Sheet, the shop is closed Sunday, and the new app starts Monday 9:00.
- [ ] `MIGRATION_ARCHIVE_PASSPHRASE` (at least 32 characters) is set privately in `.env.local` so the backup and verify commands can run. It is never shown or typed on a command line.

## 1. Stop and export (O)

1. After Saturday's last sale (owner decision 21 Oct: Saturday 24 Oct is the last trading day and the shop is closed Sunday), cashiers stop. Every phone shows nothing waiting to sync. Nobody edits the Sheet from now.
2. Export the Sheet tabs Sales, Payments, Expenses into a NEW folder `migration-data/sheet-export-20261025/` (Sales.csv, Payments.csv, Expenses.csv).
3. Final physical roll count: give Claude the counts (the rolls list in `migration-data/stock-opening/rolls.csv` is updated from it).

## 2. Backup (O)

```sh
LIVE=rozlwzhwrbbrwtzfvjxc
npm run migration:backup-db -- postgres-recovery-20261025-01 --confirm-project "$LIVE"
npm run migration:verify-backup -- postgres-recovery-20261025-01
```
Good: verify says the restore matched. Then copy the folder to Google Drive.

## 3. Prepare the files (C, owner reviews)

Claude builds the approved files from the final export and puts them in these exact folders:

- `migration-data/opening-balances/`: `1-start-date.csv`, `2-name-decisions.csv`, `3-customers-who-owe.csv`, `4-customers-paid-in-advance.csv`, `6-loans-and-owner-money.csv`. Set `opening_date` to 2026-10-24 (the last trading day), so the books start Sunday 25 Oct and Sunday's smoke tests are inside the books. The owing file contains only real debts, with a required, unique `sheet_row` for each debt. Rows 3665 and 3669 are separate debts even though their content is identical; keep both. Leave the credits file with headers only, because customer credits are unsupported.
- `migration-data/stock-opening/`: `materials.csv` and `rolls.csv`, refreshed from the physical count.
- `migration-data/sheet-export-YYYYMMDD/` (this run: `migration-data/sheet-export-20261025/`): `Sales.csv`, `2-name-decisions.csv` (the same decisions used for opening), and `ignore-payments.csv`.

`ignore-payments.csv` needs `sheet_row,sales_id,payment,expected_amount_naira,reason`; the `sales_id` must be the one on that Sheet row, so an exception can never land on a different row. Claude checks that Sheet rows 2762 and 2948 are still the intended rows and records the exact payment amount the owner approved ignoring. The file is required: with headers only, the owner approved no exceptions; a missing or empty file stops the import. An amount or Sales ID mismatch also stops it. Every input file must have its header row and whole records (a record with fewer cells than the header is refused). Sheet row N is the Nth record of `Sales.csv` (header = row 1, blank records count), the same number Google Sheets shows. A cell with a line break inside quotes is still one row, so file line numbers can be higher; error messages show both.

**Owing file.** `node scripts/migration/cli.mjs owing-build sheet-export-20261025 <new-folder>` (files only) writes `3-customers-who-owe.csv` from the final `Sales.csv`, using the same `2-name-decisions.csv` and `ignore-payments.csv` as the history, so the opening debts and the history cannot disagree. A row is a debt when the Sales row owes at least ₦1 (amount less the initial payment and additional payments 1 and 2). It never overwrites a folder. On the 19 Oct export it reproduces the rehearsal file exactly (230 debts, 71 customers, ₦1,109,926.20, same opening plan digest). The owner reviews the printed summary (debts, customers, total, rows left out under ₦1, debts with no Sales ID) before it is copied into `migration-data/opening-balances/` with the other four files.

**Stock count sheet.** To avoid typing the stock files from scratch, `node --env-file=.env.local scripts/migration/cli.mjs stock-sheet <new-folder> --confirm-project "$LIVE"` (read-only) writes `materials.csv` and `rolls.csv` from what the app holds now, one row per roll that still has stock. The owner types the feet really left in `remaining_ft`, deletes rolls that are gone and adds rolls that are new; the folder then replaces `migration-data/stock-opening/`. A draft made on 22 Oct is in `migration-data/stock-count-20261025/` (31 rolls, counted value ₦1,292,959.23 before any edits). Do the count after trading stops on the cutoff day and before the customer debts are loaded: the stock value must be in the books before `opening:post`, and it cannot be added after `opening:activate`. Rolls the app created itself (no Sheet roll ID) cannot be listed; the command prints them if any exist (none on 22 Oct).

Owner reviews and approves: customers, total owing, the ₦670,000 loan, stock value. Nothing is loaded before this OK.

## 4. Load the data (O, in this order)

Each command must succeed before the next. `--confirm-project "$LIVE"` is required on all.

```sh
npm run stock:diff -- --zero-unlisted --confirm-project "$LIVE"   # shows what will change; blockers must be empty
npm run stock:apply -- --zero-unlisted --confirm-project "$LIVE"  # same flag on BOTH; rolls missing from rolls.csv are recorded as gone (owner confirmed this on 22 Oct for the 19 Oct count: 22 rolls)
npm run opening:check                                       # files only; totals match the approved report
npm run opening:post -- --confirm-project "$LIVE"
node --env-file=.env.local scripts/migration/cli.mjs history-check sheet-export-20261025
node --env-file=.env.local scripts/migration/cli.mjs history-import sheet-export-20261025 --confirm-project "$LIVE"
node --env-file=.env.local scripts/migration/cli.mjs history-verify sheet-export-20261025 --confirm-project "$LIVE"
npm run opening:verify -- --confirm-project "$LIVE"         # every check must pass
npm run opening:activate -- --confirm-project "$LIVE"       # point of no return for the books: they start 25 Oct
```
`--zero-unlisted` zeroes every roll that is not in `rolls.csv`, so before running it Sunday, compare the diff's list of zeroed rolls with the shop one last time, because it is only correct for rolls that are really gone. Good: `history-verify` says verified; `opening:verify` shows `"ok": true` with every check passing; the activate result shows `"activated": true`. `stock:apply` records the approved stock fingerprint; opening-post refuses stock that has changed since that count. History import takes about a minute.

## 5. Release (O)

0. **First, in Vercel (Production):** set `ADMIN_EMAIL` to `elijahfasugba@gmail.com` (the owner's email; it must be exactly the email of the owner user in Supabase Auth, auto-confirmed). Do this right before the merge, not earlier: a production redeploy of the old app before then would start requiring the new email. Keep `ADMIN_PASSWORD` until the authenticator login is proven on production.
1. Merge `codex/supabase-migration` into `main` through the pull request. Vercel builds production.
2. Wait until the deployment is READY and `https://bomedia-sales.vercel.app` shows the new login.

## 6. Smoke test on production (O with C)

Use clearly named test records ("ZZ TEST") and reverse them straight away. They are dated Sunday 25 Oct, which is why the opening date is Saturday 24 Oct: the books must already be running for the money tests to be accepted.
- [ ] Owner signs in with email, password and authenticator code; signs out; "forgot password" opens the production reset page.
- [ ] Each real cashier signs in with name and PIN.
- [ ] A cashier makes a small cash sale; the record, the customer's debt and the Shift Report agree.
- [ ] A payment against one real old debt of a test customer; the debt falls by exactly that amount; then reverse it.
- [ ] An expense with a receipt photo; the photo opens for the owner.
- [ ] A correction of the test sale; an approval request and the owner's decision.
- [ ] Customer profile: "Before the new app" tab shows old sales (try a name from the merge list, e.g. Old square).
- [ ] Job board status change; stock screen shows the counted lengths.
- [ ] Owner's phone: alerts on, test alert received.
- [ ] Vercel runtime logs: no errors; pages answer quickly.

## 7. Open the shop (O)

If every box is ticked, tell the cashiers. Monday 9:00. Keep the first trading day closely watched (Vercel logs, phone alerts, nothing stuck waiting to sync).

## If something goes wrong

- **Before the shop reopens:** in Vercel promote the previous production deployment (the old Sheets app). The Sheet was not changed. The new database can be reset from the backup in step 2.
- **After reopening:** rolling back loses what was entered in the new app; those entries would go back into the Sheet by hand. The point of no return is the end of the first trading day.
- Never switch off database guards to "fix" something.
- A "too many authentication failures" message is Supabase's temporary connection block: stop, wait 5 minutes, then try once.

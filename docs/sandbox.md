# Sandbox (test project)

A separate Supabase project, `bomedia-sandbox`, for trying the new screens. It never touches the live project or Google Sheets.

## One-time setup
1. In `.env.sandbox.local` (git-ignored, on the Mac only) fill:
   - `SUPABASE_MIGRATION_PROJECT_REF` = sandbox Project ID (Project Settings > General).
   - `SUPABASE_MIGRATION_DATABASE_URL` = sandbox Connect > Session pooler (port 5432) URI with the sandbox database password. Use a password of letters and numbers only, or percent-encode symbols.
2. `npm run sandbox:setup` applies all migrations, creates the two restricted logins (saved into `.env.sandbox.local` only), and seeds test data:
   - owner staff record linked to the admin login (`SUPABASE_ADMIN_STAFF_ID`),
   - cashiers `ada` (PIN 1234) and `tunde` (PIN 5678),
   - customers Grace Chapel and Adeola Stores,
   - Flex 10 ft (2 rolls) and SAV 4 ft (1 roll), each 164 ft with 154 ft usable, plus their opening stock value,
   - services Graphic design (fixed), Installation / fixing (per job), Eyelets (fixed),
   - books starting 1 Oct 2026.

The scripts refuse to run if the sandbox Project ID matches the live one in `.env.local`. Re-running setup is safe.

## Use
- Stop the normal `npm run dev` first (both use the same `.next` folder).
- `npm run sandbox:dev`, then sign in as admin at `http://localhost:3001/bom03/login` and open `/bom03/accounting` and `/bom03/stock`. Staff view: `http://localhost:3001/cashier/login` as `ada`.
- Google Sheets is blocked in sandbox mode. Dashboard, Records, Job Board, Customers, New Sale, Estimator and Expenses now use the sandbox PostgreSQL paths. Inventory form integration remains Stage 4; use the stock screen for existing sandbox capabilities.

## Old screens in the sandbox

From migration 0012, the old dashboard, Records, job board, Customers and notifications read the sandbox database, so a job recorded in Accounting entry shows up there. Their old save buttons refuse with "This screen no longer saves". Use Accounting entry and Stock instead. Before 0012 is applied (run `npm run sandbox:setup` again), they show "Fetch failed". The admin login in the sandbox goes straight to `/bom03/accounting`.


## Stage 2 review (8 October 2026)

New Sale and Estimator now save durable versioned orders and quotes. Services are available in New Sale; per-job services require an owner-approved quote. Positive initial payments require Cash / Transfer / POS. Wait for a confirmed BOM/QT reference before treating an entry as saved on the server. Pending/auth/review entries remain on the originating device. See [migration stages](migration-stages.md) for the review checklist and trial references. Stage 2 is accepted; Stage 3 is ready for review.

## Stage 3 private receipt storage (10 October 2026)

New receipts use private Supabase Storage; old Drive receipt references remain unchanged. Set `SUPABASE_STORAGE_KEY` in `.env.sandbox.local` to the sandbox project's server-only secret key from **Settings → API Keys**. Never paste keys in chat, commit them, or prefix this variable with `NEXT_PUBLIC_`.

Run `node scripts/migration/setup-receipt-storage.mjs`, then restart `npm run sandbox:dev` after changing the key. Setup refuses the live project and creates/verifies private `expense-receipts` with a 1 MB limit. This setup and the server restart were completed on 10 October. No public receipt access is configured.

The existing expense form accepts JPEG/PNG/WebP, compresses before sending, and offers a readability preview. Keep the original photo until the EXP reference is confirmed and the saved receipt reopens. Independent backups must include Storage objects as well as database metadata; restoration is a Stage 7 gate. See the Stage 3 checklist for phone acceptance steps.

Owner **Settings → Services** (`/bom03/settings/services`) now manages service prices and availability. Choose Free, Fixed price or Owner approves. Free services record jobs without payments, zero-value journals or roll deductions. New Sale's **Add a service** accordion starts collapsed. Migration 0019 is applied to the sandbox only. Trial order `BOM-20261008-0006` is a free service; its synthetic catalog entry `Settings review service` is hidden after testing. Staff Manager is now under `/bom03/settings/staff`; the previous `/bom03/staff` link redirects there. No staff permissions were changed by the move.

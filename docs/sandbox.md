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
- Google Sheets is blocked in sandbox mode, so old screens (dashboard, Records, New Entry, old Expenses/Inventory) show errors instead of writing live data. Only the new pages are meaningful here.

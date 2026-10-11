# Start here (Claude Code) — updated 11 October 2026, 08:00 Lagos

Owner: Elijah (BOMedia, Lagos large-format printing). Project: Next.js 16 App Router + TypeScript + MUI v9, moving from Google Sheets to Supabase/Postgres. **Nothing is live or deployed on Supabase. Sheets is still the live backend. Work only against the sandbox.**

## How the owner wants to work
- Small working stages with short progress updates. Direct, honest answers; hold a position unless evidence changes it.
- UI work: design first as a Claude design canvas (Design artifact), owner replies "approve", then build. Cross-check screens against the design.
- Order for every feature: database migration, API, tests, then the screen. Never claim a screen is done until it has been seen running.
- Plain words on screens; no UUIDs or database codes anywhere staff or the owner can see.
- No hard-coded colours or inline component styles: everything goes through `app/theme.ts` (admin indigo `#2e388d`; cashier amber is the `warning` slot). Preserve existing business logic unless a stage says otherwise.
- Owner runs the sandbox himself; you may now run `npm test`, `npm run sandbox:setup` and `npm run sandbox:dev` (port 3001) in this folder. Never point anything at the live Supabase project, never run `npm audit fix --force`, never commit `migration-data`, `.env*` or secrets.

## Conventions in the code
- Schema `bomedia`. Security-definer `api_*` functions are granted only to `bomedia_financial_runtime`; sign-in functions `auth_*` only to `bomedia_auth_runtime`. New functions must be added to: `lib/server/financial-db.ts` (type, allow-list, and an explicit dispatcher line for no-argument functions), `scripts/migration/provision-auth.mjs`, `verify-financial.mjs` (and `verify-auth.mjs` for `auth_*`).
- Writes are idempotent (`prior_result` + `idempotency_requests`, one `crypto.randomUUID()` request id per unsaved edit) and write `audit_events`. PG error codes map to `FinancialError` (42501 to 403; 22023, 23514, 23505, 22P02 to 409).
- Tests: service tests inject `call`; route tests mock `next/headers`, `./postgres-auth-routes`, `./postgres-auth`; DB tests use PGlite `testDatabase()` inside `begin` with `set local role bomedia_financial_runtime`, a `failure()` savepoint helper, and `reset role` before inserting into restricted tables.
- Every page's back link is the one `BackLink` component (`components/back-link.tsx`, styled by `backLinkStyles` in `app/theme.ts`): arrow plus destination name, left-aligned with the page title. Use it for any new page; do not hand-build a back button. The older icon-only `router.back()` buttons on the Records, Expenses, Estimator, Board, New entry and Waste pages, Customers and Quick check are not converted yet.
- Lagos has no daylight saving; "today" means the Lagos date.
- Migrations are append-only; never edit one that has been applied. Next number is `202610110037`. Adding a migration also means updating `lib/schema-version.ts` (a test fails until it matches the folder).

## What exists (Settings area, owner only)
Applied to the sandbox through migration 036 (no new migration for the Inventory redesign) and passing `npm test` (see the handoff for the latest count):
1. Business details, Services order/remove, Payment methods (rename/on-off).
2. Staff Manager: restore removed cashiers, active sessions with sign out, "one device per cashier" rule.
3. Audit log (filters, readable sentences, cashier names).
4. Expense categories (`/bom03/settings/expense-categories`): add, turn on/off, and **who can log each one: Everyone / Chosen staff / Owner only** (migrations 027, 028, 030; table `expense_category_staff`). Enforced in the database; staff only see allowed categories.
5. Staff expenses feed (migration 029): each cashier sees only the expenses they logged **today**; the owner sees all.
6. Staff Manager "Show" selector (Active staff / Signed in now / Hidden staff / Removed staff / All staff, remembered per browser) and **per-person hide** (migration 031). Hiding is not removing: the person can still sign in. The owner's own staff row (`SUPABASE_ADMIN_STAFF_ID`) is never listed as staff.
7. **System status** (`/bom03/settings/system-status`, migration 032): where saving goes, database reachable and version, latest sale/payment/expense, and entries waiting on this device. Owner only, read only.
8. **Bookkeeping period** (`/bom03/settings/bookkeeping-period`, migration 033): the owner closes finished months. Month-ends only, and permanent (no reopen anywhere; the ledger already refuses to move `closed_through` back).
9. **Materials** (`/bom03/settings/materials`, migration 034): one price per material (name) for every size, changed only here. Sizes (widths) are added once and never edited; turn a size on/off; low-stock level and notes per size; rename a material; add a material. A trigger makes `materials.selling_price_per_sqft_kobo` writable only through `api_material_save` (the old post-sale copy of a roll's price onto the material is now a no-op). Turned-off sizes are refused on new jobs, quotes and price requests. Inventory's **Realised revenue** is now what the material's jobs actually sold for (035), and a material's code is frozen when it is renamed (036).
10. **Inventory redesign** (`/bom03/inventory`, owner): rebuilt from shared parts. Add roll, Log waste and Count are popups that use the same three forms as Stock entry (`components/stock/stock-forms.tsx`, logic in `lib/stock-forms.ts`). Roll length is chosen with radio cards: unit (Meters or Feet), then 50 M / 100 M or 164 ft / 328 ft, plus Other (`components/roll-length-picker.tsx`, `lib/roll-length.ts`). With the new books off (Google Sheets live) the route still shows the previous page, `components/inventory/legacy-inventory-page.tsx`; delete it at cutover.
11. **Cashier Stock check** (`/cashier/inventory`, `components/inventory/cashier-inventory-page.tsx`): rebuilt on the shared parts. In the new books a **cashier session never receives the owner's cost and earnings fields** (`lib/server/owner-only-fields.ts`): the materials feed drops Total Spent / Remaining Asset Value / Remaining Revenue / Realised Revenue, the roll feed drops Cost and Cost per Sqft, and `records?resource=inventory` drops `purchase_cost_kobo` and `cost_per_sqft_kobo_exact`. Selling Price and stock levels stay. Turned-off sizes are hidden from cashiers even if they ask for `?all=1`. Sheets mode is unchanged (its feed still carries those fields until cutover).

## Still to do, in this order of preference
- Item 4: Approved devices (blocked: phones cannot be identified yet; needs a decision between pairing-code devices and admin-screens-only). Opening balances: guided flow, owner decisions needed.
- Expense-category access was verified end to end in the sandbox on 11 October (see the handoff). Nothing outstanding there.
- Not pushed: the branch is ahead of `origin/codex/supabase-migration`. Ask the owner before pushing.
- Known, not mine to fix silently: two older lint errors (setState in effects) in sidebar/mobile-nav and Expenses page code. The Performance tab still shows the owner's own sales as an "Owner (sandbox)" card.
- System status could later show the last backup date, but only if backups become readable from the app (they are managed in Supabase today).

## Design canvases already approved (for reference)
Staff Manager, Audit log, Expense categories, "Expense categories — who can log" "BOMedia System Status", "BOMedia Bookkeeping Period" and "BOMedia Materials" (claude.ai artifacts; ask the owner for the links if you need to view them).

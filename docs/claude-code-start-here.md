# Start here (Claude Code) — updated 11 October 2026, 04:00 Lagos

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
- Lagos has no daylight saving; "today" means the Lagos date.
- Migrations are append-only; never edit one that has been applied. Next number is `202610110031`.

## What exists (Settings area, owner only)
Applied to the sandbox through migration 030 and passing `npm test`:
1. Business details, Services order/remove, Payment methods (rename/on-off).
2. Staff Manager: restore removed cashiers, active sessions with sign out, "one device per cashier" rule.
3. Audit log (filters, readable sentences, cashier names).
4. Expense categories (`/bom03/settings/expense-categories`): add, turn on/off, and **who can log each one: Everyone / Chosen staff / Owner only** (migrations 027, 028, 030; table `expense_category_staff`). Enforced in the database; staff only see allowed categories.
5. Staff expenses feed (migration 029): each cashier sees only the expenses they logged **today**; the owner sees all.

## Still to do, in this order of preference
- **Verify end to end in the sandbox** (not done yet): make Equipment "Chosen staff" with Ada ticked; sign in as Ada (PIN 1234) and Tunde (5678): Ada sees Equipment, Tunde does not and gets refused if he tries; each sees only their own expenses today; Audit log shows the change. Check phone width and dark mode on the Expense categories and Audit log screens. The staff picker lists the sandbox "Owner" account too; consider hiding it.
- Settings item 7: Data/system status. Item 6: Bookkeeping period (needs owner decisions). Item 4: Approved devices (blocked: phones cannot be identified yet; needs a decision between pairing-code devices and admin-screens-only). Item 8b: Materials management (prices and widths feed quotes; its own careful stage). Opening balances: guided flow, owner decisions needed.
- Housekeeping: about 180 files are uncommitted (last commit is 7 Oct). Ask the owner before committing, then commit in small logical commits without secrets. Update `docs/migration-handoff.md` for every stage; its older top sections are stale history.
- Known, not mine to fix silently: two older lint errors (setState in effects) in sidebar/mobile-nav and Expenses page code; the sandbox shows a red "1 entry failed to sync" banner from an old queued sale.

## Design canvases already approved (for reference)
Staff Manager, Audit log, Expense categories, and "Expense categories — who can log" (claude.ai artifacts; ask the owner for the links if you need to view them).

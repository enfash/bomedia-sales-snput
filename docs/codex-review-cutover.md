# Codex review prompt: cutover commands (written 20 October 2026)

Paste the prompt below into Codex, with the repository open on branch `codex/supabase-migration`. Read `docs/review-handover.md` first for background. Ask Codex to report only; fixes are made afterwards in the Claude session.

## Prompt

You are reviewing code that will load a small business's real money data into a Postgres (Supabase) database on Sunday 25 October 2026. Review only; do NOT edit files, run anything against a hosted database, or print secrets. The goal is to find anything that could load wrong numbers, load them twice, load them into the wrong project, or leave the database in a half-finished state.

Branch: `codex/supabase-migration`. Read `docs/review-handover.md`, then `docs/cutover-day-runsheet.md` and section 3 of `docs/cutover-runbook.md` for the intended order and rules.

Business rules (from the owner):
- The Sheet's Sales row is the truth for what a customer owes: amount minus initial payment minus additional payments 1 and 2. Never trust a separate balance column.
- Customers are matched by exact name ignoring spaces and capitals, plus the owner's explicit decisions in `2-name-decisions.csv`. Never merge other names.
- An unknown amount is never treated as zero. No invented payments. No opening cash or bank counts. Customer credits are refused (the app cannot use them).
- One opening job per debt (the amount still owed), one order per Sales ID per customer, one combined opening debts entry, one loan entry (Dr 3000 / Cr 2200), one opening stock entry (Dr 1200 / Cr 3000).
- Opening entries are dated the day before the books start; once the books are active nothing here may run again.
- The customer-history import is READ-ONLY history. It must never change the books, stock or what any customer owes today.

Files to review, in order of risk:
1. `scripts/migration/opening-balances.mjs` (plan, post, verify, activate, createOwner)
2. `scripts/migration/stock-opening.mjs` (plan, diff, apply)
3. `scripts/migration/sales-history.mjs` (plan, import, verify) and `supabase/migrations/202610190051_legacy_sales_history.sql` (table `bomedia.legacy_sales`, function `api_customer_history`)
4. `scripts/migration/cli.mjs` (the `opening-*`, `stock-*`, `history-*`, `owner-create`, `rehearsal-reset` commands and how `--confirm-project` is enforced)
5. `scripts/migration/rehearsal-reset.mjs` and `scripts/migration/setup-receipt-storage-live.mjs` (must never touch the live project)
6. `app/api/accounting/customer-history/route.ts`, `lib/server/customers.ts`, `lib/server/customers-routes.ts`, and the new tab in `components/customers/customer-profile-sheet.tsx`
7. Tests: `supabase/tests/opening-balances.test.ts`, `stock-opening.test.ts`, `sales-history.test.ts`, `rehearsal-reset.test.ts`, `receipt-bucket.test.ts`. Say which risky behaviours have NO test.

Look specifically for:
- Money: kobo arithmetic, BigInt/string conversions, rounding, negative values (overpayments), totals that could differ between the plan, the database and the verify step.
- Idempotency and replay: what happens if a command is interrupted halfway, run twice, or run with a slightly different file; are transactions and advisory locks sufficient; can two runs interleave.
- Ordering: can history import, stock apply or opening post run after the books are active or after real sales exist; are the refusals complete.
- Safety rails: can any command run against the wrong project (live vs rehearsal vs sandbox), is `--confirm-project` compared with the connection actually used, can `rehearsal-reset` or any destructive path reach live.
- Name matching: edge cases (unicode, trailing spaces, the same customer appearing under a name decision AND an exact match, a decision whose target does not exist, chains of decisions).
- Data leakage: secrets or customer data in logs, error messages, or the new API route; whether `api_customer_history` can be called by someone who should not see it, and whether it can return unbounded data.
- Authorization on the new route and function (owner and cashier may read; anonymous must not), SQL injection, JSON handling.
- The new profile tab: loading and error states, large histories (1,000 rows cap, "show more"), and that old history can never be mistaken for a current debt.
- Anything in the run-sheet order that would fail or give wrong results if followed exactly.

Report format: a numbered list ordered by severity. For each item give: severity (blocker / should fix / minor), file and line, what is wrong in one or two sentences, a concrete failure scenario with example numbers, and a suggested fix. Then a short list of "checked and found fine" so I know what was covered. If you find no blockers, say so plainly. Do not pad the list.

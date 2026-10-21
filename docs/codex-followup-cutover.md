# Codex follow-up review: the cutover fixes (written 21 October 2026)

Paste the prompt below into Codex on branch `codex/supabase-migration`. It reviews only the fixes made after the first review.

## Prompt

You are doing a second, narrower review. Review only; do NOT edit files, connect to any hosted database, print secrets, commit or push.

Scope: the changes in commit `e33ee55` ("Fix the cutover review findings from Codex and Antigravity") and anything it touches. See them with `git show e33ee55 --stat` and `git diff 88dd2db e33ee55`. Background: `docs/codex-review-cutover.md` (the first prompt and the owner's business rules) and `docs/cutover-day-runsheet.md`.

These fixes load a small business's real money data into a live database on Sunday 25 October 2026, once, with no easy undo. Your job is to find mistakes INTRODUCED OR LEFT BY THE FIXES, not to repeat the first review.

Check specifically:
1. Did each original finding actually get closed, or only the reproduced example? For each of: fail-closed reset; shared name rule and decision resolver; history ordering and shared lock; row-by-row verification and plan fingerprint; unique Sheet rows in the owing file; stock preview and valuation covering every positive roll; blank amounts, header validation and preserved record positions; the ignore-payments `expected_amount_naira` check; the TLS fallback. State closed / partly closed / not closed with evidence.
2. New failure modes: could the stricter checks wrongly REFUSE correct real data (for example the owner's two identical rows, Sheet rows 3665 and 3669, which are NOT duplicates and must both load; multi-item Sales IDs; names with a trailing space; a blank initial payment meaning "nothing paid"), or wrongly ACCEPT wrong data?
3. Verification strength: can `opening:verify` or `history-verify` still pass when a customer, Sales ID, date, amount or ledger link is wrong? Does the stored fingerprint cover everything it claims to? Is anything compared only by total?
4. Stock approval: it is bound to an audit event. Can a stale or earlier approval be matched against changed stock? Can stock be edited between `stock:apply` and `opening:post` without being noticed?
5. Locking and ordering: with the shared lock, can two commands still interleave, or can one wait forever (a session that died holding the lock; the 2-minute statement timeout)? Is the error message when it times out clear enough for a non-technical owner at 10pm on the day?
6. The `BOMEDIA_MIGRATION_DEBUG` aid in `scripts/migration/cli.mjs`: confirm it prints only the error name and code, never a message, and cannot leak a credential or row value.
7. Tests: for each fix, is there a test that fails without the fix? Name any fix whose test only passes trivially. Note any test that quietly skips an assertion.
8. The run-sheet: follow `docs/cutover-day-runsheet.md` literally as a new person would. Does every command exist in `package.json` or `scripts/migration/cli.mjs`, read the folder it says, and give the output it says? Flag any step that would fail or load the wrong files.

Report format: numbered, most severe first. For each: severity (blocker / should fix / minor), file and line, the problem in one or two sentences, a concrete failure scenario with example numbers, and a suggested fix. End with a short list of what you checked and found correct. If there are no blockers, say so plainly. Do not pad.

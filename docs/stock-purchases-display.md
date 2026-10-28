# Expenses: stock purchase visibility

Implemented locally on 28 October 2026. Not deployed and not applied to the hosted database.

## Behavior

- Expenses combines its existing expense records with posted restock journals, with All spending, Other expenses and Stock purchases filters.
- Each restock journal appears once, including purchases of several rolls. Imported Inventory Purchase expenses remain visible; imported stock rolls are not inferred to be new payments.
- Paid totals use the entry's business date, with separate stock/other amounts and all-date unpaid amounts. They are not a payment-date cash-flow report. Kobo is summed as integers.
- Purchase details are read-only and show the recorded payment account, date, reference and restock note. There is no second payment or expense action.
- Purchases stay outside the shared expense cache and expense API. Existing dashboard profit calculations and financial writes are unchanged.
- Missing purchase data hides summary totals and displays a retry message. No partial total is presented as complete.

## Release order

1. Apply `20261028174302_stock_purchase_feed.sql` to the verified deployment database. It adds a private read function only; it does not insert expenses, move stock or post payments.
2. Deploy the application changes. Deploying the application before the migration causes the combined list to report that spending is unavailable.
3. Sign in as the owner, open Expenses, select Stock purchases, and reconcile the displayed purchases with their posted restock journals. Check both desktop and phone layouts.
4. Verify anonymous and cashier requests cannot retrieve costs. Confirm dashboard profit is unchanged.

## Local evidence

- 68 focused tests passed across the new spending helpers and route, stock database writes/read feed, expense writes/list, dashboard reporting, legacy feeds and stock routes.
- Production build, TypeScript, changed-file lint and whitespace checks passed.
- Synthetic browser review: combined totals, stock filtering, read-only details, unavailable-data state and a 390px phone viewport. No real payments were submitted.
- Hosted migration and production UI verification remain outstanding.

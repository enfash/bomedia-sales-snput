# BOMedia Sales & Expense System - Test Infrastructure

This document outlines the end-to-end (E2E) automated testing infrastructure designed and implemented for the BOMedia Sales & Expense system. The suite covers all **93 test cases** across **4 tiers** to validate functionality, security boundaries, rate-limiting, error handling, and complex multi-feature integrations.

---

## 1. Overview & Test Architecture

The E2E test runner is implemented as a standalone, zero-dependency Node.js script located in `e2e/e2e-runner.js`. It communicates directly with the Next.js API route endpoints running locally on `http://localhost:3002`.

### Core Architectural Features:
*   **Cookie & Session Management**: The runner extracts authentication tokens (`admin_session` and `cashier_session` cookies) from response headers (`Set-Cookie`) and dynamically forwards them in subsequent requests. This allows testing role-based access control (Admin vs. Cashier vs. Guest) across distinct test scenarios.
*   **Google Sheets Write Delay (1500ms)**: To protect the Google Sheets API against quota limits (yielding 429 rate limit errors), a mandatory `1500ms` delay is built into the HTTP client wrapper for all write operations (`POST`, `PATCH`, `DELETE`).
*   **Sandbox Isolation**: Test database entries use unique, identifiable prefixes (e.g. client names containing `"E2E Test Client XYZ"`, transaction IDs like `"E2E-TX-..."`, PO references like `"E2E-PO-..."`). This prevents test runs from contaminating real business statistics in the active sheet.
*   **Dynamic Client-Side Mocking**: For operations like natural language text parsing (using `/api/parse-nl`), the runner tests a dynamic local fallback parser. If the external Gemini API is unreachable (due to network boundaries or CODE_ONLY constraints), the handler falls back to local regex-based parsing to construct valid structured objects.
*   **Customer Aggregation Simulation**: Since the system aggregates client history and debtor lists client-side from the Sales and Payments spreadsheets, the runner reproduces the exact React aggregation logic on raw database fetches to assert grouping correctness.

---

## 2. Tested Core Features (8 Features)

1.  **Sales Logging & Entry Form**: Batch sales entries, sales row insertions, and automatic formulas evaluation.
2.  **Expense Tracking**: Logging, batch uploads, receipt file storage, status transitions, and validation.
3.  **Additional Payments & Balance Tracking**: Log payments, audit trails, and payment status updates.
4.  **Authentication & Sessions**: Admin login, cashier login with PIN validation, and session termination.
5.  **Shift Reports (Daily Digest)**: Computation of revenues, expenses, debts, net cash flow, and WhatsApp summaries.
6.  **Customer & Debtor Management**: Client-side grouping, spent summaries, total debts, and WhatsApp reminder link sanitization.
7.  **Waste Logging**: Active roll length deduction, zero-amount expense logging, and status transitions.
8.  **Inventory Tracking & Restocking**: Roll additions, auto-logging inventory purchase expenses, FIFO cascade deductions, and active roll promotions.

---

## 3. Detailed Test Catalog (93 Cases)

### TIER 1: Feature Coverage (Happy Path - 40 Cases)

#### Sales Logging (5 Cases)
*   **TC-1.1**: Log a single-item sale with full cash payment. Verify sales sheet row is appended and payment status resolves to `"Paid"`.
*   **TC-1.2**: Log a multi-item batch sale. Verify multiple rows are appended sharing the same `Sales ID` and `TRANSACTION ID`.
*   **TC-1.3**: Log a sale with partial initial payment. Verify payment status resolves to `"Part-payment"`.
*   **TC-1.4**: Log a sale with zero initial payment. Verify payment status resolves to `"Unpaid"`.
*   **TC-1.5**: Parse a natural language sales entry text using `/api/parse-nl`. Verify that it returns the expected structured JSON format.

#### Expense Tracking (5 Cases)
*   **TC-2.1**: Log an expense with status `"Paid"`. Verify it is saved to the Expenses sheet and `PAID BY` is logged.
*   **TC-2.2**: Log an expense with status `"Pending"`. Verify it is saved with empty `PAID BY` and `PAID AT` values.
*   **TC-2.3**: Fetch all expenses via GET `/api/expenses`. Verify it returns the array of expense objects with a valid structure.
*   **TC-2.4**: Log a batch of expenses. Verify multiple rows are successfully appended using `addRows`.
*   **TC-2.5**: Upload a receipt image via `/api/upload`. Verify it saves the file in `public/uploads/` and returns the file URL.

#### Additional Payments & Balance Tracking (5 Cases)
*   **TC-3.1**: Log a payment via `/api/payments`. Verify it generates a unique `PAY-YYYYMMDD-XXXX` ID.
*   **TC-3.2**: Fetch payment history via GET `/api/payments`. Verify that all logged payments are returned with correct fields.
*   **TC-3.3**: Add `additionalPayment1` via PATCH `/api/sales` on a record less than 24 hours old. Verify that the row is updated.
*   **TC-3.4**: Record additional payments that fully settle a debt. Verify the PAYMENT STATUS formula resolves to `"Paid"`.
*   **TC-3.5**: Record an additional payment that partially covers a debt. Verify status remains `"Part-payment"`.

#### Auth & Session Management (5 Cases)
*   **TC-4.1**: Perform Admin Login with valid credentials. Verify cookie `admin_session` is set and contains the signed token.
*   **TC-4.2**: Perform Cashier Login with correct cashier name and PIN. Verify cookie `cashier_session` is set.
*   **TC-4.3**: Perform Cashier Login for a cashier with no passcode configured in the sheet. Verify login succeeds.
*   **TC-4.4**: Call GET `/api/cashiers` as Admin. Verify that the `Passcode` column values are included in the response data.
*   **TC-4.5**: Perform Logout via POST `/api/auth/logout`. Verify both session cookies are deleted.

#### Shift Reports / Daily Digest (5 Cases)
*   **TC-5.1**: Call GET `/api/digest` with today's entries. Verify successful response with all summary totals computed.
*   **TC-5.2**: Verify that `jobsToday` matches the count of sales logged today.
*   **TC-5.3**: Verify that `netCash` equals `totalCollected + newPaymentsTotal - totalExpenses` for today's logs.
*   **TC-5.4**: Verify that low stock rolls are correctly identified and listed in the digest `lowStockRolls` field.
*   **TC-5.5**: Check the generated WhatsApp summary message string and verify it compiles all KPIs and includes correct emojis.

#### Customer / Debtor Management (5 Cases)
*   **TC-6.1**: Retrieve customer group list. Verify that multiple sales records for the same client name are grouped client-side.
*   **TC-6.2**: Verify that a customer's total spent is the sum of all their sales amounts.
*   **TC-6.3**: Verify that a customer's total debt is the sum of unpaid differences across all their orders.
*   **TC-6.4**: Export customer list as CSV. Verify file structure contains all client profile columns.
*   **TC-6.5**: Generate WhatsApp reminder link for a debtor. Verify country code prefix `234` is added to 11-digit phone numbers.

#### Waste Logging (5 Cases)
*   **TC-7.1**: Log waste length `L` against a roll index via PATCH `/api/inventory`. Verify `Remaining Length (ft)` is reduced by `L` and `Waste Logged (ft)` is increased by `L`.
*   **TC-7.2**: Verify that saving a waste log automatically invokes POST `/api/expenses` with a zero-amount expense record.
*   **TC-7.3**: Confirm that the waste expense row is marked as `"Paid"` and category is `"Material Waste"`.
*   **TC-7.4**: Fetch inventory roll after logging waste. Verify that its status changes to `"Low Stock"` if remaining length <= threshold.
*   **TC-7.5**: Fetch materials list. Verify that the material aggregate `Total Remaining (ft)` is reduced by the logged waste length.

#### Inventory Tracking & Restocking (5 Cases)
*   **TC-8.1**: Post a new roll restock. Verify it appends a roll to the Inventory sheet with a unique roll ID.
*   **TC-8.2**: Log a restock with cost > 0. Verify that it automatically logs a paid expense in the Expenses sheet with category `"Inventory Purchase"`.
*   **TC-8.3**: Log a sale. Verify that inventory deduction accurately reduces the active roll's remaining length by the job's consumed length.
*   **TC-8.4**: Fetch Materials sheet. Verify that the material's aggregate fields (`Selling Price`, `Total Remaining (ft)`) update.
*   **TC-8.5**: Exhaust an active roll. Verify that the active roll status becomes `"Depleted"`, and the next FIFO roll is automatically promoted to active.

---

### TIER 2: Boundary & Corner Cases (Limits / Errors - 40 Cases)

#### Sales Logging Boundary/Error Cases (5 Cases)
*   **TC-1.6**: Log a sale for a material that has exactly 0ft stock. Verify it returns a `409` conflict.
*   **TC-1.7**: Log a sale where required material length is slightly less than stock but within the 1ft buffer (`required <= available + 1`). Verify it succeeds.
*   **TC-1.8**: Attempt to log a duplicate sale using a previously recorded transaction ID. Verify it returns 200 with the duplicate status message.
*   **TC-1.9**: Attempt to log a sale with dimensions/quantity exceeding total available stock across all rolls. Verify it fails with `409`.
*   **TC-1.10**: Log a sale with invalid dimensions (e.g. width <= 0, height <= 0). Verify that the database is not written and returns a `400`.

#### Expense Tracking Boundary/Error Cases (5 Cases)
*   **TC-2.6**: Attempt to update an expense status via PATCH without passing `timestamp`. Verify it returns `400`.
*   **TC-2.7**: Attempt to update an expense with a non-existent timestamp. Verify it returns `404` not found.
*   **TC-2.8**: Log an expense with a negative amount value. Verify it is rejected with `400`.
*   **TC-2.9**: Attempt to upload a file larger than 5MB. Verify it returns `400` or fails with an size validation error.
*   **TC-2.10**: Change an expense status from `"Paid"` to `"Pending"`. Verify `PAID BY` and `PAID AT` values are cleared to empty.

#### Additional Payments & Balance Boundary/Error Cases (5 Cases)
*   **TC-3.6**: Attempt to update a sale record older than 24 hours (e.g., 25 hours old) as a cashier. Verify it returns `403` Forbidden.
*   **TC-3.7**: Attempt to update a sale record older than 24 hours as an admin. Verify the request is allowed and succeeds.
*   **TC-3.8**: Attempt to update a sale record without passing both `rowIndex` and `saleId`. Verify it returns `400`.
*   **TC-3.9**: Record an overpayment payment amount (e.g. initial + additional > total). Verify balance differences becomes negative and status is `"Paid"`.
*   **TC-3.10**: Attempt to PATCH a sale record using a non-existent `saleId`. Verify it returns `404`.

#### Auth & Session Boundary/Error Cases (5 Cases)
*   **TC-4.6**: Fetch cashier directory (GET `/api/cashiers`) without an admin session. Verify all passcodes are removed from the payload.
*   **TC-4.7**: Attempt Cashier Login with a name not present in the Cashiers sheet. Verify it returns `404`.
*   **TC-4.8**: Attempt Cashier Login with a valid name but incorrect PIN passcode. Verify it returns `401`.
*   **TC-4.9**: Attempt Admin Login with an incorrect password or email. Verify it returns `401`.
*   **TC-4.10**: Invoke auth-checked routes with a corrupted session cookie. Verify it is rejected as unauthenticated.

#### Shift Reports / Daily Digest Boundary/Error Cases (5 Cases)
*   **TC-5.6**: Request digest on a day with 0 sales, 0 payments, and 0 expenses. Verify it returns 0 totals without errors.
*   **TC-5.7**: Verify digest compilation when some records have empty or corrupt DATE strings. Verify it parses safely without crashing.
*   **TC-5.8**: Request digest when sheet tabs (e.g., "Expenses") are missing. Verify it returns clean `404`/`500` error structures.
*   **TC-5.9**: Verify that top debtors listing excludes clients whose balance difference is <= 0 or payment status is `"Paid"`.
*   **TC-5.10**: Request digest when no rolls are low stock. Verify `lowStockRolls` returned is an empty array.

#### Customer & Debtor Boundary/Error Cases (5 Cases)
*   **TC-6.6**: Load customer list when no sales exist. Verify empty state renders gracefully.
*   **TC-6.7**: Verify that rows containing client name "Walking Customer" or "Unknown Client" are consolidated under a single profile or skipped.
*   **TC-6.8**: Verify behavior when a client has varying phone numbers across multiple sales rows. Ensure UI displays the latest.
*   **TC-6.9**: Open timeline modal for a customer with 0 payments. Verify it displays only orders with full outstanding balance.
*   **TC-6.10**: Apply search query for non-existent client. Verify search returns 0 results and doesn't crash pagination.

#### Waste Logging Boundary/Error Cases (5 Cases)
*   **TC-7.6**: Log waste length exactly equal to the roll's remaining length. Verify roll is depleted and status becomes `"Depleted"`.
*   **TC-7.7**: Attempt to log waste length greater than remaining roll length. Verify it is blocked with a validation error.
*   **TC-7.8**: Log waste with length <= 0. Verify the system rejects it.
*   **TC-7.9**: Attempt to log waste against a non-existent roll index row. Verify it returns `404`.
*   **TC-7.10**: Attempt to log waste against a roll already in `"Depleted"` status. Verify it is blocked.

#### Inventory Boundary/Error Cases (5 Cases)
*   **TC-8.6**: Restock a roll with raw length <= 10ft (waste reserve size). Verify POST is rejected with a length validation error.
*   **TC-8.7**: Attempt to log a job dimension where both width and height exceed the roll's width. Verify it returns an error and blocks deduction.
*   **TC-8.8**: Log a job dimension matching exactly the roll width. Verify it is processed without flipping, using height for length.
*   **TC-8.9**: Restock a roll with width <= 0. Verify POST is rejected with `400`.
*   **TC-8.10**: Attempt cascading deduction when all rolls of a material are out of stock. Verify the sale fails with `409` conflict.

---

### TIER 3: Cross-Feature Combinations (Pairwise - 8 Cases)

*   **TC-C.1: Sales Logging ↔ Inventory Cascade**
    *   *Scenario*: Log a sale requiring 5ft of SAV_TEMP. Active Roll A has 2ft; Roll B (next FIFO) has 10ft.
    *   *Assert*: Roll A is depleted (Status = `'Depleted'`, Remaining = `0`). Roll B remaining becomes `7ft`.
*   **TC-C.2: Cashier/Admin Roles ↔ 24-Hour Edit Time Limit**
    *   *Scenario*: Sales row dated 48 hours ago needs correction.
    *   *Assert*: Cashier PATCH `/api/sales` returns `403` Forbidden / `401`. Admin login, then Admin PATCH `/api/sales` succeeds.
*   **TC-C.3: Inventory Restock ↔ Expenses Auto-logging**
    *   *Scenario*: Add a new roll of SAV at cost ₦30,000 via POST `/api/inventory`.
    *   *Assert*: New roll row added to `"Inventory"`. An expense of ₦30,000 is automatically appended to `"Expenses"` sheet with category `"Inventory Purchase"`.
*   **TC-C.4: Waste Logging ↔ Inventory depletion ↔ Expense record**
    *   *Scenario*: Log 4ft of waste against "SAV_TEMP_C4" via PATCH `/api/inventory`.
    *   *Assert*: Roll remaining length reduced to 0. A zero-amount expense record under category `"Material Waste"` is created in `"Expenses"`.
*   **TC-C.5: Sales Logging ↔ Customer Debt ↔ Daily Shift Digest**
    *   *Scenario*: Log an unpaid sale for ₦60,000 today.
    *   *Assert*: Customer total debt increases by ₦60,000 on Customers page.
*   **TC-C.6: Additional Payments ↔ Customer Debt ↔ Daily Shift Digest Net Cash**
    *   *Scenario*: Record an additional payment of ₦25,000 on a debt.
    *   *Assert*: Payments sheet receives log. Client total debt decreases by ₦25,000. Digest displays `netCash` increased by ₦25,000.
*   **TC-C.7: Cashier Creation ↔ Authentication Login**
    *   *Scenario*: Admin POST `/api/cashiers` to add "John Printer" (PIN "5678"), then login via `/api/auth/cashier-login`.
    *   *Assert*: Cashier row added to `"Cashiers"`. Login succeeds, setting `cashier_session` cookie.
*   **TC-C.8: Inventory Depletion ↔ Materials Status ↔ Shift Digest Alert**
    *   *Scenario*: Digest fetches list.
    *   *Assert*: Shift digest includes correct status alerts.

---

### TIER 4: Real-World Application Scenarios (5 Cases)

*   **TC-S.1: Cashier Shift Order Entry Flow**
    *   *Steps*:
        1. Cashier signs in using PIN.
        2. Customer orders printed item (SAV 3ft).
        3. Form calculates area and prices. Cashier inputs a partial initial payment and submits.
        4. API verifies stock, tiles dimensions to find shortest consumed lengths, deducts from active rolls, and appends sales rows.
        5. Cashier verifies the order is logged in Sales list as `"Part-payment"`.
*   **TC-S.2: Material Restock, Expense Tracking, and Sale Consumption**
    *   *Steps*:
        1. Admin signs in.
        2. Logs restock of 3 rolls of "Flex 4ft" at a total cost of ₦90,000.
        3. Inventory sheet gets new rolls; Expenses sheet receives a ₦90,000 restock log.
        4. Cashier logins and records a sale of 15ft of "Flex 4ft".
        5. System deducts 15ft from the newly active roll and updates remaining stock.
*   **TC-S.3: Customer Debt Management & Settle Recovery**
    *   *Steps*:
        1. Cashier logs in, filters customer list by debtors, finds a client with debt.
        2. Generates WhatsApp reminder link, opening WhatsApp with the pre-formatted debt message.
        3. Client makes payment. Cashier enters a payment log (POST `/api/payments`) and updates the sale record (PATCH `/api/sales`).
        4. Sale status updates to `"Paid"` in Google Sheets. Client is removed from debtors filter.
*   **TC-S.4: Operator Error/Damage Waste Mitigation**
    *   *Steps*:
        1. A print run on "SAV 3ft" fails halfway, ruining 8ft of material.
        2. Cashier accesses inventory list, clicks "Log Waste" on active roll "SAV 3ft".
        3. Selects reason and logs 8ft.
        4. Inventory remaining length is reduced. A zero-amount expense log captures waste history.
        5. Digest shift report reflects the stock depletion.
*   **TC-S.5: End of Shift Reconcile and Report**
    *   *Steps*:
        1. Admin logs in at shift end.
        2. Requests `/api/digest` to retrieve summary.
        3. System aggregates revenue, collected money, outstanding debts, paid expenses, and calculates `netCash`.
        4. Admin checks that cash drawer balance matches `netCash`.
        5. Clicks "Send WhatsApp Digest" to forward shift report to stakeholders.

---

## 4. How to Run the Tests

To execute the test suite, ensure the Next.js server is running on port 3002:

```bash
# Start development server
npx next dev -p 3002

# Run E2E Integration Suite (in a separate terminal)
node e2e/e2e-runner.js
```

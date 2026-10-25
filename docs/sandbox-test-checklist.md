# Sandbox test checklist

Run this in the **sandbox only** (`npm run sandbox:dev`, then open http://localhost:3001). Test sign-ins: cashier **Ada** (PIN 1234) and cashier **Tunde** (PIN 5678). The owner signs in at `/bom03/login`.

Use a private window (or `127.0.0.1:3001`) for the second person so the owner and cashier sessions do not replace each other. Fill the Result column with **Pass** or **Fail** and a short note.

## Before you start (owner)

| # | Step | Expected | Result |
|---|------|----------|--------|
| 0.1 | Settings, Approvals: switch **A different price** on (for example 10% either way). | The rule shows as on. | |
| 0.2 | Settings, Approvals: leave **A large expense** off. | Tunde's small expense will save straight away. | |

## 1. New Sale as Ada (cashier, phone width is fine)

| # | Step | Expected | Result |
|---|------|----------|--------|
| 1.1 | Sign in as Ada (1234). Open New sale. Add a print job (Flex, a size, a quantity) for a new customer name. | The job appears in the order list with the list price. | |
| 1.2 | Change the price of the print job to well above or below the list price (more than the allowed percent). | The line shows **Price needs owner approval**. | |
| 1.3 | Open the review sheet. | A "Why?" box is asked for. Save stays blocked until a reason is typed. | |
| 1.4 | Put the price back to the list price. Enter a payment smaller than the total and leave **Paid by** empty. | Save is blocked and the sheet asks how the customer paid (Cash, Transfer or POS). | |
| 1.5 | Choose **Paid by** (Cash). Leave the phone number empty. | Save is blocked until a phone number (7 to 15 digits) is entered, because a balance is left. | |
| 1.6 | Enter a phone number and save. | "Saved" message. The sale is in Records with the part payment and the balance still owed. | |
| 1.7 | Repeat 1.2 and send the sale with a reason. | "Sent to the owner for approval". It shows under held sales on Ada's Records. | |
| 1.8 | As the owner, open Approvals and approve it. | It becomes a normal sale in Records. Ada sees it recorded. | |

## 2. Debtor-box payment on that sale (Ada)

| # | Step | Expected | Result |
|---|------|----------|--------|
| 2.1 | On Ada's home, find the customer from 1.6 under **Who still owes**. Tap the name. | The payment box opens with the right balance. | |
| 2.2 | Pay part of the balance, choose **Paid by**, save. | Payment saves. The balance drops by exactly that amount. | |
| 2.3 | Open the sale in Records, then Manage payment, and pay the rest. | Status becomes Paid and the balance is zero. | |
| 2.4 | Look at the owner's dashboard and Customers. | The customer no longer shows as owing. Today's collections include both payments. | |

## 3. Expenses as Tunde (cashier)

| # | Step | Expected | Result |
|---|------|----------|--------|
| 3.1 | Sign in as Tunde (5678). Log an expense (any allowed category). | Saved. | |
| 3.2 | Open Tunde's Expenses page. | He sees only the expense he logged **today**, not Ada's or older ones. | |
| 3.3 | Sign in as Ada, log one expense, open her Expenses. | Ada sees hers only, not Tunde's. | |
| 3.4 | Owner opens Expenses. | The owner sees both. Mark one as paid and pick how it was paid. It shows Paid. | |

## 4. Restock and waste (owner; stock changes are owner-only)

| # | Step | Expected | Result |
|---|------|----------|--------|
| 4.1 | Owner, Inventory (or Stock): Add roll / Restock a roll of Flex with a length and cost. | The roll appears. The material's stock total goes up by the usable length. | |
| 4.2 | Log waste on a roll (for example 3 ft). | The roll's remaining length goes down by 3 ft. | |
| 4.3 | As Ada, try to open Stock entry or Waste. | She is sent to the view-only Stock check page. She cannot restock or log waste. | |

## 5. Job status

| # | Step | Expected | Result |
|---|------|----------|--------|
| 5.1 | As Ada, open the Job board and move today's job to the next stage. | The card moves and stays there after a refresh. | |
| 5.2 | As the owner, move an older job (more than 24 hours old). | It moves. | |
| 5.3 | As Ada, try to move an older job (more than 24 hours old). | Refused with a message that only the owner can change older jobs. | |

## 6. Phone and dark mode

| # | Step | Expected | Result |
|---|------|----------|--------|
| 6.1 | Phone width (or a real phone): New sale, Records, Expenses, Job board, cashier home. | Nothing is cut off. The bottom menu works. No codes or long IDs on screen. | |
| 6.2 | Switch to dark mode and look at the same screens. | Text is readable, buttons keep their colour, the cashier side stays amber. | |

## 7. Offline save, then reconnect

| # | Step | Expected | Result |
|---|------|----------|--------|
| 7.1 | As Ada, set the browser to Offline. Enter and save a small sale (with **Paid by**). | "Saved on this device, waiting to send". It is not yet in Records. | |
| 7.2 | Go back online. Wait for the sync. | A "sent/confirmed" message. | |
| 7.3 | Check Records and the customer. | The sale appears **once** (not twice) with the right amount. Refresh and check again. | |
| 7.4 | Repeat with a payment taken offline on a debt. | The payment is applied once and the balance is right. | |

## Notes

- Nothing here touches the live project. If anything looks like it is talking to live data, stop and tell Claude.
- Record failures with the step number, what you saw, and the time.

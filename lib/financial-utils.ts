import { type UnifiedRecord } from "@/components/manage-sale-action";
import { collectableAmount } from "@/lib/balance-display";

/**
 * Parses a currency string or numeric value into a float.
 * Handles "₦", commas, and extra spaces.
 */
export const parseAmount = (val: any): number => {
  if (val === undefined || val === null) return 0;
  const str = val.toString().replace(/[₦, \s]/g, "");
  return parseFloat(str) || 0;
};

export interface WaterfallStep {
  record: UnifiedRecord;
  slot: 1 | 2;
  /**
   * How the amount lands in the slot:
   *   "set"    — the slot is empty, write the amount as a plain number.
   *   "append" — both slots are already used, so slot 2 becomes a running
   *              chain (=old+new). This is what stops a payment from being
   *              silently skipped once a sale has been paid more than twice.
   */
  mode: "set" | "append";
  toApply: number;
  remainingAfter: number;
}

/** Picks the slot and write mode for the next payment against a record. */
function nextSlot(rec: UnifiedRecord): { slot: 1 | 2; mode: "set" | "append" } {
  if (!((rec.additionalPayment1 ?? 0) > 0)) return { slot: 1, mode: "set" };
  if (!((rec.additionalPayment2 ?? 0) > 0)) return { slot: 2, mode: "set" };
  return { slot: 2, mode: "append" };
}

/**
 * Distributes a lump sum payment across a set of records, oldest first.
 *
 * Every record with an outstanding balance receives something as long as money
 * remains — a record whose two payment slots are both full chains onto slot 2
 * rather than being passed over.
 */
export function computeWaterfall(records: UnifiedRecord[], lumpSum: number): WaterfallStep[] {
  const steps: WaterfallStep[] = [];
  let remaining = lumpSum;

  // Sort by date/index to pay oldest first
  const sorted = [...records].sort((a, b) => {
    const rowA = a.rowIndex ?? 0;
    const rowB = b.rowIndex ?? 0;
    return rowA - rowB;
  });

  // Phase 1: Pay off outstanding balances
  for (const rec of sorted) {
    if (remaining <= 0) break;
    const balance = rec.balance ?? 0;
    if (balance <= 0) continue;

    const { slot, mode } = nextSlot(rec);
    const toApply = Math.min(remaining, balance);
    remaining -= toApply;

    steps.push({ record: rec, slot, mode, toApply, remainingAfter: remaining });
  }

  // Phase 2: Handle the rounded-up remainder. Customers commonly settle on a
  // figure above the invoice, so leftover money is recorded rather than
  // refused; it lands on the last record in the set. If that record already
  // took a payment above, top up that same step instead of writing to the cell
  // twice — one cell, one amount.
  if (remaining > 0 && sorted.length > 0) {
    const last = sorted[sorted.length - 1];
    const existing = steps.find(s => s.record.rowIndex === last.rowIndex);

    if (existing) {
      existing.toApply += remaining;
      existing.remainingAfter = 0;
    } else {
      const { slot, mode } = nextSlot(last);
      steps.push({ record: last, slot, mode, toApply: remaining, remainingAfter: 0 });
    }
    remaining = 0;
  }

  return steps;
}


/**
 * Processes a flat list of sales into a grouped chart data format for outstanding debt.
 *
 * Only rows that are still owed count. An overpaid row contributes nothing
 * rather than a negative: invoices are rounded so customers settle on a figure
 * they will not shave, which makes the difference margin rather than credit
 * held against future work. Netting it away would refund it against an
 * unrelated debt and hide both figures — a shortfall that will never be paid
 * and a gain already taken.
 *
 * Balance is computed directly from the three payment columns (O, Q, R) rather than
 * reading AMOUNT DIFFERENCES (Col S), which may be a stale static value or an old
 * formula that only subtracted the initial payment.
 */
export function processDebtData(sales: any[], limit = 7) {
  // Step 1: Accumulate what is still collectable per client. Overpaid rows add
  // zero rather than a negative, so a rounded-up payment on one job cannot
  // cancel out a genuine debt on another.
  const owedByClient: Record<string, number> = {};

  sales.forEach((r) => {
    const total       = parseAmount(r["AMOUNT (₦)"]          || r["Amount (₦)"]);
    const initialPay  = parseAmount(r["INITIAL PAYMENT (₦)"] || r["Initial Payment (₦)"]);
    const addl1       = parseAmount(r["ADDITIONAL PAYMENT 1"] || r["Additional Payment 1"]);
    const addl2       = parseAmount(r["ADDITIONAL PAYMENT 2"] || r["Additional Payment 2"]);
    const balance     = total - initialPay - addl1 - addl2;

    const client = (r["CLIENT NAME"] || r["Client Name"] || "Unknown").trim();
    if (!client) return;
    owedByClient[client] = (owedByClient[client] || 0) + collectableAmount(balance);
  });

  // Step 2: Keep clients still owing more than a naira (ignores rounding noise)
  let totalDebt = 0;
  const debtors: Record<string, number> = {};

  Object.entries(owedByClient).forEach(([client, owed]) => {
    if (owed > 1) {
      debtors[client] = owed;
      totalDebt += owed;
    }
  });

  const chartData = Object.entries(debtors)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, balance]) => ({
      name,
      balance,
    }));

  return { chartData, totalDebt, count: Object.keys(debtors).length };
}

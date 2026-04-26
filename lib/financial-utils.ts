import { type UnifiedRecord } from "@/components/manage-sale-action";

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
  slot: 1 | 2 | null;
  toApply: number;
  remainingAfter: number;
}

/**
 * Distributes a lump sum payment across a set of records using waterfall logic.
 * Respects existing slots (Additional Payment 1 and 2).
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

  for (const rec of sorted) {
    if (remaining <= 0) break;
    const balance = rec.balance ?? 0;
    if (balance <= 0) continue;

    // Check availability of additional payment slots
    const hasSlot1 = !((rec.additionalPayment1 ?? 0) > 0);
    const hasSlot2 = !((rec.additionalPayment2 ?? 0) > 0);

    let slot: 1 | 2 | null = null;
    if (hasSlot1) slot = 1;
    else if (hasSlot2) slot = 2;

    if (slot === null) continue;

    const toApply = Math.min(remaining, balance);
    remaining -= toApply;

    steps.push({ record: rec, slot, toApply, remainingAfter: remaining });
  }

  return steps;
}

/**
 * Processes a flat list of sales into a grouped chart data format for outstanding debt.
 * Net balances are calculated per client — overpayments (negative balances) reduce the total.
 * Only clients with a net balance > 1 (to handle float rounding) are included.
 */
export function processDebtData(sales: any[], limit = 7) {
  // Step 1: Accumulate net balance per client (positive = owed, negative = overpaid)
  const netByClient: Record<string, number> = {};

  sales.forEach((r) => {
    const balance = parseAmount(r["AMOUNT DIFFERENCES"] || r["Amount Differences"]);
    const client = (r["CLIENT NAME"] || r["Client Name"] || "Unknown").trim();
    if (!client) return;
    netByClient[client] = (netByClient[client] || 0) + balance;
  });

  // Step 2: Only keep clients with a net outstanding balance > 1 (ignore overpayments + rounding noise)
  let totalDebt = 0;
  const debtors: Record<string, number> = {};

  Object.entries(netByClient).forEach(([client, net]) => {
    if (net > 1) {
      debtors[client] = net;
      totalDebt += net;
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

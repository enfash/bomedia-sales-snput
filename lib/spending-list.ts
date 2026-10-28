import { formatKobo, parseKobo } from './accounting-money';
import { dayLabel, expenseDay, type Expense } from './expense-list';

export type StockPurchase = {
  id: string; business_date: string; created_at: string; description: string;
  amount_kobo: string; reference: string | null; logged_by: string | null;
  payment_account: string | null; note: string | null;
};
export type SpendingEntry = Expense & { stockPurchase?: StockPurchase };
export type SpendingKind = 'All spending' | 'Other expenses' | 'Stock purchases';
export const isStockPurchase = (entry: SpendingEntry) => Boolean(entry.stockPurchase) || entry.CATEGORY === 'Inventory Purchase';

// This combined list stays local to Expenses. Never put stock purchases in cachedExpenses:
// dashboard profit and other expense consumers must continue using real expense rows only.
export function spendingEntries(expenses: Expense[], purchases: StockPurchase[]): SpendingEntry[] {
  const distinct = new Map(purchases.map(p => [p.id, p]));
  return [...expenses, ...[...distinct.values()].map((p): SpendingEntry => ({
    stockPurchase: p, _amountKobo: p.amount_kobo, _backend: 'postgres',
    DATE: p.business_date, AMOUNT: '', CATEGORY: 'Inventory Purchase', DESCRIPTION: p.description,
    'PAID TO': '', 'PAYMENT METHOD': p.payment_account ?? '', 'RECEIPT URL': '',
    'Logged By': p.logged_by ?? '', STATUS: 'Paid', 'PAID BY': p.logged_by ?? '', 'PAID AT': p.created_at, TIMESTAMP: p.created_at,
  }))].sort((a, b) => expenseDay(b).localeCompare(expenseDay(a)) || b.TIMESTAMP.localeCompare(a.TIMESTAMP));
}

export function spendingKobo(entry: SpendingEntry): bigint {
  if (entry._amountKobo !== undefined) return parseKobo(entry._amountKobo);
  // Sheets amounts are decimal naira. Parse the text directly, without floating-point arithmetic.
  const raw = entry.AMOUNT.replace(/[₦,\s]/g, '');
  if (!raw) return BigInt(0);
  const match = raw.match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) throw new Error('An expense amount needs review.');
  return (BigInt(match[2]) * BigInt(100) + BigInt((match[3] ?? '').padEnd(2, '0'))) * (match[1] ? BigInt(-1) : BigInt(1));
}
export const spendingAmount = (entry: SpendingEntry) => formatKobo(spendingKobo(entry).toString());
export const totalSpending = (entries: SpendingEntry[]) => entries.reduce((sum, e) => sum + (e.STATUS === 'Cancelled' ? BigInt(0) : spendingKobo(e)), BigInt(0));

export function spendingSummary(entries: SpendingEntry[], today: string) {
  const active = entries.filter(e => e.STATUS !== 'Cancelled');
  const month = active.filter(e => expenseDay(e).startsWith(today.slice(0, 7)));
  const paid = month.filter(e => e.STATUS === 'Paid');
  const stock = paid.filter(isStockPurchase);
  const owed = active.filter(e => e.STATUS !== 'Paid');
  return { paid: totalSpending(paid).toString(), stock: totalSpending(stock).toString(),
    other: totalSpending(paid.filter(e => !isStockPurchase(e))).toString(), owed: totalSpending(owed).toString(),
    paidCount: paid.length, stockCount: stock.length, owedCount: owed.length };
}

export function filterSpending(entries: SpendingEntry[], kind: SpendingKind, status: string, query: string) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter(e => {
    if (kind === 'Stock purchases' && !isStockPurchase(e)) return false;
    if (kind === 'Other expenses' && isStockPurchase(e)) return false;
    if (status === 'Paid' && e.STATUS !== 'Paid') return false;
    if (status === 'Unpaid' && (e.STATUS === 'Paid' || e.STATUS === 'Cancelled')) return false;
    const haystack = [e.CATEGORY, e.DESCRIPTION, e['PAID TO'], e['Logged By'], e.AMOUNT,
      e.stockPurchase?.note, e.stockPurchase?.reference, e['PAYMENT METHOD'], spendingAmount(e)].join(' ').toLowerCase();
    return words.every(word => haystack.includes(word));
  });
}
export function spendingDays(entries: SpendingEntry[], today: string) {
  const groups = new Map<string, SpendingEntry[]>();
  for (const entry of entries) {
    const date = expenseDay(entry);
    const items = groups.get(date) ?? [];
    items.push(entry); groups.set(date, items);
  }
  return [...groups.entries()].sort(([a], [b]) => a === '' ? 1 : b === '' ? -1 : b.localeCompare(a))
    .map(([date, items]) => ({ date, label: date ? dayLabel(date, today) : 'NO DATE', items, totalKobo: totalSpending(items).toString() }));
}

export async function fetchStockPurchases(): Promise<StockPurchase[]> {
  const result: StockPurchase[] = [], seen = new Set<string>();
  let cursor: string | null = null;
  do {
    const response: Response = await fetch(`/api/accounting/stock-purchases${cursor ? `?after_id=${encodeURIComponent(cursor)}` : ''}`, { cache: 'no-store' });
    const page = await response.json();
    if (!response.ok || !Array.isArray(page.data) || !(page.next_after_id === null || typeof page.next_after_id === 'string')) {
      throw new Error('Stock purchases could not be loaded.');
    }
    for (const row of page.data) {
      if (typeof row.id !== 'string' || typeof row.description !== 'string' || typeof row.business_date !== 'string'
        || typeof row.created_at !== 'string' || typeof row.amount_kobo !== 'string' || !/^[0-9]+$/.test(row.amount_kobo)) {
        throw new Error('Stock purchase details could not be read.');
      }
      result.push(row);
    }
    cursor = page.next_after_id;
    if (cursor) {
      if (seen.has(cursor)) throw new Error('Stock purchases could not be completely loaded.');
      seen.add(cursor);
    }
  } while (cursor);
  return result;
}

import { afterEach, expect, it, vi } from 'vitest';
import { fetchStockPurchases, filterSpending, spendingDays, spendingEntries, spendingKobo, spendingSummary, type StockPurchase } from './spending-list';
import type { Expense } from './expense-list';

const expense = (extra: Partial<Expense> = {}): Expense => ({ DATE: '2026-10-28', AMOUNT: '220000', CATEGORY: 'Ink', DESCRIPTION: 'Ink',
  'PAID TO': '', 'PAYMENT METHOD': '', 'RECEIPT URL': '', 'Logged By': '', STATUS: 'Paid', 'PAID BY': '', 'PAID AT': '', TIMESTAMP: '', ...extra });
const purchase: StockPurchase = { id: 'purchase-1', business_date: '2026-10-28', created_at: '2026-10-28T17:23:00Z',
  description: 'Restock: 2 x Flex 10ft', amount_kobo: '28800000', reference: 'INVOICE-1', logged_by: 'Owner', payment_account: 'Transfer', note: 'Restock from Supplier' };
afterEach(() => vi.unstubAllGlobals());

it('counts a multi-roll purchase once, preserves imported purchases, and never mutates the expense cache', () => {
  const expenses = [expense(), expense({ CATEGORY: 'Inventory Purchase', AMOUNT: '100.01' })];
  const before = structuredClone(expenses);
  const rows = spendingEntries(expenses, [purchase, purchase]);
  expect(rows).toHaveLength(3);
  expect(spendingSummary(rows, '2026-10-28')).toMatchObject({ paid: '50810001', stock: '28810001', other: '22000000', stockCount: 2 });
  expect(expenses).toEqual(before);
  expect(expenses.some(e => 'stockPurchase' in e)).toBe(false);
});
it('keeps exact kobo beyond the safe integer range and ignores cancelled records in totals', () => {
  const rows = spendingEntries([expense({ _amountKobo: '9007199254740993' }), expense({ STATUS: 'Cancelled' })], [{ ...purchase, amount_kobo: '1' }]);
  expect(spendingSummary(rows, '2026-10-28').paid).toBe('9007199254740994');
  expect(spendingDays(rows, '2026-10-28')[0].totalKobo).toBe('9007199254740994');
  expect(spendingKobo(expense({ AMOUNT: '₦1,234.56' }))).toBe(BigInt(123456));
});
it('uses purchase business dates, keeps unpaid items out of spending, and separates both types', () => {
  const rows = spendingEntries([expense({ STATUS: 'Unpaid' }), expense({ DATE: '2026-09-30', STATUS: 'Unpaid', AMOUNT: '50' })], [purchase, { ...purchase, id: 'older', business_date: '2026-09-30' }]);
  expect(spendingSummary(rows, '2026-10-28')).toMatchObject({ paid: '28800000', owed: '22005000', owedCount: 2, stockCount: 1 });
  expect(filterSpending(rows, 'Stock purchases', 'Unpaid', '')).toEqual([]);
  expect(filterSpending(rows, 'Other expenses', 'All', '')).toHaveLength(2);
  expect(filterSpending(rows, 'Stock purchases', 'Paid', 'invoice-1 supplier')).toHaveLength(2);
  expect(spendingDays(rows, '2026-10-28').map(d => d.date)).toEqual(['2026-10-28', '2026-09-30']);
});
it('loads all purchase pages and fails instead of returning partial totals', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ data: [purchase], next_after_id: 'next' }))
    .mockResolvedValueOnce(Response.json({ data: [{ ...purchase, id: 'second' }], next_after_id: null }));
  vi.stubGlobal('fetch', fetcher);
  expect(await fetchStockPurchases()).toHaveLength(2);
  expect(fetcher.mock.calls[1][0]).toContain('after_id=next');
  fetcher.mockResolvedValueOnce(Response.json({ data: [purchase], next_after_id: 'next' }))
    .mockResolvedValueOnce(Response.json({ error: 'unavailable' }, { status: 503 }));
  await expect(fetchStockPurchases()).rejects.toThrow('could not be loaded');
});
it('rejects malformed pages and repeating cursors', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ data: [{ ...purchase, amount_kobo: 123 }], next_after_id: null }));
  vi.stubGlobal('fetch', fetcher);
  await expect(fetchStockPurchases()).rejects.toThrow('could not be read');
  fetcher.mockImplementation(async () => Response.json({ data: [purchase], next_after_id: 'same' }));
  await expect(fetchStockPurchases()).rejects.toThrow('completely loaded');
});

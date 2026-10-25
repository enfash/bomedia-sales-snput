import { expect, it } from 'vitest';
import { describeHeldLine, heldOldExpenses, prefillRow } from './held-old-expenses';
import type { QueueItem } from './store';

const old = (data: unknown, extra: Partial<QueueItem> = {}): QueueItem => ({ id: 'q1', type: 'expense', data, timestamp: 1, ...extra });
const single = { DATE: '2026-10-24', AMOUNT: '4,500', CATEGORY: 'Transport', DESCRIPTION: 'Fuel run', 'PAID TO': 'Bolt', 'PAYMENT METHOD': 'Cash', 'RECEIPT URL': 'https://drive.example/x', 'Logged By': 'Tunde', STATUS: 'Paid' };

it('finds an old expense that was held when the new books took over', () => {
  const [held] = heldOldExpenses([old(single)], 'postgres');
  expect(held.id).toBe('q1');
  expect(held.lines).toEqual([{ date: '2026-10-24', amount: '4500', category: 'Transport', description: 'Fuel run', paidTo: 'Bolt', paymentMethod: 'Cash', status: 'Paid', hadReceipt: true }]);
});

it('splits an old batch into its lines and skips lines with no amount', () => {
  const [held] = heldOldExpenses([old({ batch: true, items: [single, { ...single, AMOUNT: '' }, { ...single, AMOUNT: '700', STATUS: 'Unpaid' }] })], 'postgres');
  expect(held.lines.map((line) => [line.amount, line.status])).toEqual([['4500', 'Paid'], ['700', 'Unpaid']]);
});

it('shows nothing while Sheets is the backend, and leaves out sales and payments', () => {
  expect(heldOldExpenses([old(single)], 'sheets')).toEqual([]);
  expect(heldOldExpenses([old(single)], null)).toEqual([]);
  expect(heldOldExpenses([old(single, { type: 'sale' }), old(single, { type: 'payment' })], 'postgres')).toEqual([]);
});

it('describes a line in plain words with no codes', () => {
  const [held] = heldOldExpenses([old(single)], 'postgres');
  expect(describeHeldLine(held.lines[0])).toBe('₦4,500 · Transport · Bolt · 24 Oct');
});

it('fills the form without the old receipt link', () => {
  const [held] = heldOldExpenses([old(single)], 'postgres');
  expect(prefillRow(held.lines[0])).toEqual({ DATE: '2026-10-24', AMOUNT: '4500', CATEGORY: 'Transport', DESCRIPTION: 'Fuel run', 'PAID TO': 'Bolt', 'PAYMENT METHOD': 'Cash', 'RECEIPT URL': '', STATUS: 'Paid' });
});

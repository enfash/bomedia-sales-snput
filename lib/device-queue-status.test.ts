import { expect, it } from 'vitest';
import { summarizeDeviceQueue } from './device-queue-status';

it('says nothing is waiting when every queue is empty', () => {
  expect(summarizeDeviceQueue({ legacy: [], expenses: [], orders: [], payments: [] })).toEqual({ total: 0, needsAttention: 0, rows: [] });
});

it('describes each waiting entry in plain words and puts the ones that need a person first', () => {
  const summary = summarizeDeviceQueue({
    legacy: [{ type: 'sale_status', retryCount: 3 }, { type: 'payment', retryCount: 1, lastError: 'x' }, { type: 'sale' }],
    expenses: [{ state: 'pending' }], orders: [{ state: 'review' }], payments: [{ state: 'auth' }], unreadable: 1,
  });
  expect(summary.total).toBe(7);
  expect(summary.needsAttention).toBe(4);
  expect(summary.rows.slice(0, 4).every(row => row.attention)).toBe(true);
  expect(summary.rows.map(row => `${row.label}: ${row.detail}`)).toEqual(expect.arrayContaining([
    'Job status change: Failed after retries', 'Payment: Waiting to retry', 'Sale: Waiting for network', 'Expense: Waiting to send',
    'Sale: Needs your review', 'Payment: Sign in again to send', 'Saved entry: Cannot be read, kept for review',
  ]));
});

it('never leaks request IDs or payloads into the rows', () => {
  const summary = summarizeDeviceQueue({ legacy: [{ type: 'sale', lastError: 'secret details' } as never], expenses: [], orders: [], payments: [] });
  expect(JSON.stringify(summary)).not.toContain('secret');
});

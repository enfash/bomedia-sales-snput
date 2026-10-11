import { expect, it, vi } from 'vitest';
import { deliverPayment, persistPayment, readPaymentOutbox, PAYMENT_PREFIX, legacyQueueHold, paymentContext, type PaymentEntry, type OutboxStorage } from './payment-outbox';
import { describeBalance, collectableAmount, hasOutstandingDebt } from './balance-display';
import { processDebtData } from './financial-utils';
import { rowDebtKobo } from './payment-contract';

class MemoryStorage implements OutboxStorage {
  data = new Map<string, string>();
  get length() { return this.data.size; }
  key(i: number) { return [...this.data.keys()][i] ?? null; }
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
  clear() { this.data.clear(); }
}
const id = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const context = { backend: 'postgres' as const, staffId: id };
const entry = (): PaymentEntry => ({ payment: { version: 2, backend: 'postgres', requestId: id, expectedStaffId: id,
  jobIds: [id], amountKobo: '100', paymentMethod: 'cash', businessDate: '2026-10-07' }, summary: 'Test payment', state: 'pending' });
const receipt = (extra = {}) => Response.json({ success: true, requestId: id, expectedStaffId: id, businessDate: '2026-10-07',
  payment_id: id, journal_entry_id: id, amount_kobo: '100', ...extra });

it('persists before dispatch, survives a lost response and reload, and retries the original payload', async () => {
  const storage = new MemoryStorage();
  const saved = persistPayment(storage, entry());
  const send = vi.fn<typeof fetch>().mockImplementationOnce(async () => { expect(readPaymentOutbox(storage)).toHaveLength(1); throw new Error('response lost'); })
    .mockImplementationOnce(async () => receipt());
  expect(await deliverPayment(storage, saved, context, send)).toBe(false);
  const reloaded = readPaymentOutbox(storage)[0];
  expect(await deliverPayment(storage, reloaded, context, send)).toBe(true);
  expect(send.mock.calls[0][1]?.body).toBe(send.mock.calls[1][1]?.body);
  expect(readPaymentOutbox(storage)).toEqual([]);
});
it('reuses an existing identical payment and blocks another payment against pending jobs', () => {
  const storage = new MemoryStorage();
  const saved = persistPayment(storage, entry());
  const again = entry(); again.payment.requestId = other;
  expect(persistPayment(storage, again)).toEqual(saved);
  again.payment.amountKobo = '200';
  expect(() => persistPayment(storage, again)).toThrow(/already saved/);
  expect(readPaymentOutbox(storage)).toHaveLength(1);
});
it('does not dispatch unpersisted entries or silently accept unavailable local storage', async () => {
  const storage = new MemoryStorage(); const send = vi.fn();
  await expect(deliverPayment(storage, entry(), context, send)).rejects.toThrow(/saved payment changed/);
  storage.setItem = () => { throw new Error('quota'); };
  expect(() => persistPayment(storage, entry())).toThrow('quota'); expect(send).not.toHaveBeenCalled();
});
it('keeps malformed and mismatching confirmations for retry', async () => {
  for (const result of [{ success: true }, { requestId: other }, { amount_kobo: '200' }, { expectedStaffId: other }, { businessDate: '2026-10-08' }]) {
    const storage = new MemoryStorage(); const saved = persistPayment(storage, entry());
    const send = vi.fn().mockResolvedValue(Object.keys(result).length === 1 && 'success' in result ? Response.json(result) : receipt(result));
    expect(await deliverPayment(storage, saved, context, send)).toBe(false);
    expect(readPaymentOutbox(storage)[0].state).toBe('pending');
  }
});
it('holds payments for the original staff/backend and preserves refused payments', async () => {
  const storage = new MemoryStorage(); const saved = persistPayment(storage, entry()); const send = vi.fn();
  expect(await deliverPayment(storage, saved, { backend: 'sheets' }, send)).toBe(false);
  expect(readPaymentOutbox(storage)[0].state).toBe('review');
  expect(await deliverPayment(storage, saved, { backend: 'postgres', staffId: other }, send)).toBe(false);
  expect(readPaymentOutbox(storage)[0].state).toBe('auth'); expect(send).not.toHaveBeenCalled();
  for (const [status, state] of [[401, 'auth'], [403, 'auth'], [409, 'review'], [503, 'pending']] as const) {
    send.mockResolvedValueOnce(Response.json({ error: 'Needs attention' }, { status }));
    await deliverPayment(storage, saved, context, send);
    expect(readPaymentOutbox(storage)[0].state).toBe(state);
  }
});
it('preserves malformed stored data rather than overwriting it', () => {
  const storage = new MemoryStorage(); storage.setItem(PAYMENT_PREFIX + id, '{broken');
  expect(() => readPaymentOutbox(storage)).toThrow(/preserved/);
  expect(() => persistPayment(storage, entry())).toThrow();
  expect(storage.getItem(PAYMENT_PREFIX + id)).toBe('{broken');
});
it('holds ambiguous old queues across cutover while retaining the Sheets path', () => {
  expect(legacyQueueHold({ type: 'payment' }, 'postgres')).toMatch(/review/);
  expect(legacyQueueHold({ type: 'payment', version: 2, backend: 'postgres' }, 'postgres')).toMatch(/review/);
  expect(legacyQueueHold({ type: 'sale', version: 2, backend: 'sheets' }, 'postgres')).toMatch(/review/);
  expect(legacyQueueHold({ type: 'sale', version: 2, backend: 'postgres' }, 'sheets')).toMatch(/review/);
  expect(legacyQueueHold({ type: 'payment' }, 'sheets')).toBeNull();
});
it('caches a verified identity for offline capture but invalidates it on account changes or refused login', async () => {
  const storage = new MemoryStorage(); storage.setItem('userName', 'Ada');
  const send = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(context));
  expect(await paymentContext(storage, send, true)).toEqual(context);
  expect(await paymentContext(storage, send, false)).toEqual(context);
  send.mockRejectedValueOnce(new Error('offline despite navigator.onLine'));
  expect(await paymentContext(storage, send, true)).toEqual(context);
  storage.setItem('userName', 'Tunde');
  await expect(paymentContext(storage, send, false)).rejects.toThrow(/sign in/);
  storage.setItem('userName', 'Ada');
  send.mockResolvedValueOnce(Response.json({ error: 'Sign in again' }, { status: 401 }));
  await expect(paymentContext(storage, send, true)).rejects.toThrow('Sign in again');
  await expect(paymentContext(storage, send, false)).rejects.toThrow(/sign in/);
});
it('shows and collects one kobo in PostgreSQL without changing Sheets tolerance', () => {
  expect(rowDebtKobo({ 'AMOUNT (₦)': '1', 'INITIAL PAYMENT (₦)': '0.99' })).toBe(BigInt(1));
  expect(describeBalance(0.01, false, true)).toMatchObject({ tone: 'debt', label: '₦0.01' });
  expect(collectableAmount(0.01, true)).toBe(0.01); expect(hasOutstandingDebt(0.01, true)).toBe(true);
  expect(describeBalance(0.01).tone).toBe('settled');
  expect(processDebtData([{ _jobId: id, 'CLIENT NAME': 'Client', 'AMOUNT (₦)': '1', 'INITIAL PAYMENT (₦)': '0.99' }]).count).toBe(1);
});

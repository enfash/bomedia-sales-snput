import { lagosBusinessDate } from './accounting-entry';
import { confirmedPayment, isUUID, paymentContract, type DurablePayment } from './payment-contract';

export const PAYMENT_EVENT = 'bomedia-payment-outbox';
export const PAYMENT_PREFIX = 'bomedia-payment-v2:';
const CONTEXT_KEY = 'bomedia-payment-context-v1';
export type PaymentContext = { backend: 'sheets' } | { backend: 'postgres'; staffId: string };
export type OutboxStorage = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>;
export type PaymentEntry = { payment: DurablePayment; summary: string; state: 'pending' | 'review' | 'auth'; error?: string };

export function legacyQueueHold(entry: { version?: number; backend?: string; type: string }, backend: PaymentContext['backend']): string | null {
  if ((entry.backend && entry.backend !== backend) || (backend === 'postgres' && entry.version !== 2)) {
    return 'Saved under an older or different backend. Kept on this device for owner review.';
  }
  if (backend === 'postgres' && ['payment', 'payment_batch', 'sale', 'expense'].includes(entry.type)) {
    return 'Older transaction missing verified date, staff or job identity. Kept for owner review.';
  }
  return null;
}

export function cachedPaymentContext(storage: Pick<Storage, 'getItem'>): PaymentContext | null {
  try {
    const cached = JSON.parse(storage.getItem(CONTEXT_KEY) || 'null');
    if (!cached || cached.userName !== storage.getItem('userName')) return null;
    if (cached.backend === 'sheets') return { backend: 'sheets' };
    if (cached.backend === 'postgres' && isUUID(cached.staffId)) return { backend: 'postgres', staffId: cached.staffId };
  } catch { /* A missing context cannot authorize a new offline payment. */ }
  return null;
}
export async function paymentContext(storage: Storage = localStorage, send: typeof fetch = fetch, online = navigator.onLine): Promise<PaymentContext> {
  if (!online) {
    const saved = cachedPaymentContext(storage);
    if (!saved) throw new Error('Connect and sign in once before recording offline payments.');
    return saved;
  }
  let response: Response;
  try { response = await send('/api/accounting/context', { cache: 'no-store' }); }
  catch {
    const saved = cachedPaymentContext(storage);
    // A previously verified PostgreSQL identity can queue during an outage;
    // the server still checks it before any payment can be applied.
    if (saved?.backend === 'postgres') return saved;
    throw new Error('Connect once to verify where this payment belongs before saving.');
  }
  const result = await response.json();
  if (!response.ok || !['sheets', 'postgres'].includes(result.backend) || (result.backend === 'postgres' && !isUUID(result.staffId))) {
    storage.removeItem(CONTEXT_KEY);
    throw new Error(result.error || 'Payment identity is unavailable. Sign in again.');
  }
  storage.setItem(CONTEXT_KEY, JSON.stringify({ ...result, userName: storage.getItem('userName') }));
  return result;
}
export function readPaymentOutbox(storage: OutboxStorage): PaymentEntry[] {
  const entries: PaymentEntry[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(PAYMENT_PREFIX)) continue;
    try {
      const entry = JSON.parse(storage.getItem(key)!);
      paymentContract(entry.payment);
      if (key !== PAYMENT_PREFIX + entry.payment.requestId || typeof entry.summary !== 'string' || !['pending','review','auth'].includes(entry.state)) throw new Error();
      entries.push(entry);
    } catch { throw new Error('A saved payment cannot be read. It has been preserved on this device; ask the owner to review it.'); }
  }
  return entries;
}
export function persistPayment(storage: OutboxStorage, entry: PaymentEntry): PaymentEntry {
  paymentContract(entry.payment);
  for (const existing of readPaymentOutbox(storage)) {
    if (existing.payment.jobIds.some(id => entry.payment.jobIds.includes(id))) {
      const { requestId: _old, ...before } = existing.payment;
      const { requestId: _new, ...after } = entry.payment;
      if (JSON.stringify(before) === JSON.stringify(after)) return existing;
      throw new Error('A payment for this job is already saved. Finish or review that payment before adding another.');
    }
  }
  const key = PAYMENT_PREFIX + entry.payment.requestId;
  if (storage.getItem(key)) throw new Error('A saved payment already uses this request ID.');
  const text = JSON.stringify(entry);
  storage.setItem(key, text);
  if (storage.getItem(key) !== text) throw new Error('Payment could not be saved on this device. No request was sent.');
  return entry;
}
export async function deliverPayment(storage: OutboxStorage, entry: PaymentEntry, context: PaymentContext, send: typeof fetch): Promise<boolean> {
  paymentContract(entry.payment);
  const key = PAYMENT_PREFIX + entry.payment.requestId;
  const stored = storage.getItem(key);
  if (!stored || JSON.stringify(JSON.parse(stored).payment) !== JSON.stringify(entry.payment)) throw new Error('The saved payment changed. Keep it for review.');
  const hold = (state: PaymentEntry['state'], error: string) => { storage.setItem(key, JSON.stringify({ ...entry, state, error })); return false; };
  if (context.backend !== 'postgres') return hold('review', 'This payment belongs to PostgreSQL. It cannot be sent to Sheets.');
  if (context.staffId !== entry.payment.expectedStaffId) return hold('auth', 'Sign in as the staff member who saved this payment.');
  try {
    const response = await send(entry.payment.jobStatus ? '/api/sales' : '/api/payments/batch', {
      method: entry.payment.jobStatus ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json', 'X-Bomedia-Backend': 'postgres' }, body: JSON.stringify(entry.payment),
    });
    const result = await response.json();
    if (!response.ok) return hold(response.status === 401 || response.status === 403 ? 'auth' : response.status >= 500 || response.status === 429 ? 'pending' : 'review', result.error || 'Payment needs review.');
    if (!confirmedPayment(result, entry.payment)) return hold('pending', 'Confirmation was incomplete. The original payment is saved for retry.');
    storage.removeItem(key);
    return true;
  } catch { return hold('pending', 'Connection interrupted. The original payment is saved for retry.'); }
}
export async function savePostgresPayment(context: Extract<PaymentContext, { backend: 'postgres' }>, input: Pick<DurablePayment, 'jobIds' | 'amountKobo' | 'paymentMethod' | 'jobStatus' | 'notes'>, summary: string): Promise<void> {
  if (!navigator.locks) throw new Error('Open the secure app in a browser that supports safe offline payments.');
  await navigator.locks.request('bomedia-payment-outbox', () => {
    persistPayment(localStorage, { payment: {
      version: 2, backend: 'postgres', requestId: crypto.randomUUID(), businessDate: lagosBusinessDate(),
      expectedStaffId: context.staffId, ...input, jobIds: [...input.jobIds].sort(),
    }, summary, state: 'pending' });
  });
  window.dispatchEvent(new Event(PAYMENT_EVENT));
}

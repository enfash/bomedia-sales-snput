import { normalizePaymentMethod, type PaymentMethod } from './payment-methods';
import { jobStatuses } from './job-status';
export { jobStatuses } from './job-status';

export const isUUID = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export type DurablePayment = {
  version: 2; backend: 'postgres'; requestId: string; businessDate: string;
  expectedStaffId: string; jobIds: string[]; amountKobo: string; paymentMethod: PaymentMethod;
  jobStatus?: string; notes?: string;
};
export function validBusinessDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function paymentContract(value: unknown): DurablePayment {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The saved payment needs review.');
  const p = value as DurablePayment;
  if (Object.keys(p).some(k => !['version','backend','requestId','businessDate','expectedStaffId','jobIds','amountKobo','paymentMethod','jobStatus','notes'].includes(k))
    || p.version !== 2 || p.backend !== 'postgres' || !isUUID(p.requestId) || !isUUID(p.expectedStaffId)
    || !validBusinessDate(p.businessDate) || !Array.isArray(p.jobIds) || !p.jobIds.length || p.jobIds.length > 500
    || !p.jobIds.every(isUUID) || new Set(p.jobIds.map(id => id.toLowerCase())).size !== p.jobIds.length
    || typeof p.amountKobo !== 'string' || !/^[1-9]\d{0,18}$/.test(p.amountKobo) || BigInt(p.amountKobo) > BigInt('9223372036854775807')
    || normalizePaymentMethod(p.paymentMethod) !== p.paymentMethod
    || (p.jobStatus !== undefined && (p.jobIds.length !== 1 || !jobStatuses.includes(p.jobStatus)))
    || (p.notes !== undefined && (typeof p.notes !== 'string' || p.notes.length > 2000))) {
    throw new Error('Keep this payment for review: its original date, staff, amount, method and job identities are required.');
  }
  return p;
}
export function paymentKobo(input: string): string {
  const match = /^(\d{1,15})(?:\.(\d{1,2}))?$/.exec(input.trim().replace(/,/g, ''));
  if (!match) throw new Error('Enter an amount with no more than two decimal places.');
  const amount = BigInt(match[1]) * BigInt(100) + BigInt((match[2] || '').padEnd(2, '0'));
  if (amount <= BigInt(0)) throw new Error('Enter the amount received.');
  return amount.toString();
}
/** Exact outstanding balance from a PostgreSQL feed row, before display conversion. */
export function rowDebtKobo(row: Record<string, string>): bigint {
  const amount = (value: string | undefined) => {
    const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value || '0');
    if (!match) throw new Error('Refresh this job: its exact balance could not be read.');
    return (BigInt(match[2]) * BigInt(100) + BigInt((match[3] || '').padEnd(2, '0'))) * (match[1] ? BigInt(-1) : BigInt(1));
  };
  const balance = amount(row['AMOUNT (₦)']) - amount(row['INITIAL PAYMENT (₦)']) - amount(row['ADDITIONAL PAYMENT 1']) - amount(row['ADDITIONAL PAYMENT 2']);
  return balance > BigInt(0) ? balance : BigInt(0);
}
export function confirmedPayment(value: unknown, p: DurablePayment): boolean {
  const r = value as Record<string, unknown> | null;
  return !!r && r.success === true && r.requestId === p.requestId && isUUID(r.payment_id)
    && isUUID(r.journal_entry_id) && r.amount_kobo === p.amountKobo
    && r.businessDate === p.businessDate && r.expectedStaffId === p.expectedStaffId;
}

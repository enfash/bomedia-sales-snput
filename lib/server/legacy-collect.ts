// The existing payment boxes keep their screens and offline queue; once
// Postgres is in charge their payments go to the books through
// api_legacy_collect. Each submission carries one ID, so a retry cannot pay twice.
import { NextResponse } from 'next/server';
import { lagosBusinessDate } from '../accounting-entry';
import { normalizePaymentMethod } from '../payment-methods';
import { callFinancial, type FinancialCall } from './financial-db';
import { financialIdentity } from './financial-routes';
import { FinancialError } from './financial-service';
import { nairaToKoboText } from './legacy-sale';

const noStore = { 'Cache-Control': 'no-store' };
export const fail = (error: string, code: string, status: number) => NextResponse.json({ error, code }, { status, headers: noStore });
const bad = (message: string) => new FinancialError(message, 400, 'INVALID_INPUT');

/** A job reference from an old screen: its own row number first, since every
 * item of one sale shares the sale's Sales ID; else the Sales ID. */
export function jobRef(saleId: unknown, rowIndex: unknown): string {
  if ((typeof rowIndex === 'number' || typeof rowIndex === 'string') && /^[0-9]{1,18}$/.test(String(rowIndex))) return String(rowIndex);
  if (typeof saleId === 'string' && saleId.trim() && saleId.trim().length <= 200) return saleId.trim();
  return '';
}

export type LegacyPayment = { requestId: string; refs: string[]; amountKobo: string; method: string; notes?: string };

/** Records one payment against old-screen job references; returns the database result. */
export async function collectLegacy(payment: LegacyPayment, call: FinancialCall = callFinancial): Promise<Record<string, unknown>> {
  const identity = await financialIdentity(true);
  if (!identity) throw new FinancialError('Your account needs an accounting identity.', 403, 'ACTOR_REQUIRED');
  return call<Record<string, unknown>>('api_legacy_collect', `legacy-payment:${payment.requestId}`, {
    actor_id: identity.staffId.toLowerCase(), job_refs: payment.refs, amount_kobo: payment.amountKobo,
    business_date: lagosBusinessDate(), method: payment.method, ...(payment.notes ? { notes: payment.notes.slice(0, 2000) } : {}),
  });
}

export function paymentFailure(error: unknown): Response {
  if (error instanceof FinancialError) return fail(error.message, error.code, error.status);
  const code = (error as { code?: string }).code;
  if (code === '42501') return fail('Your account cannot record payments.', 'ACTOR_DISABLED', 403);
  if (code === 'P0002') return fail('A job in this payment was not found. Refresh and try again.', 'NOT_FOUND', 404);
  if (['22023', '22P02', '23514'].includes(code ?? '')) return fail('Payment was not recorded. Check the amount, the jobs and how it was paid.', 'PAYMENT_REVIEW_REQUIRED', 409);
  return fail('Payment is saved on this device and will retry.', 'ACCOUNTING_UNAVAILABLE', 503);
}

/** The debtor box's lump-sum batch (POST /api/payments/batch). */
export function legacyBatchPayment(body: Record<string, unknown>): LegacyPayment {
  const requestId = typeof body.transactionId === 'string' ? body.transactionId.trim() : '';
  if (!requestId || requestId.length > 200) throw bad('This payment has no request ID. Enter it again.');
  if (!Array.isArray(body.steps) || body.steps.length < 1 || body.steps.length > 500) throw bad('No unpaid jobs were chosen.');
  const steps = body.steps as Record<string, unknown>[];
  const refs = steps.map(step => jobRef(step?.salesId, step?.rowIndex));
  if (refs.some(ref => !ref)) throw bad('Some sales are still syncing. Refresh and try again.');
  const total = typeof body.lumpSum === 'number' ? body.lumpSum : steps.reduce((sum, step) => sum + (Number(step?.toApply) || 0), 0);
  const amountKobo = nairaToKoboText(total);
  if (!amountKobo || amountKobo === '0') throw bad('Enter the amount received.');
  const method = normalizePaymentMethod(body.paymentMethod);
  if (!method) throw bad('Choose how the customer paid: Cash, Transfer or POS.');
  return { requestId, refs, amountKobo, method, notes: typeof body.notes === 'string' ? body.notes : undefined };
}

export async function recordLegacyBatch(request: Request, call: FinancialCall = callFinancial): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    body = parsed;
  } catch { return fail('Invalid payment.', 'INVALID_INPUT', 400); }
  try {
    await collectLegacy(legacyBatchPayment(body), call);
    return NextResponse.json({ success: true }, { headers: noStore });
  } catch (error) { return paymentFailure(error); }
}

// The existing payment boxes keep their screens and offline queue; once
// Postgres is in charge their payments go to the books through
// api_durable_collect. Each submission retains its original identity and date.
import { NextResponse } from 'next/server';
import { paymentContract, confirmedPayment, type DurablePayment } from '../payment-contract';
import { verifiedAdminIdentity } from './postgres-auth-routes';
import { callFinancial, type FinancialCall } from './financial-db';
import { financialIdentity } from './financial-routes';
import { FinancialError } from './financial-service';

const noStore = { 'Cache-Control': 'no-store' };
export const fail = (error: string, code: string, status: number) => NextResponse.json({ error, code }, { status, headers: noStore });

/** A job reference from an old screen: its own row number first, since every
 * item of one sale shares the sale's Sales ID; else the Sales ID. */
export function jobRef(saleId: unknown, rowIndex: unknown): string {
  if ((typeof rowIndex === 'number' || typeof rowIndex === 'string') && /^[0-9]{1,18}$/.test(String(rowIndex))) return String(rowIndex);
  if (typeof saleId === 'string' && saleId.trim() && saleId.trim().length <= 200) return saleId.trim();
  return '';
}

export type LegacyPayment = DurablePayment;

export async function collectLegacy(payment: LegacyPayment, call: FinancialCall = callFinancial): Promise<Record<string, unknown>> {
  const p = paymentContract(payment);
  const identity = await financialIdentity(true);
  if (!identity || identity.staffId.toLowerCase() !== p.expectedStaffId.toLowerCase()) {
    throw new FinancialError('Sign in as the staff member who saved this payment. It is kept on this device.', 403, 'ACTOR_CHANGED');
  }
  const result = await call<Record<string, unknown>>('api_durable_collect', p.requestId, {
    actor_id: identity.staffId.toLowerCase(), job_ids: p.jobIds.map(id => id.toLowerCase()).sort(),
    amount_kobo: p.amountKobo, business_date: p.businessDate, method: p.paymentMethod,
    ...(p.notes !== undefined ? { notes: p.notes } : {}),
    ...(p.jobStatus !== undefined ? { job_status: p.jobStatus, any_age: !!await verifiedAdminIdentity() } : {}),
  });
  const response = { ...result, success: true, requestId: p.requestId, businessDate: p.businessDate, expectedStaffId: p.expectedStaffId };
  if (!confirmedPayment(response, p)) throw new Error('Incomplete payment confirmation');
  return response;
}

export function paymentFailure(error: unknown): Response {
  if (error instanceof FinancialError) return fail(error.message, error.code, error.status);
  const code = (error as { code?: string }).code;
  if (code === '42501') return fail('Your account cannot record payments.', 'ACTOR_DISABLED', 403);
  if (code === 'P0002') return fail('A job in this payment was not found. Refresh and try again.', 'NOT_FOUND', 404);
  if (['22023', '22P02', '23514', '23503', '22003', '22007', '22008'].includes(code ?? '')) return fail('Payment needs review. Keep the saved entry and check its amount, jobs, date and payment method.', 'PAYMENT_REVIEW_REQUIRED', 409);
  return fail('Payment is saved on this device and will retry.', 'ACCOUNTING_UNAVAILABLE', 503);
}

/** The debtor box's lump-sum batch (POST /api/payments/batch). */
export function legacyBatchPayment(body: Record<string, unknown>): LegacyPayment {
  try { return paymentContract(body); }
  catch (error) { throw new FinancialError((error as Error).message, 409, 'PAYMENT_REVIEW_REQUIRED'); }
}

export async function recordLegacyBatch(request: Request, call: FinancialCall = callFinancial): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    body = parsed;
  } catch { return fail('Invalid payment.', 'INVALID_INPUT', 400); }
  try {
    const result = await collectLegacy(legacyBatchPayment(body), call);
    return NextResponse.json(result, { headers: noStore });
  } catch (error) { return paymentFailure(error); }
}

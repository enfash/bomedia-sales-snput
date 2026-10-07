// The existing New Sale screen keeps its screen and offline queue; once
// Postgres is in charge, POST /api/sales turns its queued batch into one sale
// in the books (api_legacy_sale). The queue's transactionId makes retries safe.
import { NextResponse } from 'next/server';
import { normalizePaymentMethod } from '../payment-methods';
import { callFinancial, type FinancialCall } from './financial-db';
import { financialIdentity } from './financial-routes';
import { FinancialError } from './financial-service';

const noStore = { 'Cache-Control': 'no-store' };
const fail = (error: string, code: string, status: number) => NextResponse.json({ error, code }, { status, headers: noStore });
const STATUSES = ['Quoted', 'Printing', 'Finishing', 'Ready', 'Delivered'];

/** Naira as typed (number or text, commas allowed) to whole kobo; null when not a valid amount. */
export function nairaToKoboText(value: unknown): string | null {
  const text = typeof value === 'number' ? (Number.isFinite(value) ? value.toFixed(2) : '') : typeof value === 'string' ? value.replace(/[₦,\s]/g, '') : '';
  const match = /^(\d{1,15})(?:\.(\d{0,2}))?$/.exec(text);
  if (!match) return null;
  return (BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? '').padEnd(2, '0') || '0')).toString();
}

type QueuedItem = { values?: unknown[]; jobDescription?: unknown; qty?: unknown; materialId?: unknown;
  jobWidth?: unknown; jobHeight?: unknown; dimUnit?: unknown };

/** Old queued batch to the api_legacy_sale payload. Throws FinancialError(400) on anything it cannot read. */
export function legacySalePayload(body: Record<string, unknown>, actorId: string): { requestId: string; payload: Record<string, unknown> } {
  const bad = (message: string) => new FinancialError(message, 400, 'INVALID_INPUT');
  const requestId = typeof body.transactionId === 'string' ? body.transactionId.trim() : '';
  if (!requestId || requestId.length > 200) throw bad('This sale has no request ID. Save it again.');
  if (body.batch !== true || !Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100) throw bad('Add at least one job to the order.');
  const items = body.items as QueuedItem[];
  const first = Array.isArray(items[0]?.values) ? items[0].values as unknown[] : [];
  const date = String(first[0] ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw bad('Choose a valid date.');
  let paid = BigInt(0);
  const jobs = items.map(item => {
    const values = Array.isArray(item.values) ? item.values : [];
    const price = nairaToKoboText(values[5]);
    const rowPaid = nairaToKoboText(values[16] ?? '0');
    if (!price || price === '0') throw bad('Enter the cost per sq ft for every item.');
    if (rowPaid === null) throw bad('Enter the amount paid in naira.');
    paid += BigInt(rowPaid);
    const unit = item.dimUnit === 'in' ? 'in' : 'ft';
    const description = String(item.jobDescription ?? '').trim();
    return {
      material_ref: String(item.materialId ?? ''), quantity: String(item.qty ?? ''), width: String(item.jobWidth ?? ''),
      height: String(item.jobHeight ?? ''), unit, price_per_sqft_kobo: price,
      description: `${description || 'Print job'} [${item.jobWidth}x${item.jobHeight}${unit}]`.slice(0, 1000),
    };
  });
  const status = String(first[22] ?? '');
  const method = normalizePaymentMethod(body.paymentMethod);
  if (paid > BigInt(0) && !method) throw bad('Choose how the customer paid: Cash, Transfer or POS.');
  return { requestId, payload: {
    actor_id: actorId, business_date: date, client_name: String(first[1] ?? ''), contact: String(first[3] ?? ''),
    job_status: STATUSES.includes(status) ? status : 'Quoted', initial_payment_kobo: paid.toString(),
    ...(paid > BigInt(0) ? { payment_method: method } : {}), items: jobs,
  } };
}

export async function recordLegacySale(request: Request, call: FinancialCall = callFinancial): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    body = parsed;
  } catch { return fail('Invalid sale.', 'INVALID_INPUT', 400); }
  try {
    const identity = await financialIdentity(true);
    if (!identity) throw new FinancialError('Your account needs an accounting identity.', 403, 'ACTOR_REQUIRED');
    const { requestId, payload } = legacySalePayload(body, identity.staffId.toLowerCase());
    const result = await call<{ order_id: string; stock_shortfalls?: unknown[] }>('api_legacy_sale', `legacy-sale:${requestId}`, payload);
    const short = Array.isArray(result.stock_shortfalls) ? result.stock_shortfalls.length : 0;
    return NextResponse.json({ success: true, salesId: result.order_id,
      // The old screen shows these as "adjust stock manually", as it did with Sheets.
      ...(short ? { inventoryWarnings: Array(short).fill('Not enough stock recorded for this roll'),
        message: `Sale recorded, but stock ran short for ${short} item(s). The owner will review the stock.` } : {}) },
    { headers: noStore });
  } catch (error) {
    if (error instanceof FinancialError) return fail(error.message, error.code, error.status);
    const code = (error as { code?: string }).code;
    if (code === '42501') return fail('Your account cannot record sales.', 'ACTOR_DISABLED', 403);
    if (code === '22023' || code === '22P02') return fail('This sale could not be read. Check the material, sizes, price and payment.', 'INVALID_INPUT', 400);
    if (code === '23514') return fail('The books are not ready for this sale. Ask the owner.', 'BOOKS_NOT_READY', 409);
    return fail('Sale is saved on this device and will retry.', 'ACCOUNTING_UNAVAILABLE', 503);
  }
}

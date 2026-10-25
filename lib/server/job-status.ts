// Job board status changes once Postgres is in charge. The board keeps using
// PATCH /api/sales. Versioned payments with a status use one atomic database
// operation; old row-based payment edits are preserved for review.
import { NextResponse } from 'next/server';
import { callFinancial, type FinancialCall } from './financial-db';
import { financialIdentity } from './financial-routes';
import { FinancialError } from './financial-service';
import { verifiedAdminIdentity } from './postgres-auth-routes';
import { MOVED_MESSAGE } from './legacy-feed';
import { collectLegacy, legacyBatchPayment, jobRef, paymentFailure } from './legacy-collect';
import { canonicalJobStatus } from '../job-status';

const noStore = { 'Cache-Control': 'no-store' };
const fail = (error: string, code: string, status: number) => NextResponse.json({ error, code }, { status, headers: noStore });

export async function changeJobStatus(request: Request, call: FinancialCall = callFinancial): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    body = parsed;
  } catch { return fail('Invalid request.', 'INVALID_INPUT', 400); }
  if (body.version === 2 || body.additionalPayment1 !== undefined || body.additionalPayment2 !== undefined || body.amountKobo !== undefined) {
    try { return NextResponse.json(await collectLegacy(legacyBatchPayment(body), call), { headers: noStore }); }
    catch (error) { return paymentFailure(error); }
  }
  const keys = Object.keys(body).filter(k => body[k] !== undefined && body[k] !== null && body[k] !== '');
  if (keys.some(k => !['rowIndex', 'saleId', 'jobId', 'jobStatus'].includes(k))) return fail(MOVED_MESSAGE, 'MOVED_TO_ACCOUNTING', 409);
  if (body.jobStatus === undefined) return fail('Choose a job status.', 'INVALID_INPUT', 400);
  // Older queued board moves use the Sheets labels. Translate only the known
  // equivalent stages; unknown values must remain rejected and saved for review.
  const status = canonicalJobStatus(body.jobStatus);
  if (!status) return fail('Choose a valid job status.', 'INVALID_INPUT', 400);
  const ref = typeof body.jobId === 'string' ? body.jobId : jobRef(body.saleId, body.rowIndex);
  if (!ref || ref.length > 200) return fail('Choose a job.', 'INVALID_INPUT', 400);
  try {
    const identity = await financialIdentity(true);
    if (!identity) throw new FinancialError('Your account needs an accounting identity.', 403, 'ACTOR_REQUIRED');
    const owner = !!await verifiedAdminIdentity();
    const result = await call<Record<string, unknown>>('api_job_status', `job-status:${crypto.randomUUID()}`,
      { actor_id: identity.staffId.toLowerCase(), job_ref: ref, status, any_age: owner });
    return NextResponse.json({ success: true, ...result }, { headers: noStore });
  } catch (error) {
    if (error instanceof FinancialError) return fail(error.message, error.code, error.status);
    const code = (error as { code?: string }).code;
    if (code === '42501') return fail('Only the owner can change jobs older than 24 hours.', 'OWNER_REQUIRED', 403);
    if (code === 'P0002') return fail('This job was not found. Refresh the board.', 'NOT_FOUND', 404);
    if (code === '22023') return fail('Choose a valid job and status.', 'INVALID_INPUT', 400);
    return fail('Job status could not be saved. It will retry.', 'ACCOUNTING_UNAVAILABLE', 503);
  }
}

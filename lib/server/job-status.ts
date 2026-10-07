// Job board status changes once Postgres is in charge. The board keeps using
// PATCH /api/sales (with its offline queue); only a pure status change is
// accepted here. Payment edits on that route still refuse.
import { NextResponse } from 'next/server';
import { callFinancial, type FinancialCall } from './financial-db';
import { financialIdentity } from './financial-routes';
import { FinancialError } from './financial-service';
import { verifiedAdminIdentity } from './postgres-auth-routes';
import { MOVED_MESSAGE } from './legacy-feed';

const STATUSES = ['Quoted', 'Printing', 'Finishing', 'Ready', 'Delivered'];
const noStore = { 'Cache-Control': 'no-store' };
const fail = (error: string, code: string, status: number) => NextResponse.json({ error, code }, { status, headers: noStore });

export async function changeJobStatus(request: Request, call: FinancialCall = callFinancial): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    body = parsed;
  } catch { return fail('Invalid request.', 'INVALID_INPUT', 400); }
  const keys = Object.keys(body).filter(k => body[k] !== undefined && body[k] !== null && body[k] !== '');
  if (body.jobStatus === undefined || keys.some(k => !['rowIndex', 'saleId', 'jobStatus'].includes(k))) {
    return fail(MOVED_MESSAGE, 'MOVED_TO_ACCOUNTING', 409);
  }
  if (typeof body.jobStatus !== 'string' || !STATUSES.includes(body.jobStatus)) return fail('Choose a valid job status.', 'INVALID_INPUT', 400);
  const ref = typeof body.saleId === 'string' && body.saleId.trim() ? body.saleId.trim()
    : (typeof body.rowIndex === 'number' || typeof body.rowIndex === 'string') && /^[0-9]{1,18}$/.test(String(body.rowIndex)) ? String(body.rowIndex) : '';
  if (!ref || ref.length > 200) return fail('Choose a job.', 'INVALID_INPUT', 400);
  try {
    const identity = await financialIdentity(true);
    if (!identity) throw new FinancialError('Your account needs an accounting identity.', 403, 'ACTOR_REQUIRED');
    const owner = !!await verifiedAdminIdentity();
    const result = await call<Record<string, unknown>>('api_job_status', `job-status:${crypto.randomUUID()}`,
      { actor_id: identity.staffId.toLowerCase(), job_ref: ref, status: body.jobStatus, any_age: owner });
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

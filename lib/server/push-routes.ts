import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

import { financialHandler, financialIdentity } from './financial-routes';
import { FinancialError } from './financial-service';
import { push } from './push';

async function bodyOf(request: Request) {
  try { return await request.json(); } catch { throw new FinancialError('Invalid request.', 400, 'INVALID_INPUT'); }
}
async function actor() {
  const identity = await financialIdentity(true);
  if (!identity) throw new FinancialError('Accounting identity required.', 403, 'ACTOR_REQUIRED');
  return identity;
}

// Anyone signed in manages only their own phones and their own alert switches.
export const phoneAlertState = (request: Request) => financialHandler(async () => push.state(await actor(), new URL(request.url).searchParams.get('endpoint')));
export const turnOnPhone = (request: Request) => financialHandler(async () => ({ success: true, ...await push.subscribe(await actor(), await bodyOf(request)) }));
export const turnOffPhone = (request: Request) => financialHandler(async () => ({ success: true, ...await push.unsubscribe(await actor(), await bodyOf(request)) }));
export const sendTestAlert = (request: Request) => financialHandler(async () => {
  const body = await bodyOf(request).catch(() => ({})) as { home?: unknown };
  return { success: true, ...await push.sendTest(await actor(), typeof body.home === 'string' && body.home.startsWith('/') ? body.home : '/') };
});
export const saveAlertSwitch = (request: Request) => financialHandler(async () => ({ success: true, ...await push.savePreference(await actor(), await bodyOf(request)) }));

/** A scheduler can call this to send anything still waiting (for example after a restart). It needs the shared secret. */
export async function runDispatch(request: Request) {
  const secret = process.env.PUSH_DISPATCH_SECRET ?? '', given = request.headers.get('x-push-secret') ?? '';
  const ok = secret.length >= 24 && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return NextResponse.json({ error: 'Not allowed.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  return NextResponse.json(await push.dispatch(process.env.SUPABASE_ADMIN_STAFF_ID, 50), { headers: { 'Cache-Control': 'no-store' } });
}

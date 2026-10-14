import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { signToken, verifyToken } from '../auth-utils';
import { AdminAuthError, adminAuthMode, createAdminAuth } from './admin-auth';
import { ownerCookie } from './admin-session';

const PENDING = 'admin_pending';
const FIVE_MINUTES = 5 * 60;
const secure = () => process.env.NODE_ENV === 'production';
const reply = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
const failure = (error: unknown) => error instanceof AdminAuthError
  ? reply({ error: error.message }, error.status)
  : reply({ error: 'Sign-in service is unavailable. Please try again.' }, 503);
const notEnabled = () => adminAuthMode() === 'supabase' ? null : reply({ error: 'Not available.' }, 404);
async function body(request: Request): Promise<Record<string, unknown>> {
  const value = await request.json().catch(() => null);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AdminAuthError('Invalid request.', 400);
  return value as Record<string, unknown>;
}

/** Step 1: email and password. Hands back what the page needs for step 2 and keeps the half-signed-in state in a short HttpOnly cookie. */
export async function adminPasswordLogin(request: Request) {
  try {
    const input = await body(request);
    const result = await createAdminAuth().passwordStep(input.email, input.password);
    const response = reply(result.step === 'setup' ? { step: 'setup', qr: result.qr, secret: result.secret } : { step: 'code' });
    const token = await signToken({ role: 'admin-pending', accessToken: result.accessToken, factorId: result.factorId }, FIVE_MINUTES * 1000);
    response.cookies.set(PENDING, token, { httpOnly: true, secure: secure(), sameSite: 'lax', path: '/api/auth', maxAge: FIVE_MINUTES });
    return response;
  } catch (error) { return failure(error); }
}

/** Step 2: the 6-digit code. Only a code Supabase accepts turns the half sign-in into the real admin session. */
export async function adminCodeLogin(request: Request) {
  const off = notEnabled(); if (off) return off;
  try {
    const input = await body(request);
    const pendingToken = (await cookies()).get(PENDING)?.value;
    const pending = pendingToken ? await verifyToken(pendingToken) : null;
    if (pending?.role !== 'admin-pending' || typeof pending.accessToken !== 'string' || typeof pending.factorId !== 'string') {
      throw new AdminAuthError('Your sign-in expired. Start again.', 401);
    }
    const { email, refreshToken } = await createAdminAuth().codeStep({ accessToken: pending.accessToken, factorId: pending.factorId }, input.code);
    const response = reply({ success: true });
    response.cookies.set('admin_session', await ownerCookie(email, refreshToken), { httpOnly: true, secure: secure(), sameSite: 'lax', path: '/', maxAge: 7 * 24 * 60 * 60 });
    response.cookies.delete({ name: PENDING, path: '/api/auth' });
    return response;
  } catch (error) { return failure(error); }
}

/** "Forgot password": always answers the same way. */
export async function adminResetRequest(request: Request) {
  const off = notEnabled(); if (off) return off;
  try {
    const input = await body(request);
    await createAdminAuth().requestReset(input.email, new URL('/bom03/login/reset', request.url).toString());
    return reply({ success: true });
  } catch (error) { return failure(error); }
}

/** The page sends the link's temporary token with the new password. */
export async function adminResetPassword(request: Request) {
  const off = notEnabled(); if (off) return off;
  try {
    const input = await body(request);
    await createAdminAuth().setPassword(input.token, input.password);
    return reply({ success: true });
  } catch (error) { return failure(error); }
}

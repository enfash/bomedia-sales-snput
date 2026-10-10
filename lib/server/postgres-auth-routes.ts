import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '../auth-utils';
import { AuthError, postgresAuth } from './postgres-auth';

async function handle(work: () => Promise<NextResponse>) {
  try { return await work(); }
  catch (error) {
    const known = error instanceof AuthError;
    return NextResponse.json({ error: known ? error.message : 'Authentication service is unavailable. Please try again.' },
      { status: known ? error.status : 503, headers: { 'Cache-Control': 'no-store', ...(known && error.status === 429 ? { 'Retry-After': '900' } : {}) } });
  }
}
async function body(request: Request): Promise<Record<string, unknown>> {
  let value: unknown;
  try { value = await request.json(); } catch { throw new AuthError('Invalid request.', 400); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AuthError('Invalid request.', 400);
  return value as Record<string, unknown>;
}
export async function verifiedAdminIdentity(): Promise<string | null> {
  const token = (await cookies()).get('admin_session')?.value;
  const payload = token ? await verifyToken(token) : null;
  const email = process.env.ADMIN_EMAIL || (process.env.NODE_ENV !== 'production' ? 'admin@bomedia.com' : null);
  return payload?.role === 'admin' && email && payload.email === email ? email : null;
}
async function requireAdmin() {
  const identity = await verifiedAdminIdentity();
  if (!identity) throw new AuthError('Admin access is required.', 403);
  return identity;
}
const json = (value: unknown) => NextResponse.json(value, { headers: { 'Cache-Control': 'no-store' } });

export function postgresLogin(request: Request) {
  return handle(async () => {
    const input = await body(request);
    const result = await postgresAuth.login(input.name, input.passcode);
    const response = json({ success: true, name: result.name });
    response.cookies.set('cashier_session', result.token, { httpOnly: true, secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', path: '/', maxAge: 7 * 24 * 60 * 60 });
    return response;
  });
}
export function postgresLogout() {
  return handle(async () => {
    await postgresAuth.logout((await cookies()).get('cashier_session')?.value);
    const response = json({ success: true });
    response.cookies.delete('cashier_session'); response.cookies.delete('admin_session');
    return response;
  });
}
export function postgresStaffList() {
  return handle(async () => json({ data: await postgresAuth.list() }));
}
export function postgresStaffCreate(request: Request) {
  return handle(async () => {
    const admin = await requireAdmin();
    const input = await body(request);
    await postgresAuth.manage('create', input.name, input.passcode, admin);
    return json({ success: true });
  });
}
export function postgresStaffUpdate(request: Request) {
  return handle(async () => {
    const input = await body(request);
    if (input.passcode !== undefined) {
      const admin = await requireAdmin();
      await postgresAuth.manage('reset', input.name, input.passcode, admin);
      return json({ success: true });
    }
    if (input.status !== 'Online' && input.status !== 'Offline') throw new AuthError('Choose Online or Offline.', 400);
    await postgresAuth.presence((await cookies()).get('cashier_session')?.value, input.name, input.status === 'Online');
    return json({ success: true });
  });
}
export function postgresStaffDisable(request: Request) {
  return handle(async () => {
    const admin = await requireAdmin();
    const input = await body(request);
    await postgresAuth.manage('disable', input.name, undefined, admin);
    return json({ success: true });
  });
}

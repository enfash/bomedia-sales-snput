import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { signToken, verifyToken } from '../auth-utils';
import { createHmac } from 'node:crypto';
import { validateAuthConnection } from './auth-db';
import { postgresAuthEnabled } from './auth-backend';

const fixtures = vi.hoisted(() => ({
  values: new Map<string,string>(),
  login: vi.fn(), session: vi.fn(), logout: vi.fn(), presence: vi.fn(), list: vi.fn(), manage: vi.fn(),
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (name: string) => {
  const value = fixtures.values.get(name); return value ? { value } : undefined;
} }) }));
vi.mock('./postgres-auth', async importOriginal => {
  const actual = await importOriginal<typeof import('./postgres-auth')>();
  return { ...actual, postgresAuth: fixtures };
});
import { postgresLogin, postgresLogout, postgresStaffCreate, postgresStaffUpdate, postgresStaffDisable } from './postgres-auth-routes';
import { AuthError } from './postgres-auth';
import { proxy } from '../../proxy';
const request = (data: unknown) => new Request('https://app.example.test/api/cashiers', { method: 'POST', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } });
beforeEach(() => {
  vi.clearAllMocks(); fixtures.values.clear();
  vi.stubEnv('AUTH_BACKEND','postgres'); vi.stubEnv('SESSION_SECRET','test-session-secret-that-is-not-a-real-key');
  vi.stubEnv('ADMIN_EMAIL','owner@example.test');
});
afterEach(() => vi.unstubAllEnvs());

it('issues an HttpOnly session cookie without exposing the session secret as JSON', async () => {
  fixtures.login.mockResolvedValue({ token: 'signed-secret-token', name: 'Staff' });
  const response = await postgresLogin(request({ name: 'Staff',passcode:'0042' }));
  expect(await response.json()).toEqual({ success: true,name:'Staff' });
  expect(response.headers.get('set-cookie')).toContain('HttpOnly');
  expect(response.headers.get('set-cookie')).toContain('SameSite=lax');
  expect(response.headers.get('cache-control')).toBe('no-store');
});

it('keeps invalid PINs and database failures on the new path with safe error messages', async () => {
  fixtures.login.mockRejectedValue(new AuthError('Invalid sign-in.',401));
  expect((await postgresLogin(request({ name: 'Staff',passcode:'wrong' }))).status).toBe(401);
  fixtures.login.mockRejectedValue(new Error('postgres://secret-password@example.invalid'));
  const response = await postgresLogin(request({ name: 'Staff',passcode:'0042' }));
  expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toContain('secret-password');
});

it('requires a verified current admin identity for creating, resetting and disabling accounts', async () => {
  expect((await postgresStaffCreate(request({ name:'New',passcode:'1234' }))).status).toBe(403);
  expect((await postgresStaffUpdate(request({ name:'Staff',passcode:'1234' }))).status).toBe(403);
  expect((await postgresStaffDisable(request({ name:'Staff' }))).status).toBe(403);
  expect(fixtures.manage).not.toHaveBeenCalled();
  fixtures.values.set('admin_session',await signToken({ role:'admin',email:'owner@example.test' }));
  fixtures.manage.mockResolvedValue('new-staff-id');
  expect((await postgresStaffCreate(request({ name:'New',passcode:'1234' }))).status).toBe(200);
  expect(fixtures.manage).toHaveBeenCalledWith('create','New','1234','owner@example.test');
});

it('does not allow a public heartbeat to bypass server session validation', async () => {
  fixtures.presence.mockRejectedValue(new AuthError('Please sign in.',401));
  expect((await postgresStaffUpdate(request({ name:'Staff',status:'Online' }))).status).toBe(401);
  expect(fixtures.presence).toHaveBeenCalledWith(undefined,'Staff',true);
});

it('revokes the database session before clearing both cookies', async () => {
  fixtures.values.set('cashier_session','cookie-token');
  fixtures.logout.mockResolvedValue(undefined);
  const response = await postgresLogout();
  expect(fixtures.logout).toHaveBeenCalledWith('cookie-token');
  expect(response.headers.get('set-cookie')).toContain('cashier_session=;');
  expect(response.headers.get('set-cookie')).toContain('admin_session=;');
});

it('checks PostgreSQL revocation in the proxy and refuses to fall back on a signed legacy cookie', async () => {
  const cookie = await signToken({ role:'cashier',name:'Staff' });
  fixtures.session.mockResolvedValue(null);
  const response = await proxy(new NextRequest('https://app.example.test/api/sales',{ headers:{ cookie:`cashier_session=${cookie}` } }));
  expect(response.status).toBe(401);
  fixtures.session.mockRejectedValue(new Error('database down'));
  const unavailable = await proxy(new NextRequest('https://app.example.test/api/sales',{ headers:{ cookie:`cashier_session=${cookie}` } }));
  expect(unavailable.status).toBe(503);
});

it('keeps legacy mode available until activation and refuses an unknown backend', () => {
  vi.stubEnv('AUTH_BACKEND','sheets'); expect(postgresAuthEnabled()).toBe(false);
  vi.stubEnv('AUTH_BACKEND','typo'); expect(() => postgresAuthEnabled()).toThrow('Unsupported');
});

it('rejects migration-owner credentials, wrong projects and insecure URL options for the runtime connection', () => {
  const ref='abcdefghijklmnopqrst';
  expect(validateAuthConnection(`postgresql://bomedia_auth_server.${ref}:private@aws-1-eu-central-1.pooler.supabase.com:6543/postgres`,ref)).toContain('bomedia_auth_server');
  expect(() => validateAuthConnection(`postgresql://postgres.${ref}:private@aws-1-eu-central-1.pooler.supabase.com:5432/postgres`,ref)).toThrow('dedicated');
  expect(() => validateAuthConnection('postgresql://bomedia_auth_server:private@example.invalid/postgres',ref)).toThrow('dedicated');
  expect(() => validateAuthConnection(`postgresql://bomedia_auth_server:private@db.${ref}.supabase.co/postgres?sslmode=disable`,ref)).toThrow('dedicated');
});

it('rejects validly signed but non-expiring or malformed cookie payloads', async () => {
  const payload = JSON.stringify({ role:'admin',email:'owner@example.test' });
  const signature = createHmac('sha256',process.env.SESSION_SECRET!).update(payload).digest('hex');
  const missingExpiry = `${btoa(encodeURIComponent(payload))}.${signature}`;
  expect(await verifyToken(missingExpiry)).toBeNull();
  const current = await signToken({ role:'admin' });
  expect(await verifyToken(current)).toMatchObject({ role:'admin' });
  expect(await verifyToken(current+'.extra')).toBeNull();
  expect(await verifyToken(await signToken({ role:'admin' },-1))).toBeNull();
});

import { describe, expect, it } from 'vitest';
import { AdminAuthError, adminAuthMode, createAdminAuth, qrImageSource } from './admin-auth';

const env = { ADMIN_EMAIL: 'Owner@Example.com', SUPABASE_URL: 'https://proj.supabase.co/', SUPABASE_PUBLISHABLE_KEY: 'pub-key', ADMIN_AUTH: 'supabase' };
type Reply = { status?: number; body?: unknown };
function fake(replies: Record<string, Reply | Reply[]>) {
  const calls: { method: string; path: string; auth: string | null; body: unknown }[] = [];
  const fetcher = async (input: string, init?: RequestInit) => {
    const path = input.replace('https://proj.supabase.co/auth/v1', '');
    const headers = init?.headers as Record<string, string>;
    calls.push({ method: init?.method ?? 'GET', path, auth: headers.Authorization, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const key = Object.keys(replies).find((k) => path.startsWith(k)) ?? '';
    const entry = replies[key];
    const reply = (Array.isArray(entry) ? entry.shift() : entry) ?? { status: 404, body: {} };
    return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status ?? 200 });
  };
  return { calls, auth: createAdminAuth(env, fetcher) };
}
const fails = async (work: Promise<unknown>, status: number, text?: string) => {
  const error = await work.then(() => null, (e) => e);
  expect(error).toBeInstanceOf(AdminAuthError);
  expect(error.status).toBe(status);
  if (text) expect(error.message).toContain(text);
};
const signedIn = (factors: unknown[] = [], email = 'owner@example.com') => ({ '/token': { body: { access_token: 'aal1', user: { email, factors } } } });

describe('admin sign-in mode', () => {
  it('stays on the old password unless ADMIN_AUTH=supabase', () => {
    expect(adminAuthMode({})).toBe('password');
    expect(adminAuthMode({ ADMIN_AUTH: 'supabase' })).toBe('supabase');
  });
});

describe('QR image', () => {
  it('turns Supabase\'s raw SVG data address into one an image tag can draw', () => {
    const raw = 'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg"><path d="M1 1"/></svg>';
    const src = qrImageSource(raw);
    expect(src.startsWith('data:image/svg+xml;charset=utf-8,%3Csvg')).toBe(true);
    expect(src).not.toContain('<');
    expect(decodeURIComponent(src.split(',')[1])).toBe('<svg xmlns="http://www.w3.org/2000/svg"><path d="M1 1"/></svg>');
    expect(qrImageSource(src)).toBe(src);
  });
});

describe('password step', () => {
  it('asks for the code when an authenticator is already set up', async () => {
    const { auth, calls } = fake(signedIn([{ id: 'f1', factor_type: 'totp', status: 'verified' }]));
    expect(await auth.passwordStep('OWNER@example.com', 'pw')).toEqual({ step: 'code', accessToken: 'aal1', factorId: 'f1' });
    expect(calls[0]).toMatchObject({ path: '/token?grant_type=password', auth: 'Bearer pub-key' });
  });
  it('starts the authenticator setup the first time, clearing half-finished attempts', async () => {
    const { auth, calls } = fake({ ...signedIn([{ id: 'old', factor_type: 'totp', status: 'unverified' }]),
      '/factors/old': { body: {} }, '/factors': { body: { id: 'new', totp: { qr_code: 'data:qr', secret: 'ABC' } } } });
    expect(await auth.passwordStep('owner@example.com', 'pw')).toMatchObject({ step: 'setup', factorId: 'new', qr: qrImageSource('data:qr'), secret: 'ABC' });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(['POST /token?grant_type=password', 'DELETE /factors/old', 'POST /factors']);
  });
  it('gives the same answer for a wrong password and a different person', async () => {
    await fails(fake({ '/token': { status: 400, body: { error_code: 'invalid_credentials' } } }).auth.passwordStep('owner@example.com', 'bad'), 401, 'Invalid credentials');
    await fails(fake(signedIn([], 'someone@else.com')).auth.passwordStep('someone@else.com', 'pw'), 401, 'Invalid credentials');
  });
  it('reports lockout and outages plainly, and rejects empty input', async () => {
    await fails(fake({ '/token': { status: 429 } }).auth.passwordStep('owner@example.com', 'x'), 429);
    await fails(fake({ '/token': { status: 500 } }).auth.passwordStep('owner@example.com', 'x'), 503);
    await fails(fake({}).auth.passwordStep('', ''), 400);
  });
  it('refuses to run when the server is not configured', async () => {
    await fails(createAdminAuth({ ADMIN_AUTH: 'supabase' }).passwordStep('a@b.c', 'x'), 503);
  });
});

describe('code step', () => {
  const pending = { accessToken: 'aal1', factorId: 'f1' };
  it('accepts a good code and returns the owner email exactly as configured', async () => {
    const { auth, calls } = fake({ '/factors/f1/challenge': { body: { id: 'c1' } }, '/factors/f1/verify': { body: { access_token: 'aal2', refresh_token: 'rt2' } }, '/user': { body: { email: 'owner@example.com' } } });
    expect(await auth.codeStep(pending, ' 123456 ')).toEqual({ email: 'Owner@Example.com', refreshToken: 'rt2' });
    expect(calls[1].body).toEqual({ challenge_id: 'c1', code: '123456' });
    expect(calls[1].auth).toBe('Bearer aal1');
    expect(calls[2].auth).toBe('Bearer aal2');
  });
  it('rejects a wrong code, a malformed code, and an expired sign-in', async () => {
    await fails(fake({ '/factors/f1/challenge': { body: { id: 'c1' } }, '/factors/f1/verify': { status: 400 } }).auth.codeStep(pending, '000000'), 401, 'not right');
    await fails(fake({}).auth.codeStep(pending, '12ab56'), 400);
    await fails(fake({ '/factors/f1/challenge': { status: 401 } }).auth.codeStep(pending, '123456'), 401, 'expired');
  });
  it('refuses when the verified account is not the owner', async () => {
    const { auth } = fake({ '/factors/f1/challenge': { body: { id: 'c1' } }, '/factors/f1/verify': { body: { access_token: 'aal2' } }, '/user': { body: { email: 'x@y.z' } } });
    await fails(auth.codeStep(pending, '123456'), 401);
  });
});

describe('refreshing the sign-in', () => {
  it('returns the new refresh token while the owner is still valid', async () => {
    const { auth, calls } = fake({ '/token': { body: { refresh_token: 'new', user: { email: 'OWNER@example.com' } } } });
    expect(await auth.refreshSession('old')).toEqual({ status: 'ok', refreshToken: 'new' });
    expect(calls[0]).toMatchObject({ path: '/token?grant_type=refresh_token', body: { refresh_token: 'old' } });
  });
  it('says revoked for a deleted or banned user, a used-up token, or a different person', async () => {
    expect(await fake({ '/token': { status: 400, body: { error_code: 'refresh_token_not_found' } } }).auth.refreshSession('x')).toEqual({ status: 'revoked' });
    expect(await fake({ '/token': { status: 403, body: { error_code: 'user_banned' } } }).auth.refreshSession('x')).toEqual({ status: 'revoked' });
    expect(await fake({ '/token': { body: { refresh_token: 'n', user: { email: 'x@y.z' } } } }).auth.refreshSession('x')).toEqual({ status: 'revoked' });
  });
  it('says unavailable (never revoked) for outages and rate limits', async () => {
    expect(await fake({ '/token': { status: 500 } }).auth.refreshSession('x')).toEqual({ status: 'unavailable' });
    expect(await fake({ '/token': { status: 429 } }).auth.refreshSession('x')).toEqual({ status: 'unavailable' });
    expect(await createAdminAuth(env, async () => { throw new Error('offline'); }).refreshSession('x')).toEqual({ status: 'unavailable' });
  });
});

describe('password reset', () => {
  it('only emails the owner, and never reveals whether it did', async () => {
    const a = fake({ '/recover': { body: {} } });
    await a.auth.requestReset('stranger@x.com', 'https://app/bom03/login/reset');
    expect(a.calls).toHaveLength(0);
    await a.auth.requestReset('owner@example.com', 'https://app/bom03/login/reset');
    expect(a.calls[0].path).toBe('/recover?redirect_to=https%3A%2F%2Fapp%2Fbom03%2Flogin%2Freset');
    expect(a.calls[0].body).toEqual({ email: 'owner@example.com' });
  });
  it('changes the password only for the owner and only when it is long enough', async () => {
    const ok = fake({ '/user': [{ body: { email: 'owner@example.com' } }, { body: {} }] });
    await ok.auth.setPassword('rec', 'a-long-new-password');
    expect(ok.calls[1]).toMatchObject({ method: 'PUT', body: { password: 'a-long-new-password' } });
    await fails(fake({}).auth.setPassword('rec', 'short'), 400, '12');
    await fails(fake({ '/user': { body: { email: 'x@y.z' } } }).auth.setPassword('rec', 'a-long-new-password'), 400);
    await fails(fake({}).auth.setPassword('', 'a-long-new-password'), 400);
  });
});

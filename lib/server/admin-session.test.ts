import { describe, expect, it } from 'vitest';
import { verifyToken } from '../auth-utils';
import { CHECK_EVERY_MS, GRACE_MS, checkOwner, needsCheck, ownerCookie, withinGrace } from './admin-session';

const minutes = (n: number) => n * 60 * 1000;
const owner = (extra = {}) => ({ role: 'admin', email: 'owner@example.com', rt: 'refresh-1', checkedAt: Date.now(), ...extra });

describe('when the owner is asked again', () => {
  it('leaves old-style password cookies and other roles alone', () => {
    expect(needsCheck({ role: 'admin', email: 'a@b.c' })).toBe(false);
    expect(needsCheck({ role: 'cashier', rt: 'x', checkedAt: 0 })).toBe(false);
    expect(withinGrace({ role: 'admin', email: 'a@b.c' })).toBe(true);
  });
  it('asks every few minutes, not on every request', () => {
    const now = Date.now();
    expect(needsCheck(owner({ checkedAt: now - CHECK_EVERY_MS + 1000 }), now)).toBe(false);
    expect(needsCheck(owner({ checkedAt: now - CHECK_EVERY_MS }), now)).toBe(true);
  });
  it('only keeps an unconfirmed owner in for the grace period', () => {
    const now = Date.now();
    expect(withinGrace(owner({ checkedAt: now - GRACE_MS + 1000 }), now)).toBe(true);
    expect(withinGrace(owner({ checkedAt: now - GRACE_MS }), now)).toBe(false);
  });
});

describe('checking the owner with Supabase', () => {
  const fakeAuth = (result: { status: 'ok'; refreshToken: string } | { status: 'revoked' | 'unavailable' }, calls: string[] = []) =>
    ({ refreshSession: async (token: string) => { calls.push(token); return result; } }) as never;

  it('signs the owner out only on a definite no', async () => {
    expect(await checkOwner(owner({ rt: 'r-revoked' }), fakeAuth({ status: 'revoked' }))).toEqual({ revoked: true });
  });
  it('keeps the owner in (no new cookie) when Supabase cannot be reached', async () => {
    expect(await checkOwner(owner({ rt: 'r-down' }), fakeAuth({ status: 'unavailable' }))).toEqual({ unavailable: true });
  });
  it('issues a fresh cookie with the new refresh token, a new check time and the ORIGINAL expiry', async () => {
    const original = await ownerCookie('owner@example.com', 'r-old', minutes(60));
    const payload = await verifyToken(original);
    const verdict = await checkOwner({ ...payload, rt: 'r-ok-1', checkedAt: Date.now() - minutes(10) }, fakeAuth({ status: 'ok', refreshToken: 'r-new' }));
    const next = await verifyToken(verdict.cookie!);
    expect(next).toMatchObject({ role: 'admin', email: 'owner@example.com', rt: 'r-new' });
    expect(Date.now() - next.checkedAt).toBeLessThan(5000);
    expect(Math.abs(next.exp - payload.exp)).toBeLessThan(5000);
  });
  it('spends a refresh token once even when many requests arrive together', async () => {
    const calls: string[] = [];
    const auth = fakeAuth({ status: 'ok', refreshToken: 'r-next' }, calls);
    const same = owner({ rt: 'r-burst' });
    const results = await Promise.all(Array.from({ length: 8 }, () => checkOwner(same, auth)));
    expect(calls).toEqual(['r-burst']);
    expect(new Set(results.map((r) => r.cookie)).size).toBe(1);
  });
});

it('requires a tracked owner cookie after selecting Supabase authentication',async()=>{
 const {vi}=await import('vitest');vi.stubEnv('ADMIN_AUTH','supabase');
 try {
  expect(withinGrace({role:'admin',email:'owner@example.com'})).toBe(false);
  expect(withinGrace(owner({rt:''}))).toBe(false);
  expect(withinGrace(owner())).toBe(true);
 } finally {vi.unstubAllEnvs();}
});

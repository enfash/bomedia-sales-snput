import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ admin: vi.fn(), session: vi.fn(), dispatch: vi.fn(), state: vi.fn(), subscribe: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: 'signed-session' }) }) }));
vi.mock('./postgres-auth-routes', () => ({ verifiedAdminIdentity: mocks.admin }));
vi.mock('./postgres-auth', () => ({ postgresAuth: { session: mocks.session } }));
vi.mock('./financial-db', async (original) => ({ ...(await original<object>()), financialApiEnabled: () => true }));
vi.mock('./push', () => ({ push: { dispatch: mocks.dispatch, state: mocks.state, subscribe: mocks.subscribe, unsubscribe: vi.fn(), savePreference: vi.fn() } }));
import { phoneAlertState, runDispatch, turnOnPhone } from './push-routes';

const owner = '00000000-0000-4000-8000-000000000001';
const cashier = '00000000-0000-4000-8000-000000000002';
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('AUTH_BACKEND', 'postgres'); vi.stubEnv('SUPABASE_ADMIN_STAFF_ID', owner); vi.stubEnv('PUSH_DISPATCH_SECRET', 's'.repeat(32));
  mocks.admin.mockResolvedValue(null); mocks.session.mockResolvedValue({ staff_id: cashier });
  mocks.state.mockResolvedValue({ configured: true }); mocks.subscribe.mockResolvedValue({ id: 'd', subscribed: true }); mocks.dispatch.mockResolvedValue({ sent: 1, failed: 0 });
});
afterEach(() => vi.unstubAllEnvs());

it('registers a phone under whoever is signed in, the owner under the owner identity', async () => {
  const body = JSON.stringify({ endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'p', auth: 'a' } });
  expect((await turnOnPhone(new Request('https://app.example.test/api/push/subscription', { method: 'POST', body }))).status).toBe(200);
  expect(mocks.subscribe).toHaveBeenLastCalledWith({ staffId: cashier }, expect.any(Object));
  mocks.admin.mockResolvedValue('owner@example.test');
  await turnOnPhone(new Request('https://app.example.test/api/push/subscription', { method: 'POST', body }));
  expect(mocks.subscribe).toHaveBeenLastCalledWith({ staffId: owner }, expect.any(Object));
  expect((await phoneAlertState(new Request('https://app.example.test/api/push/subscription?endpoint=x'))).status).toBe(200);
  expect((await turnOnPhone(new Request('https://app.example.test/api/push/subscription', { method: 'POST', body: 'nope' }))).status).toBe(400);
});

it('lets only a caller with the shared secret start a send', async () => {
  const call = (secret?: string) => runDispatch(new Request('https://app.example.test/api/push/dispatch', { method: 'POST', headers: secret ? { 'x-push-secret': secret } : {} }));
  expect((await call()).status).toBe(403);
  expect((await call('wrong'.repeat(8))).status).toBe(403);
  expect(mocks.dispatch).not.toHaveBeenCalled();
  const ok = await call('s'.repeat(32));
  expect(ok.status).toBe(200);
  expect(await ok.json()).toEqual({ sent: 1, failed: 0 });
  expect(mocks.dispatch).toHaveBeenCalledWith(owner, 50);
});

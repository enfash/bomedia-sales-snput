import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ admin: vi.fn(), session: vi.fn(), read: vi.fn(), close: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: 'signed-session' }) }) }));
vi.mock('./postgres-auth-routes', () => ({ verifiedAdminIdentity: mocks.admin }));
vi.mock('./postgres-auth', () => ({ postgresAuth: { session: mocks.session } }));
vi.mock('./bookkeeping-period', () => ({ bookkeepingPeriod: { read: mocks.read, close: mocks.close } }));
import { closeBooks, readBookkeepingPeriod } from './bookkeeping-period-routes';

const id = '00000000-0000-4000-8000-000000000001';
const post = (body: unknown) => new Request('https://app.example.test/api/accounting/bookkeeping-period', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('POSTGRES_FINANCIAL_API_ENABLED', 'true'); vi.stubEnv('AUTH_BACKEND', 'postgres'); vi.stubEnv('SUPABASE_ADMIN_STAFF_ID', id);
  mocks.admin.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());

it('is owner only for reading and closing, including a signed-in cashier', async () => {
  mocks.session.mockResolvedValue({ staff_id: id });
  expect((await readBookkeepingPeriod()).status).toBe(403);
  expect((await closeBooks(post({ requestId: 'r', through: '2026-10-31' }))).status).toBe(403);
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.close).not.toHaveBeenCalled();
});

it('reads the period for the owner without caching', async () => {
  mocks.admin.mockResolvedValue('owner@example.test');
  mocks.read.mockResolvedValue({ configured: true });
  const response = await readBookkeepingPeriod();
  expect(await response.json()).toEqual({ configured: true });
  expect(response.headers.get('cache-control')).toBe('no-store');
});

it('closes with the owner accounting identity, never one sent by the browser', async () => {
  mocks.admin.mockResolvedValue('owner@example.test');
  mocks.close.mockResolvedValue({ closed_through: '2026-10-31' });
  const response = await closeBooks(post({ requestId: 'r', through: '2026-10-31', actorId: 'someone-else' }));
  expect(await response.json()).toEqual({ success: true, closed_through: '2026-10-31' });
  expect(mocks.close).toHaveBeenCalledWith({ staffId: id }, { requestId: 'r', through: '2026-10-31', actorId: 'someone-else' });
});

it('rejects a body that is not JSON', async () => {
  mocks.admin.mockResolvedValue('owner@example.test');
  expect((await closeBooks(post('not json'))).status).toBe(400);
  expect(mocks.close).not.toHaveBeenCalled();
});

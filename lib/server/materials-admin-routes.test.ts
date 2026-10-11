import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ admin: vi.fn(), session: vi.fn(), read: vi.fn(), save: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: 'signed-session' }) }) }));
vi.mock('./postgres-auth-routes', () => ({ verifiedAdminIdentity: mocks.admin }));
vi.mock('./postgres-auth', () => ({ postgresAuth: { session: mocks.session } }));
vi.mock('./materials-admin', () => ({ materialsAdmin: { read: mocks.read, save: mocks.save } }));
import { readMaterialsAdmin, saveMaterial } from './materials-admin-routes';

const id = '00000000-0000-4000-8000-000000000001';
const post = (body: unknown) => new Request('https://app.example.test/api/accounting/materials', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('POSTGRES_FINANCIAL_API_ENABLED', 'true'); vi.stubEnv('AUTH_BACKEND', 'postgres'); vi.stubEnv('SUPABASE_ADMIN_STAFF_ID', id);
  mocks.admin.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());

it('is owner only for reading and changing, including a signed-in cashier', async () => {
  mocks.session.mockResolvedValue({ staff_id: id });
  expect((await readMaterialsAdmin()).status).toBe(403);
  expect((await saveMaterial(post({ requestId: 'r', action: 'set_price', name: 'Flex', price: '250' }))).status).toBe(403);
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.save).not.toHaveBeenCalled();
});

it('reads for the owner without caching', async () => {
  mocks.admin.mockResolvedValue('owner@example.test');
  mocks.read.mockResolvedValue([{ name: 'Flex' }]);
  const response = await readMaterialsAdmin();
  expect(await response.json()).toEqual({ data: [{ name: 'Flex' }] });
  expect(response.headers.get('cache-control')).toBe('no-store');
});

it('saves with the owner accounting identity, never one from the browser', async () => {
  mocks.admin.mockResolvedValue('owner@example.test');
  mocks.save.mockResolvedValue({ price_kobo: '25000' });
  const body = { requestId: 'r', action: 'set_price', name: 'Flex', price: '250', actorId: 'someone-else' };
  expect(await (await saveMaterial(post(body))).json()).toEqual({ success: true, price_kobo: '25000' });
  expect(mocks.save).toHaveBeenCalledWith({ staffId: id }, body);
});

it('rejects a body that is not JSON', async () => {
  mocks.admin.mockResolvedValue('owner@example.test');
  expect((await saveMaterial(post('not json'))).status).toBe(400);
  expect(mocks.save).not.toHaveBeenCalled();
});

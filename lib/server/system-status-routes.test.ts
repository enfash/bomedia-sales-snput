import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ admin: vi.fn(), session: vi.fn(), read: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: 'signed-session' }) }) }));
vi.mock('./postgres-auth-routes', () => ({ verifiedAdminIdentity: mocks.admin }));
vi.mock('./postgres-auth', () => ({ postgresAuth: { session: mocks.session } }));
vi.mock('./system-status', async importOriginal => ({ ...await importOriginal<typeof import('./system-status')>(), readSystemStatus: mocks.read }));
import { getSystemStatus } from './system-status-routes';

beforeEach(() => { vi.resetAllMocks(); vi.stubEnv('POSTGRES_FINANCIAL_API_ENABLED', 'true'); vi.stubEnv('AUTH_BACKEND', 'postgres'); mocks.admin.mockResolvedValue(null); });
afterEach(() => vi.unstubAllEnvs());

it('is for the owner only, including a signed-in cashier', async () => {
  mocks.session.mockResolvedValue({ staff_id: '00000000-0000-4000-8000-000000000001' });
  expect((await getSystemStatus()).status).toBe(403);
  expect(mocks.read).not.toHaveBeenCalled();
});

it('returns the status to the owner', async () => {
  mocks.admin.mockResolvedValue('owner@example.test');
  mocks.read.mockResolvedValue({ backend: 'postgres', database: { reachable: true, ms: 80 } });
  const response = await getSystemStatus();
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ backend: 'postgres' });
});

it('answers for Google Sheets without touching the database', async () => {
  vi.stubEnv('POSTGRES_FINANCIAL_API_ENABLED', 'false');
  mocks.admin.mockResolvedValue('owner@example.test');
  const response = await getSystemStatus();
  expect(await response.json()).toMatchObject({ backend: 'sheets', today: null });
  expect(mocks.read).not.toHaveBeenCalled();
});

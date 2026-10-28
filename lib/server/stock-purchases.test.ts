import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ admin: vi.fn(), call: vi.fn() }));
vi.mock('./postgres-auth-routes', () => ({ verifiedAdminIdentity: mocks.admin }));
import { readStockPurchases } from './stock-purchases';
const request = (query = '') => new Request(`https://app.example.test/api/accounting/stock-purchases${query}`);
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv('AUTH_BACKEND', 'postgres'); vi.stubEnv('POSTGRES_FINANCIAL_API_ENABLED', 'true'); });
afterEach(() => vi.unstubAllEnvs());
it('refuses anonymous and staff access before reading purchase costs', async () => {
  mocks.admin.mockResolvedValue(null);
  expect((await readStockPurchases(request(), mocks.call)).status).toBe(403);
  expect(mocks.call).not.toHaveBeenCalled();
});
it('passes validated pagination only for the owner and disables caching', async () => {
  mocks.admin.mockResolvedValue('owner'); mocks.call.mockResolvedValue({ data: [], next_after_id: null });
  const response = await readStockPurchases(request('?limit=1&after_id=00000000-0000-4000-8000-000000000001'), mocks.call);
  expect(response.status).toBe(200); expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(mocks.call).toHaveBeenCalledWith('api_stock_purchases', 'list', { limit: 1, after_id: '00000000-0000-4000-8000-000000000001' });
  for (const query of ['?limit=501', '?limit=0', '?after_id=bad', '?limit=1&limit=2', '?actor_id=spoof']) {
    expect((await readStockPurchases(request(query), mocks.call)).status).toBe(400);
  }
  expect(mocks.call).toHaveBeenCalledTimes(1);
});
it('does not hide disabled or missing accounting services as zero purchases', async () => {
  vi.stubEnv('POSTGRES_FINANCIAL_API_ENABLED', 'false');
  expect((await readStockPurchases(request(), mocks.call)).status).toBe(404);
  vi.stubEnv('POSTGRES_FINANCIAL_API_ENABLED', 'true'); mocks.admin.mockResolvedValue('owner'); mocks.call.mockRejectedValue(new Error('missing migration'));
  expect((await readStockPurchases(request(), mocks.call)).status).toBe(503);
});
it('adds no purchases for Sheets, whose expenses already include restocks', async () => {
  vi.stubEnv('AUTH_BACKEND', 'sheets'); vi.stubEnv('POSTGRES_FINANCIAL_API_ENABLED', 'false');
  expect(await (await readStockPurchases(request(), mocks.call)).json()).toEqual({ data: [], next_after_id: null });
  expect(mocks.call).not.toHaveBeenCalled();
});

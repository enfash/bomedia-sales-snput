import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ admin: vi.fn(), session: vi.fn(), call: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: 'signed-session' }) }) }));
vi.mock('./postgres-auth-routes', () => ({ verifiedAdminIdentity: mocks.admin }));
vi.mock('./postgres-auth', () => ({ postgresAuth: { session: mocks.session } }));
vi.mock('./financial-db', async (original) => ({ ...(await original<object>()), callFinancial: mocks.call, financialApiEnabled: () => true }));
import { changeSale, readSaleHistory } from './sale-corrections-routes';

const owner = '00000000-0000-4000-8000-000000000001';
const cashier = '00000000-0000-4000-8000-000000000002';
const job = '00000000-0000-4000-8000-000000000003';
const post = (body: unknown, query = '') => new Request(`https://app.example.test/api/accounting/sale-corrections${query}`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });
const fix = { requestId: 'r1', mode: 'correct', jobId: job, changes: { quantity: '1' }, reason: 'Typed 2, meant 1' };
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('POSTGRES_FINANCIAL_API_ENABLED', 'true'); vi.stubEnv('AUTH_BACKEND', 'postgres'); vi.stubEnv('SUPABASE_ADMIN_STAFF_ID', owner);
  mocks.admin.mockResolvedValue(null); mocks.session.mockResolvedValue({ staff_id: cashier }); mocks.call.mockResolvedValue({ status: 'awaiting_approval' });
});
afterEach(() => vi.unstubAllEnvs());

it('sends a cashier request under the cashier and never lets the browser claim to be the owner', async () => {
  expect((await changeSale(post({ ...fix, byOwner: 'true' }))).status).toBe(400);
  const ok = await changeSale(post(fix));
  expect(ok.status).toBe(200);
  expect(mocks.call).toHaveBeenCalledWith('api_sale_correction', 'r1', { actor_id: cashier, mode: 'correct', jobId: job, changes: { quantity: '1' }, reason: 'Typed 2, meant 1' });
});

it('marks the owner’s change as the owner’s, using the owner accounting identity', async () => {
  mocks.admin.mockResolvedValue('owner@example.test');
  const res = await changeSale(post({ requestId: 'r2', mode: 'cancel', salesId: 'BOM-20261012-0001', reason: 'Customer cancelled' }));
  expect((await res.json()).owner).toBe(true);
  expect(mocks.call).toHaveBeenCalledWith('api_sale_correction', 'r2', { actor_id: owner, mode: 'cancel', salesId: 'BOM-20261012-0001', changes: {}, reason: 'Customer cancelled', byOwner: 'true' });
});

it('previews without a reason and without writing', async () => {
  mocks.call.mockResolvedValue({ plans: [{ new_amount_kobo: '1' }] });
  const res = await changeSale(post({ mode: 'correct', jobId: job, changes: { quantity: '1' } }, '?preview=1'));
  expect(await res.json()).toEqual({ plans: [{ new_amount_kobo: '1' }] });
  expect(mocks.call).toHaveBeenCalledWith('api_sale_correction_preview', '', { mode: 'correct', jobId: job, changes: { quantity: '1' } });
});

it('rejects unclear requests before the database', async () => {
  const bad = [{ ...fix, mode: 'maybe' }, { ...fix, jobId: 'nope' }, { ...fix, changes: {} }, { ...fix, changes: { amountKobo: '1' } }, { ...fix, reason: ' ' }, { ...fix, requestId: '' },
    { requestId: 'r', mode: 'cancel', salesId: 'BOM-1', changes: { quantity: '1' }, reason: 'x' }, 'not json'];
  for (const body of bad) expect((await changeSale(post(body))).status).toBe(400);
  expect(mocks.call).not.toHaveBeenCalled();
});

it('turns a refusal into a plain message and reads a sale’s history for anyone signed in', async () => {
  mocks.call.mockRejectedValueOnce(Object.assign(new Error('Only the owner can correct or cancel a sale'), { code: '22023' }));
  const refused = await changeSale(post(fix));
  expect(refused.status).toBe(409);
  expect((await refused.json()).error).toMatch(/Only the owner/);
  mocks.call.mockResolvedValue([{ reason: 'x' }]);
  const res = await readSaleHistory(new Request('https://app.example.test/api/accounting/sale-corrections?sales_id=BOM-20261012-0001'));
  expect(await res.json()).toEqual({ data: [{ reason: 'x' }] });
  expect(mocks.call).toHaveBeenLastCalledWith('api_sale_history', 'BOM-20261012-0001', {});
});

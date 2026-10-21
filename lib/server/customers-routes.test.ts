import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ admin: vi.fn(), session: vi.fn(), call: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: 'signed-session' }) }) }));
vi.mock('./postgres-auth-routes', () => ({ verifiedAdminIdentity: mocks.admin }));
vi.mock('./postgres-auth', () => ({ postgresAuth: { session: mocks.session } }));
vi.mock('./financial-db', async (original) => ({ ...(await original<object>()), callFinancial: mocks.call, financialApiEnabled: () => true }));
import { readCustomerProfile, readCustomers, saveCustomer } from './customers-routes';
import { GET as readHistory } from '../../app/api/accounting/customer-history/route';

const owner = '00000000-0000-4000-8000-000000000001';
const cashier = '00000000-0000-4000-8000-000000000002';
const customer = '00000000-0000-4000-8000-000000000003';
const get = (query = '') => new Request(`https://app.example.test/api/accounting/customer-profile${query}`);
const post = (body: unknown) => new Request('https://app.example.test/api/accounting/customer-profile', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('POSTGRES_FINANCIAL_API_ENABLED', 'true'); vi.stubEnv('AUTH_BACKEND', 'postgres'); vi.stubEnv('SUPABASE_ADMIN_STAFF_ID', owner);
  mocks.admin.mockResolvedValue(null);
  mocks.session.mockResolvedValue({ staff_id: cashier });
  mocks.call.mockResolvedValue({ data: [] });
});
afterEach(() => vi.unstubAllEnvs());

it('GET /api/accounting/customer-history refuses anonymous requests before querying and permits owner/cashier reads', async () => {
  const request = new Request(`https://app.example.test/api/accounting/customer-history?id=${customer}`);
  mocks.session.mockResolvedValue(null);
  const response = await readHistory(request);
  expect(response.status).toBe(401);
  expect(mocks.call).not.toHaveBeenCalled();
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  mocks.session.mockResolvedValue({ staff_id: cashier });
  expect((await readHistory(request)).status).toBe(200);
  mocks.session.mockResolvedValue(null);
  mocks.admin.mockResolvedValue('owner@example.test');
  expect((await readHistory(request)).status).toBe(200);
  expect(mocks.call).toHaveBeenCalledWith('api_customer_history', customer, {});
});

it('lets a signed-in cashier read the list and a profile', async () => {
  expect((await readCustomers()).status).toBe(200);
  expect(mocks.call).toHaveBeenCalledWith('api_customers', '', {});
  expect((await readCustomerProfile(get(`?id=${customer}`))).status).toBe(200);
  expect(mocks.call).toHaveBeenCalledWith('api_customer_profile', customer, {});
  expect((await readCustomerProfile(get('?id=nope'))).status).toBe(400);
});

it('saves a cashier change under the cashier, never as the owner, even if the browser claims it', async () => {
  mocks.call.mockResolvedValue({ changed: true, customer: {} });
  const response = await saveCustomer(post({ requestId: 'r1', customerId: customer, contact: '0803', notes: 'Pays Fridays', by_owner: true }));
  expect(response.status).toBe(400);
  const ok = await saveCustomer(post({ requestId: 'r1', customerId: customer, contact: '0803', notes: 'Pays Fridays' }));
  expect(ok.status).toBe(200);
  expect(mocks.call).toHaveBeenCalledWith('api_customer_save', 'r1', { actor_id: cashier, customer_id: customer, contact: '0803', notes: 'Pays Fridays' });
});

it('marks the owner’s change as the owner’s, using the owner accounting identity', async () => {
  mocks.admin.mockResolvedValue('owner@example.test');
  mocks.call.mockResolvedValue({ changed: true, customer: {} });
  await saveCustomer(post({ requestId: 'r2', customerId: customer, name: 'New Name' }));
  expect(mocks.call).toHaveBeenCalledWith('api_customer_save', 'r2', { actor_id: owner, customer_id: customer, name: 'New Name', by_owner: true });
});

it('rejects unclear requests before the database and turns a refusal into a plain message', async () => {
  for (const body of [{ requestId: 'r', customerId: 'nope', contact: '1' }, { requestId: 'r', customerId: customer }, { customerId: customer, contact: '1' }, { requestId: 'r', customerId: customer, contact: 5 }, 'not json'])
    expect((await saveCustomer(post(body))).status).toBe(400);
  expect(mocks.call).not.toHaveBeenCalled();
  mocks.call.mockRejectedValueOnce(Object.assign(new Error('Only the owner can change a customer’s name'), { code: '22023' }));
  const refused = await saveCustomer(post({ requestId: 'r3', customerId: customer, name: 'Other' }));
  expect(refused.status).toBe(409);
  expect((await refused.json()).error).toMatch(/Only the owner/);
  mocks.call.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'P0002' }));
  expect((await readCustomerProfile(get(`?id=${customer}`))).status).toBe(404);
});

it('gives the owner recent customer changes by staff, without the owner’s own, and refuses everyone else', async () => {
  const { readCustomerChanges } = await import('./customers-routes');
  mocks.call.mockResolvedValue([{ id: '1', by_id: cashier, by: 'Ada' }, { id: '2', by_id: owner, by: 'Owner' }]);
  expect((await readCustomerChanges()).status).toBe(403);
  mocks.admin.mockResolvedValue('owner@example.test'); mocks.session.mockResolvedValue({ staff_id: owner });
  const res = await readCustomerChanges();
  expect(res.status).toBe(200);
  expect((await res.json()).data.map((r: { id: string }) => r.id)).toEqual(['1']);
  expect(mocks.call).toHaveBeenLastCalledWith('api_recent_customer_changes', '14', {});
});

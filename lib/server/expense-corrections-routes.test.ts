import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ admin: vi.fn(), session: vi.fn(), call: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: 'signed-session' }) }) }));
vi.mock('./postgres-auth-routes', () => ({ verifiedAdminIdentity: mocks.admin }));
vi.mock('./postgres-auth', () => ({ postgresAuth: { session: mocks.session } }));
vi.mock('./financial-db', async (original) => ({ ...(await original<object>()), callFinancial: mocks.call, financialApiEnabled: () => true }));
import { changeExpense, readExpenseHistory } from './expense-corrections-routes';

const owner = '00000000-0000-4000-8000-000000000001';
const cashier = '00000000-0000-4000-8000-000000000002';
const post = (body: unknown, query = '') => new Request(`https://app.example.test/api/accounting/expense-corrections${query}`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });
const fix = { requestId: 'r1', mode: 'correct', reference: 'EXP-20261012-0007', changes: { amountKobo: '600000' }, reason: 'Typed 60,000, meant 6,000' };
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('POSTGRES_FINANCIAL_API_ENABLED', 'true'); vi.stubEnv('AUTH_BACKEND', 'postgres'); vi.stubEnv('SUPABASE_ADMIN_STAFF_ID', owner);
  mocks.admin.mockResolvedValue(null); mocks.session.mockResolvedValue({ staff_id: cashier }); mocks.call.mockResolvedValue({ status: 'awaiting_approval' });
});
afterEach(() => vi.unstubAllEnvs());

it('sends a cashier request under the cashier and never lets the browser claim to be the owner', async () => {
  expect((await changeExpense(post({ ...fix, byOwner: 'true' }))).status).toBe(400);
  const ok = await changeExpense(post(fix));
  expect(ok.status).toBe(200);
  expect(mocks.call).toHaveBeenCalledWith('api_expense_correction', 'r1', { actor_id: cashier, mode: 'correct', reference: 'EXP-20261012-0007', changes: { amountKobo: '600000' }, reason: 'Typed 60,000, meant 6,000' });
});

it('marks the owner’s change as the owner’s, using the owner accounting identity', async () => {
  mocks.admin.mockResolvedValue('owner@example.test');
  const res = await changeExpense(post({ requestId: 'r2', mode: 'cancel', reference: 'EXP-20261012-0007', reason: 'Entered twice' }));
  expect((await res.json()).owner).toBe(true);
  expect(mocks.call).toHaveBeenCalledWith('api_expense_correction', 'r2', { actor_id: owner, mode: 'cancel', reference: 'EXP-20261012-0007', changes: {}, reason: 'Entered twice', byOwner: 'true' });
});

it('previews without a reason and without writing', async () => {
  mocks.call.mockResolvedValue({ plan: { new_amount_kobo: '1' } });
  const res = await changeExpense(post({ mode: 'correct', reference: 'EXP-20261012-0007', changes: { amountKobo: '1' } }, '?preview=1'));
  expect(await res.json()).toEqual({ plan: { new_amount_kobo: '1' } });
  expect(mocks.call).toHaveBeenCalledWith('api_expense_correction_preview', '', { mode: 'correct', reference: 'EXP-20261012-0007', changes: { amountKobo: '1' } });
});

it('rejects unclear requests before the database', async () => {
  const bad = [{ ...fix, mode: 'maybe' }, { ...fix, reference: 'BOM-1' }, { ...fix, changes: {} }, { ...fix, changes: { quantity: '1' } }, { ...fix, reason: ' ' }, { ...fix, requestId: '' },
    { requestId: 'r', mode: 'cancel', reference: 'EXP-1', changes: { amountKobo: '1' }, reason: 'x' }, 'not json'];
  for (const body of bad) expect((await changeExpense(post(body))).status).toBe(400);
  expect(mocks.call).not.toHaveBeenCalled();
});

it('turns a refusal into a plain message and reads an expense’s history for anyone signed in', async () => {
  mocks.call.mockRejectedValueOnce(Object.assign(new Error('Only the owner can correct or cancel an expense'), { code: '22023' }));
  const refused = await changeExpense(post(fix));
  expect(refused.status).toBe(409);
  expect((await refused.json()).error).toMatch(/Only the owner/);
  mocks.call.mockResolvedValue([{ kind: 'correction' }]);
  const history = await readExpenseHistory(new Request('https://app.example.test/api/accounting/expense-corrections?reference=EXP-20261012-0007'));
  expect(await history.json()).toEqual({ data: [{ kind: 'correction' }] });
  expect(mocks.call).toHaveBeenLastCalledWith('api_expense_history', 'EXP-20261012-0007', {});
});

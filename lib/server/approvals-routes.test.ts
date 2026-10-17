import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ admin: vi.fn(), session: vi.fn(), call: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: 'signed-session' }) }) }));
vi.mock('./postgres-auth-routes', () => ({ verifiedAdminIdentity: mocks.admin }));
vi.mock('./postgres-auth', () => ({ postgresAuth: { session: mocks.session } }));
vi.mock('./financial-db', async (original) => ({ ...(await original<object>()), callFinancial: mocks.call, financialApiEnabled: () => true }));
import { decideApproval, readApprovalRules, readApprovals, saveApprovalRule } from './approvals-routes';

const owner = '00000000-0000-4000-8000-000000000001';
const cashier = '00000000-0000-4000-8000-000000000002';
const approval = '00000000-0000-4000-8000-000000000003';
const get = (query = '') => new Request(`https://app.example.test/api/accounting/approvals${query}`);
const post = (body: unknown) => new Request('https://app.example.test/api/accounting/approvals', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('POSTGRES_FINANCIAL_API_ENABLED', 'true'); vi.stubEnv('AUTH_BACKEND', 'postgres'); vi.stubEnv('SUPABASE_ADMIN_STAFF_ID', owner);
  mocks.admin.mockResolvedValue(null);
  mocks.session.mockResolvedValue({ staff_id: cashier });
  mocks.call.mockResolvedValue({ ok: true });
});
afterEach(() => vi.unstubAllEnvs());

it('keeps the full list, the rules and every decision away from a signed-in cashier', async () => {
  expect((await readApprovals(get())).status).toBe(403);
  expect((await readApprovalRules()).status).toBe(403);
  expect((await readApprovalRules(get('?for=other'))).status).toBe(403);
  expect((await decideApproval(post({ requestId: 'r', approvalRequestId: approval, decision: 'approve' }))).status).toBe(403);
  expect((await saveApprovalRule(post({ requestId: 'r', kind: 'date', enabled: true }))).status).toBe(403);
  expect(mocks.call).not.toHaveBeenCalled();
});

it('lets a cashier read the rules for an entry, told they are not the owner', async () => {
  mocks.call.mockResolvedValue([{ kind: 'date', enabled: true, params: { days: 0 } }]);
  const response = await readApprovalRules(get('?for=entry'));
  expect(await response.json()).toEqual({ rules: [{ kind: 'date', enabled: true, params: { days: 0 } }], isOwner: false });
  mocks.admin.mockResolvedValue('owner@example.test');
  expect((await (await readApprovalRules(get('?for=entry'))).json()).isOwner).toBe(true);
});

it('lets a cashier read only their own requests, under their own identity', async () => {
  await readApprovals(get('?mine=1'));
  expect(mocks.call).toHaveBeenCalledWith('api_my_approvals', cashier, {});
});

it('lets the owner read the list and the rules', async () => {
  mocks.admin.mockResolvedValue('owner@example.test');
  expect((await readApprovals(get())).status).toBe(200);
  expect((await readApprovalRules()).status).toBe(200);
  expect(mocks.call).toHaveBeenCalledWith('api_approvals', '', {});
  expect(mocks.call).toHaveBeenCalledWith('api_approval_rules', '', {});
});

it('decides with the owner accounting identity, never one sent by the browser', async () => {
  mocks.admin.mockResolvedValue('owner@example.test');
  const response = await decideApproval(post({ requestId: 'r1', approvalRequestId: approval, decision: 'decline', note: 'Wrong date' }));
  expect(response.status).toBe(200);
  expect(mocks.call).toHaveBeenCalledWith('api_approval_decision', 'r1', { actor_id: owner, approval_request_id: approval, decision: 'decline', note: 'Wrong date' });
  expect((await decideApproval(post({ requestId: 'r1', approvalRequestId: approval, decision: 'approve', actorId: cashier }))).status).toBe(400);
});

it('rejects an unclear decision before reaching the database', async () => {
  mocks.admin.mockResolvedValue('owner@example.test');
  for (const body of [{ requestId: 'r', approvalRequestId: 'nope', decision: 'approve' }, { requestId: 'r', approvalRequestId: approval, decision: 'maybe' }, { approvalRequestId: approval, decision: 'approve' }, 'not json'])
    expect((await decideApproval(post(body))).status).toBe(400);
  expect(mocks.call).not.toHaveBeenCalled();
});

it('saves a rule with the owner identity and turns a database refusal into a plain message', async () => {
  mocks.admin.mockResolvedValue('owner@example.test');
  await saveApprovalRule(post({ requestId: 'r2', kind: 'price', enabled: true, params: { percent: 10 } }));
  expect(mocks.call).toHaveBeenCalledWith('api_approval_rule_save', 'r2', { actor_id: owner, kind: 'price', enabled: true, params: { percent: 10 } });
  mocks.call.mockRejectedValueOnce(Object.assign(new Error('Percent must be between 0 and 100'), { code: '22023' }));
  const refused = await saveApprovalRule(post({ requestId: 'r3', kind: 'price', enabled: true, params: { percent: 500 } }));
  expect(refused.status).toBe(409);
});

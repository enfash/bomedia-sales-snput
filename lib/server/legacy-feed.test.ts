import { afterEach,beforeEach,expect,it,vi } from 'vitest';
const mocks=vi.hoisted(()=>({admin:vi.fn(),session:vi.fn()}));
vi.mock('next/headers',()=>({cookies:async()=>({get:()=>({value:'signed-session'})})}));
vi.mock('./postgres-auth-routes',()=>({verifiedAdminIdentity:mocks.admin}));
vi.mock('./postgres-auth',()=>({postgresAuth:{session:mocks.session}}));
import { legacyFeedEnabled,legacyFeedResponse,legacyWriteBlocked } from './legacy-feed';
const id='00000000-0000-4000-8000-000000000001';
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('POSTGRES_FINANCIAL_API_ENABLED','true');vi.stubEnv('AUTH_BACKEND','postgres');mocks.admin.mockResolvedValue(null);mocks.session.mockResolvedValue(null);});
afterEach(()=>vi.unstubAllEnvs());
it('leaves Sheets in charge while the switch is off',async()=>{
  vi.stubEnv('POSTGRES_FINANCIAL_API_ENABLED','false');
  expect(legacyFeedEnabled()).toBe(false);
  expect(await legacyFeedResponse('sales',vi.fn())).toBeNull();
  expect(legacyWriteBlocked()).toBeNull();
});
it('never falls back to Sheets when the switch is on but misconfigured',()=>{
  vi.stubEnv('AUTH_BACKEND','sheets');
  expect(legacyFeedEnabled()).toBe(true);
  expect(legacyWriteBlocked()?.status).toBe(409);
});
it('serves old row shapes from Postgres to signed-in users only',async()=>{
  const call=vi.fn().mockResolvedValue([{DATE:'2026-10-05','AMOUNT (₦)':'9600'}]);
  expect((await legacyFeedResponse('sales',call))!.status).toBe(401);
  expect(call).not.toHaveBeenCalled();
  mocks.session.mockResolvedValue({staff_id:id});
  const response=(await legacyFeedResponse('sales',call))!;
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({data:[{DATE:'2026-10-05','AMOUNT (₦)':'9600'}]});
  expect(call).toHaveBeenCalledWith('api_legacy_feed','sales',{});
  mocks.admin.mockResolvedValue('owner@example.test');
  expect((await legacyFeedResponse('expenses',call))!.status).toBe(200);
});
it('reports an outage without leaking details',async()=>{
  mocks.session.mockResolvedValue({staff_id:id});
  const response=(await legacyFeedResponse('payments',vi.fn().mockRejectedValue(new Error('password authentication failed'))))!;
  expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toContain('password');
});
it('refuses old-screen writes once Postgres is in charge',async()=>{
  const response=legacyWriteBlocked()!;
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({code:'MOVED_TO_ACCOUNTING'});
});

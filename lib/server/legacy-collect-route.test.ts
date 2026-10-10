import { afterEach,beforeEach,expect,it,vi } from 'vitest';
const mocks=vi.hoisted(()=>({admin:vi.fn(),session:vi.fn()}));
vi.mock('next/headers',()=>({cookies:async()=>({get:()=>({value:'signed-session'})})}));
vi.mock('./postgres-auth-routes',()=>({verifiedAdminIdentity:mocks.admin}));
vi.mock('./postgres-auth',()=>({postgresAuth:{session:mocks.session}}));
import { recordLegacyBatch } from './legacy-collect';
const id='00000000-0000-4000-8000-000000000001';
const post=(body:unknown)=>new Request('https://app.example.test/api/payments/batch',{method:'POST',body:JSON.stringify(body)});
const batch={transactionId:'t-1',lumpSum:15000,paymentMethod:'transfer',steps:[{rowIndex:4,salesId:'BOM-20261007-0001',toApply:15000}]};
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('POSTGRES_FINANCIAL_API_ENABLED','true');vi.stubEnv('AUTH_BACKEND','postgres');mocks.admin.mockResolvedValue(null);mocks.session.mockResolvedValue({staff_id:id});});
afterEach(()=>vi.unstubAllEnvs());
it('records the debtor box payment exactly once, under the signed-in staff member',async()=>{
  const call=vi.fn().mockResolvedValue({payment_id:'internal'});
  const response=await recordLegacyBatch(post(batch),call);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({success:true});
  expect(call).toHaveBeenCalledTimes(1);
  expect(call).toHaveBeenCalledWith('api_legacy_collect','legacy-payment:t-1',expect.objectContaining({actor_id:id,job_refs:['4'],amount_kobo:'1500000',method:'transfer'}));
});
it('asks for the method and keeps outages retryable',async()=>{
  expect((await recordLegacyBatch(post({...batch,paymentMethod:undefined}),vi.fn())).status).toBe(400);
  expect((await recordLegacyBatch(post(batch),vi.fn().mockRejectedValue(new Error('down')))).status).toBe(503);
  mocks.session.mockResolvedValue(null);
  expect((await recordLegacyBatch(post(batch),vi.fn())).status).toBe(401);
});

import { afterEach,beforeEach,expect,it,vi } from 'vitest';
const mocks=vi.hoisted(()=>({admin:vi.fn(),session:vi.fn()}));
vi.mock('next/headers',()=>({cookies:async()=>({get:()=>({value:'signed-session'})})}));
vi.mock('./postgres-auth-routes',()=>({verifiedAdminIdentity:mocks.admin}));
vi.mock('./postgres-auth',()=>({postgresAuth:{session:mocks.session}}));
import { recordLegacyBatch } from './legacy-collect';
const id='00000000-0000-4000-8000-000000000001';
const post=(body:unknown)=>new Request('https://app.example.test/api/payments/batch',{method:'POST',body:JSON.stringify(body)});
const batch={version:2,backend:'postgres',requestId:id,expectedStaffId:id,businessDate:'2026-10-07',jobIds:[id],amountKobo:'1500000',paymentMethod:'transfer'};
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('POSTGRES_FINANCIAL_API_ENABLED','true');vi.stubEnv('AUTH_BACKEND','postgres');mocks.admin.mockResolvedValue(null);mocks.session.mockResolvedValue({staff_id:id});});
afterEach(()=>{vi.unstubAllEnvs();vi.useRealTimers();});
it('returns a verifiable receipt and keeps the original date on retries after midnight',async()=>{
  const call=vi.fn().mockResolvedValue({payment_id:id,journal_entry_id:id,amount_kobo:'1500000'});
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-07T22:59:00Z'));
  const first=await recordLegacyBatch(post(batch),call);
  expect(first.status).toBe(200);
  expect(await first.json()).toMatchObject({success:true,requestId:id,businessDate:'2026-10-07',expectedStaffId:id,payment_id:id});
  vi.setSystemTime(new Date('2026-10-08T10:00:00Z'));
  await recordLegacyBatch(post(batch),call);
  expect(call.mock.calls[0]).toEqual(call.mock.calls[1]);
  expect(call.mock.calls[0]).toEqual(['api_durable_collect',id,expect.objectContaining({actor_id:id,job_ids:[id],amount_kobo:'1500000',business_date:'2026-10-07'})]);
});
it('refuses a changed staff identity before dispatch and rejects incomplete confirmations',async()=>{
  const call=vi.fn().mockResolvedValue({payment_id:id});
  expect((await recordLegacyBatch(post(batch),call)).status).toBe(503);
  call.mockClear();mocks.session.mockResolvedValue({staff_id:'00000000-0000-4000-8000-000000000002'});
  expect((await recordLegacyBatch(post(batch),call)).status).toBe(403);expect(call).not.toHaveBeenCalled();
  mocks.session.mockResolvedValue(null);expect((await recordLegacyBatch(post(batch),call)).status).toBe(401);
});
it('holds older payments rather than assigning today or guessing a job from a row',async()=>{
  const call=vi.fn();
  expect((await recordLegacyBatch(post({transactionId:id,steps:[{rowIndex:4}],lumpSum:1,paymentMethod:'cash'}),call)).status).toBe(409);
  expect(call).not.toHaveBeenCalled();
});

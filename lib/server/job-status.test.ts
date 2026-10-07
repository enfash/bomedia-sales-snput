import { afterEach,beforeEach,expect,it,vi } from 'vitest';
const mocks=vi.hoisted(()=>({admin:vi.fn(),session:vi.fn()}));
vi.mock('next/headers',()=>({cookies:async()=>({get:()=>({value:'signed-session'})})}));
vi.mock('./postgres-auth-routes',()=>({verifiedAdminIdentity:mocks.admin}));
vi.mock('./postgres-auth',()=>({postgresAuth:{session:mocks.session}}));
import { changeJobStatus } from './job-status';
const id='00000000-0000-4000-8000-000000000001',owner='00000000-0000-4000-8000-000000000002';
const patch=(body:unknown)=>new Request('https://app.example.test/api/sales',{method:'PATCH',body:JSON.stringify(body)});
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('POSTGRES_FINANCIAL_API_ENABLED','true');vi.stubEnv('AUTH_BACKEND','postgres');vi.stubEnv('SUPABASE_ADMIN_STAFF_ID',owner);mocks.admin.mockResolvedValue(null);mocks.session.mockResolvedValue({staff_id:id});});
afterEach(()=>vi.unstubAllEnvs());
it('saves a pure status change for staff, limited to recent jobs',async()=>{
  const call=vi.fn().mockResolvedValue({job_id:'j',job_status:'Ready'});
  const response=await changeJobStatus(patch({saleId:'S-1001',rowIndex:7,jobStatus:'Ready'}),call);
  expect(response.status).toBe(200);
  expect(call).toHaveBeenCalledWith('api_job_status',expect.stringMatching(/^job-status:/),{actor_id:id,job_ref:'S-1001',status:'Ready',any_age:false});
  await changeJobStatus(patch({rowIndex:7,jobStatus:'Printing'}),call);
  expect(call.mock.calls[1][2]).toMatchObject({job_ref:'7'});
});
it('lets the owner change any job under the owner identity',async()=>{
  mocks.admin.mockResolvedValue('owner@example.test');
  const call=vi.fn().mockResolvedValue({});
  expect((await changeJobStatus(patch({saleId:'x',jobStatus:'Delivered'}),call)).status).toBe(200);
  expect(call.mock.calls[0][2]).toMatchObject({actor_id:owner,any_age:true});
});
it('records a Manage-box payment once, by method, then the status',async()=>{
  const call=vi.fn().mockResolvedValue({payment_id:'p'});
  const response=await changeJobStatus(patch({rowIndex:7,jobStatus:'Ready',additionalPayment1:500,paymentMethod:'POS',requestId:'r-1'}),call);
  expect(response.status).toBe(200);
  expect(call.mock.calls[0]).toEqual(['api_legacy_collect','legacy-payment:r-1',expect.objectContaining({actor_id:id,job_refs:['7'],amount_kobo:'50000',method:'pos'})]);
  expect(call.mock.calls[1][0]).toBe('api_job_status');
});
it('refuses unreadable payments and other old edits',async()=>{
  const call=vi.fn();
  expect((await changeJobStatus(patch({saleId:'x',jobStatus:'Ready',additionalPayment1:500,requestId:'r'}),call)).status).toBe(400);
  expect((await changeJobStatus(patch({saleId:'x',additionalPayment1:500,paymentMethod:'cash'}),call)).status).toBe(400);
  expect((await changeJobStatus(patch({saleId:'x',jobStatus:'Ready',clientName:'Changed'}),call)).status).toBe(409);
  expect((await changeJobStatus(patch({saleId:'x',jobStatus:'Lost'}),call)).status).toBe(400);
  expect((await changeJobStatus(patch({jobStatus:'Ready'}),call)).status).toBe(400);
  expect(call).not.toHaveBeenCalled();
});
it('explains database refusals and asks the queue to retry outages',async()=>{
  const coded=(code:string)=>vi.fn().mockRejectedValue(Object.assign(new Error('x'),{code}));
  expect((await changeJobStatus(patch({saleId:'x',jobStatus:'Ready'}),coded('42501'))).status).toBe(403);
  expect((await changeJobStatus(patch({saleId:'x',jobStatus:'Ready'}),coded('P0002'))).status).toBe(404);
  expect((await changeJobStatus(patch({saleId:'x',jobStatus:'Ready'}),vi.fn().mockRejectedValue(new Error('down')))).status).toBe(503);
  mocks.session.mockResolvedValue(null);
  expect((await changeJobStatus(patch({saleId:'x',jobStatus:'Ready'}),vi.fn())).status).toBe(401);
});

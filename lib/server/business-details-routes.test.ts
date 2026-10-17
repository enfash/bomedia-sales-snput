import { afterEach,beforeEach,expect,it,vi } from 'vitest';
const mocks=vi.hoisted(()=>({admin:vi.fn(),session:vi.fn(),read:vi.fn(),save:vi.fn()}));
vi.mock('next/headers',()=>({cookies:async()=>({get:()=>({value:'signed-session'})})}));
vi.mock('./postgres-auth-routes',()=>({verifiedAdminIdentity:mocks.admin}));
vi.mock('./postgres-auth',()=>({postgresAuth:{session:mocks.session}}));
vi.mock('./business-details-service',()=>({businessDetailsService:{read:mocks.read,save:mocks.save}}));
import { readBusinessDetails,saveBusinessDetails } from './business-details-routes';
const id='00000000-0000-4000-8000-000000000001';
const post=(body:unknown)=>new Request('https://app.example.test/api/accounting/business-details',{method:'POST',body:JSON.stringify(body)});
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('POSTGRES_FINANCIAL_API_ENABLED','true');vi.stubEnv('AUTH_BACKEND','postgres');vi.stubEnv('SUPABASE_ADMIN_STAFF_ID','');mocks.admin.mockResolvedValue(null);mocks.session.mockResolvedValue(null);mocks.read.mockResolvedValue({bank:'Moniepoint MFB'});});
afterEach(()=>vi.unstubAllEnvs());
it('lets any signed-in staff read but nobody else',async()=>{
  expect((await readBusinessDetails()).status).toBe(401);
  mocks.session.mockResolvedValue({staff_id:id});
  expect((await readBusinessDetails()).status).toBe(200);
  expect(mocks.read).toHaveBeenCalledTimes(1);
});
it('lets only the owner change business details',async()=>{
  mocks.session.mockResolvedValue({staff_id:id});
  expect((await saveBusinessDetails(post({}))).status).toBe(403);
  expect(mocks.save).not.toHaveBeenCalled();
  mocks.admin.mockResolvedValue('owner@example.test');vi.stubEnv('SUPABASE_ADMIN_STAFF_ID',id);mocks.save.mockResolvedValue({changed:['bank']});
  const response=await saveBusinessDetails(post({requestId:'r1',bank:'x'}));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({success:true,changed:['bank']});
  expect(mocks.save).toHaveBeenCalledWith({staffId:id},{requestId:'r1',bank:'x'});
});
it('rejects an unreadable request body',async()=>{
  mocks.admin.mockResolvedValue('owner@example.test');vi.stubEnv('SUPABASE_ADMIN_STAFF_ID',id);
  const response=await saveBusinessDetails(new Request('https://app.example.test/x',{method:'POST',body:'not json'}));
  expect(response.status).toBe(400);
  expect(mocks.save).not.toHaveBeenCalled();
});

import { afterEach,beforeEach,expect,it,vi } from 'vitest';
const mocks=vi.hoisted(()=>({admin:vi.fn(),session:vi.fn(),list:vi.fn(),save:vi.fn()}));
vi.mock('next/headers',()=>({cookies:async()=>({get:()=>({value:'signed-session'})})}));
vi.mock('./postgres-auth-routes',()=>({verifiedAdminIdentity:mocks.admin}));
vi.mock('./postgres-auth',()=>({postgresAuth:{session:mocks.session}}));
vi.mock('./service-catalog',()=>({serviceCatalog:{list:mocks.list,save:mocks.save}}));
import { listServices,saveService } from './service-routes';
const id='00000000-0000-4000-8000-000000000001';
const post=(body:unknown)=>new Request('https://app.example.test/api/accounting/services',{method:'POST',body:JSON.stringify(body)});
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('POSTGRES_FINANCIAL_API_ENABLED','true');vi.stubEnv('AUTH_BACKEND','postgres');vi.stubEnv('SUPABASE_ADMIN_STAFF_ID','');mocks.admin.mockResolvedValue(null);mocks.session.mockResolvedValue(null);mocks.list.mockResolvedValue({data:[],next_after_id:null});});
afterEach(()=>vi.unstubAllEnvs());
it('shows staff visible services only and the owner all of them',async()=>{
  expect((await listServices()).status).toBe(401);
  mocks.session.mockResolvedValue({staff_id:id});expect((await listServices()).status).toBe(200);expect(mocks.list).toHaveBeenLastCalledWith(false);
  mocks.admin.mockResolvedValue('owner@example.test');expect((await listServices()).status).toBe(200);expect(mocks.list).toHaveBeenLastCalledWith(true);
});
it('lets only the owner change services',async()=>{
  mocks.session.mockResolvedValue({staff_id:id});
  expect((await saveService(post({}))).status).toBe(403);expect(mocks.save).not.toHaveBeenCalled();
  mocks.admin.mockResolvedValue('owner@example.test');vi.stubEnv('SUPABASE_ADMIN_STAFF_ID',id);mocks.save.mockResolvedValue({service_id:'s'});
  expect((await saveService(post({name:'x'}))).status).toBe(200);expect(mocks.save).toHaveBeenCalledWith({staffId:id},{name:'x'});
});

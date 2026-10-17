import { afterEach,beforeEach,expect,it,vi } from 'vitest';
const mocks=vi.hoisted(()=>({admin:vi.fn(),session:vi.fn(),list:vi.fn(),save:vi.fn()}));
vi.mock('next/headers',()=>({cookies:async()=>({get:()=>({value:'signed-session'})})}));
vi.mock('./postgres-auth-routes',()=>({verifiedAdminIdentity:mocks.admin}));
vi.mock('./postgres-auth',()=>({postgresAuth:{session:mocks.session}}));
vi.mock('./expense-category-settings',()=>({expenseCategorySettings:{list:mocks.list,save:mocks.save}}));
import { listExpenseCategorySettings,saveExpenseCategorySetting } from './expense-category-settings-routes';
const id='00000000-0000-4000-8000-000000000001';
const post=(body:unknown)=>new Request('https://app.example.test/api/accounting/expense-category-settings',{method:'POST',body:JSON.stringify(body)});
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('POSTGRES_FINANCIAL_API_ENABLED','true');vi.stubEnv('AUTH_BACKEND','postgres');vi.stubEnv('SUPABASE_ADMIN_STAFF_ID','');mocks.admin.mockResolvedValue(null);mocks.session.mockResolvedValue(null);mocks.list.mockResolvedValue({data:[]});});
afterEach(()=>vi.unstubAllEnvs());
it('shows the settings list to the owner only',async()=>{
  mocks.session.mockResolvedValue({staff_id:id});
  expect((await listExpenseCategorySettings()).status).toBe(403);
  expect(mocks.list).not.toHaveBeenCalled();
  mocks.admin.mockResolvedValue('owner@example.test');vi.stubEnv('SUPABASE_ADMIN_STAFF_ID',id);
  expect((await listExpenseCategorySettings()).status).toBe(200);
});
it('lets only the owner change an expense category',async()=>{
  mocks.session.mockResolvedValue({staff_id:id});
  expect((await saveExpenseCategorySetting(post({}))).status).toBe(403);
  expect(mocks.save).not.toHaveBeenCalled();
  mocks.admin.mockResolvedValue('owner@example.test');vi.stubEnv('SUPABASE_ADMIN_STAFF_ID',id);mocks.save.mockResolvedValue({name:'Packaging',changed:['added']});
  const response=await saveExpenseCategorySetting(post({requestId:'r',action:'add',name:'Packaging',kind:'everyday'}));
  expect(response.status).toBe(200);
  expect(mocks.save).toHaveBeenCalledWith({staffId:id},{requestId:'r',action:'add',name:'Packaging',kind:'everyday'});
  expect((await saveExpenseCategorySetting(new Request('https://x.test/',{method:'POST',body:'nope'}))).status).toBe(400);
});

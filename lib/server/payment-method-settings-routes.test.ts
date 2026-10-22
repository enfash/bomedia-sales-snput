import { afterEach,beforeEach,expect,it,vi } from 'vitest';
const mocks=vi.hoisted(()=>({admin:vi.fn(),session:vi.fn(),list:vi.fn(),save:vi.fn()}));
vi.mock('next/headers',()=>({cookies:async()=>({get:()=>({value:'signed-session'})})}));
vi.mock('./postgres-auth-routes',()=>({verifiedAdminIdentity:mocks.admin}));
vi.mock('./postgres-auth',()=>({postgresAuth:{session:mocks.session}}));
vi.mock('./payment-method-settings',()=>({paymentMethodSettings:{list:mocks.list,save:mocks.save}}));
import { listPaymentMethodSettings,savePaymentMethodSetting } from './payment-method-settings-routes';
const id='00000000-0000-4000-8000-000000000001';
const post=(body:unknown)=>new Request('https://app.example.test/api/accounting/payment-method-settings',{method:'POST',body:JSON.stringify(body)});
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('POSTGRES_FINANCIAL_API_ENABLED','true');vi.stubEnv('AUTH_BACKEND','postgres');vi.stubEnv('SUPABASE_ADMIN_STAFF_ID','');mocks.admin.mockResolvedValue(null);mocks.session.mockResolvedValue(null);mocks.list.mockResolvedValue({data:[]});});
afterEach(()=>vi.unstubAllEnvs());
it('shows the settings list to the owner only',async()=>{
  mocks.session.mockResolvedValue({staff_id:id});
  expect((await listPaymentMethodSettings()).status).toBe(403);
  expect(mocks.list).not.toHaveBeenCalled();
  mocks.admin.mockResolvedValue('owner@example.test');vi.stubEnv('SUPABASE_ADMIN_STAFF_ID',id);
  expect((await listPaymentMethodSettings()).status).toBe(200);
});
it('lets only the owner change a payment method',async()=>{
  mocks.session.mockResolvedValue({staff_id:id});
  expect((await savePaymentMethodSetting(post({}))).status).toBe(403);
  expect(mocks.save).not.toHaveBeenCalled();
  mocks.admin.mockResolvedValue('owner@example.test');vi.stubEnv('SUPABASE_ADMIN_STAFF_ID',id);mocks.save.mockResolvedValue({method:'cash',changed:['label']});
  const response=await savePaymentMethodSetting(post({requestId:'r',method:'cash',label:'Cash',enabled:true}));
  expect(response.status).toBe(200);
  expect(mocks.save).toHaveBeenCalledWith({staffId:id},{requestId:'r',method:'cash',label:'Cash',enabled:true});
  expect((await savePaymentMethodSetting(new Request('https://x.test/',{method:'POST',body:'nope'}))).status).toBe(400);
});

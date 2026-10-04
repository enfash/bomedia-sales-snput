import { afterEach,beforeEach,expect,it,vi } from 'vitest';
const mocks=vi.hoisted(()=>({admin:vi.fn(),session:vi.fn(),log:vi.fn(),pay:vi.fn()}));
vi.mock('next/headers',()=>({cookies:async()=>({get:()=>({value:'signed-session'})})}));
vi.mock('./postgres-auth-routes',()=>({verifiedAdminIdentity:mocks.admin}));
vi.mock('./postgres-auth',()=>({postgresAuth:{session:mocks.session}}));
vi.mock('./expense-service',()=>({expenseService:{log:mocks.log,pay:mocks.pay}}));
import { logExpense,payExpense } from './expense-routes';
const id='00000000-0000-4000-8000-000000000001';
const request=(body:unknown)=>new Request('https://app.example.test/api/accounting/expenses',{method:'POST',body:JSON.stringify(body)});
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('POSTGRES_FINANCIAL_API_ENABLED','true');vi.stubEnv('AUTH_BACKEND','postgres');vi.stubEnv('SUPABASE_ADMIN_STAFF_ID','');mocks.admin.mockResolvedValue(null);mocks.session.mockResolvedValue(null);});
afterEach(()=>vi.unstubAllEnvs());
it('stays off by default and needs a live session to log',async()=>{
  vi.stubEnv('POSTGRES_FINANCIAL_API_ENABLED','false');expect((await logExpense(request({}))).status).toBe(404);
  vi.stubEnv('POSTGRES_FINANCIAL_API_ENABLED','true');expect((await logExpense(request({}))).status).toBe(401);
  expect(mocks.log).not.toHaveBeenCalled();
});
it('logs with the session identity, never a client-sent actor',async()=>{
  mocks.session.mockResolvedValue({staff_id:id});mocks.log.mockResolvedValue({expense_id:'e',status:'Paid'});
  const input={requestId:'r',actor_id:'spoof'};const response=await logExpense(request(input));
  expect(response.status).toBe(200);expect(mocks.log).toHaveBeenCalledWith({staffId:id},input);
});
it('lets only the verified owner mark expenses paid',async()=>{
  mocks.session.mockResolvedValue({staff_id:id});
  expect((await payExpense(request({}))).status).toBe(403);expect(mocks.pay).not.toHaveBeenCalled();
  mocks.admin.mockResolvedValue('owner@example.test');expect((await payExpense(request({}))).status).toBe(503);
  vi.stubEnv('SUPABASE_ADMIN_STAFF_ID',id);mocks.pay.mockResolvedValue({expense_id:'e',status:'Paid'});
  expect((await payExpense(request({}))).status).toBe(200);expect(mocks.pay).toHaveBeenCalledWith({staffId:id},{});
});

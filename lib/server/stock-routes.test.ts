import { afterEach,beforeEach,expect,it,vi } from 'vitest';
const mocks=vi.hoisted(()=>({admin:vi.fn(),session:vi.fn(),restock:vi.fn(),waste:vi.fn(),count:vi.fn()}));
vi.mock('next/headers',()=>({cookies:async()=>({get:()=>({value:'signed-session'})})}));
vi.mock('./postgres-auth-routes',()=>({verifiedAdminIdentity:mocks.admin}));
vi.mock('./postgres-auth',()=>({postgresAuth:{session:mocks.session}}));
vi.mock('./stock-service',()=>({stockService:{restock:mocks.restock,waste:mocks.waste,count:mocks.count}}));
import { correctStockCount,logWaste,restockRolls } from './stock-routes';
const id='00000000-0000-4000-8000-000000000001';
const request=(body:unknown)=>new Request('https://app.example.test/api/accounting/waste',{method:'POST',body:JSON.stringify(body)});
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('POSTGRES_FINANCIAL_API_ENABLED','true');vi.stubEnv('AUTH_BACKEND','postgres');vi.stubEnv('SUPABASE_ADMIN_STAFF_ID','');mocks.admin.mockResolvedValue(null);mocks.session.mockResolvedValue(null);});
afterEach(()=>vi.unstubAllEnvs());
it('stays off by default',async()=>{
  vi.stubEnv('POSTGRES_FINANCIAL_API_ENABLED','false');
  for (const route of [restockRolls,logWaste,correctStockCount]) expect((await route(request({}))).status).toBe(404);
});
it('lets any signed-in staff member log waste under their own identity',async()=>{
  expect((await logWaste(request({}))).status).toBe(401);
  mocks.session.mockResolvedValue({staff_id:id});mocks.waste.mockResolvedValue({stock_entry_id:'m'});
  const input={requestId:'r',actor_id:'spoof'};
  expect((await logWaste(request(input))).status).toBe(200);expect(mocks.waste).toHaveBeenCalledWith({staffId:id},input);
});
it('keeps restock and count corrections owner-only',async()=>{
  mocks.session.mockResolvedValue({staff_id:id});
  expect((await restockRolls(request({}))).status).toBe(403);expect((await correctStockCount(request({}))).status).toBe(403);
  mocks.admin.mockResolvedValue('owner@example.test');vi.stubEnv('SUPABASE_ADMIN_STAFF_ID',id);
  mocks.restock.mockResolvedValue({stock_entry_id:'r'});mocks.count.mockResolvedValue({stock_entry_id:'c'});
  expect((await restockRolls(request({}))).status).toBe(200);expect((await correctStockCount(request({}))).status).toBe(200);
  expect(mocks.restock).toHaveBeenCalledWith({staffId:id},{});
});

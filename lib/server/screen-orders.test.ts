import { afterEach,beforeEach,expect,it,vi } from 'vitest';
const mocks=vi.hoisted(()=>({admin:vi.fn(),session:vi.fn()}));
vi.mock('next/headers',()=>({cookies:async()=>({get:()=>({value:'signed-session'})})}));
vi.mock('./postgres-auth-routes',()=>({verifiedAdminIdentity:mocks.admin}));
vi.mock('./postgres-auth',()=>({postgresAuth:{session:mocks.session}}));
import { recordScreenOrder } from './screen-orders';
const id='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const order=()=>({version:3,backend:'postgres',operation:'sale',requestId:id,expectedStaffId:id,businessDate:'2026-10-08',clientName:'Ada',contact:'',jobStatus:'Quoted',initialPaymentKobo:'99',paymentMethod:'cash',totalKobo:'100',items:[{kind:'service',ref:id,description:'Design',quantity:'1',priceKobo:'100'}]});
const request=(extra={})=>new Request('https://app.test/api/accounting/orders',{method:'POST',body:JSON.stringify({...order(),...extra})});
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('POSTGRES_FINANCIAL_API_ENABLED','true');vi.stubEnv('AUTH_BACKEND','postgres');mocks.admin.mockResolvedValue(null);mocks.session.mockResolvedValue({staff_id:id});});
afterEach(()=>vi.unstubAllEnvs());
it('sends the whole order and initial payment to one transaction using verified staff identity',async()=>{
 const call=vi.fn().mockResolvedValue({saved:true});expect((await recordScreenOrder(request(),call)).status).toBe(200);
 expect(call).toHaveBeenCalledExactlyOnceWith('api_screen_order',id,expect.objectContaining({actor_id:id,businessDate:'2026-10-08',initialPaymentKobo:'99',paymentMethod:'cash'}));
});
it('refuses changed staff, missing payment methods and disabled activation before dispatch',async()=>{
 const call=vi.fn();expect((await recordScreenOrder(request({expectedStaffId:other}),call)).status).toBe(403);
 expect((await recordScreenOrder(request({paymentMethod:undefined}),call)).status).toBe(400);
 vi.stubEnv('POSTGRES_FINANCIAL_API_ENABLED','false');expect((await recordScreenOrder(request(),call)).status).toBe(404);expect(call).not.toHaveBeenCalled();
});
it('distinguishes business review from retryable database outages',async()=>{
 const refused=vi.fn().mockRejectedValue(Object.assign(new Error('Quote is already used'),{code:'22023'}));
 expect((await recordScreenOrder(request(),refused)).status).toBe(409);
 expect((await recordScreenOrder(request(),vi.fn().mockRejectedValue(new Error('offline')))).status).toBe(503);
});

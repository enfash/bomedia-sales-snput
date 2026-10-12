import { afterEach,beforeEach,expect,it,vi } from 'vitest';
const mocks=vi.hoisted(()=>({identity:vi.fn(),admin:vi.fn()}));
vi.mock('./financial-routes',()=>({financialIdentity:mocks.identity,financialHandler:async(work:()=>Promise<unknown>)=>{try{return Response.json(await work());}catch(e){return Response.json({error:(e as Error).message},{status:(e as {status:number}).status||500});}}}));
vi.mock('./postgres-auth-routes',()=>({verifiedAdminIdentity:mocks.admin}));
import { recordScreenExpense } from './screen-expenses';
const id='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const pay={version:1,backend:'postgres',requestId:id,expectedStaffId:id,operation:'pay',expenseId:other,amountKobo:'100',businessDate:'2026-10-09',paymentMethod:'pos'};
const req=(body:unknown)=>new Request('https://app.test/api/accounting/expense-entries',{method:'POST',body:JSON.stringify(body)});
beforeEach(()=>{vi.resetAllMocks();mocks.identity.mockResolvedValue({staffId:id});mocks.admin.mockResolvedValue(null);});
afterEach(()=>vi.restoreAllMocks());
it('refuses non-owner expense payments and changed identities without writing',async()=>{
 const call=vi.fn();expect((await recordScreenExpense(req(pay),call)).status).toBe(403);expect(call).not.toHaveBeenCalled();
 mocks.admin.mockResolvedValue('owner');mocks.identity.mockResolvedValue({staffId:other});expect((await recordScreenExpense(req(pay),call)).status).toBe(403);expect(call).not.toHaveBeenCalled();
});
it('uses the verified identity and forwards the original payment date and request',async()=>{
 mocks.admin.mockResolvedValue('owner');const call=vi.fn().mockResolvedValue({ok:true});expect((await recordScreenExpense(req(pay),call)).status).toBe(200);
 expect(call).toHaveBeenCalledWith('api_screen_expense',id,{actor_id:id,byOwner:'true',operation:'pay',expenseId:other,amountKobo:'100',businessDate:'2026-10-09',paymentMethod:'pos'});
});
const log={version:1,backend:'postgres',requestId:id,expectedStaffId:id,operation:'log',items:[{businessDate:'2026-10-09',amountKobo:'100',category:'Equipment',description:'x',paidTo:'',status:'unpaid'}]};
it('lets only the verified owner unlock owner-only categories, whatever the browser sends',async()=>{
 const call=vi.fn().mockResolvedValue({ok:true});
 await recordScreenExpense(req({...log,byOwner:'true'}),call);
 expect(call.mock.calls[0][2]).not.toHaveProperty('byOwner');
 mocks.admin.mockResolvedValue('owner');
 await recordScreenExpense(req(log),call);
 expect(call.mock.calls[1][2]).toMatchObject({byOwner:'true'});
});

it('says in plain words when staff were not given the expense category',async()=>{
 const call=vi.fn().mockRejectedValue(Object.assign(new Error('Only the owner can log that category'),{code:'22023'}));
 const response=await recordScreenExpense(req(log),call);
 expect(response.status).toBe(409);
 expect((await response.json()).error).toBe('You do not have access to that expense category. Ask the owner to add you.');
});
const bigLog={version:1,backend:'postgres',requestId:id,expectedStaffId:id,operation:'log',items:[{businessDate:'2026-10-09',amountKobo:'6000000',category:'Transport',description:'Van',paidTo:'Fast Movers',status:'paid',paymentMethod:'transfer'}]};
it('passes the cashier’s reason through, and never lets the browser claim to be the owner',async()=>{
 const call=vi.fn().mockResolvedValue({ok:true});
 await recordScreenExpense(req({...bigLog,approvalReason:'Van hire for a job',byOwner:'true'}),call);
 expect(call.mock.calls[0][2]).toMatchObject({approvalReason:'Van hire for a job'});
 expect(call.mock.calls[0][2]).not.toHaveProperty('byOwner');
 expect((await recordScreenExpense(req({...bigLog,approvalReason:'x'.repeat(501)}),call)).status).toBe(400);
});

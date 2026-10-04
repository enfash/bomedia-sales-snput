import { afterEach,beforeEach,expect,it,vi } from 'vitest';
const mocks=vi.hoisted(()=>({admin:vi.fn(),session:vi.fn(),collect:vi.fn(),read:vi.fn(),report:vi.fn()}));
vi.mock('next/headers',()=>({cookies:async()=>({get:()=>({value:'signed-session'})})}));
vi.mock('./postgres-auth-routes',()=>({verifiedAdminIdentity:mocks.admin}));
vi.mock('./postgres-auth',()=>({postgresAuth:{session:mocks.session}}));
vi.mock('./financial-service',async original=>({...await original<typeof import('./financial-service')>(),financialService:{collect:mocks.collect,read:mocks.read,report:mocks.report}}));
import { collectPayment,readFinancialRecords,readAccountingReport } from './financial-routes';
import { validateFinancialConnection } from './financial-db';
const id='00000000-0000-4000-8000-000000000001';
const request=(body:unknown)=>new Request('https://app.example.test/api/accounting/payments',{method:'POST',body:JSON.stringify(body)});
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('POSTGRES_FINANCIAL_API_ENABLED','true');vi.stubEnv('AUTH_BACKEND','postgres');vi.stubEnv('SUPABASE_ADMIN_STAFF_ID','');mocks.admin.mockResolvedValue(null);mocks.session.mockResolvedValue(null);});
afterEach(()=>vi.unstubAllEnvs());
it('defaults disabled and requires PostgreSQL authentication before use',async()=>{
  vi.stubEnv('POSTGRES_FINANCIAL_API_ENABLED','false');expect((await collectPayment(request({}))).status).toBe(404);
  vi.stubEnv('POSTGRES_FINANCIAL_API_ENABLED','true');vi.stubEnv('AUTH_BACKEND','sheets');expect((await collectPayment(request({}))).status).toBe(503);
  expect(mocks.collect).not.toHaveBeenCalled();
});
it('requires a live staff session for reads and collections',async()=>{
  expect((await collectPayment(request({}))).status).toBe(401);
  expect((await readFinancialRecords(new Request('https://app.example.test/api/accounting/records?resource=jobs'))).status).toBe(401);
  expect(mocks.read).not.toHaveBeenCalled();expect(mocks.collect).not.toHaveBeenCalled();
});
it('derives the actor from the database session and returns no credentials',async()=>{
  mocks.session.mockResolvedValue({staff_id:id,name:'Cashier'});mocks.collect.mockResolvedValue({payment_id:'receipt',amount_kobo:'100'});
  const input={requestId:'request'};const response=await collectPayment(request(input));
  expect(mocks.collect).toHaveBeenCalledWith({staffId:id},input);expect(response.status).toBe(200);
  expect(await response.json()).toEqual({success:true,payment_id:'receipt',amount_kobo:'100'});expect(response.headers.get('cache-control')).toBe('no-store');
});
it('requires explicit owner mapping for writes but permits verified owner reads',async()=>{
  mocks.admin.mockResolvedValue('owner@example.test');mocks.read.mockResolvedValue({data:[],next_after_id:null});
  expect((await collectPayment(request({}))).status).toBe(503);expect(mocks.collect).not.toHaveBeenCalled();
  expect((await readFinancialRecords(new Request('https://app.example.test/api/accounting/records?resource=jobs'))).status).toBe(200);
  vi.stubEnv('SUPABASE_ADMIN_STAFF_ID',id);mocks.collect.mockResolvedValue({payment_id:'receipt'});
  expect((await collectPayment(request({}))).status).toBe(200);expect(mocks.collect).toHaveBeenCalledWith({staffId:id},{});
});
it('does not leak database errors or fall back to Sheets',async()=>{
  mocks.session.mockRejectedValue(new Error('postgres://private-password@host'));
  const response=await collectPayment(request({}));expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toContain('private-password');expect(mocks.collect).not.toHaveBeenCalled();
});
it('rejects migration-owner and authentication connection strings',()=>{
  const ref='abcdefghijklmnopqrst',host='aws-1-eu-central-1.pooler.supabase.com';
  const url=(role:string)=>`postgresql://${role}.${ref}:not-a-real-password@${host}:5432/postgres`;
  expect(validateFinancialConnection(url('bomedia_financial_server'),ref)).toContain('bomedia_financial_server');
  expect(()=>validateFinancialConnection(url('postgres'),ref)).toThrow();
  expect(()=>validateFinancialConnection(url('bomedia_auth_server'),ref)).toThrow();
  expect(()=>validateFinancialConnection(url('bomedia_financial_server')+'?sslmode=disable',ref)).toThrow();
});

it('restricts period reports to the verified owner',async()=>{
  const request=new Request('https://app.example.test/api/accounting/report?from=2026-10-05&through=2026-10-05');
  mocks.session.mockResolvedValue({staff_id:id});expect((await readAccountingReport(request)).status).toBe(403);
  expect(mocks.report).not.toHaveBeenCalled();mocks.admin.mockResolvedValue('owner@example.test');mocks.report.mockResolvedValue({period_profit_kobo:'0'});
  expect((await readAccountingReport(request)).status).toBe(200);expect(mocks.report).toHaveBeenCalledWith('2026-10-05','2026-10-05');
});

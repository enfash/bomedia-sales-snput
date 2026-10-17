import { afterEach,beforeEach,expect,it,vi } from 'vitest';
const mocks=vi.hoisted(()=>({admin:vi.fn(),session:vi.fn(),collect:vi.fn(),read:vi.fn(),report:vi.fn(),call:vi.fn()}));
vi.mock('next/headers',()=>({cookies:async()=>({get:()=>({value:'signed-session'})})}));
vi.mock('./postgres-auth-routes',()=>({verifiedAdminIdentity:mocks.admin}));
vi.mock('./postgres-auth',()=>({postgresAuth:{session:mocks.session}}));
vi.mock('./financial-service',async original=>({...await original<typeof import('./financial-service')>(),financialService:{collect:mocks.collect,read:mocks.read,report:mocks.report}}));
vi.mock('./financial-db',async original=>({...await original<typeof import('./financial-db')>(),callFinancial:mocks.call}));
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

it('keeps the expenses-awaiting list owner-only',async()=>{
  const request=new Request('https://app.example.test/api/accounting/records?resource=expenses_awaiting');
  mocks.session.mockResolvedValue({staff_id:id});expect((await readFinancialRecords(request)).status).toBe(403);
  expect(mocks.read).not.toHaveBeenCalled();mocks.admin.mockResolvedValue('owner@example.test');mocks.read.mockResolvedValue({data:[],next_after_id:null});
  expect((await readFinancialRecords(request)).status).toBe(200);
});
it('hides owner-only expense categories from staff unless the owner chose them, and strips the access fields',async()=>{
  const {categoriesForViewer}=await import('./financial-routes');
  const me='00000000-0000-4000-8000-000000000001';
  const page={data:[{name:'Ink',capital:false,owner_only:false,staff_ids:[]},{name:'Equipment',capital:true,owner_only:true,staff_ids:[]},{name:'Generator',capital:true,owner_only:true,staff_ids:[me.toUpperCase()]}],next_after_id:null};
  expect(categoriesForViewer(page,me)).toEqual({data:[{name:'Ink',capital:false},{name:'Generator',capital:true}],next_after_id:null});
  expect(categoriesForViewer(page,'00000000-0000-4000-8000-000000000002').data.map(c=>c.name)).toEqual(['Ink']);
  expect(categoriesForViewer(page,null)).toBe(page);
});

it('marks turned-off sizes in the materials list so Stock entry can label them, without hiding them',async()=>{
  const request=new Request('https://app.example.test/api/accounting/records?resource=materials');
  mocks.session.mockResolvedValue({staff_id:id});
  mocks.read.mockResolvedValue({data:[{id:'AAAAAAAA-0000-4000-8000-000000000001',name:'Flex'},{id:'00000000-0000-4000-8000-000000000002',name:'Banner'}],next_after_id:null});
  mocks.call.mockResolvedValue([{id:'aaaaaaaa-0000-4000-8000-000000000001'}]);
  const body=await(await readFinancialRecords(request)).json();
  expect(mocks.call).toHaveBeenCalledWith('api_unavailable_materials','current',{});
  expect(body.data).toEqual([{id:'AAAAAAAA-0000-4000-8000-000000000001',name:'Flex',available:false},{id:'00000000-0000-4000-8000-000000000002',name:'Banner'}]);
  mocks.call.mockResolvedValue([]);
  expect((await(await readFinancialRecords(request)).json()).data[0]).not.toHaveProperty('available');
});

it('removes roll costs from the stock records a cashier reads, and keeps them for the owner',async()=>{
  const request=new Request('https://app.example.test/api/accounting/records?resource=inventory');
  const rows={data:[{id:'r1',remaining_length_ft:'150',purchase_cost_kobo:'6000000',cost_per_sqft_kobo_exact:'3896',selling_price_kobo:'25000'}],next_after_id:null};
  mocks.read.mockResolvedValue(rows);
  mocks.session.mockResolvedValue({staff_id:id});
  expect((await(await readFinancialRecords(request)).json()).data[0]).toEqual({id:'r1',remaining_length_ft:'150',selling_price_kobo:'25000'});
  mocks.session.mockResolvedValue(null);mocks.admin.mockResolvedValue('owner@example.test');
  expect((await(await readFinancialRecords(request)).json()).data[0]).toMatchObject({purchase_cost_kobo:'6000000',cost_per_sqft_kobo_exact:'3896'});
});

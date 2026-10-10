import { afterEach,beforeEach,expect,it,vi } from 'vitest';
const mocks=vi.hoisted(()=>({admin:vi.fn(),session:vi.fn(),save:vi.fn(),lookup:vi.fn(),requests:vi.fn(),decide:vi.fn()}));
vi.mock('next/headers',()=>({cookies:async()=>({get:()=>({value:'signed-session'})})}));
vi.mock('./postgres-auth-routes',()=>({verifiedAdminIdentity:mocks.admin}));
vi.mock('./postgres-auth',()=>({postgresAuth:{session:mocks.session}}));
vi.mock('./quote-service',()=>({quoteService:{save:mocks.save,lookup:mocks.lookup,requests:mocks.requests,decide:mocks.decide}}));
import { decidePriceRequest,listPriceRequests,lookupQuote,saveQuote } from './quote-routes';
const id='00000000-0000-4000-8000-000000000001';
const post=(body:unknown)=>new Request('https://app.example.test/api/accounting/quotes',{method:'POST',body:JSON.stringify(body)});
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('POSTGRES_FINANCIAL_API_ENABLED','true');vi.stubEnv('AUTH_BACKEND','postgres');vi.stubEnv('SUPABASE_ADMIN_STAFF_ID','');mocks.admin.mockResolvedValue(null);mocks.session.mockResolvedValue(null);});
afterEach(()=>vi.unstubAllEnvs());
it('lets signed-in staff save and look up quotes under their own identity',async()=>{
  expect((await saveQuote(post({}))).status).toBe(401);
  mocks.session.mockResolvedValue({staff_id:id});mocks.save.mockResolvedValue({estimate_id:'e'});mocks.lookup.mockResolvedValue({found:false});
  expect((await saveQuote(post({requestId:'r'}))).status).toBe(200);expect(mocks.save).toHaveBeenCalledWith({staffId:id},{requestId:'r'});
  expect((await lookupQuote(new Request('https://app.example.test/api/accounting/quotes?number=QT-00001'))).status).toBe(200);
  expect((await lookupQuote(new Request('https://app.example.test/api/accounting/quotes?number=a&number=b'))).status).toBe(400);
});
it('keeps listing and deciding price requests owner-only',async()=>{
  mocks.session.mockResolvedValue({staff_id:id});
  expect((await listPriceRequests()).status).toBe(403);expect((await decidePriceRequest(post({}))).status).toBe(403);
  expect(mocks.decide).not.toHaveBeenCalled();
  mocks.admin.mockResolvedValue('owner@example.test');vi.stubEnv('SUPABASE_ADMIN_STAFF_ID',id);
  mocks.requests.mockResolvedValue({data:[],next_after_id:null});mocks.decide.mockResolvedValue({status:'approved'});
  expect((await listPriceRequests()).status).toBe(200);expect((await decidePriceRequest(post({decision:'approve'}))).status).toBe(200);
});

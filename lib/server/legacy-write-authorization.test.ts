import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({call:vi.fn(),admin:vi.fn(),sale:vi.fn()}));
vi.mock('next/headers',()=>({cookies:async()=>({get:()=>({value:'signed'})})}));
vi.mock('./postgres-auth',()=>({postgresAuth:{session:async()=>({staff_id:'00000000-0000-4000-8000-000000000001'})}}));
vi.mock('./postgres-auth-routes',()=>({verifiedAdminIdentity:mocks.admin}));
vi.mock('./financial-db',()=>({callFinancial:mocks.call,financialApiEnabled:()=>true}));
vi.mock('./sales-service',()=>({salesService:{sale:mocks.sale}}));
import {recordSale} from './sales-routes';
import {recordLegacySale} from './legacy-sale';
beforeEach(()=>{vi.resetAllMocks();mocks.admin.mockResolvedValue(null);});
afterEach(()=>vi.unstubAllEnvs());
it('blocks cashier calls to both older sale write routes before a database write',async()=>{
 for(const handler of [recordSale,recordLegacySale]){
  const response=await handler(new Request('https://app.test/api/sales',{method:'POST',body:'{}'}));
  expect(response.status).toBe(403);
 }
 expect(mocks.call).not.toHaveBeenCalled();expect(mocks.sale).not.toHaveBeenCalled();
});

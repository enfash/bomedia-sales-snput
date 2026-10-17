import { afterEach,beforeEach,expect,it,vi } from 'vitest';
const mocks=vi.hoisted(()=>({admin:vi.fn(),session:vi.fn(),list:vi.fn()}));
vi.mock('next/headers',()=>({cookies:async()=>({get:()=>({value:'signed-session'})})}));
vi.mock('./postgres-auth-routes',()=>({verifiedAdminIdentity:mocks.admin}));
vi.mock('./postgres-auth',()=>({postgresAuth:{session:mocks.session}}));
vi.mock('./audit-log',()=>({auditLog:{list:mocks.list}}));
import { listAuditLog } from './audit-log-routes';
const id='00000000-0000-4000-8000-000000000001';
const get=(query='')=>new Request(`https://app.example.test/api/accounting/audit-log${query}`);
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('POSTGRES_FINANCIAL_API_ENABLED','true');vi.stubEnv('AUTH_BACKEND','postgres');vi.stubEnv('SUPABASE_ADMIN_STAFF_ID','');mocks.admin.mockResolvedValue(null);mocks.session.mockResolvedValue(null);mocks.list.mockResolvedValue({data:[],next_before:null,people:[]});});
afterEach(()=>vi.unstubAllEnvs());
it('is for the owner only, including a signed-in cashier',async()=>{
  mocks.session.mockResolvedValue({staff_id:id});
  expect((await listAuditLog(get())).status).toBe(403);
  expect(mocks.list).not.toHaveBeenCalled();
});
it('passes only the supported query filters to the service',async()=>{
  mocks.admin.mockResolvedValue('owner@example.test');vi.stubEnv('SUPABASE_ADMIN_STAFF_ID',id);
  const response=await listAuditLog(get(`?category=staff&staff=${id}&range=today&beforeAt=2026-10-09T10:00:00Z&beforeId=${id}&evil=1`));
  expect(response.status).toBe(200);
  expect(mocks.list).toHaveBeenCalledWith({category:'staff',staffId:id,range:'today',beforeAt:'2026-10-09T10:00:00Z',beforeId:id});
});

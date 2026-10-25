import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({admin:vi.fn(),shift:vi.fn(),rows:vi.fn(),sheets:vi.fn()}));
vi.mock('@/lib/server/postgres-auth-routes',()=>({verifiedAdminIdentity:mocks.admin}));
vi.mock('@/lib/server/shift-report',()=>({shiftData:mocks.shift}));
vi.mock('@/lib/server/legacy-feed',()=>({legacyFeedEnabled:()=>true,legacyRows:mocks.rows}));
vi.mock('@/lib/google-sheets',()=>({getDoc:mocks.sheets}));
import {GET} from './route';
beforeEach(()=>{vi.resetAllMocks();mocks.admin.mockResolvedValue('owner@example.test');mocks.rows.mockResolvedValue([]);mocks.shift.mockResolvedValue({sales:[],expenses:[],payments:[{_amountKobo:'2500000',_method:'cash','PAYMENT METHOD':'Cash'}]});});
it('includes old-debt collections even with no new sales and does not contact Sheets',async()=>{
 const response=await GET();expect(response.status).toBe(200);const body=await response.json();
 expect(body.summary).toMatchObject({totalCollected:25000,netCash:25000,totalExpenses:0});expect(body.message).toContain('Collections (all methods): ₦25,000.00');expect(mocks.sheets).not.toHaveBeenCalled();
});
it('does not disclose the owner-wide digest to a cashier',async()=>{
 mocks.admin.mockResolvedValue(null);expect((await GET()).status).toBe(403);expect(mocks.shift).not.toHaveBeenCalled();expect(mocks.rows).not.toHaveBeenCalled();
});

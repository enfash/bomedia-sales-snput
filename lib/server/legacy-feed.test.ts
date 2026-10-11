import { afterEach,beforeEach,expect,it,vi } from 'vitest';
const mocks=vi.hoisted(()=>({admin:vi.fn(),session:vi.fn()}));
vi.mock('next/headers',()=>({cookies:async()=>({get:()=>({value:'signed-session'})})}));
vi.mock('./postgres-auth-routes',()=>({verifiedAdminIdentity:mocks.admin}));
vi.mock('./postgres-auth',()=>({postgresAuth:{session:mocks.session}}));
import { expensesForViewer,lagosToday,legacyFeedEnabled,legacyFeedResponse,legacyWriteBlocked,materialsForViewer } from './legacy-feed';
const id='00000000-0000-4000-8000-000000000001';
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('POSTGRES_FINANCIAL_API_ENABLED','true');vi.stubEnv('AUTH_BACKEND','postgres');mocks.admin.mockResolvedValue(null);mocks.session.mockResolvedValue(null);});
afterEach(()=>vi.unstubAllEnvs());
it('leaves Sheets in charge while the switch is off',async()=>{
  vi.stubEnv('POSTGRES_FINANCIAL_API_ENABLED','false');
  expect(legacyFeedEnabled()).toBe(false);
  expect(await legacyFeedResponse('sales',vi.fn())).toBeNull();
  expect(legacyWriteBlocked()).toBeNull();
});
it('never falls back to Sheets when the switch is on but misconfigured',()=>{
  vi.stubEnv('AUTH_BACKEND','sheets');
  expect(legacyFeedEnabled()).toBe(true);
  expect(legacyWriteBlocked()?.status).toBe(409);
});
it('serves old row shapes from Postgres to signed-in users only',async()=>{
  const call=vi.fn().mockResolvedValue([{DATE:'2026-10-05','AMOUNT (₦)':'9600'}]);
  expect((await legacyFeedResponse('sales',call))!.status).toBe(401);
  expect(call).not.toHaveBeenCalled();
  mocks.session.mockResolvedValue({staff_id:id});
  const response=(await legacyFeedResponse('sales',call))!;
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({data:[{DATE:'2026-10-05','AMOUNT (₦)':'9600'}]});
  expect(call).toHaveBeenCalledWith('api_legacy_feed','sales',{});
  mocks.admin.mockResolvedValue('owner@example.test');
  expect((await legacyFeedResponse('expenses',call))!.status).toBe(200);
});
it('reports an outage without leaking details',async()=>{
  mocks.session.mockResolvedValue({staff_id:id});
  const response=(await legacyFeedResponse('payments',vi.fn().mockRejectedValue(new Error('password authentication failed'))))!;
  expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toContain('password');
});
it('refuses old-screen writes once Postgres is in charge',async()=>{
  const response=legacyWriteBlocked()!;
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({code:'MOVED_TO_ACCOUNTING'});
});
it('shows each cashier only the expenses they logged today, and the owner everything',async()=>{
  const today=lagosToday();
  const rows=()=>[{DATE:today,CATEGORY:'Ink',_loggedById:id},{DATE:today,CATEGORY:'Fuel',_loggedById:'00000000-0000-4000-8000-000000000002'},{DATE:'2020-01-01',CATEGORY:'Old',_loggedById:id},{DATE:today,CATEGORY:'Odd'}];
  const call=vi.fn().mockImplementation(async()=>rows());
  mocks.session.mockResolvedValue({staff_id:id});
  expect((await (await legacyFeedResponse('expenses',call))!.json()).data).toEqual([{DATE:today,CATEGORY:'Ink'}]);
  expect((await (await legacyFeedResponse('sales',call))!.json()).data).toHaveLength(4);
  mocks.admin.mockResolvedValue('owner@example.test');
  const owner=(await (await legacyFeedResponse('expenses',call))!.json()).data;
  expect(owner).toHaveLength(4);
  expect(JSON.stringify(owner)).not.toContain('_loggedById');
});
it('counts a day by Lagos time, not UTC',()=>{
  expect(lagosToday(new Date('2026-10-10T23:30:00Z'))).toBe('2026-10-11');
  expect(expensesForViewer([{DATE:'2026-10-11',_loggedById:id},{DATE:'2026-10-10',_loggedById:id}],id,new Date('2026-10-10T23:30:00Z'))).toEqual([{DATE:'2026-10-11'}]);
});

const materialRows=[{'Material ID':'FLEX-10FT','Material Name':'Flex'},{'Material ID':'BANNER-6FT','Material Name':'Banner'}];
it('hides turned-off sizes from selling screens and flags them for Inventory',async()=>{
  const off=vi.fn().mockImplementation(async(method:string)=>method==='api_unavailable_materials'?[{id:'x',code:'BANNER-6FT'}]:[]);
  expect(await materialsForViewer(materialRows,false,off)).toEqual([{...materialRows[0],'Total Realised Revenue':'0',Available:'Yes'}]);
  expect(await materialsForViewer(materialRows,true,off)).toEqual([{...materialRows[0],'Total Realised Revenue':'0',Available:'Yes'},{...materialRows[1],'Total Realised Revenue':'0',Available:'No'}]);
  expect(off).toHaveBeenCalledWith('api_unavailable_materials','current',{});
});
it('flags every size as available when nothing is turned off',async()=>{
  expect((await materialsForViewer(materialRows,false,vi.fn().mockResolvedValue([]))).every(row=>row.Available==='Yes')).toBe(true);
  expect((await materialsForViewer(materialRows,true,vi.fn().mockResolvedValue([]))).every(row=>row.Available==='Yes')).toBe(true);
});
it('reports realised revenue from what the jobs actually sold for, not from the current price',async()=>{
  const call=vi.fn().mockImplementation(async(method:string)=>method==='api_material_sales'?[{code:'FLEX-10FT',sold:'1800'}]:[]);
  const rows=[{...materialRows[0],'Total Realised Revenue':'468000'},{...materialRows[1],'Total Realised Revenue':'99999'}];
  const result=await materialsForViewer(rows,false,call);
  expect(result.map(row=>row['Total Realised Revenue'])).toEqual(['1800','0']);
  expect(call).toHaveBeenCalledWith('api_material_sales','current',{});
});
it('applies the filter to the materials feed response, and the all option includes everything',async()=>{
  mocks.session.mockResolvedValue({staff_id:id});
  const call=vi.fn().mockImplementation(async(method:string)=>method==='api_unavailable_materials'?[{id:'x',code:'BANNER-6FT'}]:method==='api_material_sales'?[]:materialRows);
  expect((await(await legacyFeedResponse('materials',call))!.json()).data.map((row:Record<string,string>)=>row['Material ID'])).toEqual(['FLEX-10FT']);
  expect((await(await legacyFeedResponse('materials',call,{includeUnavailable:true}))!.json()).data).toHaveLength(2);
  const other=vi.fn().mockResolvedValue([{DATE:'2026-10-05'}]);
  await legacyFeedResponse('sales',other);
  expect(other).not.toHaveBeenCalledWith('api_unavailable_materials','current',{});
});

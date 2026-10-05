import type { PGlite } from '@electric-sql/pglite';
import { afterAll,afterEach,beforeAll,beforeEach,expect,it } from 'vitest';
import { testDatabase,insertId } from './helpers';
import { createServiceCatalog } from '../../lib/server/service-catalog';
import { createQuoteService } from '../../lib/server/quote-service';
import { createSalesService } from '../../lib/server/sales-service';
import type { FinancialCall } from '../../lib/server/financial-db';
let db:PGlite,staff:string,owner:string,customer:string,material:string;
const call:FinancialCall=async<T>(method:string,key:string,payload:Record<string,unknown>):Promise<T>=>{
  if(method==='api_services')return (await db.query<{result:T}>('select bomedia.api_services($1) as result',[key==='all'])).rows[0].result;
  if(method==='api_price_requests')return (await db.query<{result:T}>('select bomedia.api_price_requests() as result')).rows[0].result;
  if(method==='api_quote_lookup')return (await db.query<{result:T}>('select bomedia.api_quote_lookup($1) as result',[key])).rows[0].result;
  return (await db.query<{result:T}>(`select bomedia.${method}($1,$2::jsonb) as result`,[key,JSON.stringify(payload)])).rows[0].result;
};
const catalog=createServiceCatalog(call),quotes=createQuoteService(call),sales=createSalesService(call);
beforeAll(async()=>{db=await testDatabase();},30_000);
afterAll(async()=>{await db?.close();});
beforeEach(async()=>{
  await db.exec('begin');
  staff=await insertId(db,"insert into bomedia.staff(display_name,login_name) values ('Ada','ada') returning id");
  owner=await insertId(db,"insert into bomedia.staff(display_name,login_name) values ('Owner','owner') returning id");
  customer=await insertId(db,"insert into bomedia.customers(display_name) values ('Grace Chapel') returning id");
  material=await insertId(db,"insert into bomedia.materials(name,width_ft,selling_price_per_sqft_kobo) values ('Banner',4,10000) returning id");
  const roll=await insertId(db,"insert into bomedia.inventory_rolls(material_id,item_name,width_ft,total_length_ft,remaining_length_ft,purchase_cost_kobo,selling_price_kobo) values ($1,'Roll',4,100,100,10000,10000) returning id",[material]);
  await db.query('update bomedia.materials set active_roll_id=$1 where id=$2',[roll,material]);
  await db.exec("insert into bomedia.bookkeeping_settings(starts_on,state) values ('2026-10-05','active')");
  await db.query("select bomedia.post_journal('inventory-fixture',$1::jsonb)",[JSON.stringify({actor_id:staff,business_date:'2026-10-05',kind:'adjustment',memo:'Inventory',
    lines:[{account_code:'1200',debit_kobo:'10000'},{account_code:'3000',credit_kobo:'10000'}]})]);
  await db.exec('set local role bomedia_financial_runtime');
});
afterEach(async()=>{await db.exec('rollback');});
async function failure(work:()=>Promise<unknown>,match:object) {
  await db.exec('savepoint rejected');await expect(work()).rejects.toMatchObject(match);await db.exec('rollback to savepoint rejected');
}
const owned=<T>(sql:string,params:unknown[]=[])=>(async()=>{await db.exec('reset role');try {return (await db.query<T>(sql,params)).rows;} finally {await db.exec('set local role bomedia_financial_runtime');}})();
async function services() {
  const design=(await catalog.save({staffId:owner},{requestId:'s1',name:'Graphic design',pricing:'fixed',unitPriceKobo:'500000',visible:true})).service_id;
  const fixing=(await catalog.save({staffId:owner},{requestId:'s2',name:'Installation / fixing',pricing:'per_job',visible:true})).service_id;
  return {design,fixing};
}
it('keeps an owner service list with unique names and hidden entries',async()=>{
  const {design}=await services();
  await catalog.save({staffId:owner},{requestId:'s3',name:'Lamination',pricing:'fixed',unitPriceKobo:'100000',visible:false});
  await failure(()=>catalog.save({staffId:owner},{requestId:'dup',name:' graphic design ',pricing:'fixed',unitPriceKobo:'1',visible:true}),{status:409});
  expect(((await catalog.list(false)).data as {name:string}[]).map(s=>s.name)).toEqual(['Graphic design','Installation / fixing']);
  expect((await catalog.list(true)).data).toHaveLength(3);
  await catalog.save({staffId:owner},{requestId:'s4',serviceId:design,name:'Graphic design',pricing:'fixed',unitPriceKobo:'600000',visible:true});
  expect(((await catalog.list(false)).data as {unit_price_kobo:string}[])[0].unit_price_kobo).toBe('600000');
  await expect(catalog.save({staffId:owner},{requestId:'x',name:'Bad',pricing:'per_job',unitPriceKobo:'1',visible:true})).rejects.toMatchObject({status:400});
});
it('sells a fixed service with a print job: no stock, booked as a sale',async()=>{
  const {design}=await services();
  const result=await sales.sale({staffId:staff},{requestId:'sale',customerId:customer,businessDate:'2026-10-05',jobs:[
    {materialId:material,description:'Banner',quantity:'1',widthFt:'2',heightFt:'3',expectedUnitPriceKobo:'60000'},
    {serviceId:design,description:'Banner artwork',quantity:'2',expectedUnitPriceKobo:'500000'}]});
  expect(result.total_kobo).toBe('1060000');
  const jobs=await owned<{service_id:string|null;material_name_snapshot:string;tiled_length_ft:string|null;amount_kobo:string}>(
    'select service_id,material_name_snapshot,tiled_length_ft::text as tiled_length_ft,amount_kobo::text as amount_kobo from bomedia.jobs j order by j.amount_kobo');
  expect(jobs).toEqual([{service_id:null,material_name_snapshot:'Banner',tiled_length_ft:'2.000000',amount_kobo:'60000'},
    {service_id:design,material_name_snapshot:'Graphic design',tiled_length_ft:null,amount_kobo:'1000000'}]);
  expect((await owned<{n:string}>("select sum(debit_kobo-credit_kobo)::text as n from bomedia.journal_lines where account_code='1100'"))[0].n).toBe('1060000');
  await failure(()=>sales.sale({staffId:staff},{requestId:'stale',customerId:customer,businessDate:'2026-10-05',jobs:[{serviceId:design,description:'Art',quantity:'1',expectedUnitPriceKobo:'400000'}]}),{status:409});
});
it('bills a per-job service only at an owner-approved price for the same quantity',async()=>{
  const {fixing}=await services();
  const item={serviceId:fixing,description:'Fix 2 banners, Ikotun',quantity:'1'};
  await failure(()=>sales.sale({staffId:staff},{requestId:'direct',customerId:customer,businessDate:'2026-10-05',jobs:[{...item,expectedUnitPriceKobo:'1500000'}]}),{status:409});
  await failure(()=>quotes.save({staffId:staff},{requestId:'q0',customerId:customer,businessDate:'2026-10-05',items:[item]}),{status:409});
  const saved=await quotes.save({staffId:staff},{requestId:'q1',customerId:customer,businessDate:'2026-10-05',items:[item],
    priceRequests:[{itemIndex:0,requestedUnitPriceKobo:'1500000',reason:'2 fixers, ladder, transport'}]});
  expect(saved).toMatchObject({total_kobo:'1500000',pending_price_requests:1});
  const [request]=(await quotes.requests()).data as {id:string;material_name:string;is_service:boolean;list_total_kobo:string|null}[];
  expect(request).toMatchObject({material_name:'Installation / fixing',is_service:true,list_total_kobo:null});
  await quotes.decide({staffId:owner},{requestId:'d1',priceRequestId:request.id,decision:'approve'});
  const job={...item,expectedUnitPriceKobo:'1500000',priceRequestId:request.id};
  await failure(()=>sales.sale({staffId:staff},{requestId:'qty',customerId:customer,businessDate:'2026-10-05',quoteId:saved.estimate_id,jobs:[{...job,quantity:'2'}]}),{status:409});
  const sale=await sales.sale({staffId:staff},{requestId:'ok',customerId:customer,businessDate:'2026-10-05',quoteId:saved.estimate_id,jobs:[job]});
  expect(sale.total_kobo).toBe('1500000');
  expect((await quotes.lookup(saved.quote_number)).used).toBe(true);
});
it('refuses hidden services and mixed or sized service items',async()=>{
  const hidden=(await catalog.save({staffId:owner},{requestId:'h',name:'Old service',pricing:'fixed',unitPriceKobo:'1000',visible:false})).service_id;
  await failure(()=>sales.sale({staffId:staff},{requestId:'hidden',customerId:customer,businessDate:'2026-10-05',jobs:[{serviceId:hidden,description:'x',quantity:'1',expectedUnitPriceKobo:'1000'}]}),{status:409});
  await failure(()=>quotes.save({staffId:staff},{requestId:'hq',customerId:customer,businessDate:'2026-10-05',items:[{serviceId:hidden,description:'x',quantity:'1'}]}),{status:409});
  await expect(sales.sale({staffId:staff},{requestId:'mixed',customerId:customer,businessDate:'2026-10-05',jobs:[{serviceId:hidden,materialId:material,description:'x',quantity:'1',expectedUnitPriceKobo:'1'}]})).rejects.toMatchObject({status:400});
  await expect(quotes.save({staffId:staff},{requestId:'sized',customerId:customer,businessDate:'2026-10-05',items:[{serviceId:hidden,description:'x',quantity:'1',widthFt:'2'}]})).rejects.toMatchObject({status:400});
  for (const sql of ['select * from bomedia.services',"insert into bomedia.services(name,pricing) values ('x','per_job')"]) {
    await db.exec('savepoint bad');await expect(db.query(sql)).rejects.toThrow();await db.exec('rollback to savepoint bad');
  }
});

import type { PGlite } from '@electric-sql/pglite';
import { afterAll,afterEach,beforeAll,beforeEach,expect,it } from 'vitest';
import { testDatabase,insertId } from './helpers';
import { createQuoteService } from '../../lib/server/quote-service';
import { createSalesService } from '../../lib/server/sales-service';
import type { FinancialCall } from '../../lib/server/financial-db';
let db:PGlite,staff:string,owner:string,customer:string,other:string,material:string;
const call:FinancialCall=async<T>(method:string,key:string,payload:Record<string,unknown>):Promise<T>=>{
  if(method==='api_price_requests')return (await db.query<{result:T}>('select bomedia.api_price_requests() as result')).rows[0].result;
  if(method==='api_quote_lookup')return (await db.query<{result:T}>('select bomedia.api_quote_lookup($1) as result',[key])).rows[0].result;
  return (await db.query<{result:T}>(`select bomedia.${method}($1,$2::jsonb) as result`,[key,JSON.stringify(payload)])).rows[0].result;
};
const quotes=createQuoteService(call),sales=createSalesService(call);
beforeAll(async()=>{db=await testDatabase();},30_000);
afterAll(async()=>{await db?.close();});
beforeEach(async()=>{
  await db.exec('begin');
  staff=await insertId(db,"insert into bomedia.staff(display_name,login_name) values ('Ada','ada') returning id");
  owner=await insertId(db,"insert into bomedia.staff(display_name,login_name) values ('Owner','owner') returning id");
  customer=await insertId(db,"insert into bomedia.customers(display_name) values ('Grace Chapel') returning id");
  other=await insertId(db,"insert into bomedia.customers(display_name) values ('Someone else') returning id");
  material=await insertId(db,"insert into bomedia.materials(name,width_ft,selling_price_per_sqft_kobo) values ('Banner',4,10000) returning id");
  const roll=await insertId(db,"insert into bomedia.inventory_rolls(material_id,item_name,width_ft,total_length_ft,remaining_length_ft,purchase_cost_kobo,selling_price_kobo) values ($1,'Roll',4,100,100,10000,10000) returning id",[material]);
  await db.query('update bomedia.materials set active_roll_id=$1 where id=$2',[roll,material]);
  await db.exec("insert into bomedia.bookkeeping_settings(starts_on,state) values ('2026-10-05','active')");
  await db.query("select bomedia.post_journal('inventory-fixture',$1::jsonb)",[JSON.stringify({actor_id:staff,business_date:'2026-10-05',kind:'adjustment',memo:'Inventory',
    lines:[{account_code:'1200',debit_kobo:'10000'},{account_code:'3000',credit_kobo:'10000'}]})]);
  await db.exec('set local role bomedia_financial_runtime');
});
afterEach(async()=>{await db.exec('rollback');});
const items=[{materialId:'',description:'Banner',quantity:'3',widthFt:'2',heightFt:'3'},{materialId:'',description:'Sticker',quantity:'2',widthFt:'1',heightFt:'1'}];
const quote=(extra={})=>({requestId:'quote-1',customerId:customer,businessDate:'2026-10-05',items:items.map(i=>({...i,materialId:material})),...extra});
const job=(extra={})=>({materialId:material,description:'Banner',quantity:'3',widthFt:'2',heightFt:'3',expectedUnitPriceKobo:'60000',...extra});
async function failure(work:()=>Promise<unknown>,match:object) {
  await db.exec('savepoint rejected');await expect(work()).rejects.toMatchObject(match);await db.exec('rollback to savepoint rejected');
}
it('prices a quote from the catalog with a unique number and no stock or debt',async()=>{
  const first=await quotes.save({staffId:staff},quote());
  expect(first).toMatchObject({total_kobo:'200000',pending_price_requests:0});expect(first.quote_number).toMatch(/^QT-\d{5}$/);
  expect(await quotes.save({staffId:staff},quote())).toEqual(first);
  const second=await quotes.save({staffId:staff},quote({requestId:'quote-2',customerId:undefined,clientName:'Walk-in'}));
  expect(Number(second.quote_number.slice(3))).toBe(Number(first.quote_number.slice(3))+1);
  const found=await quotes.lookup(first.quote_number.toLowerCase());
  expect(found).toMatchObject({found:true,legacy:false,client_name:'Grace Chapel',used:false});
  expect((found.items as {current_unit_price_kobo:string}[])[0].current_unit_price_kobo).toBe('60000');
  await db.exec('reset role');
  expect((await db.query('select * from bomedia.jobs')).rows).toHaveLength(0);
  await db.exec("update bomedia.materials set selling_price_per_sqft_kobo=12000");
  await db.exec('set local role bomedia_financial_runtime');
  expect(((await quotes.lookup(first.quote_number)).items as {unit_price_kobo:string;current_unit_price_kobo:string}[])[0]).toMatchObject({unit_price_kobo:'60000',current_unit_price_kobo:'72000'});
  expect(await quotes.lookup('QT-99999')).toEqual({found:false});
});
it('records an owner-approved price once, for the same item and customer only',async()=>{
  const saved=await quotes.save({staffId:staff},quote({priceRequests:[{itemIndex:0,requestedUnitPriceKobo:'50000',reason:'Regular customer'}]}));
  expect(saved.pending_price_requests).toBe(1);
  const [request]=(await quotes.requests()).data as {id:string;status:string;requested_total_kobo:string;list_total_kobo:string}[];
  expect(request).toMatchObject({status:'pending',requested_total_kobo:'150000',list_total_kobo:'180000'});
  const approved=job({priceRequestId:request.id,expectedUnitPriceKobo:'50000'});
  await failure(()=>sales.sale({staffId:staff},{requestId:'early',customerId:customer,businessDate:'2026-10-05',quoteId:saved.estimate_id,jobs:[approved]}),{status:409});
  await quotes.decide({staffId:owner},{requestId:'decide-1',priceRequestId:request.id,decision:'approve',note:'OK this once'});
  await failure(()=>quotes.decide({staffId:owner},{requestId:'decide-2',priceRequestId:request.id,decision:'decline'}),{status:409});
  await failure(()=>sales.sale({staffId:staff},{requestId:'other',customerId:other,businessDate:'2026-10-05',quoteId:saved.estimate_id,jobs:[approved]}),{status:409});
  await failure(()=>sales.sale({staffId:staff},{requestId:'changed',customerId:customer,businessDate:'2026-10-05',quoteId:saved.estimate_id,jobs:[{...approved,quantity:'2'}]}),{status:409});
  await failure(()=>sales.sale({staffId:staff},{requestId:'no-quote',customerId:customer,businessDate:'2026-10-05',jobs:[approved]}),{status:409});
  const sale={requestId:'sale-1',customerId:customer,businessDate:'2026-10-05',quoteId:saved.estimate_id,jobs:[approved]};
  const result=await sales.sale({staffId:staff},sale);
  expect(result.total_kobo).toBe('150000');
  expect(await sales.sale({staffId:staff},sale)).toEqual(result);
  await failure(()=>sales.sale({staffId:staff},{...sale,requestId:'again'}),{status:409});
  expect(((await quotes.requests()).data as {status:string}[])[0].status).toBe('used');
  expect((await quotes.lookup(saved.quote_number)).used).toBe(true);
});
it('never lets staff set a price themselves',async()=>{
  await failure(()=>sales.sale({staffId:staff},{requestId:'spoof',customerId:customer,businessDate:'2026-10-05',jobs:[{...job(),approvedUnitPriceKobo:'1'}]}),{status:400});
  await failure(()=>sales.sale({staffId:staff},{requestId:'stale',customerId:customer,businessDate:'2026-10-05',jobs:[job({expectedUnitPriceKobo:'50000'})]}),{status:409});
  for (const sql of ["select bomedia.post_tracked_sale('x','{}')","select * from bomedia.price_requests","update bomedia.price_requests set status='approved'"]) {
    await db.exec('savepoint bad');await expect(db.query(sql)).rejects.toThrow();await db.exec('rollback to savepoint bad');
  }
});
it('validates quotes and decisions before SQL',async()=>{
  await expect(quotes.save({staffId:staff},quote({priceRequests:[{itemIndex:5,requestedUnitPriceKobo:'1',reason:'Why not'}]}))).rejects.toMatchObject({status:400});
  await expect(quotes.save({staffId:staff},quote({customerId:undefined,clientName:'Walk-in',priceRequests:[{itemIndex:0,requestedUnitPriceKobo:'1',reason:'Cheap'}]}))).rejects.toMatchObject({status:400});
  await expect(quotes.save({staffId:staff},quote({items:[]}))).rejects.toMatchObject({status:400});
  await expect(quotes.lookup('1234')).rejects.toMatchObject({status:400});
  await expect(quotes.decide({staffId:owner},{requestId:'x',priceRequestId:customer,decision:'maybe'})).rejects.toMatchObject({status:400});
  await failure(()=>quotes.save({staffId:staff},quote({priceRequests:[{itemIndex:0,requestedUnitPriceKobo:'60000',reason:'Same price'}]})),{status:409});
});

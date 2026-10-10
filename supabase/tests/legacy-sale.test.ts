import type { PGlite } from '@electric-sql/pglite';
import { afterAll,afterEach,beforeAll,beforeEach,expect,it } from 'vitest';
import { testDatabase,insertId } from './helpers';
let db:PGlite,staff:string,material:string;
const sale=async(key:string,payload:Record<string,unknown>)=>(await db.query<{result:Record<string,unknown>}>('select bomedia.api_legacy_sale($1,$2::jsonb) as result',[key,JSON.stringify({actor_id:staff,business_date:'2026-10-07',...payload})])).rows[0].result;
const item=(extra:Record<string,unknown>={})=>({material_ref:'MAT-FLEX',description:'Banner [8x4ft]',quantity:'2',width:'8',height:'4',unit:'ft',price_per_sqft_kobo:'15000',...extra});
const owned=async<T=Record<string,string>>(sql:string)=>{await db.exec('reset role');try {return (await db.query<T>(sql)).rows;} finally {await db.exec('set local role bomedia_financial_runtime');}};
async function failure(work:()=>Promise<unknown>,code:string) {
  await db.exec('savepoint rejected');await expect(work()).rejects.toMatchObject({code});await db.exec('rollback to savepoint rejected');
}
beforeAll(async()=>{db=await testDatabase();},30_000);
afterAll(async()=>{await db?.close();});
beforeEach(async()=>{
  await db.exec('begin');
  staff=await insertId(db,"insert into bomedia.staff(display_name,login_name) values ('Ada','ada') returning id");
  await db.exec("insert into bomedia.customers(display_name,contact) values ('Grace  Chapel',null)");
  material=await insertId(db,"insert into bomedia.materials(legacy_material_id,name,width_ft,selling_price_per_sqft_kobo) values ('MAT-FLEX','Flex',10,15000) returning id");
  const roll=await insertId(db,"insert into bomedia.inventory_rolls(material_id,item_name,width_ft,total_length_ft,remaining_length_ft,purchase_cost_kobo,selling_price_kobo) values ($1,'Flex Roll',10,20,20,2000000,15000) returning id",[material]);
  await db.query('update bomedia.materials set active_roll_id=$1 where id=$2',[roll,material]);
  await db.exec("insert into bomedia.bookkeeping_settings(starts_on,state) values ('2026-10-01','active')");
  await db.query("select bomedia.post_journal('inventory-fixture',$1::jsonb)",[JSON.stringify({actor_id:staff,business_date:'2026-10-01',kind:'adjustment',memo:'Inventory',
    lines:[{account_code:'1200',debit_kobo:'2000000'},{account_code:'3000',credit_kobo:'2000000'}]})]);
  await db.exec('set local role bomedia_financial_runtime');
});
afterEach(async()=>{await db.exec('rollback');});

it('records the old form as a sale: same customer by name, typed status, payment by method, safe to retry',async()=>{
  const payload={client_name:' grace chapel ',contact:'0803',job_status:'Printing',initial_payment_kobo:'500000',payment_method:'transfer',items:[item()]};
  const first=await sale('s1',payload);
  expect(first).toMatchObject({total_kobo:'960000',sales_id:expect.stringMatching(/^BOM-\d{8}-\d{4}$/)});
  expect(await owned('select display_name,contact from bomedia.customers')).toEqual([{display_name:'Grace  Chapel',contact:'0803'}]);
  expect(await owned('select job_status,price_per_sqft_kobo::text as p,tiled_length_ft::text as l from bomedia.jobs')).toEqual([{job_status:'Printing',p:'15000',l:'8.000000'}]);
  expect(await owned("select method,amount_kobo::text as a from bomedia.payments")).toEqual([{method:'Transfer',a:'500000'}]);
  expect(await owned('select count(*)::text as n from bomedia.sale_reviews')).toEqual([{n:'0'}]);
  await db.exec('reset role');await db.exec("update bomedia.jobs set job_status='Ready'");await db.exec('set local role bomedia_financial_runtime');
  expect(await sale('s1',payload)).toEqual(first);
  expect(await owned('select job_status from bomedia.jobs')).toEqual([{job_status:'Ready'}]);
  expect(await owned('select count(*)::text as n from bomedia.payments')).toEqual([{n:'1'}]);
});
it('bills a price typed by staff and flags it, and creates a new customer for a new name',async()=>{
  await sale('s2',{client_name:'Adeola Stores',items:[item({price_per_sqft_kobo:'12000',width:'48',height:'24',unit:'in',quantity:'1'})]});
  expect(await owned('select display_name from bomedia.customers order by created_at')).toHaveLength(2);
  expect(await owned('select amount_kobo::text as a,price_per_sqft_kobo::text as p,job_status from bomedia.jobs')).toEqual([{a:'96000',p:'12000',job_status:'Quoted'}]);
  expect(await owned("select kind,details->>'typed_per_sqft_kobo' as t,details->>'list_per_sqft_kobo' as l from bomedia.sale_reviews"))
    .toEqual([{kind:'price',t:'12000',l:'15000'}]);
});
it('records a sale when stock runs short, using what is left and flagging the rest',async()=>{
  const result=await sale('s3',{client_name:'Grace Chapel',items:[item({quantity:'3',width:'10',height:'10'})]}) as {stock_shortfalls:{missing_ft:string}[]};
  expect(result.stock_shortfalls).toEqual([expect.objectContaining({missing_ft:'10.000000'})]);
  expect(await owned('select remaining_length_ft::text as r from bomedia.inventory_rolls')).toEqual([{r:'0.000000'}]);
  expect(await owned("select kind,details->>'missing_ft' as m from bomedia.sale_reviews")).toEqual([{kind:'stock',m:'10.000000'}]);
  // With no stock left at all the sale is refused with a clear reason.
  await failure(()=>sale('s4',{client_name:'Grace Chapel',items:[item({quantity:'1'})]}),'23514');
});
it('refuses money without a method, unknown materials and bad statuses',async()=>{
  await failure(()=>sale('x1',{client_name:'Grace Chapel',initial_payment_kobo:'100',items:[item()]}),'22023');
  await failure(()=>sale('x2',{client_name:'Grace Chapel',items:[item({material_ref:'NOPE'})]}),'22023');
  await failure(()=>sale('x3',{client_name:'Grace Chapel',job_status:'Lost',items:[item()]}),'22023');
  await failure(()=>sale('x4',{client_name:' ',items:[item()]}),'22023');
  await failure(()=>sale('x5',{client_name:'Grace Chapel',items:[item()],extra:1}),'22023');
});

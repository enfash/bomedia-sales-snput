import type { PGlite } from '@electric-sql/pglite';
import { afterAll,afterEach,beforeAll,beforeEach,expect,it } from 'vitest';
import { testDatabase,insertId } from './helpers';
let db:PGlite,staff:string,jobA:string,jobB:string,seqB:string;
const collect=async(key:string,payload:Record<string,unknown>)=>(await db.query<{result:Record<string,unknown>}>('select bomedia.api_legacy_collect($1,$2::jsonb) as result',
  [key,JSON.stringify({actor_id:staff,business_date:'2026-10-07',method:'transfer',...payload})])).rows[0].result;
const owned=async(sql:string)=>{await db.exec('reset role');try {return (await db.query<Record<string,string>>(sql)).rows;} finally {await db.exec('set local role bomedia_financial_runtime');}};
async function failure(work:()=>Promise<unknown>,code:string) {
  await db.exec('savepoint rejected');await expect(work()).rejects.toMatchObject({code});await db.exec('rollback to savepoint rejected');
}
beforeAll(async()=>{db=await testDatabase();},30_000);
afterAll(async()=>{await db?.close();});
beforeEach(async()=>{
  await db.exec('begin');
  staff=await insertId(db,"insert into bomedia.staff(display_name,login_name) values ('Ada','ada') returning id");
  await db.exec("insert into bomedia.bookkeeping_settings(starts_on,state) values ('2026-10-01','active')");
  const customer=await insertId(db,"insert into bomedia.customers(display_name) values ('Grace Chapel') returning id");
  const other=await insertId(db,"insert into bomedia.customers(display_name) values ('Adeola Stores') returning id");
  const material=await insertId(db,"insert into bomedia.materials(name,width_ft,selling_price_per_sqft_kobo) values ('Flex',10,15000) returning id");
  const roll=await insertId(db,"insert into bomedia.inventory_rolls(material_id,item_name,width_ft,total_length_ft,remaining_length_ft,purchase_cost_kobo,selling_price_kobo) values ($1,'Flex Roll',10,100,100,1000000,15000) returning id",[material]);
  await db.query('update bomedia.materials set active_roll_id=$1 where id=$2',[roll,material]);
  await db.query("select bomedia.post_journal('inventory-fixture',$1::jsonb)",[JSON.stringify({actor_id:staff,business_date:'2026-10-01',kind:'adjustment',memo:'Inventory',
    lines:[{account_code:'1200',debit_kobo:'1000000'},{account_code:'3000',credit_kobo:'1000000'}]})]);
  await db.exec('set local role bomedia_financial_runtime');
  const sell=async(key:string,cust:string,price:string)=>(await db.query<{r:{job_ids:string[]}}>('select bomedia.post_tracked_sale($1,$2::jsonb) as r',[key,JSON.stringify({actor_id:staff,customer_id:cust,
    business_date:'2026-10-02',jobs:[{material_id:material,description:'Banner',quantity:'1',width_ft:'2',height_ft:'2',expected_unit_price_kobo:price}]})])).rows[0].r.job_ids[0];
  await db.exec('reset role');
  jobA=await sell('a',customer,'60000');jobB=await sell('b',customer,'60000');
  await sell('c',other,'60000');
  seqB=(await db.query<{s:string}>('select collection_sequence::text as s from bomedia.jobs where id=$1',[jobB])).rows[0].s;
  await db.exec('set local role bomedia_financial_runtime');
});
afterEach(async()=>{await db.exec('rollback');});

it('applies one lump sum across a customer’s jobs, oldest first, once',async()=>{
  const first=await collect('p1',{job_refs:[jobA,seqB],amount_kobo:'90000',notes:'Auto-distributed lump sum'});
  expect(await owned("select method,amount_kobo::text as a from bomedia.payments")).toEqual([{method:'Transfer',a:'90000'}]);
  expect(await owned(`select balance_kobo::text as b from bomedia.job_balances where job_id in ('${jobA}','${jobB}') order by balance_kobo`))
    .toEqual([{b:'0'},{b:'30000'}]);
  expect(await collect('p1',{job_refs:[jobA,seqB],amount_kobo:'90000',notes:'Auto-distributed lump sum'})).toEqual(first);
  expect(await owned('select count(*)::text as n from bomedia.payments')).toEqual([{n:'1'}]);
});
it('refuses jobs of two customers, unknown jobs and a missing method',async()=>{
  const otherJob=(await owned("select j.id from bomedia.jobs j join bomedia.customers c on c.id=j.customer_id where c.display_name='Adeola Stores'"))[0].id;
  await failure(()=>collect('x1',{job_refs:[jobA,otherJob],amount_kobo:'100'}),'22023');
  await failure(()=>collect('x2',{job_refs:['S-404'],amount_kobo:'100'}),'P0002');
  await failure(()=>collect('x3',{job_refs:[jobA],amount_kobo:'100',method:null}),'22023');
});

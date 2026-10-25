import type { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { testDatabase, insertId } from './helpers';
import { createFinancialService, type FinancialPage } from '../../lib/server/financial-service';
import type { FinancialCall, FinancialMethod } from '../../lib/server/financial-db';
let db: PGlite, actor: string, customer: string, job: string;
const call: FinancialCall = async <T>(method: FinancialMethod,key: string,payload: Record<string,unknown>): Promise<T> =>
  (await db.query<{result:T}>(method==='api_payment_methods' ? 'select bomedia.api_payment_methods() as result' : `select bomedia.${method}($1,$2::jsonb) as result`,method==='api_payment_methods' ? [] : [key,JSON.stringify(payload)])).rows[0].result;
const service=createFinancialService(call);
beforeAll(async()=>{db=await testDatabase();},30_000);
afterAll(async()=>{await db?.close();});
beforeEach(async()=>{
  await db.exec('begin');
  actor=await insertId(db,"insert into bomedia.staff(display_name,login_name) values ('Collector','collector') returning id");
  customer=await insertId(db,"insert into bomedia.customers(display_name) values ('Customer') returning id");
  const order=await insertId(db,'insert into bomedia.orders(customer_id) values ($1) returning id',[customer]);
  job=await insertId(db,"insert into bomedia.jobs(order_id,customer_id,description,quantity,unit_price_kobo,amount_kobo,job_status,business_date) values ($1,$2,'Banner',1,17344999,17344999,'Pending','2026-10-05') returning id",[order,customer]);
  await db.exec("insert into bomedia.bookkeeping_settings(starts_on,state) values ('2026-10-05','active')");
  await db.query("select bomedia.post_journal('fixture',$1::jsonb)",[JSON.stringify({actor_id:actor,kind:'sale',memo:'Sale fixture',business_date:'2026-10-05',source_type:'job',source_id:job,
    lines:[{account_code:'1100',debit_kobo:'17344999',customer_id:customer,job_id:job},{account_code:'4000',credit_kobo:'17344999'}]})]);
  await db.exec('set local role bomedia_financial_runtime');
});
afterEach(async()=>{await db.exec('rollback');});
const payment=(extra={})=>({requestId:'collection-1',customerId:customer,jobIds:[job],amountKobo:'17300000',method:'cash',cashAccountCode:'1000',businessDate:'2026-10-05',...extra});
async function savepointFailure(work:()=>Promise<unknown>,match: object) {
  await db.exec('savepoint bad'); await expect(work()).rejects.toMatchObject(match); await db.exec('rollback to savepoint bad');
}
it('records receipt and ledger through the restricted capability and keeps the exact shortfall',async()=>{
  const result=await service.collect({staffId:actor},payment());
  expect(result.amount_kobo).toBe('17300000');expect(result.journal_entry_id).toBeTruthy();
  expect(await service.collect({staffId:actor},payment())).toEqual(result);
  const jobs=await service.read('jobs',{customer_id:customer});
  expect(jobs.data[0].balance_kobo).toBe('44999');
  expect((await service.read('payments',{})).data).toHaveLength(1);
  await service.collect({staffId:actor},payment({requestId:'collection-2',amountKobo:'44998'}));
  expect((await service.read('jobs',{})).data[0].balance_kobo).toBe('1');
});
it('rejects excess, wrong customer, changed retry payload and closed books without another receipt',async()=>{
  await savepointFailure(()=>service.collect({staffId:actor},payment({amountKobo:'17345000'})),{status:409});
  await savepointFailure(()=>service.collect({staffId:actor},payment({customerId:'00000000-0000-4000-8000-000000000001'})),{status:409});
  await service.collect({staffId:actor},payment());
  await savepointFailure(()=>service.collect({staffId:actor},payment({amountKobo:'1'})),{status:409});
  await db.exec("reset role; update bomedia.bookkeeping_settings set closed_through='2026-10-05'; set local role bomedia_financial_runtime");
  await savepointFailure(()=>service.collect({staffId:actor},payment({requestId:'closed',amountKobo:'1'})),{status:409});
  expect((await service.read('payments',{})).data).toHaveLength(1);
});
it('refuses disabled actors even on replay',async()=>{
  await service.collect({staffId:actor},payment());
  await db.exec('reset role'); await db.query('update bomedia.staff set disabled_at=now() where id=$1',[actor]); await db.exec('set local role bomedia_financial_runtime');
  await savepointFailure(()=>service.collect({staffId:actor},payment()),{status:403});
});
it('rejects client actor spoofing, decimal money, duplicate IDs, legacy row indices and invalid dates before SQL',async()=>{
  for (const extra of [{actor_id:actor},{amountKobo:17300000},{amountKobo:'1.5'},{amountKobo:'9223372036854775808'},
    {jobIds:[job,job.toUpperCase()]},{rowIndex:2},{businessDate:'2026-02-30'}]) {
    await expect(service.collect({staffId:actor},payment(extra))).rejects.toMatchObject({status:400});
  }
  expect((await service.read('payments',{})).data).toHaveLength(0);
});
it('denies direct private tables, generic journals, old payment primitives and all auth capabilities',async()=>{
  for (const sql of ['select * from bomedia.staff','select * from bomedia.payments',"select bomedia.post_journal('bad','{}')",
    "select bomedia.record_payment('bad','{}')",'select bomedia.auth_list_staff()',"update bomedia.access_settings set single_session=false"]) {
    await savepointFailure(()=>db.query(sql),{code:'42501'});
  }
});
it('paginates stable UUIDs without losing rows and never joins customers by display name',async()=>{
  await db.exec("reset role; insert into bomedia.customers(display_name) select 'Customer' from generate_series(1,3); set local role bomedia_financial_runtime");
  const seen=new Set<string>(); let cursor: string|null=null;
  do {
    const page: FinancialPage=await service.read('customers',{limit:2,...(cursor ? {after_id:cursor} : {})});
    for(const row of page.data) {expect(seen.has(String(row.id))).toBe(false);seen.add(String(row.id));}
    cursor=page.next_after_id;
  } while(cursor);
  expect(seen.size).toBe(4);
  await expect(service.read('staff',{})).rejects.toMatchObject({status:400});
  await expect(service.read('jobs',{limit:501})).rejects.toMatchObject({status:400});
});
it.each(['anon','authenticated','service_role','bomedia_auth_runtime'])('denies financial capabilities to %s',async role=>{
  const rows=await db.query<{permitted:boolean}>("select has_function_privilege($1,'bomedia.api_collect(text,jsonb)','EXECUTE') or has_function_privilege($1,'bomedia.api_read(text,jsonb)','EXECUTE') as permitted",[role]);
  expect(rows.rows[0].permitted).toBe(false);
});
it('reads operational records with stable IDs and exact money without exposing staging or credentials',async()=>{
  await db.exec('reset role');
  const material=await insertId(db,"insert into bomedia.materials(name,width_ft,selling_price_per_sqft_kobo) values ('Banner',4,15000) returning id");
  await db.query("insert into bomedia.inventory_rolls(material_id,item_name,width_ft,total_length_ft,remaining_length_ft,cost_per_sqft_kobo_exact) values ($1,'Roll',4,100,55.125,312.123456)",[material]);
  await db.exec("insert into bomedia.expenses(amount_kobo,category,status) values (9007199254740993,'Printing','Paid'); insert into bomedia.estimates(cart_data,client_name_snapshot) values ('[]','Customer'); set local role bomedia_financial_runtime");
  const expense=(await service.read('expenses',{})).data[0];expect(expense.amount_kobo).toBe('9007199254740993');expect(expense).not.toHaveProperty('source_row_id');
  expect((await service.read('materials',{})).data[0].remaining_length_ft).toBe('55.125000');
  expect(Number((await service.read('inventory',{})).data[0].cost_per_sqft_kobo_exact)).toBe(312.123456);
  expect((await service.read('estimates',{})).data[0].cart_data).toEqual([]);
});
it('reports posted period profit separately from cash receipts and does not count allocations as extra receipts',async()=>{
  await service.collect({staffId:actor},payment());
  const [{result}]=(await db.query<{result:{period_profit_kobo:string;receipts_kobo:string;accounts:Record<string,string>[]}}>("select bomedia.api_report('2026-10-05','2026-10-05') as result")).rows;
  expect(result.period_profit_kobo).toBe('17344999');expect(result.receipts_kobo).toBe('17300000');
  const ar=result.accounts.find(a=>a.code==='1100')!;
  expect(BigInt(ar.debit_kobo)-BigInt(ar.credit_kobo)).toBe(BigInt('44999'));
  await savepointFailure(()=>db.query("select bomedia.api_report('2026-10-06','2026-10-05')"),{code:'22023'});
});

it.each([['cash','1000','Cash'],['transfer','1010','Transfer'],['pos','1020','POS']])('posts %s to its configured destination without asking the cashier for account codes',async(method,code,label)=>{
  const body=payment({method,cashAccountCode:undefined});
  const receipt=await service.collect({staffId:actor},body);
  expect(await service.collect({staffId:actor},body)).toEqual(receipt);
  expect((await service.read('payments',{})).data[0].method).toBe(label);
  const report=(await db.query<{result:{accounts:Record<string,string>[]}}>("select bomedia.api_report('2026-10-05','2026-10-05') as result")).rows[0].result;
  expect(report.accounts.find(a=>a.code===code)?.debit_kobo).toBe('17300000');
});
it('requires a recognized method and rejects mismatched or disabled destinations without recording receipts',async()=>{
  for(const method of [undefined,'','cheque'])await expect(service.collect({staffId:actor},payment({method}))).rejects.toMatchObject({status:400});
  await savepointFailure(()=>service.collect({staffId:actor},payment({method:'pos'})),{status:409});
  await savepointFailure(()=>call('api_collect','missing',{actor_id:actor,customer_id:customer,job_ids:[job],amount_kobo:'1',business_date:'2026-10-05'}),{code:'22023'});
  await db.exec("reset role; update bomedia.payment_methods set enabled=false where method='pos'; set local role bomedia_financial_runtime");
  await savepointFailure(()=>service.collect({staffId:actor},payment({method:'pos',cashAccountCode:undefined})),{status:409});
  expect((await service.read('payments',{})).data).toHaveLength(0);
  expect(await service.read('payment_methods',{})).toEqual({data:[{method:'cash',label:'Cash'},{method:'transfer',label:'Transfer'}],next_after_id:null});
  await expect(service.read('payment_methods',{limit:2})).rejects.toMatchObject({status:400});
});
it('prevents the runtime from bypassing method selection or changing method mappings',async()=>{
  for(const sql of ["select bomedia.post_tracked_sale('bad','{}')","select bomedia.resolve_payment_method('cash')","update bomedia.payment_methods set account_code='1000' where method='pos'"]) {
    await savepointFailure(()=>db.query(sql),{code:'42501'});
  }
});

it('holds a saved collection when the signed-in staff identity has changed',async()=>{
  await expect(service.collect({staffId:actor},payment({expectedStaffId:'00000000-0000-4000-8000-000000000001'}))).rejects.toMatchObject({status:403,code:'ACTOR_CHANGED'});
  expect((await service.read('payments',{})).data).toHaveLength(0);
});

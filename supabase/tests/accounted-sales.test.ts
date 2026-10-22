import type { PGlite } from '@electric-sql/pglite';
import { afterAll,afterEach,beforeAll,beforeEach,expect,it } from 'vitest';
import { testDatabase,insertId } from './helpers';
import { createFinancialService } from '../../lib/server/financial-service';
import { createSalesService } from '../../lib/server/sales-service';
import type { FinancialCall,FinancialMethod } from '../../lib/server/financial-db';
let db:PGlite,actor:string,customer:string,material:string,roll:string;
const call:FinancialCall=async<T>(method:FinancialMethod,key:string,payload:Record<string,unknown>):Promise<T>=>
  (await db.query<{result:T}>(method==='api_payment_methods' ? 'select bomedia.api_payment_methods() as result' : `select bomedia.${method}($1,$2::jsonb) as result`,method==='api_payment_methods' ? [] : [key,JSON.stringify(payload)])).rows[0].result;
const service=createSalesService(call);
beforeAll(async()=>{db=await testDatabase();},30_000);
afterAll(async()=>{await db?.close();});
beforeEach(async()=>{
  await db.exec('begin');
  actor=await insertId(db,"insert into bomedia.staff(display_name,login_name) values ('Collector','collector') returning id");
  customer=await insertId(db,"insert into bomedia.customers(display_name,contact) values ('Customer','Contact') returning id");
  material=await insertId(db,"insert into bomedia.materials(name,width_ft,selling_price_per_sqft_kobo) values ('Banner',4,10000) returning id");
  roll=await insertId(db,"insert into bomedia.inventory_rolls(material_id,item_name,width_ft,total_length_ft,remaining_length_ft,purchase_cost_kobo,selling_price_kobo) values ($1,'Roll',4,100,100,10000,10000) returning id",[material]);
  await db.query('update bomedia.materials set active_roll_id=$1 where id=$2',[roll,material]);
  await db.exec("insert into bomedia.bookkeeping_settings(starts_on,state) values ('2026-10-05','active')");
  await db.query("select bomedia.post_journal('inventory-fixture',$1::jsonb)",[JSON.stringify({actor_id:actor,business_date:'2026-10-05',kind:'adjustment',memo:'Test inventory capital',
    lines:[{account_code:'1200',debit_kobo:'10000'},{account_code:'3000',credit_kobo:'10000'}]})]);
  await db.exec('set local role bomedia_financial_runtime');
});
afterEach(async()=>{await db.exec('rollback');});
const item=(extra={})=>({materialId:material,description:'Banner',quantity:'3',widthFt:'2',heightFt:'3',expectedUnitPriceKobo:'60000',...extra});
const sale=(extra={})=>({requestId:'sale-1',customerId:customer,businessDate:'2026-10-05',jobs:[item()],initialPaymentKobo:'173000',paymentMethod:'cash',cashAccountCode:'1000',...extra});
async function failure(work:()=>Promise<unknown>,match:object) {
  await db.exec('savepoint rejected');await expect(work()).rejects.toMatchObject(match);await db.exec('rollback to savepoint rejected');
}
async function read(resource:string) {return (await db.query<{result:{data:Record<string,unknown>[]}}>('select bomedia.api_read($1,\'{}\') as result',[resource])).rows[0].result.data;}
it('posts a priced/tiled sale, stock cost, invoice and initial receipt together with exact debt',async()=>{
  const result=await service.sale({staffId:actor},sale());
  expect(result.total_kobo).toBe('180000');expect(result.job_ids).toHaveLength(1);expect(result.journal_entry_ids).toHaveLength(1);
  expect(await service.sale({staffId:actor},sale())).toEqual(result);
  expect((await read('inventory'))[0].remaining_length_ft).toBe('94.000000');
  expect((await read('jobs'))[0]).toMatchObject({amount_kobo:'180000',balance_kobo:'7000',customer_name:'Customer'});
  expect(await read('payments')).toHaveLength(1);
  const report=(await db.query<{result:{period_profit_kobo:string;receipts_kobo:string}}>("select bomedia.api_report('2026-10-05','2026-10-05') as result")).rows[0].result;
  expect(report).toMatchObject({period_profit_kobo:'179400',receipts_kobo:'173000'});
});
it('rolls back all sale/stock/journal writes when the initial receipt account is invalid',async()=>{
  await failure(()=>service.sale({staffId:actor},sale({cashAccountCode:'4000'})),{status:409});
  expect(await read('jobs')).toHaveLength(0);expect(await read('payments')).toHaveLength(0);
  expect((await read('inventory'))[0].remaining_length_ft).toBe('100.000000');
  await db.exec('reset role');expect((await db.query("select * from bomedia.idempotency_requests where operation='api_sale' or operation='sale'")).rows).toHaveLength(0);
});
it('refuses stale quotes, excess receipt, impossible dimensions and insufficient stock without consuming anything',async()=>{
  for(const body of [sale({jobs:[item({expectedUnitPriceKobo:'1'})]}),sale({initialPaymentKobo:'180001'}),
    sale({jobs:[item({widthFt:'5',heightFt:'6',expectedUnitPriceKobo:'300000'})]}),sale({jobs:[item({quantity:'10000'})]})]) {
    await failure(()=>service.sale({staffId:actor},body),{status:409});
  }
  expect(await read('jobs')).toHaveLength(0);expect((await read('inventory'))[0].remaining_length_ft).toBe('100.000000');
});
it('allocates multiple jobs against a shared roll without independently reusing the same stock',async()=>{
  const jobs=[item({quantity:'30',widthFt:'4',heightFt:'2',expectedUnitPriceKobo:'80000'}),item({quantity:'30',widthFt:'4',heightFt:'2',expectedUnitPriceKobo:'80000'})];
  // Each needs 60ft; together 120ft must fail against 100ft.
  await failure(()=>service.sale({staffId:actor},sale({jobs,initialPaymentKobo:'0'})),{status:409});
  expect(await read('jobs')).toHaveLength(0);expect((await read('inventory'))[0].remaining_length_ft).toBe('100.000000');
});
it('preserves per-roll costing to the last kobo over partial then complete consumption',async()=>{
  await db.exec('reset role');await db.query('update bomedia.inventory_rolls set total_length_ft=3,remaining_length_ft=3,purchase_cost_kobo=100 where id=$1',[roll]);await db.exec('set local role bomedia_financial_runtime');
  const job=item({quantity:'1',widthFt:'4',heightFt:'1',expectedUnitPriceKobo:'40000'});
  for(let i=0;i<3;i++)await service.sale({staffId:actor},sale({requestId:`small-${i}`,jobs:[job],initialPaymentKobo:'0'}));
  await db.exec('reset role');
  expect((await db.query<{cost:string}>("select sum(debit_kobo)::text as cost from bomedia.journal_lines where account_code='5000'")).rows[0].cost).toBe('100');
  expect((await db.query<{active_roll_id:string|null}>('select active_roll_id from bomedia.materials')).rows[0].active_roll_id).toBeNull();
});
it('requires reconciled inventory value and configured roll cost',async()=>{
  await db.exec('reset role');await db.query('update bomedia.inventory_rolls set purchase_cost_kobo=null where id=$1',[roll]);await db.exec('set local role bomedia_financial_runtime');
  await failure(()=>service.sale({staffId:actor},sale()),{status:409});
  await db.exec('reset role');await db.query('update bomedia.inventory_rolls set purchase_cost_kobo=100000000 where id=$1',[roll]);await db.exec('set local role bomedia_financial_runtime');
  await failure(()=>service.sale({staffId:actor},sale()),{status:409});
});
it('creates separate identities for matching names and replays explicit creation once',async()=>{
  const body={requestId:'customer-1',name:'Customer'};
  const created=await service.customer({staffId:actor},body);
  expect(created.customer_id).not.toBe(customer);expect(await service.customer({staffId:actor},body)).toEqual(created);
  expect(await read('customers')).toHaveLength(2);
});
it('rejects actor spoofing and client-selected prices/stock arrays before reaching SQL',async()=>{
  for(const body of [sale({actorId:actor}),sale({jobs:[item({stock:[]})]}),sale({jobs:[item({quantity:'0.5'})]}),sale({businessDate:'2026-02-30'})]) {
    await expect(service.sale({staffId:actor},body)).rejects.toMatchObject({status:400});
  }
});
it.each(['anon','authenticated','service_role','bomedia_auth_runtime'])('denies new sale/customer capabilities to %s',async role=>{
  expect((await db.query<{granted:boolean}>("select has_function_privilege($1,'bomedia.api_sale(text,jsonb)','EXECUTE') or has_function_privilege($1,'bomedia.api_customer(text,jsonb)','EXECUTE') as granted",[role])).rows[0].granted).toBe(false);
});

it('keeps public collection request keys separate from automatic initial-payment keys',async()=>{
  const invoice=await service.sale({staffId:actor},sale({initialPaymentKobo:'10000',paymentMethod:'Cash'}));
  const initial=invoice.initial_payment as {payment_id:string};
  const payments=createFinancialService(call);
  const body={requestId:`sale-receipt/${invoice.order_id}`,customerId:customer,jobIds:invoice.job_ids,
    amountKobo:'10000',cashAccountCode:'1000',businessDate:'2026-10-05',method:'Cash'};
  const collected=await payments.collect({staffId:actor},body);
  expect(collected.payment_id).not.toBe(initial.payment_id);
  expect(await payments.collect({staffId:actor},body)).toEqual(collected);
  expect(await read('payments')).toHaveLength(2);
  expect((await read('jobs'))[0].balance_kobo).toBe('160000');
});

it.each([['cash','1000','Cash'],['transfer','1010','Transfer'],['pos','1020','POS']])('records an initial %s payment with its method and journal destination',async(method,code,label)=>{
  const body=sale({paymentMethod:method,cashAccountCode:undefined});
  const receipt=await service.sale({staffId:actor},body);
  expect(await service.sale({staffId:actor},body)).toEqual(receipt);
  expect((await read('payments'))[0].method).toBe(label);
  const report=(await db.query<{result:{accounts:Record<string,string>[]}}>("select bomedia.api_report('2026-10-05','2026-10-05') as result")).rows[0].result;
  expect(report.accounts.find(a=>a.code===code)?.debit_kobo).toBe('173000');
});
it('requires a method only when money is received and never defaults an actual payment to cash',async()=>{
  for(const paymentMethod of [undefined,'','cheque'])await expect(service.sale({staffId:actor},sale({paymentMethod}))).rejects.toMatchObject({status:400});
  const result=await service.sale({staffId:actor},sale({initialPaymentKobo:'0',paymentMethod:undefined,cashAccountCode:undefined}));
  expect(result.total_kobo).toBe('180000');expect(await read('payments')).toHaveLength(0);
});

it('holds saved sales and customer creation when a different staff member is signed in',async()=>{
  const expectedStaffId='00000000-0000-4000-8000-000000000001';
  await expect(service.sale({staffId:actor},sale({expectedStaffId}))).rejects.toMatchObject({status:403,code:'ACTOR_CHANGED'});
  await expect(service.customer({staffId:actor},{requestId:'customer',name:'Customer',expectedStaffId})).rejects.toMatchObject({status:403,code:'ACTOR_CHANGED'});
  expect(await read('jobs')).toHaveLength(0);expect(await read('customers')).toHaveLength(1);
});

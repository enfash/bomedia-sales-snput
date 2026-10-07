import type { PGlite } from '@electric-sql/pglite';
import { afterAll,afterEach,beforeAll,beforeEach,expect,it } from 'vitest';
import { testDatabase,insertId } from './helpers';
import { createSalesService } from '../../lib/server/sales-service';
import { createFinancialService } from '../../lib/server/financial-service';
import { createExpenseService } from '../../lib/server/expense-service';
import type { FinancialCall } from '../../lib/server/financial-db';
let db:PGlite,staff:string,customer:string,material:string;
const call:FinancialCall=async<T>(method:string,key:string,payload:Record<string,unknown>):Promise<T>=>{
  if(method==='api_legacy_feed')return (await db.query<{result:T}>('select bomedia.api_legacy_feed($1) as result',[key])).rows[0].result;
  if(method==='api_expense_categories')return (await db.query<{result:T}>('select bomedia.api_expense_categories() as result')).rows[0].result;
  return (await db.query<{result:T}>(`select bomedia.${method}($1,$2::jsonb) as result`,[key,JSON.stringify(payload)])).rows[0].result;
};
const sales=createSalesService(call),money=createFinancialService(call),expenses=createExpenseService(call);
const feed=async(resource:string)=>(await call<Record<string,string>[]>('api_legacy_feed',resource,{}));
beforeAll(async()=>{db=await testDatabase();},30_000);
afterAll(async()=>{await db?.close();});
beforeEach(async()=>{
  await db.exec('begin');
  staff=await insertId(db,"insert into bomedia.staff(display_name,login_name) values ('Ada','ada') returning id");
  customer=await insertId(db,"insert into bomedia.customers(display_name,contact) values ('Grace Chapel','0803') returning id");
  material=await insertId(db,"insert into bomedia.materials(name,width_ft,selling_price_per_sqft_kobo,low_stock_threshold_ft) values ('Flex',10,15000,50) returning id");
  const roll=await insertId(db,"insert into bomedia.inventory_rolls(material_id,item_name,width_ft,total_length_ft,remaining_length_ft,purchase_cost_kobo,selling_price_kobo) values ($1,'Flex 10ft - Roll 001',10,100,100,4000000,15000) returning id",[material]);
  await db.query('update bomedia.materials set active_roll_id=$1 where id=$2',[roll,material]);
  await db.exec("insert into bomedia.bookkeeping_settings(starts_on,state) values ('2026-10-01','active')");
  await db.query("select bomedia.post_journal('inventory-fixture',$1::jsonb)",[JSON.stringify({actor_id:staff,business_date:'2026-10-01',kind:'adjustment',memo:'Inventory',
    lines:[{account_code:'1200',debit_kobo:'4000000'},{account_code:'3000',credit_kobo:'4000000'}]})]);
  await db.exec('set local role bomedia_financial_runtime');
});
afterEach(async()=>{await db.exec('rollback');});

it('serves jobs as old Sales rows: same-day money is the initial payment, later money is additional',async()=>{
  const sale=await sales.sale({staffId:staff},{requestId:'sale',customerId:customer,businessDate:'2026-10-05',initialPaymentKobo:'960000',paymentMethod:'Cash',
    jobs:[{materialId:material,description:'Church banner',quantity:'2',widthFt:'8',heightFt:'4',expectedUnitPriceKobo:'480000'}]});
  let [row]=await feed('sales');
  expect(row).toMatchObject({DATE:'2026-10-05','CLIENT NAME':'Grace Chapel',CONTACT:'0803','JOB DESCRIPTION':'Church banner',MATERIAL:'Flex',
    custom:'8x4',QTY:'2','UNIT COST (₦)':'4800','AMOUNT (₦)':'9600','INITIAL PAYMENT (₦)':'9600','ADDITIONAL PAYMENT 1':'',
    'AMOUNT DIFFERENCES':'0','PAYMENT STATUS':'Paid','Logged By':'Ada','Sales ID':sale.job_ids[0],'TRANSACTION ID':sale.order_id,_jobId:sale.job_ids[0],_customerId:customer});
  expect(await feed('payments')).toEqual([]);

  const second=await sales.sale({staffId:staff},{requestId:'sale2',customerId:customer,businessDate:'2026-10-05',
    jobs:[{materialId:material,description:'Stickers',quantity:'1',widthFt:'2',heightFt:'2',expectedUnitPriceKobo:'60000'}]});
  row=(await feed('sales'))[1];
  expect(row).toMatchObject({'AMOUNT (₦)':'600','INITIAL PAYMENT (₦)':'0','AMOUNT DIFFERENCES':'600','PAYMENT STATUS':'Unpaid'});
  await money.collect({staffId:staff},{requestId:'later',customerId:customer,jobIds:second.job_ids,amountKobo:'25050',businessDate:'2026-10-06',method:'Transfer'});
  row=(await feed('sales'))[1];
  expect(row).toMatchObject({'INITIAL PAYMENT (₦)':'0','ADDITIONAL PAYMENT 1':'250.5','AMOUNT DIFFERENCES':'349.5','PAYMENT STATUS':'Part-payment'});
  const payments=await feed('payments');
  expect(payments).toHaveLength(1);
  expect(payments[0]).toMatchObject({'SALES ID':second.job_ids[0],'CLIENT NAME':'Grace Chapel',DATE:'2026-10-06',AMOUNT:'250.5',
    'PAYMENT TYPE':'Settlement','COLLECTED BY':'Ada','PAYMENT METHOD':'Transfer'});
  // Every value is text, as Sheets returned it.
  for (const r of [...await feed('sales'),...payments]) for (const v of Object.values(r)) expect(typeof v).toBe('string');
});

it('serves rolls, materials and expenses in the old shapes',async()=>{
  await sales.sale({staffId:staff},{requestId:'sale',customerId:customer,businessDate:'2026-10-05',
    jobs:[{materialId:material,description:'Banner',quantity:'1',widthFt:'10',heightFt:'60',expectedUnitPriceKobo:'9000000'}]});
  const [roll]=await feed('inventory');
  expect(roll).toMatchObject({'Item Name':'Flex 10ft - Roll 001','Width (ft)':'10','Total Length (ft)':'100','Remaining Length (ft)':'40',
    Price:'150',Cost:'40000','Low Stock Threshold (ft)':'20',Status:'Active'});
  const [mat]=await feed('materials');
  expect(mat).toMatchObject({'Material Name':'Flex','Selling Price':'150','Total Remaining (ft)':'40','Total Capacity (ft)':'100',
    'Roll Count':'1',Status:'Low Stock','Total Spent':'40000','Total Remaining Asset Value':'16000',
    'Total Remaining Revenue':'60000','Total Realised Revenue':'90000'});
  await expenses.log({staffId:staff},{requestId:'fuel',businessDate:'2026-10-05',amountKobo:'250000',category:'Transport',status:'paid',
    description:'Delivery',paidTo:'Bolt',paymentMethod:'Cash'});
  const [expense]=await feed('expenses');
  expect(expense).toMatchObject({DATE:'2026-10-05',AMOUNT:'2500',CATEGORY:'Transport',DESCRIPTION:'Delivery','PAID TO':'Bolt','Logged By':'Ada'});
  await expect(feed('staff')).rejects.toMatchObject({code:'22023'});
});

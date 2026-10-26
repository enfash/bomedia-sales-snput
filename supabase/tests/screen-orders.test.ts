import type { PGlite } from '@electric-sql/pglite';
import { afterAll,afterEach,beforeAll,beforeEach,expect,it } from 'vitest';
import { testDatabase,insertId } from './helpers';
let db:PGlite,staff:string,material:string,service:string;
const print=()=>({kind:'print',ref:material,description:'Banner',quantity:'2',width:'8',height:'4',unit:'ft',priceKobo:'15000'});
const call=async(key:string,extra:Record<string,unknown>={})=>(await db.query<{result:Record<string,any>}>(
 'select bomedia.api_screen_order($1,$2::jsonb) as result',[key,JSON.stringify({actor_id:staff,operation:'sale',businessDate:'2026-10-08',clientName:'Grace Chapel',contact:'0803',jobStatus:'Printing',initialPaymentKobo:'500000',paymentMethod:'transfer',totalKobo:'960000',items:[print()],...extra})])).rows[0].result;
const owned=async(sql:string)=>{await db.exec('reset role');const rows=(await db.query<Record<string,string>>(sql)).rows;await db.exec('set local role bomedia_financial_runtime');return rows;};

it('records the screenshot amounts across five materials, with one full receipt and separate income that replays once',async()=>{
 const items=[];
 for (const width of [10,8,6,4,3]) {
  const [m]=await owned(`insert into bomedia.materials(name,width_ft,selling_price_per_sqft_kobo) values ('Synthetic Flex ${width}',${width},15116150) returning id::text`);
  await owned(`insert into bomedia.inventory_rolls(material_id,item_name,width_ft,total_length_ft,remaining_length_ft,purchase_cost_kobo,selling_price_kobo) values ('${m.id}','Synthetic roll',${width},100,100,0,15116150)`);
  items.push({...print(),ref:m.id,quantity:'1',width:'2',height:'2',priceKobo:'15116150'});
 }
 const payload={items,totalKobo:'302323000',initialPaymentKobo:'302400000'};
 const saved=await call('five-materials-extra',payload);
 expect(saved.job_ids).toHaveLength(5);
 expect(saved.initial_payment).toMatchObject({amount_kobo:'302400000',extra_income_kobo:'77000'});
 expect(await owned('select sum(amount_kobo)::text n from bomedia.payment_allocations')).toEqual([{n:'302323000'}]);
 expect(await owned('select sum(balance_kobo)::text n from bomedia.job_balances')).toEqual([{n:'0'}]);
 expect(await owned("select account_code,sum(debit_kobo-credit_kobo)::text n from bomedia.journal_lines where account_code in ('1010','1100','4020','2100') group by account_code order by account_code"))
   .toEqual([{account_code:'1010',n:'302400000'},{account_code:'1100',n:'0'},{account_code:'4020',n:'-77000'}]);
 const profile=(await db.query<{r:{payments:unknown[]}}>('select bomedia.api_customer_profile($1) r',[saved.customer_id])).rows[0].r;
 expect(profile.payments).toMatchObject([{amount_kobo:'302400000',extra_income_kobo:'77000'}]);
 const feed=(await db.query<{r:Record<string,string>[]}>('select bomedia.api_legacy_feed($1) r',['sales'])).rows[0].r;
 expect(feed.every(row=>Number(row['AMOUNT DIFFERENCES'])===0)).toBe(true);
 expect(feed.reduce((sum,row)=>sum+Number(row['EXTRA INCOME (₦)']),0)).toBe(770);
 const payments=(await db.query<{r:Record<string,string>[]}>('select bomedia.api_legacy_feed($1) r',['payments'])).rows[0].r;
 expect(payments).toMatchObject([{'PAYMENT TYPE':'Extra income',AMOUNT:'770',DATE:'2026-10-08'}]);
 const shift=(await db.query<{r:{payments:Record<string,string>[]}}>('select bomedia.api_shift_report($1,$2) r',['2026-10-08',JSON.stringify({actor_id:staff})])).rows[0].r;
 expect(shift.payments).toMatchObject([{_amountKobo:'302400000'}]);
 await owned('update bomedia.materials set selling_price_per_sqft_kobo=1');
 expect(await call('five-materials-extra',payload)).toEqual(saved);
 await failure(()=>call('five-materials-extra',{...payload,initialPaymentKobo:'302400001'}));
 expect(await owned('select count(*)::text n from bomedia.payments')).toEqual([{n:'1'}]);
 expect(await owned('select count(*)::text n from bomedia.payment_extra_income')).toEqual([{n:'1'}]);
});

it('rolls back sale, stock, payment and excess if the income account cannot be posted',async()=>{
 await owned("update bomedia.ledger_accounts set active=false where code='4020'");
 await db.exec('savepoint income_failure');
 await expect(call('income-failure',{initialPaymentKobo:'960001'})).rejects.toThrow();
 await db.exec('rollback to savepoint income_failure');
 expect(await owned('select count(*)::text n from bomedia.orders')).toEqual([{n:'0'}]);
 expect(await owned('select count(*)::text n from bomedia.payments')).toEqual([{n:'0'}]);
 expect(await owned('select count(*)::text n from bomedia.payment_extra_income')).toEqual([{n:'0'}]);
 expect(await owned('select remaining_length_ft::text n from bomedia.inventory_rolls')).toEqual([{n:'100.000000'}]);
});
async function failure(work:()=>Promise<unknown>,code='22023') {await db.exec('savepoint rejected');await expect(work()).rejects.toMatchObject({code});await db.exec('rollback to savepoint rejected');}
beforeAll(async()=>{db=await testDatabase();},30000);afterAll(async()=>{await db?.close();});
beforeEach(async()=>{
 await db.exec('begin');
 staff=await insertId(db,"insert into bomedia.staff(display_name,login_name) values ('Ada','ada') returning id");
 material=await insertId(db,"insert into bomedia.materials(legacy_material_id,name,width_ft,selling_price_per_sqft_kobo) values ('MAT-FLEX','Flex',10,15000) returning id");
 const roll=await insertId(db,"insert into bomedia.inventory_rolls(material_id,item_name,width_ft,total_length_ft,remaining_length_ft,purchase_cost_kobo,selling_price_kobo) values ($1,'Flex Roll',10,100,100,2000000,15000) returning id",[material]);
 await db.query('update bomedia.materials set active_roll_id=$1 where id=$2',[roll,material]);
 service=await insertId(db,"insert into bomedia.services(name,pricing,unit_price_kobo,visible) values ('Design','fixed',10000,true) returning id");
 await db.exec("insert into bomedia.bookkeeping_settings(starts_on,state) values ('2026-10-01','active')");
 await db.query("select bomedia.post_journal('inventory-fixture',$1::jsonb)",[JSON.stringify({actor_id:staff,business_date:'2026-10-01',kind:'adjustment',memo:'Inventory',lines:[{account_code:'1200',debit_kobo:'2000000'},{account_code:'3000',credit_kobo:'2000000'}]})]);
 await db.exec('set local role bomedia_financial_runtime');
});afterEach(async()=>{await db.exec('rollback');});
it('posts print and service items atomically, preserving receipts and stock on replay after catalog/status changes',async()=>{
 const payload={items:[print(),{kind:'service',ref:service,description:'Design',quantity:'1',priceKobo:'10000'}],totalKobo:'970000'};
 const result=await call('mixed',payload);
 expect(result).toMatchObject({total_kobo:'970000',initial_payment_kobo:'500000',business_date:'2026-10-08',sales_id:expect.stringMatching(/^BOM-/)});
 expect(result.job_ids).toHaveLength(2);expect(result.initial_payment.payment_id).toBeTruthy();
 await owned("update bomedia.materials set selling_price_per_sqft_kobo=16000");
 await owned("update bomedia.services set unit_price_kobo=11000");
 await owned("update bomedia.jobs set job_status='Ready'");
 expect(await call('mixed',payload)).toEqual(result);
 expect(await owned('select remaining_length_ft::text as n from bomedia.inventory_rolls')).toEqual([{n:'92.000000'}]);
 expect(await owned('select count(*)::text as n from bomedia.payments')).toEqual([{n:'1'}]);
 expect(await owned('select distinct job_status from bomedia.jobs')).toEqual([{job_status:'Ready'}]);
 const feed=(await db.query<{r:Record<string,string>[]}>('select bomedia.api_legacy_feed($1) as r',['sales'])).rows[0].r;
 expect(feed).toHaveLength(2);expect(feed.every(r=>r._jobId&&r['JOB STATUS']==='Ready')).toBe(true);
});
it('saves a quote with no stock/payment then converts it once and retains the quote/order link',async()=>{
 const quote=await call('quote',{operation:'quote',initialPaymentKobo:'0'});
 expect(quote.quote_number).toMatch(/^QT-\d{5,}$/);
 expect(await owned('select count(*)::text as n from bomedia.jobs')).toEqual([{n:'0'}]);
 const order=await call('converted',{quoteId:quote.estimate_id,customerId:quote.customer_id});
 expect(await call('converted',{quoteId:quote.estimate_id,customerId:quote.customer_id})).toEqual(order);
 await failure(()=>call('duplicate-conversion',{quoteId:quote.estimate_id,customerId:quote.customer_id}));
 expect(await owned('select estimate_id::text as id from bomedia.orders')).toEqual([{id:quote.estimate_id}]);
});
it('services consume no rolls; typed print prices are flagged',async()=>{
 await call('service',{items:[{kind:'service',ref:service,description:'Design',quantity:'2',priceKobo:'10000'}],totalKobo:'20000',initialPaymentKobo:'0'});
 expect(await owned('select remaining_length_ft::text as n from bomedia.inventory_rolls')).toEqual([{n:'100.000000'}]);
 await call('typed',{items:[{...print(),priceKobo:'12000'}],totalKobo:'768000',initialPaymentKobo:'0'});
 expect(await owned("select kind from bomedia.sale_reviews")).toEqual([{kind:'price'}]);
});
it('rejects changed totals, unapproved service prices and changed request bodies without partial writes',async()=>{
 await failure(()=>call('bad-total',{totalKobo:'960001'}));
 await failure(()=>call('bad-service',{items:[{kind:'service',ref:service,description:'Design',quantity:'1',priceKobo:'1'}],totalKobo:'1',initialPaymentKobo:'0'}));
 expect(await owned('select count(*)::text as n from bomedia.orders')).toEqual([{n:'0'}]);
 await call('stable');await failure(()=>call('stable',{initialPaymentKobo:'0'}));
});
it('does not merge historical customers that share a name',async()=>{
 await owned("insert into bomedia.customers(display_name) values ('Grace Chapel'),('grace chapel')");
 await failure(()=>call('ambiguous'));
 const customers=await owned('select id::text as id from bomedia.customers order by id');
 const result=await call('selected',{customerId:customers[1].id});expect(result.customer_id).toBe(customers[1].id);
});
it('records free catalog services with no receipt, stock movement or zero-value journal; mixed orders still bill print normally',async()=>{
 await db.query('select bomedia.api_service_save($1,$2)',['free-catalog',JSON.stringify({actor_id:staff,service_id:service,name:'Free design',pricing:'fixed',unit_price_kobo:'0',visible:true})]);
 const free={kind:'service',ref:service,description:'Included design',quantity:'1',priceKobo:'0'};
 const payload={items:[free],totalKobo:'0',initialPaymentKobo:'0'};
 const result=await call('free-only',payload);expect(result.total_kobo).toBe('0');expect(result.initial_payment).toBeNull();expect(result.journal_entry_ids).toEqual([]);
 expect(await call('free-only',payload)).toEqual(result);
 expect(await owned('select amount_kobo::text as n from bomedia.jobs')).toEqual([{n:'0'}]);
 expect(await owned("select count(*)::text as n from bomedia.journal_entries where kind='sale'")).toEqual([{n:'0'}]);
 expect(await owned('select count(*)::text as n from bomedia.payments')).toEqual([{n:'0'}]);
 expect(await owned('select remaining_length_ft::text as n from bomedia.inventory_rolls')).toEqual([{n:'100.000000'}]);
 const mixed=await call('free-and-print',{items:[free,print()],totalKobo:'960000'});
 expect(mixed.job_ids).toHaveLength(2);expect(mixed.journal_entry_ids).toHaveLength(1);expect(mixed.initial_payment.payment_id).toBeTruthy();
 expect((await call('free-extra-income',{...payload,initialPaymentKobo:'1'})).initial_payment.extra_income_kobo).toBe('1');
 await failure(()=>call('free-print',{items:[{...print(),priceKobo:'0'}],totalKobo:'0',initialPaymentKobo:'0'}));
 await owned('update bomedia.services set visible=false');
 await failure(()=>call('hidden-free',payload));
});
it('keeps quote numbers unique beyond 99,999 and rejects disabled staff',async()=>{
 await owned("select setval('bomedia.quote_number_seq',99999)");
 const first=await call('number-1',{operation:'quote',initialPaymentKobo:'0'});
 const second=await call('number-2',{operation:'quote',initialPaymentKobo:'0'});
 expect(first.quote_number).toBe('QT-100000');expect(second.quote_number).toBe('QT-100001');
 await owned('update bomedia.staff set disabled_at=now()');
 await failure(()=>call('disabled'),'42501');
});
it('a failed later stock item rolls back the earlier job, payment and stock movement',async()=>{
 await failure(()=>call('late-failure',{items:[print(),{...print(),width:'20',height:'20'}],totalKobo:'12960000'}));
 expect(await owned('select count(*)::text as n from bomedia.jobs')).toEqual([{n:'0'}]);
 expect(await owned('select count(*)::text as n from bomedia.payments')).toEqual([{n:'0'}]);
 expect(await owned('select remaining_length_ft::text as n from bomedia.inventory_rolls')).toEqual([{n:'100.000000'}]);
});
it('requires an approved per-job service quote and consumes its approval once without any roll movement',async()=>{
 await owned("update bomedia.services set pricing='per_job',unit_price_kobo=null");
 const customer=(await owned("insert into bomedia.customers(display_name) values ('Grace Chapel') returning id::text"))[0].id;
 const quote=(await db.query<{r:Record<string,any>}>('select bomedia.api_quote($1,$2) r',['service-quote',JSON.stringify({actor_id:staff,customer_id:customer,business_date:'2026-10-08',items:[{service_id:service,description:'Installation',quantity:'1'}],price_requests:[{item_index:0,requested_unit_price_kobo:'50000',reason:'Site installation'}]})])).rows[0].r;
 const pr=(await owned('select id::text from bomedia.price_requests'))[0].id;
 const fields={quoteId:quote.estimate_id,customerId:customer,items:[{kind:'service',ref:service,description:'Installation',quantity:'1',priceKobo:'50000',priceRequestId:pr,approvedUnitKobo:'50000'}],totalKobo:'50000',initialPaymentKobo:'0'};
 await failure(()=>call('unapproved',fields));
 await db.query('select bomedia.api_price_decision($1,$2)',['approve-service',JSON.stringify({actor_id:staff,price_request_id:pr,decision:'approve'})]);
 const saved=await call('approved',fields);expect(await call('approved',fields)).toEqual(saved);
 expect(await owned('select status from bomedia.price_requests')).toEqual([{status:'used'}]);
 expect(await owned('select remaining_length_ft::text as n from bomedia.inventory_rolls')).toEqual([{n:'100.000000'}]);
});

it('records an exact staff-entered service charge without price approval or stock, with stable replay',async()=>{
 await owned("update bomedia.services set pricing='variable',unit_price_kobo=null");
 await owned("update bomedia.approval_rules set enabled=true where kind='price'");
 const item={kind:'service',ref:service,description:'Delivery to Ikeja',quantity:'2',priceKobo:'150025'};
 const payload={items:[item],totalKobo:'300050',initialPaymentKobo:'300050',paymentMethod:'cash'};
 const result=await call('delivery',payload);
 expect(result).toMatchObject({total_kobo:'300050',initial_payment_kobo:'300050'});
 expect(result.job_ids).toHaveLength(1);
 expect(await owned('select amount_kobo::text as n from bomedia.jobs')).toEqual([{n:'300050'}]);
 expect(await owned('select count(*)::text as n from bomedia.approval_requests')).toEqual([{n:'0'}]);
 expect(await owned('select remaining_length_ft::text as n from bomedia.inventory_rolls')).toEqual([{n:'100.000000'}]);
 expect(await owned("select sum(debit_kobo-credit_kobo)::text as n from bomedia.journal_lines where account_code='1000'")).toEqual([{n:'300050'}]);
 // A lost acknowledgement returns the original order even if the owner then changes the service.
 await owned("update bomedia.services set pricing='fixed',unit_price_kobo=99900,visible=false");
 expect(await call('delivery',payload)).toEqual(result);
 await failure(()=>call('delivery',{...payload,items:[{...item,priceKobo:'150026'}],totalKobo:'300052'}));
 expect(await owned('select count(*)::text as n from bomedia.payments')).toEqual([{n:'1'}]);
});

it('refuses invalid typed service charges and stale permission, preserving fixed and approval-only prices',async()=>{
 await owned("update bomedia.services set pricing='variable',unit_price_kobo=null");
 const item={kind:'service',ref:service,description:'Delivery',quantity:'1',priceKobo:'125000'};
 const payload={items:[item],totalKobo:'125000',initialPaymentKobo:'0'};
 for(const priceKobo of ['0','-1','1.5','invalid']) {
  await db.exec('savepoint invalid_amount');
  await expect(call('invalid-'+priceKobo,{...payload,items:[{...item,priceKobo}],totalKobo:priceKobo})).rejects.toThrow();
  await db.exec('rollback to savepoint invalid_amount');
 }
 await owned('update bomedia.services set visible=false');
 await failure(()=>call('hidden-typed',payload));
 await owned("update bomedia.services set visible=true,pricing='fixed',unit_price_kobo=10000");
 await failure(()=>call('changed-to-fixed',payload));
 await owned("update bomedia.services set pricing='per_job',unit_price_kobo=null");
 await failure(()=>call('changed-to-approval',payload));
 expect(await owned('select count(*)::text as n from bomedia.orders')).toEqual([{n:'0'}]);
 expect(await owned('select count(*)::text as n from bomedia.payments')).toEqual([{n:'0'}]);
});

it('preserves a typed service amount through quote save, lookup and one-time conversion',async()=>{
 await owned("update bomedia.services set pricing='variable',unit_price_kobo=null");
 const payload={items:[{kind:'service',ref:service,description:'Delivery',quantity:'2',priceKobo:'150025'}],totalKobo:'300050',initialPaymentKobo:'0'};
 const quote=await call('delivery-quote',{...payload,operation:'quote'});
 const lookup=(await db.query<{r:{items:{unit_price_kobo:string}[]}}>('select bomedia.api_quote_lookup($1) r',[quote.quote_number])).rows[0].r;
 expect(lookup.items[0].unit_price_kobo).toBe('150025');
 expect(await owned('select count(*)::text as n from bomedia.jobs')).toEqual([{n:'0'}]);
 const salePayload={...payload,quoteId:quote.estimate_id,customerId:quote.customer_id};
 const sale=await call('delivery-convert',salePayload);
 expect(sale.total_kobo).toBe('300050');
 expect(await call('delivery-convert',salePayload)).toEqual(sale);
 await failure(()=>call('delivery-convert-again',salePayload));
});

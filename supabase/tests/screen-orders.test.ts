import type { PGlite } from '@electric-sql/pglite';
import { afterAll,afterEach,beforeAll,beforeEach,expect,it } from 'vitest';
import { testDatabase,insertId } from './helpers';
let db:PGlite,staff:string,material:string,service:string;
const print=()=>({kind:'print',ref:material,description:'Banner',quantity:'2',width:'8',height:'4',unit:'ft',priceKobo:'15000'});
const call=async(key:string,extra:Record<string,unknown>={})=>(await db.query<{result:Record<string,any>}>(
 'select bomedia.api_screen_order($1,$2::jsonb) as result',[key,JSON.stringify({actor_id:staff,operation:'sale',businessDate:'2026-10-08',clientName:'Grace Chapel',contact:'0803',jobStatus:'Printing',initialPaymentKobo:'500000',paymentMethod:'transfer',totalKobo:'960000',items:[print()],...extra})])).rows[0].result;
const owned=async(sql:string)=>{await db.exec('reset role');const rows=(await db.query<Record<string,string>>(sql)).rows;await db.exec('set local role bomedia_financial_runtime');return rows;};
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
it('rejects changed totals, excess payments, unapproved service prices and changed request bodies without partial writes',async()=>{
 await failure(()=>call('bad-total',{totalKobo:'960001'}));
 await failure(()=>call('too-much',{initialPaymentKobo:'960001'}));
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
 await failure(()=>call('free-overpaid',{...payload,initialPaymentKobo:'1'}));
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

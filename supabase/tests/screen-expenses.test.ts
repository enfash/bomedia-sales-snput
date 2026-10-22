import type { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { testDatabase, insertId } from './helpers';
let db:PGlite,actor:string;
const call=async(method:string,key:string,payload:object)=>(await db.query<{result:any}>(`select bomedia.${method}($1,$2::jsonb) result`,[key,JSON.stringify(payload)])).rows[0].result;
beforeAll(async()=>{db=await testDatabase();},30000);
afterAll(()=>db.close());
beforeEach(async(context)=>{await db.exec('begin');actor=await insertId(db,"insert into bomedia.staff(display_name,login_name) values ('Expense reviewer','expense-reviewer') returning id");await db.query("insert into bomedia.bookkeeping_settings(starts_on,state) values ('2026-10-09',$1)",[context.task.name.includes('opening liability')?'setup':'active']);await db.exec('set local role bomedia_financial_runtime');});
afterEach(()=>db.exec('rollback'));
const item=(extra={})=>({businessDate:'2026-10-09',amountKobo:'125001',category:'Transport',description:'Stage 3 test',paidTo:'Test supplier',status:'paid',paymentMethod:'Transfer',...extra});
const log=(items=[item()],requestId='log')=>call('api_screen_expense',requestId,{actor_id:actor,operation:'log',items});
async function fail(work:()=>Promise<unknown>){await db.exec('savepoint bad');await expect(work()).rejects.toThrow();await db.exec('rollback to savepoint bad');}
async function inspect(sql:string,args:unknown[]=[]){await db.exec('reset role');const r=await db.query(sql,args);await db.exec('set local role bomedia_financial_runtime');return r.rows;}
async function reserve(id='00000000-0000-4000-8000-000000000001') {return call('api_receipt','reserve',{actor_id:actor,request_id:id,sha256:'a'.repeat(64),file_id:'test-drive-file-id',mime_type:'image/png',byte_size:20});}
it('saves mixed paid/unpaid batches once, retains exact kobo and rolls back all items on a failure',async()=>{
 const items=[item(),item({category:'Equipment',status:'unpaid',paymentMethod:undefined,amountKobo:'200000'})];
 const result=await log(items);expect(await log(items)).toEqual(result);expect(result.expenses).toHaveLength(2);
 expect(await inspect('select account_code,sum(debit_kobo-credit_kobo)::text net from bomedia.journal_lines group by account_code order by account_code')).toEqual([{account_code:'1010',net:'-125001'},{account_code:'1500',net:'200000'},{account_code:'2010',net:'-200000'},{account_code:'6000',net:'125001'}]);
 await fail(()=>log([item(),item({category:'Raw Materials'})],'bad'));
 expect(await inspect('select count(*)::int n from bomedia.expenses')).toEqual([{n:2}]);
 await fail(()=>log([item({amountKobo:'1'})]));
});
it('pays an existing unpaid expense once, keeps original cost, and never reverts a payment',async()=>{
 const logged=await log([item({status:'unpaid',paymentMethod:undefined})]);const id=logged.expenses[0].expense_id;
 const payload={actor_id:actor,operation:'pay',expenseId:id,amountKobo:'125001',businessDate:'2026-10-10',paymentMethod:'POS'};
 await fail(()=>call('api_screen_expense','wrong',{...payload,amountKobo:'125000'}));
 const paid=await call('api_screen_expense','pay',payload);expect(await call('api_screen_expense','pay',payload)).toEqual(paid);
 expect(paid.expenses[0]).toMatchObject({expense_id:id,status:'Paid',business_date:'2026-10-10'});
 expect(await inspect('select account_code,sum(debit_kobo-credit_kobo)::text net from bomedia.journal_lines group by account_code order by account_code')).toEqual([{account_code:'1020',net:'-125001'},{account_code:'2010',net:'0'},{account_code:'6000',net:'125001'}]);
 await fail(()=>call('api_screen_expense','pay-again',payload));
 const replay=await log([item({status:'unpaid',paymentMethod:undefined})]);expect(replay).toEqual(logged);
 expect(await inspect('select status from bomedia.expenses where id=$1',[id])).toEqual([{status:'Paid'}]);
});
it('reserves one Storage file per upload request, attaches only ready owned receipts, and preserves links on retries',async()=>{
 const receipt=await reserve();expect(await reserve()).toEqual(receipt);
 await fail(()=>log([item({receiptId:receipt.id})]));
 await call('api_receipt','ready',{actor_id:actor,receipt_id:receipt.id});
 const result=await log([item({receiptId:receipt.id})]);expect(await log([item({receiptId:receipt.id})])).toEqual(result);
 expect(result.expenses[0].receipt_id).toBe(receipt.id);
 expect(await inspect('select storage_provider,external_file_id,url from bomedia.receipt_references')).toEqual([{storage_provider:'supabase_storage',external_file_id:'test-drive-file-id',url:`/api/accounting/receipts/${receipt.id}`}]);
 await fail(()=>log([item({receiptId:receipt.id})],'second-link'));
 expect(await inspect('select count(*)::int n from bomedia.expenses')).toEqual([{n:1}]);
});
it('keeps unsupported legacy expenses blocked, then settles an evidenced opening liability without re-expensing',async()=>{
 await db.exec('reset role');const id=await insertId(db,"insert into bomedia.expenses(amount_kobo,business_date,category,status) values (50000,'2026-09-01','Transport','Unpaid') returning id");await db.exec('set local role bomedia_financial_runtime');
 const payload={actor_id:actor,operation:'pay',expenseId:id,amountKobo:'50000',businessDate:'2026-10-09',paymentMethod:'Cash'};
 await fail(()=>call('api_screen_expense','legacy-pay',payload));
 await fail(()=>db.query('select bomedia.link_expense_opening($1::jsonb)',[JSON.stringify({expense_id:id})]));
 await db.exec('reset role');
 const journal=await call('post_journal','opening',{actor_id:actor,business_date:'2026-10-08',kind:'opening',memo:'Supported legacy expense liability',source_type:'expense_opening',source_id:id,opening_confirmed:true,evidence_reference:'test invoice and owner-approved opening schedule',lines:[{account_code:'3000',debit_kobo:'50000'},{account_code:'2010',credit_kobo:'50000'}]});
 await db.query('select bomedia.link_expense_opening($1::jsonb)',[JSON.stringify({actor_id:actor,expense_id:id,journal_entry_id:journal.journal_entry_id})]);
 await db.exec("update bomedia.bookkeeping_settings set state='active'; set local role bomedia_financial_runtime");
 await call('api_screen_expense','legacy-pay',payload);
 expect(await inspect("select count(*)::int n from bomedia.journal_lines where account_code='6000'")).toEqual([{n:0}]);
 expect(await inspect("select sum(credit_kobo-debit_kobo)::text net from bomedia.journal_lines where account_code='2010'")).toEqual([{net:'0'}]);
});
it('exposes stable identities and payable flags while protecting upload and opening tables',async()=>{
 await log();
 // api_legacy_feed has a one-argument signature.
 const rows=(await db.query<{r:any}>("select bomedia.api_legacy_feed('expenses') r")).rows[0].r;
 expect(rows[0]).toMatchObject({_backend:'postgres',_amountKobo:'125001'});expect(rows[0]._expenseId).toMatch(/^[a-f0-9-]{36}$/);
 for(const table of ['receipt_uploads','expense_opening_items'])await fail(()=>db.query(`select * from bomedia.${table}`));
});
it('refuses an owner-only category from staff but accepts it when the server says the owner is acting',async()=>{
  await db.exec("select bomedia.api_expense_category_save('own-cat',jsonb_build_object('actor_id','"+actor+"','action','set_access','name','Equipment','access','owner'))");
  await fail(()=>log([item({category:'Equipment'})],'staff-try'));
  const result=await call('api_screen_expense','owner-try',{actor_id:actor,operation:'log',byOwner:'true',items:[item({category:'Equipment'})]});
  expect(result.expenses).toHaveLength(1);
  expect(await log([item({category:'Transport'})],'staff-ok')).toBeTruthy();
});
it('lets staff the owner chose log an owner-only category, and nobody else',async()=>{
  await db.exec('reset role');
  const other=await insertId(db,"insert into bomedia.staff(display_name,login_name) values ('Other','other') returning id");
  await db.exec('set local role bomedia_financial_runtime');
  await db.exec("select bomedia.api_expense_category_save('chosen-cat',jsonb_build_object('actor_id','"+actor+"','action','set_access','name','Equipment','access','chosen','staff_ids',jsonb_build_array('"+actor+"')))");
  expect(await log([item({category:'Equipment'})],'chosen-ok')).toBeTruthy();
  await fail(()=>call('api_screen_expense','other-try',{actor_id:other,operation:'log',items:[item({category:'Equipment'})]}));
});

it('protects an attached receipt from other cashiers and permits the owner',async()=>{
 const receipt=await reserve();await call('api_receipt','ready',{actor_id:actor,receipt_id:receipt.id});
 const date=(await db.query<{d:string}>("select ((now() at time zone 'Africa/Lagos')::date)::text d")).rows[0].d;
 await log([item({businessDate:date,receiptId:receipt.id})]);
 await db.exec('reset role');const other=await insertId(db,"insert into bomedia.staff(display_name,login_name) values('Other','other') returning id");await db.exec('set local role bomedia_financial_runtime');
 await fail(()=>call('api_receipt','read',{actor_id:other,receipt_id:receipt.id}));
 expect((await call('api_receipt','read',{actor_id:actor,receipt_id:receipt.id})).id).toBe(receipt.id);
 expect((await call('api_receipt','read',{actor_id:other,receipt_id:receipt.id,by_owner:'true'})).id).toBe(receipt.id);
});

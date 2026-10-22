import type { PGlite } from '@electric-sql/pglite';
import { afterAll,afterEach,beforeAll,beforeEach,expect,it } from 'vitest';
import { testDatabase,insertId } from './helpers';
let db:PGlite,staff:string,job:string,seq:string;
const status=async(payload:Record<string,unknown>)=>(await db.query<{result:Record<string,string>}>('select bomedia.api_job_status($1,$2::jsonb) as result',['r',JSON.stringify({actor_id:staff,...payload})])).rows[0].result;
async function failure(payload:Record<string,unknown>,code:string) {
  await db.exec('savepoint rejected');await expect(status(payload)).rejects.toMatchObject({code});await db.exec('rollback to savepoint rejected');
}
beforeAll(async()=>{db=await testDatabase();},30_000);
afterAll(async()=>{await db?.close();});
beforeEach(async()=>{
  await db.exec('begin');
  staff=await insertId(db,"insert into bomedia.staff(display_name,login_name) values ('Ada','ada') returning id");
  const customer=await insertId(db,"insert into bomedia.customers(display_name) values ('Grace Chapel') returning id");
  const order=await insertId(db,"insert into bomedia.orders(customer_id,legacy_sales_id) values ($1,'S-1001') returning id",[customer]);
  job=await insertId(db,"insert into bomedia.jobs(order_id,customer_id,description,quantity,unit_price_kobo,amount_kobo,job_status) values ($1,$2,'Banner',1,100,100,'Quoted') returning id",[order,customer]);
  seq=(await db.query<{s:string}>('select collection_sequence::text as s from bomedia.jobs where id=$1',[job])).rows[0].s;
  await db.exec('set local role bomedia_financial_runtime');
});
afterEach(async()=>{await db.exec('rollback');});
const owned=async(sql:string)=>{await db.exec('reset role');try {return (await db.query<Record<string,string>>(sql)).rows;} finally {await db.exec('set local role bomedia_financial_runtime');}};

it('moves a job by its ID, legacy Sales ID or board row number, and audits real changes only',async()=>{
  expect(await status({job_ref:job,status:'Printing'})).toEqual({job_id:job,job_status:'Printing'});
  expect(await status({job_ref:'S-1001',status:'Ready'})).toMatchObject({job_status:'Ready'});
  expect(await status({job_ref:seq,status:'Ready'})).toMatchObject({job_id:job});
  expect((await owned('select job_status from bomedia.jobs'))[0].job_status).toBe('Ready');
  // One test transaction gives both events the same timestamp, so compare as a set.
  const events=await owned("select details->>'from' as f,details->>'to' as t from bomedia.audit_events where action='job_status' order by f");
  expect(events).toEqual([{f:'Printing',t:'Ready'},{f:'Quoted',t:'Printing'}]);
});
it('refuses unknown jobs and statuses, and keeps older jobs owner-only',async()=>{
  await failure({job_ref:job,status:'Lost'},'22023');
  await failure({job_ref:'S-404',status:'Ready'},'P0002');
  await failure({job_ref:job,status:'Ready',extra:1},'22023');
  await db.exec('reset role');await db.query("update bomedia.jobs set created_at=now()-interval '2 days'");await db.exec('set local role bomedia_financial_runtime');
  await failure({job_ref:job,status:'Delivered'},'42501');
  expect(await status({job_ref:job,status:'Delivered',any_age:true})).toMatchObject({job_status:'Delivered'});
});

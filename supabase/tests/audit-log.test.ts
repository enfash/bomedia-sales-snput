import type { PGlite } from '@electric-sql/pglite';
import { afterAll,afterEach,beforeAll,beforeEach,expect,it } from 'vitest';
import { testDatabase,insertId } from './helpers';

type Row={id:string;at:string;action:string;category:string;actor_name:string|null;details:Record<string,unknown>};
type Page={data:Row[];next_before:{at:string;id:string}|null;people:{id:string;name:string}[]};
let db:PGlite,owner:string,other:string;
const read=async(filter:Record<string,unknown>={})=>(await db.query<{r:Page}>('select bomedia.api_audit_log($1,$2::jsonb) as r',['',JSON.stringify(filter)])).rows[0].r;
async function event(action:string,at:string,actor:string|null,details:Record<string,unknown>={}) {
  await db.exec('reset role');
  await db.query('insert into bomedia.audit_events(actor_id,action,entity_type,details,created_at) values ($1,$2,$3,$4::jsonb,$5)',[actor,action,'x',JSON.stringify(details),at]);
  await db.exec('set local role bomedia_financial_runtime');
}
async function failure(work:()=>Promise<unknown>,match:object) {
  await db.exec('savepoint rejected');await expect(work()).rejects.toMatchObject(match);await db.exec('rollback to savepoint rejected');
}
beforeAll(async()=>{db=await testDatabase();},30_000);
afterAll(async()=>{await db?.close();});
beforeEach(async()=>{
  await db.exec('begin');
  await db.exec('delete from bomedia.audit_events');
  owner=await insertId(db,"insert into bomedia.staff(display_name,login_name) values ('Owner','owner') returning id");
  other=await insertId(db,"insert into bomedia.staff(display_name,login_name) values ('Amaka','amaka') returning id");
  await db.exec('set local role bomedia_financial_runtime');
});
afterEach(async()=>{await db.exec('rollback');});

it('lists newest first with the person, a kind and the people for the filter',async()=>{
  await event('staff_login','2026-10-10T08:00:00Z',other);
  await event('payment_recorded','2026-10-10T09:00:00Z',other,{amount_kobo:2500000,method:'transfer'});
  await event('business_details_saved','2026-10-10T10:00:00Z',owner,{changed:['phone','address']});
  const page=await read();
  expect(page.data.map(r=>r.action)).toEqual(['business_details_saved','payment_recorded','staff_login']);
  expect(page.data.map(r=>r.category)).toEqual(['settings','sales','signins']);
  expect(page.data[1]).toMatchObject({actor_name:'Amaka',details:{amount_kobo:2500000,method:'transfer'}});
  expect(page.next_before).toBeNull();
  expect(page.people.map(p=>p.name)).toEqual(['Amaka','Owner']);
});
it('filters by kind, person and start date',async()=>{
  await event('staff_login','2026-10-08T08:00:00Z',other);
  await event('expense_logged','2026-10-09T08:00:00Z',other);
  await event('expense_paid','2026-10-10T08:00:00Z',owner);
  expect((await read({category:'expenses'})).data).toHaveLength(2);
  expect((await read({category:'expenses',staff_id:owner})).data.map(r=>r.action)).toEqual(['expense_paid']);
  expect((await read({since:'2026-10-09T00:00:00Z'})).data).toHaveLength(2);
  expect((await read({category:'stock'})).data).toEqual([]);
});
it('groups admin actions with no staff id under staff and keeps the admin email',async()=>{
  await event('staff_restore','2026-10-10T08:00:00Z',null,{admin_identity:'owner@example.test'});
  const [row]=(await read({category:'staff'})).data;
  expect(row).toMatchObject({actor_name:null,details:{admin_identity:'owner@example.test'}});
  expect((await read({category:'signins'})).data).toEqual([]);
});
it('pages with a cursor, even when entries share a time',async()=>{
  for(let i=0;i<5;i++)await event('staff_login','2026-10-10T08:00:00Z',other);
  await event('staff_login','2026-10-10T07:00:00Z',other);
  const first=await read({limit:4});
  expect(first.data).toHaveLength(4);expect(first.next_before).not.toBeNull();
  const second=await read({limit:4,before_at:first.next_before!.at,before_id:first.next_before!.id});
  expect(second.data).toHaveLength(2);expect(second.next_before).toBeNull();
  const ids=[...first.data,...second.data].map(r=>r.id);
  expect(new Set(ids).size).toBe(6);
});
it('never returns keys outside the safe list, long values or nested objects',async()=>{
  await event('sale_recorded','2026-10-10T08:00:00Z',other,{pin_hash:'secret',token:'abc',nested:{a:1},name:'x'.repeat(400),status:'ok',label:'Cash'});
  const [row]=(await read()).data;
  expect(row.details).toEqual({status:'ok',label:'Cash'});
  expect(JSON.stringify(await read())).not.toContain('secret');
});
it('refuses unknown filters, bad kinds, half cursors and oversized pages',async()=>{
  await failure(()=>read({sort:'asc'}),{code:'22023'});
  await failure(()=>read({category:'everything'}),{code:'22023'});
  await failure(()=>read({before_at:'2026-10-10T08:00:00Z'}),{code:'22023'});
  await failure(()=>read({limit:0}),{code:'22023'});
  await failure(()=>read({limit:101}),{code:'22023'});
  await failure(()=>db.query("select bomedia.api_audit_log('', '[]'::jsonb)"),{code:'22023'});
});
it('is read-only: the runtime role cannot write or read the table directly',async()=>{
  await failure(()=>db.query("insert into bomedia.audit_events(action,entity_type) values ('x','y')"),{code:'42501'});
  await failure(()=>db.query("update bomedia.audit_events set action='x'"),{code:'42501'});
  await failure(()=>db.query('delete from bomedia.audit_events'),{code:'42501'});
  await failure(()=>db.query('select * from bomedia.audit_events'),{code:'42501'});
});

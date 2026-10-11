import type { PGlite } from '@electric-sql/pglite';
import { afterAll,afterEach,beforeAll,beforeEach,expect,it } from 'vitest';
import { testDatabase,insertId } from './helpers';

let db:PGlite,owner:string,gone:string;
const list=async()=>(await db.query<{r:{data:{method:string;label:string;enabled:boolean;account_code:string}[]}}>('select bomedia.api_payment_methods_admin() as r')).rows[0].r.data;
const staffList=async()=>(await db.query<{r:{data:{method:string;label:string}[]}}>('select bomedia.api_payment_methods() as r')).rows[0].r.data;
const save=async(key:string,payload:Record<string,unknown>)=>
  (await db.query<{r:{method:string;changed:string[]}}>('select bomedia.api_payment_method_save($1,$2::jsonb) as r',[key,JSON.stringify(payload)])).rows[0].r;
async function failure(work:()=>Promise<unknown>,match:object) {
  await db.exec('savepoint rejected');await expect(work()).rejects.toMatchObject(match);await db.exec('rollback to savepoint rejected');
}
beforeAll(async()=>{db=await testDatabase();},30_000);
afterAll(async()=>{await db?.close();});
beforeEach(async()=>{
  await db.exec('begin');
  owner=await insertId(db,"insert into bomedia.staff(display_name,login_name) values ('Owner','owner') returning id");
  gone=await insertId(db,"insert into bomedia.staff(display_name,login_name,disabled_at) values ('Gone','gone',now()) returning id");
  await db.exec('set local role bomedia_financial_runtime');
});
afterEach(async()=>{await db.exec('rollback');});

it('lists all three methods with their fixed ledger accounts, in a stable order',async()=>{
  expect(await list()).toMatchObject([{method:'cash',label:'Cash',enabled:true,account_code:'1000'},{method:'transfer',label:'Transfer',enabled:true,account_code:'1010'},{method:'pos',label:'POS',enabled:true,account_code:'1020'}]);
});
it('renames a method and turns it off for staff without touching its account',async()=>{
  expect(await save('a',{actor_id:owner,method:'transfer',label:'  Bank transfer ',enabled:true})).toEqual({method:'transfer',changed:['label']});
  expect(await save('b',{actor_id:owner,method:'pos',label:'POS',enabled:false})).toEqual({method:'pos',changed:['enabled']});
  expect(await list()).toMatchObject([{method:'cash'},{method:'transfer',label:'Bank transfer',account_code:'1010'},{method:'pos',enabled:false,account_code:'1020'}]);
  expect((await staffList()).map(m=>m.label).sort()).toEqual(['Bank transfer','Cash']);
  expect((await staffList()).map(m=>m.method)).toEqual(['cash','transfer']);
});
it('replays a repeated request and refuses the same request with different content',async()=>{
  const payload={actor_id:owner,method:'cash',label:'Cash in hand',enabled:true};
  expect(await save('same',payload)).toEqual({method:'cash',changed:['label']});
  expect(await save('same',payload)).toEqual({method:'cash',changed:['label']});
  await failure(()=>save('same',{...payload,label:'Other'}),{});
  await db.exec('reset role');
  const audit=await db.query<{n:string}>("select count(*)::text as n from bomedia.audit_events where action='payment_method_saved'");
  await db.exec('set local role bomedia_financial_runtime');
  expect(audit.rows[0].n).toBe('1');
});
it('keeps at least one method on and refuses duplicate names',async()=>{
  await save('p',{actor_id:owner,method:'pos',label:'POS',enabled:false});
  await save('t',{actor_id:owner,method:'transfer',label:'Transfer',enabled:false});
  await failure(()=>save('c',{actor_id:owner,method:'cash',label:'Cash',enabled:false}),{code:'23514'});
  await failure(()=>save('d',{actor_id:owner,method:'pos',label:' cash ',enabled:false}),{code:'23505'});
  expect((await list()).find(m=>m.method==='cash')?.enabled).toBe(true);
});
it('refuses bad input, unknown methods, extra fields and disabled staff',async()=>{
  await failure(()=>save('x1',{actor_id:owner,method:'cheque',label:'Cheque',enabled:true}),{code:'22023'});
  await failure(()=>save('x2',{actor_id:owner,method:'cash',label:'   ',enabled:true}),{code:'22023'});
  await failure(()=>save('x3',{actor_id:owner,method:'cash',label:'x'.repeat(41),enabled:true}),{code:'22023'});
  await failure(()=>save('x4',{actor_id:owner,method:'cash',label:'Cash',enabled:'yes'}),{code:'22023'});
  await failure(()=>save('x5',{actor_id:owner,method:'cash',label:'Cash',enabled:true,account_code:'1200'}),{code:'22023'});
  await failure(()=>save('x6',{actor_id:gone,method:'cash',label:'Cash',enabled:true}),{code:'42501'});
  expect((await list()).find(m=>m.method==='cash')?.account_code).toBe('1000');
});

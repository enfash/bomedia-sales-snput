import type { PGlite } from '@electric-sql/pglite';
import { afterAll,afterEach,beforeAll,beforeEach,expect,it } from 'vitest';
import { testDatabase,insertId } from './helpers';

type Row={name:string;kind:string;enabled:boolean;expense_count:number;owner_only:boolean;staff_ids:string[]};
let db:PGlite,owner:string,gone:string;
const list=async()=>(await db.query<{r:{data:Row[]}}>('select bomedia.api_expense_categories_admin() as r')).rows[0].r.data;
const staffList=async()=>(await db.query<{r:{data:{name:string}[]}}>('select bomedia.api_expense_categories() as r')).rows[0].r.data;
const save=async(key:string,payload:Record<string,unknown>)=>
  (await db.query<{r:{name:string;changed:string[]}}>('select bomedia.api_expense_category_save($1,$2::jsonb) as r',[key,JSON.stringify({actor_id:owner,...payload})])).rows[0].r;
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

it('lists every category with its kind, state and how many expenses use it',async()=>{
  const rows=await list();
  expect(rows.length).toBeGreaterThan(1);
  expect(rows.find(r=>r.name==='Equipment')).toMatchObject({kind:'capital',enabled:true});
  expect(rows.find(r=>r.name==='Ink')).toMatchObject({kind:'everyday',enabled:true,expense_count:0});
});
it('adds a category of the chosen kind and refuses a name that already exists in any case',async()=>{
  expect(await save('a',{action:'add',name:'  Packaging ',kind:'everyday'})).toEqual({name:'Packaging',changed:['added']});
  expect(await save('b',{action:'add',name:'Generator',kind:'capital'})).toEqual({name:'Generator',changed:['added']});
  const rows=await list();
  expect(rows.find(r=>r.name==='Packaging')).toMatchObject({kind:'everyday',enabled:true});
  expect(rows.find(r=>r.name==='Generator')).toMatchObject({kind:'capital',enabled:true});
  await failure(()=>save('c',{action:'add',name:'packaging',kind:'capital'}),{code:'23505'});
});
it('turns a category off and on, hiding it from staff but keeping it in the owner list',async()=>{
  expect((await save('d',{action:'set_enabled',name:'ink',enabled:false})).changed).toEqual(['enabled']);
  const rows=await list();
  expect(rows[rows.length-1]).toMatchObject({name:'Ink',enabled:false});
  expect((await staffList()).map(c=>c.name)).not.toContain('Ink');
  expect((await save('e',{action:'set_enabled',name:'Ink',enabled:false})).changed).toEqual([]);
  await save('f',{action:'set_enabled',name:'Ink',enabled:true});
  expect((await staffList()).map(c=>c.name)).toContain('Ink');
});
it('never lets the kind change or an unknown, bad or extra field through',async()=>{
  await failure(()=>save('g',{action:'add',name:'X',kind:'weird'}),{code:'22023'});
  await failure(()=>save('h',{action:'set_enabled',name:'Ink',enabled:true,kind:'capital'}),{code:'22023'});
  await failure(()=>save('i',{action:'set_enabled',name:'Nope',enabled:true}),{code:'22023'});
  await failure(()=>save('j',{action:'rename',name:'Ink'}),{code:'22023'});
  await failure(()=>save('k',{action:'add',name:'  ',kind:'everyday'}),{code:'22023'});
});
it('keeps at least one category on',async()=>{
  const on=(await list()).filter(r=>r.enabled).map(r=>r.name);
  for(const name of on.slice(0,-1))await save('off-'+name,{action:'set_enabled',name,enabled:false});
  await failure(()=>save('last',{action:'set_enabled',name:on[on.length-1],enabled:false}),{code:'23514'});
});
it('replays a repeated request, refuses a disabled actor and records an audit entry',async()=>{
  const payload={action:'add',name:'Packaging',kind:'everyday'};
  expect(await save('same',payload)).toEqual({name:'Packaging',changed:['added']});
  expect(await save('same',payload)).toEqual({name:'Packaging',changed:['added']});
  await failure(()=>save('same',{...payload,kind:'capital'}),{});
  await failure(()=>save('dead',{...payload,name:'Other',actor_id:gone}),{code:'42501'});
  await db.exec('reset role');
  const audit=await db.query<{n:string}>("select count(*)::text as n from bomedia.audit_events where action='expense_category_saved'");
  await db.exec('set local role bomedia_financial_runtime');
  expect(audit.rows[0].n).toBe('1');
});
it('lets the owner choose who can log a category and keeps one staff category open',async()=>{
  await db.exec('reset role');
  const staff=await insertId(db,"insert into bomedia.staff(display_name,login_name) values ('Ada','ada') returning id");
  await db.exec('set local role bomedia_financial_runtime');
  expect(await save('o1',{action:'add',name:'Generator',kind:'capital',access:'owner'})).toEqual({name:'Generator',changed:['added']});
  expect((await list()).find(r=>r.name==='Generator')).toMatchObject({owner_only:true,staff_ids:[]});
  expect((await save('o2',{action:'set_access',name:'Equipment',access:'chosen',staff_ids:[staff]})).changed).toEqual(['access_chosen']);
  expect((await list()).find(r=>r.name==='Equipment')).toMatchObject({owner_only:true,staff_ids:[staff]});
  expect((await save('o3',{action:'set_access',name:'equipment',access:'chosen',staff_ids:[staff]})).changed).toEqual([]);
  expect((await save('o4',{action:'set_access',name:'Equipment',access:'everyone'})).changed).toEqual(['access_everyone']);
  expect((await list()).find(r=>r.name==='Equipment')).toMatchObject({owner_only:false,staff_ids:[]});
  await failure(()=>save('o5',{action:'set_access',name:'Ink',access:'chosen'}),{code:'22023'});
  await failure(()=>save('o6',{action:'set_access',name:'Ink',access:'everyone',staff_ids:[staff]}),{code:'22023'});
  await failure(()=>save('o7',{action:'set_access',name:'Ink',access:'chosen',staff_ids:[gone]}),{code:'22023'});
  await failure(()=>save('o8',{action:'set_access',name:'Ink',access:'owner',kind:'capital'}),{code:'22023'});
  const open=(await list()).filter(r=>r.enabled&&!r.owner_only).map(r=>r.name);
  for(const name of open.slice(0,-1))await save('own-'+name,{action:'set_access',name,access:'owner'});
  await failure(()=>save('own-last',{action:'set_access',name:open[open.length-1],access:'owner'}),{code:'23514'});
});

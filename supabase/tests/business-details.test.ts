import type { PGlite } from '@electric-sql/pglite';
import { afterAll,afterEach,beforeAll,beforeEach,expect,it } from 'vitest';
import { testDatabase,insertId } from './helpers';

let db:PGlite,owner:string,gone:string;
const base=()=>({actor_id:owner,account_name:'Broad Options Media / Fasugba Elijah Niyi',account_number:'5236650819',bank:'Moniepoint MFB',
  phone:'+234 802 224 7567',email:'info@bomedia.com.ng',address:'65, New Ipaja Road, Alaguntan BRT Bus Stop, Alimosho, Lagos.'});
const read=async()=>(await db.query<{r:Record<string,string|null>}>('select bomedia.api_business_details() as r')).rows[0].r;
const save=async(key:string,payload:Record<string,unknown>)=>
  (await db.query<{r:{changed:string[]}}>('select bomedia.api_business_details_save($1,$2::jsonb) as r',[key,JSON.stringify(payload)])).rows[0].r;
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

it('starts with the values that were hard-coded, so printed output is unchanged',async()=>{
  expect(await read()).toMatchObject({account_name:'Broad Options Media / Fasugba Elijah Niyi',account_number:'5236650819',bank:'Moniepoint MFB',
    phone:'+234 802 224 7567',phone_dial:'+2348022247567',email:'info@bomedia.com.ng',updated_by:null});
});
it('saves trimmed values, derives the dialable phone, and replays safely',async()=>{
  expect((await save('k0',base())).changed).toEqual([]);
  const edited={...base(),phone:'0802 224 7567',bank:'  Moniepoint  '};
  const first=await save('k1',edited);
  expect(first.changed).toEqual(['bank','phone']);
  expect(await save('k1',edited)).toEqual(first);
  await failure(()=>save('k1',{...edited,bank:'Other'}),{code:'22023'});
  expect(await read()).toMatchObject({bank:'Moniepoint',phone:'0802 224 7567',phone_dial:'08022247567',updated_by:'Owner'});
});
it.each([
  ['a 9-digit account number',{account_number:'523665081'}],['letters in the account number',{account_number:'52366508AB'}],
  ['a bad email',{email:'nope'}],['a bad phone',{phone:'call me'}],['a blank address',{address:'   '}],
])('rejects %s',async(_label,change)=>{
  await failure(()=>save('bad',{...base(),...change}),{code:'23514'});
});
it('requires every field, no extra fields and an enabled actor',async()=>{
  const {email:_email,...missing}=base();
  await failure(()=>save('m',missing),{code:'22023'});
  await failure(()=>save('x',{...base(),singleton:false}),{code:'22023'});
  await failure(()=>save('d',{...base(),actor_id:gone}),{code:'42501'});
});
it('records only the changed field names in the audit trail and cannot be deleted or read directly',async()=>{
  await save('k1',{...base(),phone:'0802 224 7567'});
  await failure(()=>db.query('select * from bomedia.business_details'),{code:'42501'});
  await db.exec('reset role');
  const audit=(await db.query<{details:unknown}>("select details from bomedia.audit_events where action='business_details_saved'")).rows;
  expect(audit).toEqual([{details:{changed:['phone']}}]);
  await failure(()=>db.query('delete from bomedia.business_details'),{code:'23514'});
});

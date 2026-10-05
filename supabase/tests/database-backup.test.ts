import { readFileSync,readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { afterAll,beforeAll,expect,it } from 'vitest';
import { applyMigrations } from '../../scripts/migration/apply.mjs';
import { captureDatabase,restoreAndVerifyLocally } from '../../scripts/migration/database-backup.mjs';
import { canonicalJson,sha256,encryptArchive,decryptArchive } from '../../scripts/migration/snapshot.mjs';
const directory=fileURLToPath(new URL('../migrations/',import.meta.url));
const files=readdirSync(directory).filter(f=>f.endsWith('.sql')).sort().map(name=>({name,sql:readFileSync(directory+name,'utf8')}));
let db:PGlite;
let backup:Awaited<ReturnType<typeof captureDatabase>>;
beforeAll(async()=>{
  db=new PGlite();await db.exec('create role anon; create role authenticated; create role service_role bypassrls; set timezone to UTC');
  await applyMigrations(db,files);
  const staff=(await db.query<{id:string}>("insert into bomedia.staff(display_name,login_name) values ('Owner','owner') returning id")).rows[0].id;
  await db.exec("insert into bomedia.bookkeeping_settings(starts_on,state) values ('2026-10-05','active')");
  await db.query("select bomedia.post_journal('large-exact-entry',$1::jsonb)",[JSON.stringify({actor_id:staff,business_date:'2026-10-05',kind:'adjustment',memo:'Exact recovery fixture',
    lines:[{account_code:'1000',debit_kobo:'9007199254740993'},{account_code:'3000',credit_kobo:'9007199254740993'}]})]);
  const material=(await db.query<{id:string}>("insert into bomedia.materials(name,width_ft,selling_price_per_sqft_kobo) values ('Test',4,1000) returning id")).rows[0].id;
  const roll=(await db.query<{id:string}>("insert into bomedia.inventory_rolls(material_id,item_name,width_ft,total_length_ft,remaining_length_ft,cost_per_sqft_kobo_exact) values ($1,'Test roll',4,100,55.123456,45.123456) returning id",[material])).rows[0].id;
  await db.query('update bomedia.materials set active_roll_id=$1 where id=$2',[roll,material]);
  await db.exec("insert into bomedia.estimates(client_name_snapshot,cart_data) values ('NULL','[]')");
  backup=await captureDatabase(db,files,'local-synthetic-only');
},30_000);
afterAll(async()=>{await db?.close();});
it('restores cyclic material links, immutable posted journals, exact bigints and decimals from saved encrypted content',async()=>{
  const passphrase='synthetic-password-used-only-in-this-test-123456789';
  const serialized=JSON.stringify(encryptArchive(backup,passphrase));
  expect(serialized).not.toContain('9007199254740993');
  const report=await restoreAndVerifyLocally(decryptArchive(JSON.parse(serialized),passphrase),files);
  expect(report).toMatchObject({verified:true,tables:36,foreignKeysValidated:true,exactValuesVerified:true,localRestoreOnly:true});
},30_000);
it('rejects altered rows and mismatched migration history',async()=>{
  const bad=structuredClone(backup);bad.tables.find((t: {name:string})=>t.name==='staff')!.rows[0][1]='Changed';
  await expect(restoreAndVerifyLocally(bad,files)).rejects.toThrow('integrity mismatch');
  await expect(restoreAndVerifyLocally(backup,files.slice(0,-1))).rejects.toThrow('matching trusted');
},30_000);
it('validates foreign keys after trigger-free loading instead of accepting orphaned restored rows',async()=>{
  const bad=structuredClone(backup),rolls=bad.tables.find((t: {name:string})=>t.name==='inventory_rolls')!;
  const column=rolls.columns.findIndex((c: {name:string})=>c.name==='material_id');rolls.rows[0][column]='00000000-0000-4000-8000-000000000001';rolls.sha256=sha256(canonicalJson(rolls.rows));
  await expect(restoreAndVerifyLocally(bad,files)).rejects.toThrow(/foreign key/);
},30_000);
it('restores an older backup after new migrations are added without applying the later schema to it',async()=>{
  const newer=[...files,{name:'202610050001_future.sql',sql:'begin; create table bomedia.future_feature(id uuid primary key); commit;'}];
  expect(await restoreAndVerifyLocally(backup,newer)).toMatchObject({verified:true,tables:36});
},30_000);

it('distinguishes SQL null from literal NULL text in the exported format',()=>{
  const estimates=backup.tables.find((t: {name:string})=>t.name==='estimates')!;
  const customer=estimates.columns.findIndex((c: {name:string})=>c.name==='customer_id');
  const label=estimates.columns.findIndex((c: {name:string})=>c.name==='client_name_snapshot');
  expect(estimates.rows[0][customer]).toBeNull();expect(estimates.rows[0][label]).toBe('NULL');
});

import { readFileSync,readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { expect,it } from 'vitest';

it('preserves an existing receipt and its retry response when the income policy is installed',async()=>{
 const db=new PGlite();
 try {
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  const dir=fileURLToPath(new URL('../migrations/',import.meta.url));
  const migration='20261026200438_sale_extra_income.sql';
  for(const file of readdirSync(dir).filter(f=>f.endsWith('.sql')&&f<migration).sort()) await db.exec(readFileSync(dir+file,'utf8'));
  const actor=(await db.query<{id:string}>("insert into bomedia.staff(display_name,login_name) values ('Upgrade test','upgrade') returning id")).rows[0].id;
  const service=(await db.query<{id:string}>("insert into bomedia.services(name,pricing,unit_price_kobo,visible) values ('Upgrade service','fixed',100,true) returning id")).rows[0].id;
  await db.exec("insert into bomedia.bookkeeping_settings(starts_on,state) values ('2026-10-01','active')");
  const payload={actor_id:actor,operation:'sale',businessDate:'2026-10-26',clientName:'Synthetic upgrade customer',contact:'',jobStatus:'Delivered',initialPaymentKobo:'100',paymentMethod:'cash',totalKobo:'100',items:[{kind:'service',ref:service,description:'Upgrade service',quantity:'1',priceKobo:'100'}]};
  const call=async()=> (await db.query<{r:unknown}>('select bomedia.api_screen_order($1,$2) r',['before-upgrade',JSON.stringify(payload)])).rows[0].r;
  const original=await call();
  await db.exec(readFileSync(dir+migration,'utf8'));
  expect(await call()).toEqual(original);
  expect((await db.query('select * from bomedia.payments')).rows).toHaveLength(1);
  expect((await db.query('select * from bomedia.payment_extra_income')).rows).toHaveLength(0);
 } finally { await db.close(); }
},30000);

import type { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { insertId, testDatabase } from './helpers';

let db: PGlite, customer: string, order: string, owner: string;
const sold = async () => (await db.query<{ r: { code: string; sold: string }[] }>('select bomedia.api_material_sales() as r')).rows[0].r;
const material = (name: string, width: number, price: number, legacy: string | null = null) =>
  insertId(db, 'insert into bomedia.materials(name,width_ft,selling_price_per_sqft_kobo,legacy_material_id) values ($1,$2,$3,$4) returning id', [name, width, price, legacy]);
const job = (materialId: string | null, amountKobo: number) => db.query(
  `insert into bomedia.jobs(order_id,customer_id,material_id,description,quantity,unit_price_kobo,amount_kobo,job_status) values ($1,$2,$3,'Test',1,$4,$4,'Delivered')`,
  [order, customer, materialId, amountKobo]);
beforeAll(async () => { db = await testDatabase(); }, 30_000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec('begin');
  owner = await insertId(db, "insert into bomedia.staff(display_name,login_name) values ('Owner','owner') returning id");
  customer = await insertId(db, "insert into bomedia.customers(display_name) values ('Grace Chapel') returning id");
  order = await insertId(db, 'insert into bomedia.orders(customer_id) values ($1) returning id', [customer]);
});
afterEach(async () => { await db.exec('rollback'); });

it('is empty when nothing has been sold', async () => {
  await material('Banner', 4, 20000);
  expect(await sold()).toEqual([]);
});

it('totals what each material actually sold for, ignoring services and other materials', async () => {
  const banner = await material('Banner', 4, 20000), flex = await material('Flex', 10, 25000, 'FLEX-10FT');
  await material('Unsold', 4, 1000);
  await job(banner, 150000); await job(banner, 50050); await job(flex, 180000); await job(null, 999999);
  const rows = await sold();
  expect(rows.sort((a, b) => a.code.localeCompare(b.code))).toEqual([{ code: 'BANNER-4FT', sold: '2000.5' }, { code: 'FLEX-10FT', sold: '1800' }]);
});

it('does not change when the material price changes later', async () => {
  const banner = await material('Banner', 4, 20000);
  await job(banner, 150000);
  const before = await sold();
  await db.query("select bomedia.api_material_save('price-change',$1::jsonb)", [JSON.stringify({ actor_id: owner, action: 'set_price', name: 'Banner', price_kobo: '90000' })]);
  expect(await sold()).toEqual(before);
});

it('runs for the accounting runtime only', async () => {
  await db.exec('set local role bomedia_financial_runtime');
  expect(await sold()).toEqual([]);
  await db.exec('reset role');
  for (const role of ['anon', 'authenticated', 'service_role', 'bomedia_auth_runtime']) {
    const result = await db.query<{ ok: boolean }>("select has_function_privilege($1,'bomedia.api_material_sales()','EXECUTE') as ok", [role]);
    expect(result.rows[0].ok).toBe(false);
  }
});

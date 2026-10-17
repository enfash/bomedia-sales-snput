import type { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { insertId, testDatabase } from './helpers';

let db: PGlite;
beforeAll(async () => { db = await testDatabase(); }, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => { await db.exec('begin'); });
afterEach(async () => { await db.exec('rollback'); });

it('reports how much length a size started with, next to what is left', async () => {
  const material = await insertId(db, "insert into bomedia.materials(legacy_material_id,name,width_ft,selling_price_per_sqft_kobo) values ('MAT-FLEX','Flex',10,15000) returning id");
  await db.query("insert into bomedia.inventory_rolls(material_id,item_name,width_ft,total_length_ft,remaining_length_ft,purchase_cost_kobo,selling_price_kobo) values ($1,'Flex A',10,100,40,1000000,15000),($1,'Flex B',10,50,0,500000,15000)", [material]);
  const result = (await db.query<{ r: { name: string; sizes: { remaining_ft: string; capacity_ft: string; roll_count: number }[] }[] }>('select bomedia.api_materials_admin() as r')).rows[0].r;
  expect(result[0].sizes[0]).toMatchObject({ remaining_ft: '40', capacity_ft: '150', roll_count: 1 });
});

it('lists recent customer changes with who made them, newest first', async () => {
  const staff = await insertId(db, "insert into bomedia.staff(display_name,login_name) values ('Ada','ada') returning id");
  const customer = await insertId(db, "insert into bomedia.customers(display_name,contact) values ('Grace Chapel','0803') returning id");
  await db.query("insert into bomedia.customer_changes(customer_id,changed_by,changes) values ($1,$2,$3::jsonb)", [customer, staff, JSON.stringify({ contact: { from: '0803', to: '0805' } })]);
  await db.query("insert into bomedia.customer_changes(customer_id,changed_by,changes,created_at) values ($1,$2,$3::jsonb, now() - interval '30 days')", [customer, staff, JSON.stringify({ notes: { from: null, to: 'old' } })]);
  const rows = (await db.query<{ r: { by: string; name: string; reference: string; changes: Record<string, unknown> }[] }>('select bomedia.api_recent_customer_changes(14) as r')).rows[0].r;
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ by: 'Ada', name: 'Grace Chapel', changes: { contact: { from: '0803', to: '0805' } } });
  expect(rows[0].reference).toMatch(/^CUS-/);
});

import type { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { insertId, testDatabase } from './helpers';

let db: PGlite, ada: string, owner: string, material: string, today: string;
const print = () => ({ kind: 'print', ref: material, description: 'Banner', quantity: '2', width: '8', height: '4', unit: 'ft', priceKobo: '15000' });
const order = (over: Record<string, unknown> = {}) => ({
  actor_id: ada, operation: 'sale', businessDate: today, clientName: 'Grace Chapel', contact: '0803', jobStatus: 'Printing',
  initialPaymentKobo: '0', totalKobo: '960000', items: [print()], ...over,
});
const sell = async (key: string, over: Record<string, unknown> = {}) => (await db.query<{ r: Record<string, any> }>(
  'select bomedia.api_screen_order($1,$2::jsonb) as r', [key, JSON.stringify(order(over))])).rows[0].r;
const list = async () => (await db.query<{ r: { data: Record<string, any>[] } }>('select bomedia.api_customers() as r')).rows[0].r.data;
const profile = async (id: string) => (await db.query<{ r: Record<string, any> }>('select bomedia.api_customer_profile($1) as r', [id])).rows[0].r;
const save = async (key: string, payload: Record<string, unknown>) => (await db.query<{ r: Record<string, any> }>(
  'select bomedia.api_customer_save($1,$2::jsonb) as r', [key, JSON.stringify(payload)])).rows[0].r;
const owned = async (sql: string, params: unknown[] = []) => {
  await db.exec('reset role'); const rows = (await db.query<Record<string, any>>(sql, params)).rows; await db.exec('set local role bomedia_financial_runtime'); return rows;
};
async function failure(work: () => Promise<unknown>, code = '22023') {
  await db.exec('savepoint rejected'); await expect(work()).rejects.toMatchObject({ code }); await db.exec('rollback to savepoint rejected');
}

beforeAll(async () => { db = await testDatabase(); }, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec('begin');
  ada = await insertId(db, "insert into bomedia.staff(display_name,login_name) values ('Ada','ada') returning id");
  owner = await insertId(db, "insert into bomedia.staff(display_name,login_name) values ('Owner','owner') returning id");
  material = await insertId(db, "insert into bomedia.materials(legacy_material_id,name,width_ft,selling_price_per_sqft_kobo) values ('MAT-FLEX','Flex',10,15000) returning id");
  const roll = await insertId(db, "insert into bomedia.inventory_rolls(material_id,item_name,width_ft,total_length_ft,remaining_length_ft,purchase_cost_kobo,selling_price_kobo) values ($1,'Flex Roll',10,100,100,2000000,15000) returning id", [material]);
  await db.query('update bomedia.materials set active_roll_id=$1 where id=$2', [roll, material]);
  await db.exec("insert into bomedia.bookkeeping_settings(starts_on,state) values ('2026-10-01','active')");
  await db.query("select bomedia.post_journal('inventory-fixture',$1::jsonb)", [JSON.stringify({ actor_id: ada, business_date: '2026-10-01', kind: 'adjustment', memo: 'Inventory', lines: [{ account_code: '1200', debit_kobo: '2000000' }, { account_code: '3000', credit_kobo: '2000000' }] })]);
  today = (await db.query<{ d: string }>("select ((now() at time zone 'Africa/Lagos')::date)::text as d")).rows[0].d;
  await db.exec('set local role bomedia_financial_runtime');
});
afterEach(async () => { await db.exec('rollback'); });

it('gives each customer a readable, unique ID in the order they were made, including ones made by a sale', async () => {
  const first = await sell('one');
  await sell('two', { clientName: 'Zed Events', contact: '0805' });
  await sell('three', { clientName: 'Zed Events', contact: '0805' });
  const customers = await list();
  expect(customers.map((c) => c.name)).toEqual(['Grace Chapel', 'Zed Events']);
  // The counter never goes backwards, so check the pattern and that the second follows the first.
  const numbers = customers.map((c) => Number(String(c.reference).replace('CUS-', '')));
  expect(customers.every((c) => /^CUS-\d{4,}$/.test(c.reference))).toBe(true);
  expect(numbers[1]).toBe(numbers[0] + 1);
  expect(first.sales_id).toMatch(/^BOM-/);
});

it('shows what a customer has bought, paid and still owes, with their sales and payments on the profile', async () => {
  await sell('part', { initialPaymentKobo: '100000', paymentMethod: 'cash' });
  const [grace] = await list();
  expect(grace).toMatchObject({ orders: 1, total_kobo: '960000', paid_kobo: '100000', owed_kobo: '860000', contact: '0803', last_order_date: today });
  const p = await profile(grace.id);
  expect(p.customer.reference).toMatch(/^CUS-\d{4,}$/);
  expect(p.sales).toHaveLength(1);
  expect(p.sales[0]).toMatchObject({ jobs: 1, total_kobo: '960000', paid_kobo: '100000', owed_kobo: '860000' });
  expect(p.sales[0].sales_id).toMatch(/^BOM-/);
  expect(p.changes).toEqual([]);
});

it('lists each item of an order on the profile, with its words, size and what it cost', async () => {
  await sell('items');
  const [grace] = await list();
  const [order] = (await profile(grace.id)).sales;
  expect(order.items).toHaveLength(1);
  expect(order.items[0]).toMatchObject({ description: 'Banner', amount_kobo: '960000' });
  expect(Number(order.items[0].quantity)).toBe(2);
  expect(Number(order.items[0].width_ft)).toBe(8);
  expect(Number(order.items[0].height_ft)).toBe(4);
  // An order of several jobs lists each of them (the test's transaction gives every row one timestamp, so the order is not asserted).
  const [orderRow] = await owned("select id from bomedia.orders where customer_id = $1", [grace.id]);
  await owned(`insert into bomedia.jobs(order_id,customer_id,description,client_name_snapshot,quantity,unit_price_kobo,amount_kobo,job_status,business_date)
    values ($1,$2,'Poster',$3,1,1000,1000,'Delivered',$4)`, [orderRow.id, grace.id, grace.name, today]);
  const again = (await profile(grace.id)).sales[0];
  expect(again.jobs).toBe(2);
  expect(again.items.map((i: { description: string }) => i.description).sort()).toEqual(['Banner', 'Poster']);
});

it('adds the Sheet history to what a customer has spent, without counting an opening debt a second time', async () => {
  await sell('new-sale');
  const [grace] = await list();
  // Two old sales (one of two items) from the Sheet, then the opening debt that restates the unpaid part of the first.
  for (const [row, salesId, amount, paid] of [[2, 'S1', '500000', '0'], [3, 'S1', '220000', '0'], [4, 'S2', '100000', '100000']]) {
    await owned(`insert into bomedia.legacy_sales(customer_id,sheet_row,sale_date,sales_id,description,amount_kobo,paid_kobo,owed_kobo,batch,source)
      values ($1,$2,'2026-09-01',$3,'Old banner',$4,$5,$4::bigint-$5::bigint,'test','{}'::jsonb)`, [grace.id, row, salesId, amount, paid]);
  }
  const [orderRow] = await owned("insert into bomedia.orders(customer_id,legacy_sales_id,created_by) values ($1,'S1',$2) returning id", [grace.id, ada]);
  await owned(`insert into bomedia.jobs(order_id,customer_id,description,client_name_snapshot,quantity,unit_price_kobo,amount_kobo,job_status,business_date,logged_by_snapshot)
    values ($1,$2,'Opening balance',$3,1,432313,432313,'Delivered','2026-09-01','Sheet opening balance')`, [orderRow.id, grace.id, grace.name]);
  const [after] = await list();
  expect(after).toMatchObject({
    spent_before_kobo: '820000', orders_before: 2, spent_since_kobo: '960000', orders_since: 1, spent_kobo: '1780000', orders_lifetime: 3,
    // What is owed still comes only from the books: the new sale plus the opening debt.
    total_kobo: '1392313', owed_kobo: '1392313',
  });
  expect((await profile(grace.id)).customer).toMatchObject({ spent_kobo: '1780000', orders_lifetime: 3 });
});

it('lets staff correct the phone and notes, keeping who changed what and when on the profile and in the audit log', async () => {
  await sell('s');
  const [grace] = await list();
  const result = await save('fix-phone', { actor_id: ada, customer_id: grace.id, contact: '0807 000 1111', notes: 'Pays on Fridays' });
  expect(result.changed).toBe(true);
  expect(result.customer).toMatchObject({ contact: '0807 000 1111', notes: 'Pays on Fridays', name: 'Grace Chapel' });
  const p = await profile(grace.id);
  expect(p.changes).toHaveLength(1);
  expect(p.changes[0]).toMatchObject({ by: 'Ada', changes: { contact: { from: '0803', to: '0807 000 1111' }, notes: { from: null, to: 'Pays on Fridays' } } });
  const audit = await owned("select action, details from bomedia.audit_events where action = 'customer_updated'");
  expect(audit).toHaveLength(1);
  expect(audit[0].details).toMatchObject({ customer: grace.reference, fields: ['contact', 'notes'] });
  expect((await owned('select bomedia.audit_category($1) as c', ['customer_updated']))[0].c).toBe('sales');
});

it('records nothing when nothing changed, and answers a repeated request once', async () => {
  await sell('s');
  const [grace] = await list();
  expect((await save('same', { actor_id: ada, customer_id: grace.id, contact: '0803', notes: '' })).changed).toBe(false);
  expect((await profile(grace.id)).changes).toEqual([]);
  const first = await save('once', { actor_id: ada, customer_id: grace.id, contact: '0900' });
  const again = await save('once', { actor_id: ada, customer_id: grace.id, contact: '0900' });
  expect(again).toEqual(first);
  expect((await profile(grace.id)).changes).toHaveLength(1);
  await failure(() => save('once', { actor_id: ada, customer_id: grace.id, contact: '0901' }));
});

it('lets only the owner rename a customer, and clears a phone or note when it is emptied', async () => {
  await sell('s');
  const [grace] = await list();
  await failure(() => save('rename-staff', { actor_id: ada, customer_id: grace.id, name: 'Grace Chapel Ltd' }));
  const renamed = await save('rename-owner', { actor_id: owner, customer_id: grace.id, name: 'Grace Chapel Ltd', by_owner: true });
  expect(renamed.customer.name).toBe('Grace Chapel Ltd');
  const cleared = await save('clear', { actor_id: ada, customer_id: grace.id, contact: '   ' });
  expect(cleared.customer.contact).toBe('');
  const p = await profile(grace.id);
  expect(p.changes.map((c: any) => Object.keys(c.changes))).toEqual([['contact'], ['name']]);
});

it('refuses bad input, unknown customers, disabled staff and unexpected fields', async () => {
  await sell('s');
  const [grace] = await list();
  await failure(() => save('a', { actor_id: ada, customer_id: grace.id, name: '  ', by_owner: true }));
  await failure(() => save('b', { actor_id: ada, customer_id: grace.id, contact: 'x'.repeat(101) }));
  await failure(() => save('c', { actor_id: ada, customer_id: grace.id, notes: 'x'.repeat(2001) }));
  await failure(() => save('d', { actor_id: ada, customer_id: grace.id, reference: 'CUS-9999' }));
  await failure(() => save('e', { actor_id: ada, customer_id: '00000000-0000-4000-8000-000000000009', contact: '1' }), 'P0002');
  await failure(() => profile('nope'), 'P0002');
  await owned('update bomedia.staff set disabled_at = now() where id = $1', [ada]);
  await failure(() => save('f', { actor_id: ada, customer_id: grace.id, contact: '1' }), '42501');
});

it('keeps the helper and the reference trigger away from the runtime role', async () => {
  await failure(() => db.query('select bomedia.customer_rows(null)'), '42501');
});

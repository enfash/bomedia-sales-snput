import type { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { insertId, testDatabase } from './helpers';

let db: PGlite;
const revision = async () => (await db.query<{ r: { revision: number } }>('select bomedia.api_data_revision() as r')).rows[0].r.revision;

beforeAll(async () => { db = await testDatabase(); }, 30_000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => { await db.exec('begin'); });
afterEach(async () => { await db.exec('rollback'); });

it('moves once per write statement, however many rows it touches', async () => {
  const before = await revision();
  await db.query("insert into bomedia.staff(display_name,login_name) select 'Staff '||g, 'staff'||g from generate_series(1,3) g");
  expect(await revision()).toBe(before + 1);
});

it('moves on updates and deletes too, not just inserts', async () => {
  const staff = await insertId(db, "insert into bomedia.staff(display_name,login_name) values ('Ada','ada') returning id");
  const afterInsert = await revision();
  await db.query("update bomedia.staff set display_name = 'Ada Obi' where id = $1", [staff]);
  expect(await revision()).toBe(afterInsert + 1);
  await db.query('delete from bomedia.staff where id = $1', [staff]);
  expect(await revision()).toBe(afterInsert + 2);
});

it('moves when a sale or expense changes, which is what the feeds show', async () => {
  const customer = await insertId(db, "insert into bomedia.customers(display_name) values ('Grace Chapel') returning id");
  const afterCustomer = await revision();
  const order = await insertId(db, 'insert into bomedia.orders(customer_id) values ($1) returning id', [customer]);
  await db.query(
    `insert into bomedia.jobs(order_id,customer_id,description,quantity,unit_price_kobo,amount_kobo,job_status) values ($1,$2,'Test',1,150000,150000,'Delivered')`,
    [order, customer]);
  expect(await revision()).toBeGreaterThan(afterCustomer);
  const beforeExpense = await revision();
  await db.query("insert into bomedia.expenses(amount_kobo,category,description,status) values (50000,'Ink','Ink','paid')");
  expect(await revision()).toBeGreaterThan(beforeExpense);
});

it('does not move when the write is rolled back, so the feeds never report unsaved data', async () => {
  const before = await revision();
  await db.query("insert into bomedia.staff(display_name,login_name) values ('Temp','temp')");
  await db.exec('rollback');
  await db.exec('begin');
  expect(await revision()).toBe(before);
});

it('has a change trigger on every table the feeds read', async () => {
  const triggers = await db.query<{ table_name: string }>(
    "select c.relname as table_name from pg_trigger t join pg_class c on c.oid = t.tgrelid where t.tgname like 'bump_revision_%' order by 1");
  const expected = ['customers', 'expense_recoveries', 'expense_revisions', 'expenses', 'inventory_rolls', 'job_adjustments', 'job_revisions',
    'jobs', 'journal_entries', 'journal_lines', 'materials', 'orders', 'payment_allocations', 'payments', 'receipt_references', 'services', 'staff'];
  expect(triggers.rows.map((row) => row.table_name).sort()).toEqual(expected.sort());
});

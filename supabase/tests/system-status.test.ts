import type { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { insertId, testDatabase } from './helpers';

type Seen = { reference: string; at: string } | null;
type Status = { schema: { tracked: boolean; applied: number | null; latest: string | null }; last_sale: Seen; last_payment: Seen; last_expense: Seen;
  today: { sales: number; payments: number; expenses: number } };
let db: PGlite, customer: string;
const read = async () => (await db.query<{ r: Status }>('select bomedia.api_system_status() as r')).rows[0].r;
async function failure(work: () => Promise<unknown>, match: object) {
  await db.exec('savepoint rejected'); await expect(work()).rejects.toMatchObject(match); await db.exec('rollback to savepoint rejected');
}
beforeAll(async () => { db = await testDatabase(); }, 30_000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec('begin');
  for (const table of ['payments', 'expenses', 'orders']) await db.exec(`delete from bomedia.${table}`);
  customer = await insertId(db, "insert into bomedia.customers(display_name) values ('Grace Chapel') returning id");
});
afterEach(async () => { await db.exec('rollback'); });

it('reports nothing yet on an empty database, without failing', async () => {
  const status = await read();
  expect(status).toMatchObject({ last_sale: null, last_payment: null, last_expense: null, today: { sales: 0, payments: 0, expenses: 0 } });
});

it('returns the newest sale, payment and expense by readable reference, and counts only today in Lagos time', async () => {
  await db.query("insert into bomedia.orders(customer_id,created_at) values ($1, now() - interval '3 days')", [customer]);
  await db.query('insert into bomedia.orders(customer_id) values ($1)', [customer]);
  await db.query('insert into bomedia.payments(customer_id,amount_kobo,method) values ($1,150000,$2)', [customer, 'cash']);
  await db.query("insert into bomedia.expenses(amount_kobo,category,status,created_at) values (50000,'Ink','Paid', now() - interval '2 days')");
  await db.query("insert into bomedia.expenses(amount_kobo,category,status) values (70000,'Ink','Paid')");
  const status = await read();
  expect(status.today).toEqual({ sales: 1, payments: 1, expenses: 1 });
  expect(status.last_sale?.reference).toMatch(/^BOM-\d{8}-\d{4,}$/);
  expect(status.last_payment?.reference).toMatch(/^PAY-\d{8}-\d{4,}$/);
  expect(status.last_expense?.reference).toMatch(/^EXP-\d{8}-\d{4,}$/);
  expect(Date.now() - new Date(status.last_sale!.at).getTime()).toBeLessThan(60_000);
  expect(JSON.stringify(status)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
});

it('reads the migration ledger when there is one, and says it is untracked when there is not', async () => {
  expect((await read()).schema).toEqual({ tracked: false, applied: null, latest: null });
  await db.exec(`create schema migration_control;
    create table migration_control.applied_migrations (name text primary key, checksum text not null, applied_at timestamptz not null default now());
    insert into migration_control.applied_migrations(name,checksum) values ('202610030001_a.sql',repeat('a',64)),('202610110032_z.sql',repeat('b',64))`);
  expect((await read()).schema).toEqual({ tracked: true, applied: 2, latest: '202610110032_z.sql' });
});

it('runs for the accounting runtime only, and cannot change anything', async () => {
  await db.exec('set local role bomedia_financial_runtime');
  expect((await read()).today.sales).toBe(0);
  await failure(() => db.query('insert into bomedia.orders(customer_id) values ($1)', [customer]), { code: '42501' });
  await db.exec('reset role');
  for (const role of ['anon', 'authenticated', 'service_role', 'bomedia_auth_runtime']) {
    const result = await db.query<{ ok: boolean }>("select has_function_privilege($1,'bomedia.api_system_status()','EXECUTE') as ok", [role]);
    expect(result.rows[0].ok).toBe(false);
  }
});

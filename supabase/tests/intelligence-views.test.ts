import type { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { insertId, testDatabase } from './helpers';

let db: PGlite, ada: string, grace: string, flex: string, order: string, delivered: string, opening: string;

const reader = async (sql: string, params: unknown[] = []) => {
  await db.exec('reset role');
  await db.exec('set local role bomedia_intelligence_read');
  return (await db.query<Record<string, any>>(sql, params)).rows;
};
async function denied(work: () => Promise<unknown>) {
  await db.exec('savepoint denied');
  await expect(work()).rejects.toMatchObject({ code: '42501' });
  await db.exec('rollback to savepoint denied');
}

beforeAll(async () => { db = await testDatabase(); }, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec('begin');
  ada = await insertId(db, "insert into bomedia.staff(display_name,login_name) values ('Ada','ada') returning id");
  grace = await insertId(db, "insert into bomedia.customers(display_name,contact,notes) values ('Grace Chapel','0803','VIP') returning id");
  flex = await insertId(db, "insert into bomedia.materials(legacy_material_id,name,width_ft,selling_price_per_sqft_kobo) values ('MAT-FLEX','Flex',10,15000) returning id");
  await db.exec("insert into bomedia.bookkeeping_settings(starts_on,state) values ('2026-10-01','active')");
  order = await insertId(db, 'insert into bomedia.orders(customer_id,created_at) values ($1,$2) returning id', [grace, '2026-10-20T09:00:00Z']);
  delivered = await insertId(db, `insert into bomedia.jobs(order_id,customer_id,material_id,description,quantity,unit_price_kobo,amount_kobo,job_status,business_date,logged_by_snapshot)
    values ($1,$2,$3,'Banner',2,480000,960000,'Delivered','2026-10-20','Ada') returning id`, [order, grace, flex]);
  await db.query(`insert into bomedia.jobs(order_id,customer_id,description,quantity,unit_price_kobo,amount_kobo,job_status,business_date,cancelled_at,cancel_reason)
    values ($1,$2,'Mistake',1,0,0,'Cancelled','2026-10-20',now(),'Typo')`, [order, grace]);
  opening = await insertId(db, `insert into bomedia.jobs(order_id,customer_id,description,quantity,unit_price_kobo,amount_kobo,job_status,business_date,logged_by_snapshot)
    values ($1,$2,'Opening balance',1,50000,50000,'Delivered','2026-10-01','Sheet opening balance') returning id`, [order, grace]);
  const payment = await insertId(db, `insert into bomedia.payments(customer_id,amount_kobo,business_date,method,collected_by,collected_by_snapshot)
    values ($1,500000,'2026-10-21','cash',$2,'Ada') returning id`, [grace, ada]);
  await db.exec(`insert into bomedia.payment_allocations(payment_id,job_id,customer_id,amount_kobo,kind)
    values ('${payment}','${delivered}','${grace}',500000,'settlement')`);
  await db.exec(`insert into bomedia.job_adjustments(job_id,amount_kobo,kind,reason,business_date)
    values ('${opening}',-10000,'write_off','Agreed discount','2026-10-22')`);
  await db.exec(`insert into bomedia.customer_changes(customer_id,changed_by,changes)
    values ('${grace}','${ada}','{"contact":{"from":"0801","to":"0803"}}')`);
  await db.exec(`insert into bomedia.expenses(amount_kobo,business_date,category,description,status,logged_by_snapshot)
    values (120000,'2026-10-21','Transport','Delivery','Paid','Ada')`);
  await db.query("select bomedia.post_journal('cogs-delivered',$1::jsonb)", [JSON.stringify({ actor_id: ada, business_date: '2026-10-20', kind: 'sale', memo: 'Cost of Banner',
    lines: [{ account_code: '5000', debit_kobo: '300000', customer_id: grace, job_id: delivered }, { account_code: '1200', credit_kobo: '300000' }] })]);
  await db.query("select bomedia.post_journal('cogs-untied',$1::jsonb)", [JSON.stringify({ actor_id: ada, business_date: '2026-10-21', kind: 'adjustment', memo: 'Stock used',
    lines: [{ account_code: '5000', debit_kobo: '40000' }, { account_code: '1200', credit_kobo: '40000' }] })]);
}, 30000);
afterEach(async () => { await db.exec('rollback'); });

it('lets the reader select the intelligence views and nothing else', async () => {
  const rows = await reader('select id from intelligence.jobs');
  expect(rows).toHaveLength(3);
  await denied(() => reader('select id from bomedia.jobs'));
  await denied(() => reader("insert into intelligence.customers(id,reference,display_name) values (gen_random_uuid(),'CUS-9999','X')"));
  await denied(() => reader("update intelligence.books set state = 'setup'"));
  await denied(() => reader('select bomedia.customer_rows(null)'));
});

it('keeps anonymous and service callers out of the schema', async () => {
  await db.exec('reset role');
  await db.exec('set local role anon');
  await denied(() => db.query('select * from intelligence.books'));
  await db.exec('reset role');
  await db.exec('set local role service_role');
  await denied(() => db.query('select * from intelligence.books'));
  await db.exec('reset role');
});

it('sets the read-only default on the reader role', async () => {
  const [role] = (await db.query<{ rolconfig: string[] | null }>("select rolconfig from pg_roles where rolname = 'bomedia_intelligence_read'")).rows;
  expect(role.rolconfig).toEqual(expect.arrayContaining(['default_transaction_read_only=on', 'statement_timeout=8s']));
});

it('shows jobs with cancellation and opening-balance flags, and the material name', async () => {
  const jobs = await reader('select id, material_name, cancelled, opening_balance, amount_kobo, job_status from intelligence.jobs');
  expect(jobs).toHaveLength(3);
  expect(jobs.find((j) => j.id === opening)).toEqual({ id: opening, material_name: '', cancelled: false, opening_balance: true, amount_kobo: 50000, job_status: 'Delivered' });
  expect(jobs.find((j) => j.id === delivered)).toEqual({ id: delivered, material_name: 'Flex', cancelled: false, opening_balance: false, amount_kobo: 960000, job_status: 'Delivered' });
  expect(jobs.filter((j) => j.cancelled)).toEqual([expect.objectContaining({ material_name: '', opening_balance: false, amount_kobo: 0, job_status: 'Cancelled' })]);
});

it('carries payments, allocations and adjustments with the staff name and the customer reference', async () => {
  const [payment] = await reader('select reference, collected_by, method, amount_kobo, business_date::text as business_date from intelligence.payments');
  expect(payment).toMatchObject({ reference: expect.stringMatching(/^PAY-/), collected_by: 'Ada', method: 'cash', amount_kobo: 500000, business_date: '2026-10-21' });
  expect(await reader('select kind, amount_kobo from intelligence.payment_allocations')).toEqual([expect.objectContaining({ kind: 'settlement', amount_kobo: 500000 })]);
  expect(await reader('select kind, amount_kobo, reason from intelligence.job_adjustments')).toEqual([expect.objectContaining({ kind: 'write_off', amount_kobo: -10000 })]);
  const [customer] = await reader('select reference, display_name, contact, notes from intelligence.customers');
  expect(customer).toEqual({ reference: expect.stringMatching(/^CUS-\d{4,}$/), display_name: 'Grace Chapel', contact: '0803', notes: 'VIP' });
});

it('reports customer changes as field from/to, and expenses with their status', async () => {
  expect(await reader('select changed_by, changes from intelligence.customer_changes')).toEqual([
    { changed_by: 'Ada', changes: { contact: { from: '0801', to: '0803' } } },
  ]);
  expect(await reader('select category, amount_kobo, status, cancelled from intelligence.expenses')).toEqual([
    expect.objectContaining({ category: 'Transport', amount_kobo: 120000, status: 'Paid', cancelled: false }),
  ]);
});

it('nets cost of goods sold by business date and ties only the job-linked part to a job', async () => {
  expect(await reader('select business_date::text as business_date, cost_kobo from intelligence.daily_cost_of_goods_sold order by business_date')).toEqual([
    { business_date: '2026-10-20', cost_kobo: 300000 },
    { business_date: '2026-10-21', cost_kobo: 40000 },
  ]);
  expect(await reader('select job_id, cost_kobo from intelligence.job_costs')).toEqual([{ job_id: delivered, cost_kobo: 300000 }]);
});

it('reports the books and the newest change', async () => {
  expect(await reader('select starts_on::text as starts_on, state, closed_through::text as closed_through from intelligence.books')).toEqual([
    { starts_on: '2026-10-01', state: 'active', closed_through: null },
  ]);
  const [{ updated_at }] = await reader('select updated_at from intelligence.last_change');
  expect(updated_at).not.toBeNull();
});

it('gives orders the Lagos business date of the day they were made', async () => {
  expect(await reader('select reference, business_date::text as business_date from intelligence.orders')).toEqual([
    { reference: expect.stringMatching(/^BOM-/), business_date: '2026-10-20' },
  ]);
});

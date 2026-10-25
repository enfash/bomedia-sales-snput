import type { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { insertId, testDatabase } from './helpers';

let db: PGlite, ada: string, grace: string, flex: string, order: string, delivered: string;

const as = async (role: string, sql: string, params: unknown[] = []) => {
  await db.exec('reset role');
  await db.exec(`set local role ${role}`);
  return (await db.query<Record<string, any>>(sql, params)).rows;
};
const reader = (sql: string, params: unknown[] = []) => as('bomedia_intelligence_read', sql, params);
async function denied(work: () => Promise<unknown>, code = '42501') {
  await db.exec('savepoint denied');
  await expect(work()).rejects.toMatchObject({ code });
  await db.exec('rollback to savepoint denied');
}

beforeAll(async () => { db = await testDatabase(); }, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec('begin');
  ada = await insertId(db, "insert into bomedia.staff(display_name,login_name,pin_hash) values ('Ada','ada','hash') returning id");
  grace = await insertId(db, "insert into bomedia.customers(display_name,contact,notes) values ('Grace Chapel','0803','VIP') returning id");
  flex = await insertId(db, "insert into bomedia.materials(legacy_material_id,name,width_ft,selling_price_per_sqft_kobo) values ('MAT-FLEX','Flex',10,15000) returning id");
  await db.exec("insert into bomedia.bookkeeping_settings(starts_on,state) values ('2026-10-01','active')");
  order = await insertId(db, 'insert into bomedia.orders(customer_id,created_at) values ($1,$2) returning id', [grace, '2026-10-20T09:00:00Z']);
  delivered = await insertId(db, `insert into bomedia.jobs(order_id,customer_id,material_id,description,quantity,unit_price_kobo,amount_kobo,job_status,business_date)
    values ($1,$2,$3,'Banner',2,480000,960000,'Delivered','2026-10-20') returning id`, [order, grace, flex]);
  await db.query(`insert into bomedia.jobs(order_id,customer_id,description,quantity,unit_price_kobo,amount_kobo,job_status,business_date,cancelled_at,cancel_reason)
    values ($1,$2,'Mistake',1,0,0,'Cancelled','2026-10-20',now(),'Typo')`, [order, grace]);
  const payment = await insertId(db, `insert into bomedia.payments(customer_id,amount_kobo,business_date,method,collected_by,collected_by_snapshot)
    values ($1,500000,NULL,'cash',$2,'Ada') returning id`, [grace, ada]);
  await db.exec(`insert into bomedia.payment_allocations(payment_id,job_id,customer_id,amount_kobo,kind)
    values ('${payment}','${delivered}','${grace}',500000,'settlement')`);
  await db.exec(`insert into bomedia.customer_changes(customer_id,changed_by,changes)
    values ('${grace}','${ada}','{"contact":{"from":"0801","to":"0803"}}')`);
  await db.exec(`insert into bomedia.expenses(amount_kobo,business_date,category,description,status)
    values (120000,'2026-10-21','Transport','Delivery','Paid')`);
  await db.query("select bomedia.post_journal('cogs-delivered',$1::jsonb)", [JSON.stringify({ actor_id: ada, business_date: '2026-10-20', kind: 'sale', memo: 'Cost of Banner', source_type: 'job', source_id: delivered,
    lines: [{ account_code: '5000', debit_kobo: '300000', customer_id: grace, job_id: delivered }, { account_code: '1200', credit_kobo: '300000' }] })]);
  await db.query("select bomedia.post_journal('cogs-untied',$1::jsonb)", [JSON.stringify({ actor_id: ada, business_date: '2026-10-21', kind: 'adjustment', memo: 'Stock used',
    lines: [{ account_code: '5000', debit_kobo: '40000' }, { account_code: '1200', credit_kobo: '40000' }] })]);
}, 30000);
afterEach(async () => { await db.exec('rollback'); });

it('lets the reader select the v_ views, with money as text and dates as YYYY-MM-DD', async () => {
  expect(await reader('select contract_version from intelligence.v_contract')).toEqual([{ contract_version: '1' }]);
  const [job] = await reader("select id, material, amount_kobo, business_date, date_from_created, status from intelligence.v_jobs where id = $1", [delivered]);
  expect(job).toEqual({ id: delivered, material: 'Flex', amount_kobo: '960000', business_date: '2026-10-20', date_from_created: false, status: 'Delivered' });
  expect(await reader('select reference, collected_by, amount_kobo, date_from_created from intelligence.v_payments')).toEqual([
    expect.objectContaining({ reference: expect.stringMatching(/^PAY-/), collected_by: 'Ada', amount_kobo: '500000', date_from_created: true }),
  ]);
});

it('falls back to the creation date, and flags it, for rows with no business date', async () => {
  const [payment] = await reader('select business_date, date_from_created from intelligence.v_payments');
  expect(payment.date_from_created).toBe(true);
  expect(payment.business_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

it('keeps contact details out of the main customer view, and returns them only from the contacts view', async () => {
  const [customer] = await reader('select * from intelligence.v_customers');
  expect(Object.keys(customer)).not.toContain('contact');
  expect(Object.keys(customer)).not.toContain('notes');
  expect(await reader('select contact, notes from intelligence.v_customer_contacts')).toEqual([{ contact: '0803', notes: 'VIP' }]);
});

it('nets cost of goods sold by date and ties the job-linked part to its job', async () => {
  expect(await reader('select business_date, cost_kobo from intelligence.v_daily_cost order by business_date')).toEqual([
    { business_date: '2026-10-20', cost_kobo: '300000' },
    { business_date: '2026-10-21', cost_kobo: '40000' },
  ]);
  expect(await reader('select job_id, cost_kobo from intelligence.v_job_cost')).toEqual([{ job_id: delivered, cost_kobo: '300000' }]);
});

it('reports the books, the expense account, and a freshness time', async () => {
  expect(await reader('select starts_on, state from intelligence.v_books')).toEqual([{ starts_on: '2026-10-01', state: 'active' }]);
  expect(await reader('select category, amount_kobo, account_code, status from intelligence.v_expenses')).toEqual([
    { category: 'Transport', amount_kobo: '120000', account_code: '6000', status: 'Paid' },
  ]);
  const [{ updated_at }] = await reader('select updated_at from intelligence.v_freshness');
  expect(updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
});

it('lets the reader select the views and nothing else', async () => {
  await denied(() => reader('select id from bomedia.jobs'));
  await denied(() => reader('select pin_hash from bomedia.staff'));
  await denied(() => reader("insert into intelligence.v_contract(contract_version) values ('2')"), '55000');
  await denied(() => reader("update bomedia.customers set notes = 'x'"));
  await denied(() => reader('select bomedia.customer_rows(null)'));
  await denied(() => reader('select * from intelligence.jobs'), '42P01');
});

it('keeps anonymous and service callers out of the schema', async () => {
  await denied(() => as('anon', 'select * from intelligence.v_contract'));
  await denied(() => as('service_role', 'select * from intelligence.v_contract'));
});

it('gives the view owner only the columns it needs, with no PINs, sessions or write access', async () => {
  expect(await as('intelligence_owner', 'select display_name from bomedia.staff where id = $1', [ada])).toEqual([{ display_name: 'Ada' }]);
  await denied(() => as('intelligence_owner', 'select pin_hash from bomedia.staff'));
  await denied(() => as('intelligence_owner', 'select login_name from bomedia.staff'));
  await denied(() => as('intelligence_owner', "insert into bomedia.customers(display_name) values ('X')"));
  await denied(() => as('intelligence_owner', 'select * from bomedia.sessions'));
});

it('the reader login is read-only by default and has a statement timeout', async () => {
  const [role] = (await db.query<{ rolconfig: string[] | null }>("select rolconfig from pg_roles where rolname = 'bomedia_intelligence_read'")).rows;
  expect(role.rolconfig).toEqual(expect.arrayContaining(['default_transaction_read_only=on', 'statement_timeout=15s']));
});

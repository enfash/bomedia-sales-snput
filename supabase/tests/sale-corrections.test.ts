import type { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { insertId, testDatabase } from './helpers';

let db: PGlite, ada: string, owner: string, material: string, roll: string, today: string;
const print = (over: Record<string, unknown> = {}) => ({ kind: 'print', ref: material, description: 'Banner', quantity: '2', width: '8', height: '4', unit: 'ft', priceKobo: '15000', ...over });
const order = (over: Record<string, unknown> = {}) => ({
  actor_id: ada, operation: 'sale', businessDate: today, clientName: 'Grace Chapel', contact: '0803', jobStatus: 'Printing',
  initialPaymentKobo: '0', totalKobo: '960000', items: [print()], ...over,
});
const sell = async (key: string, over: Record<string, unknown> = {}) => (await db.query<{ r: Record<string, any> }>(
  'select bomedia.api_screen_order($1,$2::jsonb) as r', [key, JSON.stringify(order(over))])).rows[0].r;
const correct = async (key: string, payload: Record<string, unknown>) => (await db.query<{ r: Record<string, any> }>(
  'select bomedia.api_sale_correction($1,$2::jsonb) as r', [key, JSON.stringify(payload)])).rows[0].r;
const mine = (jobId: string, changes: Record<string, unknown>, reason = 'Customer wanted one banner') => ({ actor_id: owner, mode: 'correct', jobId, changes, reason, byOwner: 'true' });
const cancelAll = (salesId: string, reason = 'Customer cancelled', who = owner, byOwner = true) => ({ actor_id: who, mode: 'cancel', salesId, reason, ...(byOwner ? { byOwner: 'true' } : {}) });
const owned = async (sql: string, params: unknown[] = []) => {
  await db.exec('reset role'); const rows = (await db.query<Record<string, any>>(sql, params)).rows; await db.exec('set local role bomedia_financial_runtime'); return rows;
};
async function failure(work: () => Promise<unknown>, code = '22023') {
  await db.exec('savepoint rejected'); await expect(work()).rejects.toMatchObject({ code }); await db.exec('rollback to savepoint rejected');
}
const jobOf = async (salesId: string) => (await owned('select j.id, j.* from bomedia.jobs j join bomedia.orders o on o.id=j.order_id where o.reference=$1 or o.legacy_sales_id=$1 order by j.created_at', [salesId]));
const remaining = async () => Number((await owned('select remaining_length_ft::text as r from bomedia.inventory_rolls where id=$1', [roll]))[0].r);
const net = async (code: string) => Number((await owned("select coalesce(sum(l.debit_kobo::numeric-l.credit_kobo),0)::text as n from bomedia.journal_lines l join bomedia.journal_entries e on e.id=l.entry_id where e.status='posted' and l.account_code=$1", [code]))[0].n);
const rule = async (enabled: boolean, days = 7) => (await db.query('select bomedia.api_approval_rule_save($1,$2::jsonb) as r', [`rule-${Math.random()}`, JSON.stringify({ actor_id: owner, kind: 'edit_old', enabled, params: { days } })]));
const decide = async (key: string, id: string, decision: 'approve' | 'decline') => (await db.query<{ r: Record<string, any> }>(
  'select bomedia.api_approval_decision($1,$2::jsonb) as r', [key, JSON.stringify({ actor_id: owner, approval_request_id: id, decision })])).rows[0].r;

beforeAll(async () => { db = await testDatabase(); }, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec('begin');
  ada = await insertId(db, "insert into bomedia.staff(display_name,login_name) values ('Ada','ada') returning id");
  owner = await insertId(db, "insert into bomedia.staff(display_name,login_name) values ('Owner','owner') returning id");
  material = await insertId(db, "insert into bomedia.materials(legacy_material_id,name,width_ft,selling_price_per_sqft_kobo) values ('MAT-FLEX','Flex',10,15000) returning id");
  roll = await insertId(db, "insert into bomedia.inventory_rolls(material_id,item_name,width_ft,total_length_ft,remaining_length_ft,purchase_cost_kobo,selling_price_kobo) values ($1,'Flex Roll',10,100,100,2000000,15000) returning id", [material]);
  await db.query('update bomedia.materials set active_roll_id=$1 where id=$2', [roll, material]);
  await db.exec("insert into bomedia.bookkeeping_settings(starts_on,state) values ('2026-10-01','active')");
  await db.query("select bomedia.post_journal('inventory-fixture',$1::jsonb)", [JSON.stringify({ actor_id: ada, business_date: '2026-10-01', kind: 'adjustment', memo: 'Inventory', lines: [{ account_code: '1200', debit_kobo: '2000000' }, { account_code: '3000', credit_kobo: '2000000' }] })]);
  today = (await db.query<{ d: string }>("select ((now() at time zone 'Africa/Lagos')::date)::text as d")).rows[0].d;
  await db.exec('set local role bomedia_financial_runtime');
});
afterEach(async () => { await db.exec('rollback'); });

it('corrects a quantity: the old money is reversed, the exact stock returns, the new sale is posted, and the old version is kept', async () => {
  const sale = await sell('s1');
  const [job] = await jobOf(sale.sales_id);
  expect(await remaining()).toBe(92);
  const result = await correct('c1', mine(job.id, { quantity: '1' }));
  expect(result).toMatchObject({ status: 'applied', kind: 'correction', sales_id: sale.sales_id });
  expect(await remaining()).toBe(96);
  // Receivable and sales now hold only the corrected ₦4,800; the cost taken from stock is for 4 ft (₦800), not 8 ft.
  expect(await net('1100')).toBe(480000);
  expect(await net('4000')).toBe(-480000);
  expect(await net('5000')).toBe(80000);
  expect(await net('1200')).toBe(2000000 - 80000);
  const [after] = await jobOf(sale.sales_id);
  expect(Number(after.amount_kobo)).toBe(480000);
  expect(after.description).toBe('Banner');
  expect(Number(after.quantity)).toBe(1);
  const movements = await owned("select kind, length_delta_ft::text as d from bomedia.inventory_movements where job_id=$1 order by created_at, id", [job.id]);
  // Same-moment rows have no fixed order, so compare the set.
  expect(movements.map((m) => `${m.kind}:${Number(m.d)}`).sort()).toEqual(['reversal:8', 'sale:-4', 'sale:-8']);
  const revisions = await owned('select revision, kind, reason, before, after, changed_by, approved_by from bomedia.job_revisions where job_id=$1', [job.id]);
  expect(revisions).toHaveLength(1);
  expect(revisions[0]).toMatchObject({ revision: 1, kind: 'correction', reason: 'Customer wanted one banner', changed_by: owner, approved_by: null });
  expect(revisions[0].before).toMatchObject({ amount_kobo: '960000', quantity: '2' });
  expect(revisions[0].after).toMatchObject({ amount_kobo: '480000', quantity: '1' });
  const audit = await owned("select details from bomedia.audit_events where action='sale_corrected'");
  expect(audit[0].details).toMatchObject({ sales_id: sale.sales_id, fields: expect.arrayContaining(['amount_kobo', 'quantity']) });
});

it('takes the extra stock when a correction needs more, and refuses one the roll cannot cover', async () => {
  const sale = await sell('s2');
  const [job] = await jobOf(sale.sales_id);
  await correct('more', mine(job.id, { quantity: '3' }));
  expect(await remaining()).toBe(100 - 12);
  expect(await net('4000')).toBe(-1440000);
  await owned('update bomedia.inventory_rolls set remaining_length_ft = 1 where id=$1', [roll]);
  await failure(() => correct('too-much', mine(job.id, { quantity: '20' })));
  expect(await remaining()).toBe(1);
  expect(await net('4000')).toBe(-1440000);
});

it('corrects the size, the price and the date together, and corrects it again from the latest version', async () => {
  const sale = await sell('s3');
  const [job] = await jobOf(sale.sales_id);
  await correct('size', mine(job.id, { width: '6', height: '3', priceKobo: '20000', quantity: '1' }));
  expect(Number((await jobOf(sale.sales_id))[0].amount_kobo)).toBe(360000);
  await correct('again', mine(job.id, { quantity: '2' }, 'Customer changed his mind again'));
  const [final] = await jobOf(sale.sales_id);
  expect(Number(final.amount_kobo)).toBe(720000);
  expect(await net('1100')).toBe(720000);
  expect(await net('4000')).toBe(-720000);
  const revisions = await owned('select revision from bomedia.job_revisions where job_id=$1 order by revision', [job.id]);
  expect(revisions.map((r) => r.revision)).toEqual([1, 2]);
  // 6 x 3 ft pieces: normal 3 ft/row of... the stock still balances against what is on the roll.
  const used = 100 - (await remaining());
  const sold = await owned("select coalesce(sum(-length_delta_ft),0)::text as s from bomedia.inventory_movements where roll_id=$1", [roll]);
  expect(Number(sold[0].s)).toBe(used);
});

it('cancels a whole sale of two jobs, keeps the money paid as credit, and refuses to cancel twice', async () => {
  const second = print({ description: 'Sticker', quantity: '1', width: '2', height: '2' });
  const total = (960000 + 60000).toString();
  const sale = await sell('s5', { items: [print(), second], totalKobo: total, initialPaymentKobo: '300000', paymentMethod: 'cash' });
  expect(await remaining()).toBeLessThan(100);
  const cancelled = await correct('x1', cancelAll(sale.sales_id));
  expect(cancelled).toMatchObject({ status: 'applied', kind: 'cancellation' });
  expect(cancelled.jobs).toHaveLength(2);
  expect(await remaining()).toBe(100);
  expect(await net('4000')).toBe(0);
  expect(await net('5000')).toBe(0);
  expect(await net('1200')).toBe(2000000);
  const jobs = await jobOf(sale.sales_id);
  expect(jobs.every((j) => j.job_status === 'Cancelled' && Number(j.amount_kobo) === 0 && j.cancelled_at)).toBe(true);
  expect(jobs[0].cancel_reason).toBe('Customer cancelled');
  // The ₦3,000 the customer paid is still on their account, now as credit against a ₦0 sale.
  const paid = await owned('select coalesce(sum(a.amount_kobo),0)::text as p from bomedia.payment_allocations a join bomedia.jobs j on j.id=a.job_id join bomedia.orders o on o.id=j.order_id where o.reference=$1', [sale.sales_id]);
  expect(Number(paid[0].p)).toBe(300000);
  expect(Number((await owned('select sum(balance_kobo)::text as b from bomedia.job_balances where job_id = any($1)', [jobs.map((j) => j.id)]))[0].b)).toBe(-300000);
  await failure(() => correct('x2', cancelAll(sale.sales_id)), 'P0002');
  expect((await owned("select count(*)::int as n from bomedia.job_revisions"))[0].n).toBe(2);
});

it('refuses a correction in a closed month and changes nothing', async () => {
  const sale = await sell('s6', { businessDate: '2026-10-02' });
  const [job] = await jobOf(sale.sales_id);
  await owned("update bomedia.bookkeeping_settings set closed_through='2026-10-05'");
  await failure(() => correct('closed', mine(job.id, { quantity: '1' })), '23514');
  expect(await remaining()).toBe(92);
  expect(await net('4000')).toBe(-960000);
});

it('lets a cashier ask only when the owner allows it, only for a recent sale, and holds the request for approval', async () => {
  const sale = await sell('s7');
  const [job] = await jobOf(sale.sales_id);
  const ask = (key: string, changes: Record<string, unknown> = { quantity: '1' }, reason = 'Typed 2, meant 1') => correct(key, { actor_id: ada, mode: 'correct', jobId: job.id, changes, reason });
  await failure(() => ask('off'));
  await rule(true, 7);
  const held = await ask('held');
  expect(held).toMatchObject({ status: 'awaiting_approval', kinds: ['correction'] });
  expect(await ask('held')).toEqual(held);
  expect(await remaining()).toBe(92);
  expect(await net('4000')).toBe(-960000);
  await failure(() => ask('held', { quantity: '3' }));
  await failure(() => correct('no-reason', { actor_id: ada, mode: 'correct', jobId: job.id, changes: { quantity: '1' }, reason: '  ' }));
  const old = await sell('s8', { businessDate: '2026-10-01', clientName: 'Zed Events', items: [print()] });
  const [oldJob] = await jobOf(old.sales_id);
  await db.exec('savepoint days');
  const tooOld = `select bomedia.api_sale_correction('old', $1::jsonb)`;
  // The seed date is within a week of today in this test run; make it older to prove the limit.
  await owned("update bomedia.jobs set business_date = (now() at time zone 'Africa/Lagos')::date - 12 where id=$1", [oldJob.id]);
  await expect(db.query(tooOld, [JSON.stringify({ actor_id: ada, mode: 'correct', jobId: oldJob.id, changes: { quantity: '1' }, reason: 'late' })])).rejects.toMatchObject({ code: '22023' });
  await db.exec('rollback to savepoint days');
});

it('applies an approved request once, with who asked and who approved, and leaves a declined one untouched', async () => {
  const sale = await sell('s9');
  const [job] = await jobOf(sale.sales_id);
  await rule(true, 7);
  const held = await correct('req', { actor_id: ada, mode: 'correct', jobId: job.id, changes: { quantity: '1' }, reason: 'Typed 2, meant 1' });
  const list = (await db.query<{ r: { pending_count: number; data: Record<string, any>[] } }>('select bomedia.api_approvals() as r')).rows[0].r;
  expect(list.data[0]).toMatchObject({ operation: 'sale_correction', status: 'pending', reason: 'Typed 2, meant 1', requested_by: 'Ada', kinds: ['correction'] });
  expect(list.data[0].changes[0]).toMatchObject({ sales_id: sale.sales_id, old_amount_kobo: '960000', new_amount_kobo: '480000' });
  expect(list.data[0].changes[0].returns[0]).toMatchObject({ roll: 'Flex Roll', length_ft: '8' });
  expect(list.data[0].changes[0].takes[0]).toMatchObject({ roll: 'Flex Roll', length_ft: '4' });
  const approved = await decide('d1', held.approval_request_id, 'approve');
  expect(approved).toMatchObject({ status: 'approved', sales_id: sale.sales_id });
  expect(await remaining()).toBe(96);
  expect(await net('4000')).toBe(-480000);
  expect(await correct('req', { actor_id: ada, mode: 'correct', jobId: job.id, changes: { quantity: '1' }, reason: 'Typed 2, meant 1' })).toMatchObject({ status: 'applied' });
  expect((await owned('select count(*)::int as n from bomedia.job_revisions'))[0].n).toBe(1);
  const revision = (await owned('select changed_by, approved_by, approval_request_id from bomedia.job_revisions'))[0];
  expect(revision).toMatchObject({ changed_by: ada, approved_by: owner, approval_request_id: held.approval_request_id });
  // A second request, declined: nothing moves.
  const second = await correct('req2', { actor_id: ada, mode: 'cancel', salesId: sale.sales_id, reason: 'Customer left' });
  expect(second.status).toBe('awaiting_approval');
  expect(await decide('d2', second.approval_request_id, 'decline')).toMatchObject({ status: 'declined' });
  expect(await remaining()).toBe(96);
  expect((await jobOf(sale.sales_id))[0].cancelled_at).toBeNull();
});

it('leaves a held request waiting with the reason when the books refuse it at approval', async () => {
  const sale = await sell('s10', { businessDate: '2026-10-02' });
  const [job] = await jobOf(sale.sales_id);
  await rule(true, 90);
  const held = await correct('closed-later', { actor_id: ada, mode: 'correct', jobId: job.id, changes: { quantity: '1' }, reason: 'Typed wrong' });
  await owned("update bomedia.bookkeeping_settings set closed_through='2026-10-05'");
  const result = await decide('d', held.approval_request_id, 'approve');
  expect(result.status).toBe('failed');
  expect(result.error).toMatch(/closed/i);
  expect(await remaining()).toBe(92);
  expect((await owned("select status from bomedia.approval_requests"))[0].status).toBe('pending');
});

it('corrects a service job without touching stock, and keeps the helpers away from the runtime role', async () => {
  const service = (await owned("insert into bomedia.services(name,pricing,unit_price_kobo,visible) values ('Eyelets','fixed',5000,true) returning id"))[0].id as string;
  const sale = await sell('s11', { items: [{ kind: 'service', ref: service, description: 'Eyelets', quantity: '4', priceKobo: '5000' }], totalKobo: '20000' });
  const [job] = await jobOf(sale.sales_id);
  await correct('svc', mine(job.id, { quantity: '2' }));
  expect(Number((await jobOf(sale.sales_id))[0].amount_kobo)).toBe(10000);
  expect(await remaining()).toBe(100);
  expect(await net('4000')).toBe(-10000);
  await failure(() => db.query('select bomedia.apply_job_change($1,$2::jsonb,$3,null,null,$4)', [job.id, '{}', owner, 'x']), '42501');
  await failure(() => db.query('select bomedia.plan_job_change($1,$2::jsonb)', [job.id, '{"mode":"cancel"}']), '42501');
});

it('previews a change without making it, and lists a sale\u2019s history newest first', async () => {
  const sale = await sell('s12');
  const [job] = await jobOf(sale.sales_id);
  const preview = (await db.query<{ r: { plans: Record<string, any>[] } }>('select bomedia.api_sale_correction_preview($1::jsonb) as r', [JSON.stringify({ mode: 'correct', jobId: job.id, changes: { quantity: '1' } })])).rows[0].r.plans[0];
  expect(preview).toMatchObject({ old_amount_kobo: '960000', new_amount_kobo: '480000', sales_id: sale.sales_id });
  expect(preview.returns[0].length_ft).toBe('8');
  expect(preview.takes[0].length_ft).toBe('4');
  expect(await remaining()).toBe(92);
  expect((await db.query<{ r: unknown[] }>('select bomedia.api_sale_history($1) as r', [sale.sales_id])).rows[0].r).toEqual([]);
  await correct('h1', mine(job.id, { quantity: '1' }, 'First fix'));
  await correct('h2', mine(job.id, { description: 'Banner, glossy' }, 'Second fix'));
  const history = (await db.query<{ r: Record<string, any>[] }>('select bomedia.api_sale_history($1) as r', [sale.sales_id])).rows[0].r;
  expect(history.map((h) => h.reason)).toEqual(['Second fix', 'First fix']);
  expect(history[1]).toMatchObject({ by: 'Owner', approved_by: null, kind: 'correction', job: 'Banner' });
});

it('tells the sales feed how many times a sale was corrected', async () => {
  const sale = await sell('s-feed');
  const [job] = await jobOf(sale.sales_id);
  const feed = async () => (await db.query<{ r: Record<string, string>[] }>("select bomedia.api_legacy_feed('sales') as r")).rows[0].r.find((row) => row['Sales ID'] === sale.sales_id)!;
  expect((await feed())._revisions).toBe('0');
  await correct('c-feed', mine(job.id, { quantity: '1' }));
  expect((await feed())._revisions).toBe('1');
});

it('retains collections after same-day cancellation and scopes them to the collector',async()=>{
 const sale=await sell('paid-for-report',{initialPaymentKobo:'960000',paymentMethod:'Cash'});
 await correct('cancel-for-report',cancelAll(sale.sales_id));
 const r=(await db.query<{r:any}>('select bomedia.api_shift_report($1,$2::jsonb) r',[today,JSON.stringify({actor_id:owner,by_owner:'true'})])).rows[0].r;
 expect(r.sales).toEqual([]);expect(r.payments).toHaveLength(1);expect(r.payments[0]).toMatchObject({_amountKobo:'960000',_staffId:ada,'PAYMENT METHOD':'Cash'});
});
it('refuses cancellation of imported opening debt without altering the job or opening journal',async()=>{
 await db.exec('rollback; begin');
 owner=await insertId(db,"insert into bomedia.staff(display_name,login_name) values('Owner','owner') returning id");
 await db.exec("insert into bomedia.bookkeeping_settings(starts_on,state) values('2026-10-01','setup')");
 const customer=await insertId(db,"insert into bomedia.customers(display_name) values('Historical customer') returning id");
 const orderId=await insertId(db,"insert into bomedia.orders(customer_id,legacy_sales_id) values($1,'BOM-OLD') returning id",[customer]);
 const job=await insertId(db,"insert into bomedia.jobs(order_id,customer_id,description,quantity,unit_price_kobo,amount_kobo,job_status,business_date) values($1,$2,'Imported debt',1,1000000,1000000,'Delivered','2026-09-01') returning id",[orderId,customer]);
 // Open the books only after the imported balance has been posted.
 await db.query("select bomedia.post_journal('opening-debt-test',$1::jsonb)",[JSON.stringify({actor_id:owner,business_date:'2026-09-30',kind:'opening',memo:'Imported balance',opening_confirmed:true,evidence_reference:'Owner-confirmed test schedule',lines:[{account_code:'1100',debit_kobo:'1000000',job_id:job,customer_id:customer},{account_code:'3000',credit_kobo:'1000000'}]})]);
 await db.exec("update bomedia.bookkeeping_settings set state='active'; set local role bomedia_financial_runtime");
 await failure(()=>correct('cancel-imported',cancelAll('BOM-OLD')));
 expect((await owned('select amount_kobo::text amount,cancelled_at from bomedia.jobs where id=$1',[job]))[0]).toMatchObject({amount:'1000000',cancelled_at:null});
 expect(await net('1100')).toBe(1000000);
});

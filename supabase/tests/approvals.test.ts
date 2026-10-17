import type { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { insertId, testDatabase } from './helpers';

let db: PGlite, ada: string, owner: string, bea: string, material: string, today: string;
const print = (priceKobo = '15000') => ({ kind: 'print', ref: material, description: 'Banner', quantity: '2', width: '8', height: '4', unit: 'ft', priceKobo });
const order = (over: Record<string, unknown> = {}) => ({
  actor_id: ada, operation: 'sale', businessDate: today, clientName: 'Grace Chapel', contact: '0803', jobStatus: 'Printing',
  initialPaymentKobo: '0', totalKobo: '960000', items: [print()], ...over,
});
const send = async (key: string, payload: Record<string, unknown>) => (await db.query<{ result: Record<string, any> }>(
  'select bomedia.api_screen_order($1,$2::jsonb) as result', [key, JSON.stringify(payload)])).rows[0].result;
// A cashier entry. `approvalReason` is what the cashier types when asked why.
const cashier = (key: string, extra: Record<string, unknown> = {}, reason: string | null = 'Customer paid last week') =>
  send(key, order({ ...(reason ? { approvalReason: reason } : {}), ...extra }));
const asOwner = (key: string, extra: Record<string, unknown> = {}) => send(key, order({ actor_id: owner, by_owner: true, ...extra }));
const rule = async (kind: string, enabled: boolean, params: Record<string, unknown>) => (await db.query<{ result: Record<string, any> }>(
  'select bomedia.api_approval_rule_save($1,$2::jsonb) as result', [`rule-${kind}-${Math.random()}`, JSON.stringify({ actor_id: owner, kind, enabled, params })])).rows[0].result;
const decide = async (key: string, id: string, decision: 'approve' | 'decline', note?: string) => (await db.query<{ result: Record<string, any> }>(
  'select bomedia.api_approval_decision($1,$2::jsonb) as result', [key, JSON.stringify({ actor_id: owner, approval_request_id: id, decision, ...(note ? { note } : {}) })])).rows[0].result;
const owned = async (sql: string, params: unknown[] = []) => {
  await db.exec('reset role'); const rows = (await db.query<Record<string, any>>(sql, params)).rows; await db.exec('set local role bomedia_financial_runtime'); return rows;
};
async function failure(work: () => Promise<unknown>, code = '22023') {
  await db.exec('savepoint rejected'); await expect(work()).rejects.toMatchObject({ code }); await db.exec('rollback to savepoint rejected');
}
const daysFromToday = async (n: number) => (await owned("select ((now() at time zone 'Africa/Lagos')::date + $1::int)::text as d", [n]))[0].d as string;
const count = async (table: string) => (await owned(`select count(*)::int as n from bomedia.${table}`))[0].n as number;

beforeAll(async () => { db = await testDatabase(); }, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec('begin');
  ada = await insertId(db, "insert into bomedia.staff(display_name,login_name) values ('Ada','ada') returning id");
  owner = await insertId(db, "insert into bomedia.staff(display_name,login_name) values ('Owner','owner') returning id");
  bea = await insertId(db, "insert into bomedia.staff(display_name,login_name) values ('Bea','bea') returning id");
  material = await insertId(db, "insert into bomedia.materials(legacy_material_id,name,width_ft,selling_price_per_sqft_kobo) values ('MAT-FLEX','Flex',10,15000) returning id");
  const roll = await insertId(db, "insert into bomedia.inventory_rolls(material_id,item_name,width_ft,total_length_ft,remaining_length_ft,purchase_cost_kobo,selling_price_kobo) values ($1,'Flex Roll',10,100,100,2000000,15000) returning id", [material]);
  await db.query('update bomedia.materials set active_roll_id=$1 where id=$2', [roll, material]);
  await db.exec("insert into bomedia.bookkeeping_settings(starts_on,state) values ('2026-10-01','active')");
  await db.query("select bomedia.post_journal('inventory-fixture',$1::jsonb)", [JSON.stringify({ actor_id: ada, business_date: '2026-10-01', kind: 'adjustment', memo: 'Inventory', lines: [{ account_code: '1200', debit_kobo: '2000000' }, { account_code: '3000', credit_kobo: '2000000' }] })]);
  today = (await db.query<{ d: string }>("select ((now() at time zone 'Africa/Lagos')::date)::text as d")).rows[0].d;
  await db.exec('set local role bomedia_financial_runtime');
});
afterEach(async () => { await db.exec('rollback'); });

it('starts with both rules off, so a backdated or re-priced cashier sale posts exactly as before', async () => {
  const rules = (await db.query<{ r: { kind: string; enabled: boolean }[] }>('select bomedia.api_approval_rules() as r')).rows[0].r;
  expect(rules).toEqual([{ kind: 'date', enabled: false, params: { days: 0 } }, { kind: 'edit_old', enabled: false, params: { days: 7 } }, { kind: 'expense_limit', enabled: false, params: { amount_kobo: 5000000 } }, { kind: 'price', enabled: false, params: { percent: 0 } }]);
  const result = await cashier('plain', { businessDate: await daysFromToday(-3), items: [print('12000')], totalKobo: '768000' }, null);
  expect(result.sales_id).toMatch(/^BOM-/);
  expect(await count('approval_requests')).toBe(0);
});

it('lets only a rule that exists be saved, with sensible limits, and records who changed it', async () => {
  expect(await rule('date', true, { days: 2 })).toEqual({ kind: 'date', enabled: true, params: { days: 2 } });
  await failure(() => rule('date', true, { days: 31 }));
  await failure(() => rule('date', true, { days: 1.5 }));
  await failure(() => rule('price', true, { percent: 101 }));
  await failure(() => rule('nonsense', true, {}));
    expect((await owned("select action from bomedia.audit_events where action='approval_rule_saved'")).length).toBe(1);
  expect((await owned("select bomedia.audit_category('approval_requested') as c"))[0].c).toBe('approvals');
});

it('holds a cashier sale dated away from today and posts nothing until the owner decides', async () => {
  await rule('date', true, { days: 0 });
  const date = await daysFromToday(-3);
  const held = await cashier('backdated', { businessDate: date });
  expect(held).toMatchObject({ status: 'awaiting_approval', kinds: ['date'], request_id: 'backdated' });
  expect(await count('orders')).toBe(0); expect(await count('jobs')).toBe(0);
  expect(await owned('select remaining_length_ft::text as n from bomedia.inventory_rolls')).toEqual([{ n: '100.000000' }]);
  const [row] = await owned('select changes,reason,status from bomedia.approval_requests');
  expect(row).toMatchObject({ status: 'pending', reason: 'Customer paid last week' });
  expect(row.changes).toEqual([{ kind: 'date', normal: today, asked: date, days_off: -3 }]);
  // The same request again is the same request, not a second one.
  expect(await cashier('backdated', { businessDate: date })).toEqual(held);
  expect(await count('approval_requests')).toBe(1);
  const other = await daysFromToday(-4);
  await failure(() => cashier('backdated', { businessDate: other }));
});

it('lets today through, and gives the owner his own entries without asking', async () => {
  await rule('date', true, { days: 0 }); await rule('price', true, { percent: 0 });
  expect((await cashier('today', {}, null)).sales_id).toBeTruthy();
  expect((await asOwner('owner-back', { businessDate: await daysFromToday(-3), items: [print('12000')], totalKobo: '768000' })).sales_id).toBeTruthy();
  expect(await count('approval_requests')).toBe(0);
});

it('honours the days of grace and the price tolerance, in both directions', async () => {
  await rule('date', true, { days: 3 }); await rule('price', true, { percent: 25 });
  expect((await cashier('grace', { businessDate: await daysFromToday(-3) }, null)).sales_id).toBeTruthy();
  expect((await cashier('too-old', { businessDate: await daysFromToday(-4) })).status).toBe('awaiting_approval');
  expect((await cashier('future', { businessDate: await daysFromToday(4) })).status).toBe('awaiting_approval');
  expect((await cashier('inside', { items: [print('12000')], totalKobo: '768000' }, null)).sales_id).toBeTruthy();
  expect((await cashier('below', { items: [print('10000')], totalKobo: '640000' })).kinds).toEqual(['price']);
  expect((await cashier('above', { items: [print('20000')], totalKobo: '1280000' })).kinds).toEqual(['price']);
});

it('describes a held price in plain figures, and puts both reasons in one request', async () => {
  await rule('date', true, { days: 0 }); await rule('price', true, { percent: 0 });
  const held = await cashier('both', { businessDate: await daysFromToday(-1), items: [print('12000')], totalKobo: '768000' });
  expect(held.kinds).toEqual(['date', 'price']);
  const [row] = await owned('select changes,summary from bomedia.approval_requests');
  expect(row.changes.find((c: { kind: string }) => c.kind === 'price')).toEqual({
    kind: 'price', item: 'Banner', material: 'Flex', list_per_sqft_kobo: '15000', typed_per_sqft_kobo: '12000', percent_off: -20.0 });
  expect(row.summary).toEqual({ client: 'Grace Chapel', total_kobo: '768000', items: ['Banner'] });
});

it('needs a reason from the cashier before it will hold anything', async () => {
  await rule('date', true, { days: 0 });
  const backdated = await daysFromToday(-2);
  await failure(() => cashier('no-reason', { businessDate: backdated }, null));
  expect(await count('approval_requests')).toBe(0);
});

it('posts exactly what was held when approved, once, and answers a retry with the posted sale', async () => {
  await rule('date', true, { days: 0 });
  const date = await daysFromToday(-3);
  const held = await cashier('approve-me', { businessDate: date, initialPaymentKobo: '500000', paymentMethod: 'transfer' });
  const id = held.approval_request_id as string;
  const decided = await decide('decide-1', id, 'approve', 'Fine');
  expect(decided).toMatchObject({ status: 'approved', sales_id: expect.stringMatching(/^BOM-/) });
  expect(await count('orders')).toBe(1);
  expect(await owned('select remaining_length_ft::text as n from bomedia.inventory_rolls')).toEqual([{ n: '92.000000' }]);
  // Same decision again changes nothing; deciding again fails.
  expect(await decide('decide-1', id, 'approve', 'Fine')).toEqual(decided);
  await failure(() => decide('decide-2', id, 'decline'));
  // The cashier's phone retries the original request: it gets the posted sale and nothing is posted twice.
  const retry = await cashier('approve-me', { businessDate: date, initialPaymentKobo: '500000', paymentMethod: 'transfer' });
  expect(retry).toMatchObject({ sales_id: decided.sales_id, business_date: date });
  expect(await count('orders')).toBe(1); expect(await count('payments')).toBe(1);
  const [request] = await owned('select status,result from bomedia.approval_requests');
  expect(request).toMatchObject({ status: 'approved' }); expect(request.result.sales_id).toBe(decided.sales_id);
  expect((await owned("select action from bomedia.audit_events where action like 'approval_%' order by created_at,action")).map(r => r.action))
    .toEqual(expect.arrayContaining(['approval_approved', 'approval_requested']));
});

it('records a decline with the note, posts nothing, and keeps that request ID declined', async () => {
  await rule('price', true, { percent: 0 });
  const held = await cashier('decline-me', { items: [print('10000')], totalKobo: '640000' });
  const declined = await decide('decline-1', held.approval_request_id, 'decline', 'Too low');
  expect(declined).toEqual({ approval_request_id: held.approval_request_id, status: 'declined' });
  expect(await count('orders')).toBe(0);
  expect(await cashier('decline-me', { items: [print('10000')], totalKobo: '640000' })).toMatchObject({ status: 'declined', decision_note: 'Too low' });
  expect(await count('orders')).toBe(0);
});

it('leaves a request pending, with the reason, when the books refuse it at approval time', async () => {
  await rule('date', true, { days: 0 });
  const held = await cashier('closed', { businessDate: await daysFromToday(-2) });
  await owned("update bomedia.bookkeeping_settings set closed_through = (now() at time zone 'Africa/Lagos')::date");
  const result = await decide('decide-closed', held.approval_request_id, 'approve');
  expect(result.status).toBe('failed'); expect(String(result.error)).toMatch(/closed/i);
  const [row] = await owned('select status,last_error from bomedia.approval_requests');
  expect(row.status).toBe('pending'); expect(row.last_error).toMatch(/closed/i);
  expect(await count('orders')).toBe(0);
  expect(await decide('decide-closed-2', held.approval_request_id, 'decline', 'Period closed')).toMatchObject({ status: 'declined' });
});

it('refuses to approve a request that has expired, and shows it as expired', async () => {
  await rule('date', true, { days: 0 });
  const held = await cashier('old', { businessDate: await daysFromToday(-2) });
  await owned("update bomedia.approval_requests set expires_at = now() - interval '1 hour'");
  const list = (await db.query<{ r: { pending_count: number; data: { status: string }[] } }>('select bomedia.api_approvals() as r')).rows[0].r;
  expect(list.pending_count).toBe(0); expect(list.data[0].status).toBe('expired');
  await db.exec('savepoint e');
  await expect(decide('decide-old', held.approval_request_id, 'approve')).rejects.toMatchObject({ code: '22023' });
  await db.exec('rollback to savepoint e');
  expect(await count('orders')).toBe(0);
});

it('lists what is waiting for the owner, and only a staff member\'s own requests for that staff member', async () => {
  await rule('date', true, { days: 0 });
  await cashier('ada-1', { businessDate: await daysFromToday(-2) });
  await send('bea-1', order({ actor_id: bea, businessDate: await daysFromToday(-1), approvalReason: 'Late entry' }));
  const all = (await db.query<{ r: { pending_count: number; data: { requested_by: string; reason: string }[] } }>('select bomedia.api_approvals() as r')).rows[0].r;
  expect(all.pending_count).toBe(2);
  expect(all.data.map(d => d.requested_by).sort()).toEqual(['Ada', 'Bea']);
  const mine = (await db.query<{ r: { data: { requested_by: string }[] } }>('select bomedia.api_my_approvals($1) as r', [ada])).rows[0].r;
  expect(mine.data.map(d => d.requested_by)).toEqual(['Ada']);
  await failure(() => db.query('select bomedia.api_my_approvals($1)', ['not-an-id']), '42501');
});

it('only ever lets the server runtime use the approval functions', async () => {
  await db.exec('reset role');
  const rows = (await db.query<{ n: string }>(`select p.proname as n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='bomedia'
    and p.proname in ('screen_order_before_approvals','approval_changes','approval_row','approval_answer') and has_function_privilege('bomedia_financial_runtime',p.oid,'execute')`)).rows;
  expect(rows).toEqual([]);
  await db.exec('set local role bomedia_financial_runtime');
});

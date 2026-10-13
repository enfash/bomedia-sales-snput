import type { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { insertId, testDatabase } from './helpers';

let db: PGlite, ada: string, bola: string, owner: string, today: string;
const log = async (key: string, over: Record<string, unknown> = {}, who = ada) => {
  const item = { businessDate: today, amountKobo: '6000000', category: 'Ink', description: 'Bulk ink', paidTo: 'Ink Depot', status: 'unpaid', ...over };
  return (await db.query<{ r: Record<string, any> }>('select bomedia.api_screen_expense($1,$2::jsonb) as r', [key, JSON.stringify({ actor_id: who, operation: 'log', items: [item] })])).rows[0].r.expenses[0];
};
const payLater = async (key: string, expenseId: string, amountKobo: string, method = 'Cash') => (await db.query<{ r: Record<string, any> }>(
  'select bomedia.api_screen_expense($1,$2::jsonb) as r', [key, JSON.stringify({ actor_id: owner, operation: 'pay', expenseId, amountKobo, businessDate: today, paymentMethod: method })])).rows[0].r;
const change = async (key: string, payload: Record<string, unknown>) => (await db.query<{ r: Record<string, any> }>(
  'select bomedia.api_expense_correction($1,$2::jsonb) as r', [key, JSON.stringify(payload)])).rows[0].r;
const mine = (reference: string, changes: Record<string, unknown>, reason = 'Typed the wrong amount') => ({ actor_id: owner, mode: 'correct', reference, changes, reason, byOwner: 'true' });
const cancel = (reference: string, reason = 'Entered twice', who = owner, byOwner = true) => ({ actor_id: who, mode: 'cancel', reference, reason, ...(byOwner ? { byOwner: 'true' } : {}) });
const owned = async (sql: string, params: unknown[] = []) => {
  await db.exec('reset role'); const rows = (await db.query<Record<string, any>>(sql, params)).rows; await db.exec('set local role bomedia_financial_runtime'); return rows;
};
async function failure(work: () => Promise<unknown>, code = '22023') {
  await db.exec('savepoint rejected'); await expect(work()).rejects.toMatchObject({ code }); await db.exec('rollback to savepoint rejected');
}
const net = async (code: string) => Number((await owned('select coalesce(sum(l.debit_kobo::numeric-l.credit_kobo),0)::text as n from bomedia.journal_lines l join bomedia.journal_entries e on e.id=l.entry_id where l.account_code=$1 and e.status=$2', [code, 'posted']))[0].n);
const row = async (reference: string) => (await owned('select * from bomedia.expenses where reference=$1', [reference]))[0];
const rule = async (enabled: boolean, days = 7) => (await db.query('select bomedia.api_approval_rule_save($1,$2::jsonb) as r', [`rule-${Math.random()}`, JSON.stringify({ actor_id: owner, kind: 'edit_old', enabled, params: { days } })]));
const decide = async (key: string, id: string, decision: 'approve' | 'decline') => (await db.query<{ r: Record<string, any> }>(
  'select bomedia.api_approval_decision($1,$2::jsonb) as r', [key, JSON.stringify({ actor_id: owner, approval_request_id: id, decision })])).rows[0].r;

beforeAll(async () => { db = await testDatabase(); }, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec('begin');
  ada = await insertId(db, "insert into bomedia.staff(display_name,login_name) values ('Ada','ada') returning id");
  bola = await insertId(db, "insert into bomedia.staff(display_name,login_name) values ('Bola','bola') returning id");
  owner = await insertId(db, "insert into bomedia.staff(display_name,login_name) values ('Owner','owner') returning id");
  await db.exec("insert into bomedia.bookkeeping_settings(starts_on,state) values ('2026-01-01','active')");
  today = (await db.query<{ d: string }>("select ((now() at time zone 'Africa/Lagos')::date)::text as d")).rows[0].d;
  await db.exec('set local role bomedia_financial_runtime');
});
afterEach(async () => { await db.exec('rollback'); });

it('corrects an unpaid expense: the old entry is reversed, the new amount is owed, and the old version is kept', async () => {
  const e = await log('e1');
  expect(await net('2010')).toBe(-6000000);
  const result = await change('c1', mine(e.reference, { amountKobo: '600000', paidTo: 'Ink Depot Ltd' }));
  expect(result).toMatchObject({ status: 'applied', kind: 'correction', reference: e.reference });
  expect(await net('2010')).toBe(-600000);
  expect(await net('6000')).toBe(600000);
  const after = await row(e.reference);
  expect(after).toMatchObject({ amount_kobo: 600000, paid_to: 'Ink Depot Ltd', status: 'Unpaid' });
  const [revision] = await owned('select * from bomedia.expense_revisions where expense_id=$1', [e.expense_id]);
  expect(revision).toMatchObject({ kind: 'correction', reason: 'Typed the wrong amount', excess_kobo: 0 });
  expect(revision.before).toMatchObject({ amount_kobo: '6000000' });
  expect(revision.after).toMatchObject({ amount_kobo: '600000', paid_to: 'Ink Depot Ltd' });
  expect((await owned("select details from bomedia.audit_events where action='expense_corrected'"))[0].details).toMatchObject({ reference: e.reference });
  const history = (await db.query<{ r: any[] }>('select bomedia.api_expense_history($1) as r', [e.reference])).rows[0].r;
  expect(history).toHaveLength(1);
  expect(history[0]).toMatchObject({ kind: 'correction', by: 'Owner', reason: 'Typed the wrong amount' });
});

it('lowers a paid expense without pretending the money came back: the cash stays out and the difference is held to recover', async () => {
  const e = await log('e2', { status: 'paid', paymentMethod: 'Cash' });
  const cashBefore = await net('1000');
  expect(cashBefore).toBe(-6000000);
  await change('c2', mine(e.reference, { amountKobo: '600000' }));
  expect(await net('1000')).toBe(-6000000);
  expect(await net('6000')).toBe(600000);
  expect(await net('1300')).toBe(5400000);
  expect(Number((await row(e.reference)).amount_kobo)).toBe(600000);
  const [revision] = await owned('select excess_kobo from bomedia.expense_revisions');
  expect(Number(revision.excess_kobo)).toBe(5400000);
});

it('does not let a paid expense go up, and asks for a real change', async () => {
  const e = await log('e3', { status: 'paid', paymentMethod: 'Cash' });
  await failure(() => change('c3', mine(e.reference, { amountKobo: '7000000' })));
  await failure(() => change('c3b', mine(e.reference, {})));
  await failure(() => change('c3c', mine(e.reference, { amountKobo: '6000000' })));
  await failure(() => change('c3d', mine(e.reference, { colour: 'red' })));
  await failure(() => change('c3e', mine(e.reference, { category: 'Not a category' })));
});

it('moves an expense to another category, so the right account carries it', async () => {
  const e = await log('e4');
  await change('c4', mine(e.reference, { category: 'Equipment' }));
  expect(await net('6000')).toBe(0);
  expect(await net('1500')).toBe(6000000);
  expect((await row(e.reference)).category).toBe('Equipment');
});

it('cancels an unpaid expense: nothing is owed, it stays visible as Cancelled, and it can no longer be paid', async () => {
  const e = await log('e5');
  await change('c5', cancel(e.reference));
  expect(await net('2010')).toBe(0);
  expect(await net('6000')).toBe(0);
  expect(await row(e.reference)).toMatchObject({ status: 'Cancelled', amount_kobo: 0, cancel_reason: 'Entered twice' });
  await failure(() => payLater('p5', e.expense_id, '6000000'));
  await failure(() => change('c5b', cancel(e.reference)));
  expect(await owned('select bomedia.expense_is_payable($1) as p', [e.expense_id])).toEqual([{ p: false }]);
});

it('cancels a paid expense: the cash stays out and the whole amount is held to recover', async () => {
  const e = await log('e6', { status: 'paid', paymentMethod: 'Transfer' });
  const out = await net('1010');
  expect(out).toBe(-6000000);
  await change('c6', cancel(e.reference));
  expect(await net('1010')).toBe(-6000000);
  expect(await net('6000')).toBe(0);
  expect(await net('1300')).toBe(6000000);
  expect((await row(e.reference)).status).toBe('Cancelled');
});

it('pays the corrected amount in full when an unpaid expense is corrected first', async () => {
  const e = await log('e8');
  await change('c8', mine(e.reference, { amountKobo: '1000000' }));
  expect(await owned('select bomedia.expense_is_payable($1) as p', [e.expense_id])).toEqual([{ p: true }]);
  await failure(() => payLater('p8bad', e.expense_id, '6000000'));
  await payLater('p8', e.expense_id, '1000000');
  expect(await net('2010')).toBe(0);
  expect(await net('1000')).toBe(-1000000);
  expect((await row(e.reference)).status).toBe('Paid');
});

it('corrects an expense that was paid later: both entries are reversed and the cash that left stays out', async () => {
  const e = await log('e9');
  await payLater('p9', e.expense_id, '6000000');
  expect(await net('1000')).toBe(-6000000);
  await change('c9', mine(e.reference, { amountKobo: '2000000' }));
  expect(await net('1000')).toBe(-6000000);
  expect(await net('2010')).toBe(0);
  expect(await net('6000')).toBe(2000000);
  expect(await net('1300')).toBe(4000000);
});

it('keeps correcting: a second correction reverses only what is still in force', async () => {
  const e = await log('e10');
  await change('c10a', mine(e.reference, { amountKobo: '3000000' }));
  await change('c10b', mine(e.reference, { amountKobo: '1000000' }, 'Still too high'));
  expect(await net('2010')).toBe(-1000000);
  expect(await net('6000')).toBe(1000000);
  const history = (await db.query<{ r: any[] }>('select bomedia.api_expense_history($1) as r', [e.reference])).rows[0].r;
  expect(history.map((h) => h.revision)).toEqual([2, 1]);
});

it('previews the effect without changing anything', async () => {
  const e = await log('e11', { status: 'paid', paymentMethod: 'Cash' });
  const { plan } = (await db.query<{ r: Record<string, any> }>('select bomedia.api_expense_correction_preview($1::jsonb) as r', [JSON.stringify({ reference: e.reference, mode: 'correct', changes: { amountKobo: '1000000' } })])).rows[0].r;
  expect(plan).toMatchObject({ old_amount_kobo: '6000000', new_amount_kobo: '1000000', paid: true, excess_kobo: '5000000' });
  expect(Number((await row(e.reference)).amount_kobo)).toBe(6000000);
  expect(await owned('select count(*)::int as n from bomedia.expense_revisions')).toEqual([{ n: 0 }]);
});

it('refuses an expense that predates the books', async () => {
  await db.exec('reset role');
  const id = await insertId(db, "insert into bomedia.expenses(amount_kobo,business_date,category,status) values (500000,'2026-01-05','Ink','Paid') returning id");
  await db.exec('set local role bomedia_financial_runtime');
  const [{ reference }] = await owned('select reference from bomedia.expenses where id=$1', [id]);
  await failure(() => change('c12', mine(reference, { amountKobo: '100000' })), '23514');
});

it('refuses a change in a month the owner has closed', async () => {
  const e = await log('e13', { businessDate: '2026-02-10' });
  await owned("update bomedia.bookkeeping_settings set closed_through='2026-02-28' where singleton");
  await failure(() => change('c13', mine(e.reference, { amountKobo: '100000' })), '23514');
});

it('lets a cashier ask only when the owner allows it, for her own recent expense, and holds it for approval', async () => {
  const e = await log('e14');
  await failure(() => change('c14a', { actor_id: ada, mode: 'correct', reference: e.reference, changes: { amountKobo: '600000' }, reason: 'Typo' }));
  await rule(true, 7);
  const held = await change('c14b', { actor_id: ada, mode: 'correct', reference: e.reference, changes: { amountKobo: '600000' }, reason: 'Typo' });
  expect(held).toMatchObject({ status: 'awaiting_approval', kinds: ['correction'] });
  expect(Number((await row(e.reference)).amount_kobo)).toBe(6000000);
  expect(await change('c14b', { actor_id: ada, mode: 'correct', reference: e.reference, changes: { amountKobo: '600000' }, reason: 'Typo' })).toEqual(held);
  await failure(() => change('c14c', { actor_id: bola, mode: 'correct', reference: e.reference, changes: { amountKobo: '600000' }, reason: 'Typo' }));
  const approved = await decide('d14', held.approval_request_id, 'approve');
  expect(approved).toMatchObject({ status: 'approved', reference: e.reference });
  expect(Number((await row(e.reference)).amount_kobo)).toBe(600000);
  const [revision] = await owned('select changed_by, approved_by from bomedia.expense_revisions');
  expect(revision).toMatchObject({ changed_by: ada, approved_by: owner });
});

it('turns away a cashier for an old expense, and a declined request changes nothing', async () => {
  const old = await log('e15', { businessDate: '2026-09-01' });
  await rule(true, 7);
  await failure(() => change('c15a', { actor_id: ada, mode: 'cancel', reference: old.reference, reason: 'Duplicate' }));
  const fresh = await log('e16');
  const held = await change('c15b', cancel(fresh.reference, 'Duplicate', ada, false));
  expect(held).toMatchObject({ status: 'awaiting_approval', kinds: ['cancellation'] });
  await decide('d15', held.approval_request_id, 'decline');
  expect((await row(fresh.reference)).status).toBe('Unpaid');
  expect(await net('2010')).toBe(-12000000);
});

import type { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { insertId, testDatabase } from './helpers';

let db: PGlite, ada: string, owner: string;
const item = (over: Record<string, unknown> = {}) => ({ businessDate: '2026-10-09', amountKobo: '6000000', category: 'Transport', description: 'Delivery van', paidTo: 'Fast Movers', status: 'paid', paymentMethod: 'Transfer', ...over });
const send = async (key: string, payload: Record<string, unknown>) => (await db.query<{ r: Record<string, any> }>(
  'select bomedia.api_screen_expense($1,$2::jsonb) as r', [key, JSON.stringify(payload)])).rows[0].r;
const cashier = (key: string, items = [item()], reason: string | null = 'Van hire for the Zed Events job') =>
  send(key, { actor_id: ada, operation: 'log', items, ...(reason ? { approvalReason: reason } : {}) });
const asOwner = (key: string, items = [item()]) => send(key, { actor_id: owner, operation: 'log', items, byOwner: 'true' });
const rule = async (enabled: boolean, amountKobo: number | string = 5000000, kind = 'expense_limit') => (await db.query<{ r: Record<string, any> }>(
  'select bomedia.api_approval_rule_save($1,$2::jsonb) as r', [`rule-${Math.random()}`, JSON.stringify({ actor_id: owner, kind, enabled, params: { amount_kobo: amountKobo } })])).rows[0].r;
const decide = async (key: string, id: string, decision: 'approve' | 'decline', note?: string) => (await db.query<{ r: Record<string, any> }>(
  'select bomedia.api_approval_decision($1,$2::jsonb) as r', [key, JSON.stringify({ actor_id: owner, approval_request_id: id, decision, ...(note ? { note } : {}) })])).rows[0].r;
const owned = async (sql: string, params: unknown[] = []) => {
  await db.exec('reset role'); const rows = (await db.query<Record<string, any>>(sql, params)).rows; await db.exec('set local role bomedia_financial_runtime'); return rows;
};
async function failure(work: () => Promise<unknown>, code = '22023') {
  await db.exec('savepoint rejected'); await expect(work()).rejects.toMatchObject({ code }); await db.exec('rollback to savepoint rejected');
}
const count = async (table: string) => (await owned(`select count(*)::int as n from bomedia.${table}`))[0].n as number;

beforeAll(async () => { db = await testDatabase(); }, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec('begin');
  ada = await insertId(db, "insert into bomedia.staff(display_name,login_name) values ('Ada','ada') returning id");
  owner = await insertId(db, "insert into bomedia.staff(display_name,login_name) values ('Owner','owner') returning id");
  await db.query("insert into bomedia.bookkeeping_settings(starts_on,state) values ('2026-10-09','active')");
  await db.exec('set local role bomedia_financial_runtime');
});
afterEach(async () => { await db.exec('rollback'); });

it('starts switched off with a ₦50,000 limit ready, so a big expense posts exactly as before', async () => {
  const rules = (await db.query<{ r: { kind: string; enabled: boolean; params: any }[] }>('select bomedia.api_approval_rules() as r')).rows[0].r;
  expect(rules.find((r) => r.kind === 'expense_limit')).toEqual({ kind: 'expense_limit', enabled: false, params: { amount_kobo: 5000000 } });
  const result = await cashier('plain', [item()], null);
  expect(result.expenses[0].reference).toMatch(/^EXP-/);
  expect(await count('approval_requests')).toBe(0);
});

it('saves the limit with sensible bounds and records who changed it', async () => {
  expect(await rule(true, 2500000)).toEqual({ kind: 'expense_limit', enabled: true, params: { amount_kobo: 2500000 } });
  await failure(() => rule(true, 99));
  await failure(() => rule(true, 1.5));
  await failure(() => rule(true, '1000000000001'));
  expect((await owned("select details from bomedia.audit_events where action = 'approval_rule_saved' order by created_at desc limit 1"))[0].details)
    .toMatchObject({ kind: 'expense_limit', enabled: true });
});

it('holds an expense above the limit, with no money out, and answers a repeat the same way', async () => {
  await rule(true);
  const held = await cashier('big');
  expect(held).toMatchObject({ status: 'awaiting_approval', kinds: ['expense_limit'] });
  expect(await count('expenses')).toBe(0);
  expect(await count('journal_lines')).toBe(0);
  expect(await cashier('big')).toEqual(held);
  expect(await count('approval_requests')).toBe(1);
  await failure(() => cashier('big', [item({ amountKobo: '7000000' })]));
});

it('does not hold an expense at or under the limit, a payment, or anything the owner enters', async () => {
  await rule(true);
  expect((await cashier('at-limit', [item({ amountKobo: '5000000' })], null)).expenses).toHaveLength(1);
  expect((await asOwner('owner-big')).expenses).toHaveLength(1);
  const unpaid = await cashier('unpaid-small', [item({ amountKobo: '4000000', status: 'unpaid', paymentMethod: undefined })], null);
  // Paying it is a different operation and is never held, even when the amount is above the limit.
  await owned('update bomedia.approval_rules set params = \'{"amount_kobo": 100}\' where kind = \'expense_limit\'');
  const paid = await send('pay', { actor_id: ada, operation: 'pay', expenseId: unpaid.expenses[0].expense_id, amountKobo: '4000000', businessDate: '2026-10-09', paymentMethod: 'Cash' });
  expect(paid.operation).toBe('pay');
  expect(await count('approval_requests')).toBe(0);
});

it('needs a reason before holding', async () => {
  await rule(true);
  await failure(() => cashier('no-reason', [item()], null));
  await failure(() => cashier('blank', [item()], '   '));
  expect(await count('approval_requests')).toBe(0);
});

it('holds a whole batch when one item is over, then posts every item once when approved', async () => {
  await rule(true);
  const items = [item({ amountKobo: '100000', description: 'Small' }), item({ amountKobo: '6000000' })];
  const held = await cashier('batch', items);
  expect(held.status).toBe('awaiting_approval');
  expect(await count('expenses')).toBe(0);
  const approved = await decide('d1', held.approval_request_id, 'approve', 'Fine');
  expect(approved).toMatchObject({ status: 'approved' });
  expect(approved.references).toHaveLength(2);
  expect(await count('expenses')).toBe(2);
  const again = await cashier('batch', items);
  expect(again.expenses).toHaveLength(2);
  expect(await count('expenses')).toBe(2);
  await failure(() => decide('d2', held.approval_request_id, 'approve'));
});

it('lists a held expense for the owner with the plain facts, then with its reference once approved', async () => {
  await rule(true);
  const held = await cashier('listed');
  let list = (await db.query<{ r: { pending_count: number; data: Record<string, any>[] } }>('select bomedia.api_approvals() as r')).rows[0].r;
  expect(list.pending_count).toBe(1);
  expect(list.data[0]).toMatchObject({ operation: 'screen_expense', status: 'pending', reason: 'Van hire for the Zed Events job', requested_by: 'Ada', reference: null });
  expect(list.data[0].changes[0]).toMatchObject({ kind: 'expense_limit', category: 'Transport', paid_to: 'Fast Movers', amount_kobo: '6000000', limit_kobo: '5000000' });
  expect(list.data[0].summary).toMatchObject({ kind: 'expense', total_kobo: '6000000' });
  await decide('d', held.approval_request_id, 'approve');
  list = (await db.query<{ r: { pending_count: number; data: Record<string, any>[] } }>('select bomedia.api_approvals() as r')).rows[0].r;
  expect(list.data[0]).toMatchObject({ status: 'approved', reference: expect.stringMatching(/^EXP-/) });
  const mine = (await db.query<{ r: { data: Record<string, any>[] } }>('select bomedia.api_my_approvals($1) as r', [ada])).rows[0].r.data;
  expect(mine[0].operation).toBe('screen_expense');
});

it('keeps a declined expense unrecorded for good and records the decision in the audit log', async () => {
  await rule(true);
  const held = await cashier('no');
  expect(await decide('d', held.approval_request_id, 'decline', 'Use the supplier account')).toMatchObject({ status: 'declined' });
  expect(await cashier('no')).toMatchObject({ status: 'declined', decision_note: 'Use the supplier account' });
  expect(await count('expenses')).toBe(0);
  const audit = await owned("select details from bomedia.audit_events where action = 'approval_declined'");
  expect(audit[0].details).toMatchObject({ operation: 'screen_expense', kinds: ['expense_limit'] });
});

it('leaves the request waiting, with the reason, when the books refuse it at approval', async () => {
  await rule(true);
  const held = await cashier('bad-receipt', [item({ receiptId: '00000000-0000-4000-8000-0000000000aa' })]);
  const result = await decide('d', held.approval_request_id, 'approve');
  expect(result.status).toBe('failed');
  expect(result.error).toMatch(/Receipt/);
  expect(await count('expenses')).toBe(0);
  expect((await owned("select status, last_error from bomedia.approval_requests"))[0]).toMatchObject({ status: 'pending' });
  expect(await decide('d2', held.approval_request_id, 'decline')).toMatchObject({ status: 'declined' });
});

it('keeps the held-expense function away from the runtime role', async () => {
  await failure(() => db.query("select bomedia.screen_expense_before_approvals('x','{}'::jsonb)"), '42501');
  await failure(() => db.query("select bomedia.expense_changes('{}'::jsonb)"), '42501');
});

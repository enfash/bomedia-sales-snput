import type { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { insertId, testDatabase } from './helpers';

let db: PGlite;
let actor: string;
let customer: string;
beforeAll(async () => { db = await testDatabase(); }, 30_000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec('begin');
  actor = await insertId(db, `insert into bomedia.staff(display_name, login_name) values ('Test owner', 'owner') returning id`);
  customer = await insertId(db, `insert into bomedia.customers(display_name) values ('Test customer') returning id`);
  await db.exec(`insert into bomedia.bookkeeping_settings(starts_on, state) values ('2026-10-05', 'active')`);
});
afterEach(async () => { await db.exec('rollback'); });

async function call(name: string, key: string, payload: object) {
  // Function names come only from this test, never from input.
  return (await db.query<{ result: { journal_entry_id: string; payment_id: string; amount_kobo: string } }>(
    `select bomedia.${name}($1, $2::jsonb) as result`, [key, JSON.stringify(payload)])).rows[0].result;
}
function entry(amount = '10000', extra = {}) {
  return { actor_id: actor, business_date: '2026-10-05', kind: 'adjustment', memo: 'Test owner contribution',
    lines: [{ account_code: '1000', debit_kobo: amount }, { account_code: '3000', credit_kobo: amount }], ...extra };
}
async function job(amount = '17344999') {
  const order = await insertId(db, `insert into bomedia.orders(customer_id) values ($1) returning id`, [customer]);
  const id = await insertId(db, `insert into bomedia.jobs(order_id, customer_id, description, quantity, unit_price_kobo,
    amount_kobo, job_status, business_date) values ($1, $2, 'Print job', 1, $3, $3, 'Pending', '2026-10-05') returning id`,
  [order, customer, amount]);
  await call('post_journal', `job-${id}`, entry(amount, { kind: 'sale', source_type: 'job', source_id: id,
    lines: [{ account_code: '1100', debit_kobo: amount, customer_id: customer, job_id: id }, { account_code: '4000', credit_kobo: amount }] }));
  return id;
}
function receipt(ids: string[], amount = '17300000', extra = {}) {
  return { customer_id: customer, actor_id: actor, business_date: '2026-10-05', amount_kobo: amount,
    job_ids: ids, cash_account_code: '1000', method: 'Cash', ...extra };
}
async function balance(id: string) {
  return (await db.query<{ value: string }>(`select balance_kobo::text as value from bomedia.job_balances where job_id = $1`, [id])).rows[0].value;
}
async function expectFailure(work: () => Promise<unknown>, message: string) {
  await db.exec('savepoint expected_failure');
  await expect(work()).rejects.toThrow(message);
  await db.exec('rollback to savepoint expected_failure');
}

it('posts balanced exact-kobo journals and replays without duplicating cash or audit entries', async () => {
  const payload = entry('9007199254740993');
  const result = await call('post_journal', 'capital', payload);
  expect(await call('post_journal', 'capital', payload)).toEqual(result);
  expect((await db.query('select id from bomedia.journal_entries')).rows).toHaveLength(1);
  const totals = await db.query<{ balance: string }>(`select debit_minus_credit_kobo::text as balance from bomedia.ledger_account_balances where code = '1000'`);
  expect(totals.rows[0].balance).toBe('9007199254740993');
  await expectFailure(() => call('post_journal', 'capital', entry('9007199254740994')), 'different data');
});

it('rejects an unbalanced journal atomically, leaving no draft, lines, audit or request record', async () => {
  await expectFailure(() => call('post_journal', 'bad', entry('100', {
    lines: [{ account_code: '1000', debit_kobo: '100' }, { account_code: '3000', credit_kobo: '99' }],
  })), 'equal positive debit and credit');
  expect((await db.query('select id from bomedia.journal_entries')).rows).toHaveLength(0);
  expect((await db.query('select * from bomedia.journal_lines')).rows).toHaveLength(0);
  expect((await db.query('select * from bomedia.idempotency_requests')).rows).toHaveLength(0);
  expect((await db.query('select * from bomedia.audit_events')).rows).toHaveLength(0);
});

it('refuses to create a posted header directly without validated lines', async () => {
  await expectFailure(() => db.query(`insert into bomedia.journal_entries(business_date, kind, memo, status, posted_at, created_by)
    values ('2026-10-05', 'adjustment', 'Invalid', 'posted', now(), $1)`, [actor]), 'Create lines before posting');
});

it('prevents updates, deletions and extra lines on a posted journal', async () => {
  const result = await call('post_journal', 'capital', entry());
  const id = result.journal_entry_id;
  await expectFailure(() => db.query(`update bomedia.journal_entries set memo = 'Changed' where id = $1`, [id]), 'immutable');
  await expectFailure(() => db.query(`delete from bomedia.journal_entries where id = $1`, [id]), 'immutable');
  await expectFailure(() => db.query(`update bomedia.journal_lines set debit_kobo = 1 where entry_id = $1 and line_number = 1`, [id]), 'cannot be changed');
  await expectFailure(() => db.query(`delete from bomedia.journal_lines where entry_id = $1`, [id]), 'cannot be changed');
  await expectFailure(() => db.query(`insert into bomedia.journal_lines(entry_id, line_number, account_code, debit_kobo)
    values ($1, 3, '1000', 1)`, [id]), 'cannot be changed');
});

it('corrects a standalone journal with an exact linked reversal, preserving both records', async () => {
  const original = await call('post_journal', 'capital', entry());
  const payload = { journal_entry_id: original.journal_entry_id, actor_id: actor, business_date: '2026-10-06', reason: 'Original contribution entered incorrectly' };
  const reversed = await call('reverse_journal', 'reverse-capital', payload);
  expect(await call('reverse_journal', 'reverse-capital', payload)).toEqual(reversed);
  expect((await db.query('select id from bomedia.journal_entries')).rows).toHaveLength(2);
  expect((await db.query<{ balance: string }>(`select debit_minus_credit_kobo::text as balance from bomedia.ledger_account_balances where code = '1000'`)).rows[0].balance).toBe('0');
  await expectFailure(() => call('reverse_journal', 'again', payload), 'duplicate key');
});

it('rejects a fake reversal even when its debit and credit totals balance', async () => {
  const original = await call('post_journal', 'capital', entry());
  await expectFailure(() => call('post_journal', 'fake', entry('10000', {
    kind: 'reversal', reverses_entry_id: original.journal_entry_id,
    lines: [{ account_code: '1000', credit_kobo: '10000' }, { account_code: '3100', debit_kobo: '10000' }],
  })), 'exactly offset');
});

it('does not post a draft or unconfirmed opening balance as current-period income', async () => {
  // Fresh setup is allowed here because the fixture has not posted entries yet.
  await db.exec('rollback; begin');
  actor = await insertId(db, `insert into bomedia.staff(display_name, login_name) values ('Owner', 'owner') returning id`);
  await db.exec(`insert into bomedia.bookkeeping_settings(starts_on) values ('2026-10-05')`);
  const payload = entry('10000', { kind: 'opening', business_date: '2026-10-04' });
  await expectFailure(() => call('post_journal', 'opening', payload), 'confirmation and evidence');
  await call('post_journal', 'opening', { ...payload, opening_confirmed: true, evidence_reference: 'Test closing cash count approved by owner' });
  const dates = await db.query<{ date: string; kind: string }>(`select business_date::text as date, kind from bomedia.journal_entries`);
  expect(dates.rows).toEqual([{ date: '2026-10-04', kind: 'opening' }]);
  await expectFailure(() => call('post_journal', 'new-sale-before-active', entry()), 'active books');
  await db.exec(`update bomedia.bookkeeping_settings set state = 'active'`);
  await expectFailure(() => call('post_journal', 'extra-opening', { ...payload, opening_confirmed: true, evidence_reference: 'Test' }), 'require setup state');
});

it('requires configuration, stable start dates and closed-period protection', async () => {
  await call('post_journal', 'capital', entry());
  await expectFailure(() => db.exec(`update bomedia.bookkeeping_settings set starts_on = '2026-10-06'`), 'cannot change');
  await expectFailure(() => db.exec(`update bomedia.bookkeeping_settings set state = 'setup'`), 'cannot return');
  await expectFailure(() => db.exec('delete from bomedia.bookkeeping_settings'), 'cannot be deleted');
  await db.exec(`update bomedia.bookkeeping_settings set closed_through = '2026-10-05'`);
  await expectFailure(() => call('post_journal', 'late', entry()), 'period is closed');
  await expectFailure(() => db.exec('update bomedia.bookkeeping_settings set closed_through = null'), 'cannot be reopened');
  await call('post_journal', 'next-day', entry('10000', { business_date: '2026-10-06' }));
});

it.each([['17300000', '44999'], ['17309000', '35999'], ['17344998', '1']])(
  'keeps the exact short-payment outstanding: received %s kobo, remaining %s kobo', async (paid, expected) => {
    const id = await job();
    const payload = receipt([id], paid);
    const result = await call('record_accounted_payment', 'collect', payload);
    expect(await call('record_accounted_payment', 'collect', payload)).toEqual(result);
    expect(result.amount_kobo).toBe(paid);
    expect(await balance(id)).toBe(expected);
    const totals = await db.query<{ code: string; balance: string }>(`select code, debit_minus_credit_kobo::text as balance
      from bomedia.ledger_account_balances where code in ('1000', '1100', '4000') order by code`);
    expect(totals.rows).toEqual([{ code: '1000', balance: paid }, { code: '1100', balance: expected }, { code: '4000', balance: '-17344999' }]);
    expect((await db.query('select id from bomedia.job_adjustments')).rows).toHaveLength(0);
    expect((await db.query('select id from bomedia.payments')).rows).toHaveLength(1);
  },
);

it('collects the remaining debt later without recording the old sale a second time', async () => {
  const id = await job();
  await call('record_accounted_payment', 'part', receipt([id]));
  await call('record_accounted_payment', 'rest', receipt([id], '44999'));
  expect(await balance(id)).toBe('0');
  expect((await db.query<{ total: string }>(`select sum(amount_kobo)::text as total from bomedia.payments`)).rows[0].total).toBe('17344999');
  expect((await db.query(`select id from bomedia.journal_entries where kind = 'sale'`)).rows).toHaveLength(1);
});

it('allocates one receipt over multiple jobs without counting the receipt more than once', async () => {
  const a = await job('10000'), b = await job('20000');
  const result = await call('record_accounted_payment', 'batch', receipt([b, a], '25000'));
  expect(await balance(a)).toBe('0');
  expect(await balance(b)).toBe('5000');
  const lines = await db.query<{ debit: string; credit: string }>(`select sum(debit_kobo)::text as debit, sum(credit_kobo)::text as credit
    from bomedia.journal_lines where entry_id = $1`, [result.journal_entry_id]);
  expect(lines.rows[0]).toEqual({ debit: '25000', credit: '25000' });
  expect((await db.query('select id from bomedia.payments')).rows).toHaveLength(1);
});

it('refuses unestablished opening debt, excess money and a non-cash receiving account', async () => {
  const id = await job();
  await expectFailure(() => call('record_accounted_payment', 'excess', receipt([id], '17345000')), 'explicit deposit or rounding');
  await expectFailure(() => call('record_accounted_payment', 'wrong-account', receipt([id], '100', { cash_account_code: '4000' })), 'cash or bank account');
  await db.query(`insert into bomedia.job_adjustments(job_id, amount_kobo, kind, reason)
    values ($1, -1, 'correction', 'Test unmatched change')`, [id]);
  await expectFailure(() => call('record_accounted_payment', 'unmatched', receipt([id])), 'ledger must agree');
  expect((await db.query('select id from bomedia.payments')).rows).toHaveLength(0);
});

it('rolls back the payment, allocation and retry claims if journal posting fails', async () => {
  const id = await job();
  await db.exec(`update bomedia.bookkeeping_settings set closed_through = '2026-10-05'`);
  await expectFailure(() => call('record_accounted_payment', 'closed', receipt([id])), 'period is closed');
  expect((await db.query('select id from bomedia.payments')).rows).toHaveLength(0);
  expect(await balance(id)).toBe('17344999');
  expect((await db.query(`select request_key from bomedia.idempotency_requests where operation <> 'journal'`)).rows).toHaveLength(0);
});

it('requires business-linked reversals to update the payment ledger and job together', async () => {
  const id = await job();
  const result = await call('record_accounted_payment', 'payment', receipt([id]));
  await expectFailure(() => call('reverse_journal', 'bad-reversal', {
    journal_entry_id: result.journal_entry_id, actor_id: actor, business_date: '2026-10-05', reason: 'Test',
  }), 'business reversal');
});

it('protects journal accounts, customer identity and private API privileges', async () => {
  const id = await job();
  await expectFailure(() => db.exec(`update bomedia.ledger_accounts set category = 'income' where code = '1100'`), 'cannot be reclassified');
  const other = await insertId(db, `insert into bomedia.customers(display_name) values ('Other') returning id`);
  await expectFailure(() => call('record_accounted_payment', 'wrong-customer', receipt([id], '100', { customer_id: other })), 'belong to this customer');
  const permissions = await db.query<{ allowed: boolean }>(`select has_function_privilege(role_name,
    'bomedia.record_accounted_payment(text,jsonb)', 'EXECUTE') or has_table_privilege(role_name,
    'bomedia.journal_entries', 'SELECT,INSERT,UPDATE,DELETE') as allowed from unnest(array['anon','authenticated','service_role']) role_name`);
  expect(permissions.rows.every(r => !r.allowed)).toBe(true);
});

it('refuses all journals until an opening date is configured', async () => {
  await db.exec('rollback; begin');
  actor = await insertId(db, `insert into bomedia.staff(display_name, login_name) values ('Owner', 'owner') returning id`);
  await expectFailure(() => call('post_journal', 'not-configured', entry()), 'not been configured');
});

it('rejects zero-sided, negative and mixed debit/credit lines and disabled collectors', async () => {
  await expectFailure(() => call('post_journal', 'zero', entry('0')), 'check constraint');
  await expectFailure(() => call('post_journal', 'negative', entry('-100')), 'nonnegative integer');
  await expectFailure(() => call('post_journal', 'both', entry('100', {
    lines: [{ account_code: '1000', debit_kobo: '100', credit_kobo: '100' }, { account_code: '3000', credit_kobo: '100' }],
  })), 'check constraint');
  const id = await job();
  await db.query('update bomedia.staff set disabled_at = now() where id = $1', [actor]);
  await expectFailure(() => call('record_accounted_payment', 'disabled', receipt([id])), 'enabled collector');
});

it('refuses a collection before its sale or before the receivable was established in the ledger', async () => {
  const id = await job();
  await expectFailure(() => call('record_accounted_payment', 'too-early', receipt([id], '100', { business_date: '2026-10-04' })), 'predate');
  // This confirmed job is old, but its accounting entry is still on October 5.
  await db.query(`update bomedia.jobs set business_date = '2026-10-03' where id = $1`, [id]);
  await expectFailure(() => call('record_accounted_payment', 'before-ledger', receipt([id], '100', { business_date: '2026-10-04' })), 'ledger must agree');
  expect((await db.query('select id from bomedia.payments')).rows).toHaveLength(0);
});

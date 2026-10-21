import type { PGlite } from '@electric-sql/pglite';
import { afterEach, expect, it } from 'vitest';
import { testDatabase, insertId } from './helpers';
import { activateOpening, buildOpeningPlan, postOpening, verifyOpening } from '../../scripts/migration/opening-balances.mjs';
import { applyStock } from '../../scripts/migration/stock-opening.mjs';
import { buildHistoryPlan, importHistory, verifyHistory } from '../../scripts/migration/sales-history.mjs';
import { CUTOVER_LOCK, CUTOVER_LOCK_TIMEOUT } from '../../scripts/migration/cutover-shared.mjs';

let db: PGlite;
afterEach(async () => { await db?.close(); db = undefined!; });
const debtHeader = 'customer_name,amount_owed_naira,sale_date,sales_id,sheet_row,job_description\n';
const debtRows = 'Alpha,100,2026-10-01,A1,2,Banner\nBeta,200,2026-10-01,B1,3,Sticker\n';
const plan = (owing = debtRows) => buildOpeningPlan({ startDate: 'item,value\nopening_date,2026-10-25\n', owing: debtHeader + owing, credits: '', loans: '' });
const history = () => buildHistoryPlan({ sales: 'DATE,CLIENT NAME,AMOUNT (₦),INITIAL PAYMENT (₦),ADDITIONAL PAYMENT 1,ADDITIONAL PAYMENT 2,Sales ID\n2026-10-01,Alpha,100,0,,,A1\n2026-10-01,Beta,200,0,,,B1\n' });
async function fresh() {
  db = await testDatabase();
  return insertId(db, "insert into bomedia.staff(display_name,login_name) values('Owner','owner') returning id");
}

it('refuses changed debt allocations with identical totals, including activation and replay', async () => {
  const actorId = await fresh();
  const original = plan();
  await postOpening(db, original, { actorId });
  const swapped = plan('Alpha,200,2026-10-01,A1,2,Banner\nBeta,100,2026-10-01,B1,3,Sticker\n');
  const result = await verifyOpening(db, swapped);
  expect(result.ok).toBe(false);
  expect(result.checks.filter((c: { ok: boolean }) => !c.ok).map((c: { name: string }) => c.name)).toEqual(expect.arrayContaining([
    'opening entries contain the approved plan fingerprint', 'each approved debt matches its customer, sale, date, amount and ledger line',
  ]));
  await expect(activateOpening(db, swapped)).rejects.toThrow(/Not activated/);
  await db.exec("update bomedia.jobs set business_date='2026-10-02' where amount_kobo=10000");
  expect((await verifyOpening(db, original)).ok).toBe(false);
  await expect(postOpening(db, original, { actorId })).rejects.toThrow(/does not match/);
});

it('preserves the owner-confirmed identical Olaat debts on rows 3665 and 3669; refuses a repeated source row', async () => {
  const a = 'Olaat,1800,2026-10-17,BOM-20261017-2865,3665,3x3ft SAV\n';
  const b = a.replace('3665', '3669');
  const approved = plan(a + b);
  expect(approved.customers[0].jobs.map((j: { sheetRow: number }) => j.sheetRow)).toEqual([3665, 3669]);
  expect(approved.totals).toMatchObject({ jobs: 2, orders: 1, debtsKobo: '360000' });
  expect(() => plan(a + a)).toThrow(/Sheet row 3665 appears twice/);
  expect(() => plan(a.replace(',3665,', ',,'))).toThrow(/sheet_row/);
  expect(() => plan(a.replace(',3665,', ',1,'))).toThrow(/sheet_row/);
  const actorId = await fresh();
  await postOpening(db, approved, { actorId });
  expect((await verifyOpening(db, approved)).ok).toBe(true);
  expect((await db.query<{ memo: string }>("select memo from bomedia.journal_lines where account_code='1100' order by memo")).rows.map(r => r.memo)).toEqual(['Sheet row 3665', 'Sheet row 3669']);
});

it('matches existing customers and refuses duplicate normalized database identities before opening or history writes', async () => {
  const actorId = await fresh();
  const existing = await insertId(db, "insert into bomedia.customers(display_name) values(' ALPHA ') returning id");
  await postOpening(db, plan(), { actorId });
  expect((await db.query<{ customer_id: string }>("select customer_id from bomedia.jobs where amount_kobo=10000")).rows[0].customer_id).toBe(existing);
  expect((await verifyOpening(db, plan())).ok).toBe(true);
  await db.exec("insert into bomedia.customers(display_name) values('Alpha')");
  await expect(importHistory(db, history())).rejects.toThrow(/Ambiguous/);
  expect((await db.query<{ n: number }>('select count(*)::int n from bomedia.legacy_sales')).rows[0].n).toBe(0);
  await db.close();
  const otherActor = await fresh();
  await db.exec("insert into bomedia.customers(display_name) values('Alpha'),(' ALPHA ')");
  await expect(postOpening(db, plan(), { actorId: otherActor })).rejects.toThrow(/Ambiguous/);
  expect((await db.query<{ n: number }>('select count(*)::int n from bomedia.journal_entries')).rows[0].n).toBe(0);
});

it('history verification detects wrong owed amounts and customer assignments even with unchanged aggregate totals', async () => {
  const actorId = await fresh();
  await postOpening(db, plan(), { actorId });
  const approved = history();
  await importHistory(db, approved);
  await db.exec('update bomedia.legacy_sales set owed_kobo=owed_kobo+1 where sheet_row=2');
  await expect(verifyHistory(db, approved)).rejects.toThrow(/Sheet row 2/);
  await db.exec(`update bomedia.legacy_sales set owed_kobo=amount_kobo;
    update bomedia.legacy_sales set customer_id=(select customer_id from bomedia.legacy_sales other where other.sheet_row=5-legacy_sales.sheet_row)`);
  await expect(verifyHistory(db, approved)).rejects.toThrow(/customer/);
  await expect(importHistory(db, approved)).rejects.toThrow(/does not match/);
});

it('history, stock apply, opening post and activation acquire the same transaction lock first', async () => {
  const actorId = '00000000-0000-4000-8000-000000000001';
  for (const operation of [
    (fake: unknown) => importHistory(fake, history()),
    (fake: unknown) => postOpening(fake, plan(), { actorId }),
    (fake: unknown) => activateOpening(fake, plan()),
    (fake: unknown) => applyStock(fake, {}, { actorId }),
  ]) {
    const queries: string[] = [];
    const fake = { transaction: async (work: (tx: unknown) => Promise<unknown>) => work({ query: async (sql: string) => {
      queries.push(sql);
      if (queries.length > 2) throw new Error('stop after lock');
      return { rows: [] };
    } }) };
    await expect(operation(fake)).rejects.toThrow(/stop after lock/);
    expect(queries.slice(0, 2)).toEqual([CUTOVER_LOCK_TIMEOUT, CUTOVER_LOCK]);
  }
});

it('turns a lock wait that times out into a plain message telling the owner to wait, not repeat', async () => {
  const actorId = await fresh();
  for (const code of ['55P03', '57014']) {
    const fake = { transaction: async (work: (tx: unknown) => Promise<unknown>) => work({ query: async (sql: string) => {
      if (sql === CUTOVER_LOCK) throw Object.assign(new Error('internal text that must not be shown'), { code });
      return { rows: [] };
    } }) };
    await expect(postOpening(fake, plan(), { actorId })).rejects.toThrow(/Another cutover command is still running/);
    await expect(importHistory(fake, history())).rejects.toThrow(/Another cutover command is still running/);
  }
});

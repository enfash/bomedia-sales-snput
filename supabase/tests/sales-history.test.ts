import type { PGlite } from '@electric-sql/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import { testDatabase } from './helpers';
import { buildHistoryPlan, importHistory, verifyHistory } from '../../scripts/migration/sales-history.mjs';
import { buildOpeningPlan, parseCsvDocument, postOpening } from '../../scripts/migration/opening-balances.mjs';

const HEADER = 'DATE,CLIENT NAME,JOB DESCRIPTION,CONTACT,MATERIAL,Cost Per SQRFT,3FT,4FT,5FT,6FT,7FT,8FT,10FT,custom,QTY,UNIT COST (₦),INITIAL PAYMENT (₦),AMOUNT (₦),ADDITIONAL PAYMENT 1,ADDITIONAL PAYMENT 2,AMOUNT DIFFERENCES,PAYMENT STATUS,JOB STATUS,Logged By,Sales ID,TIMESTAMP,TRANSACTION ID\n';
const SALES = HEADER
  + '2026-09-01,Kay,Banner,0803,Flex,180,,,5,,,,,,2,"₦1,000.00","₦1,000.00","₦3,000.00",,,0,Part,Delivered,Ada,BOM-1,,\n'
  + '2026-09-02,kay  ,Sticker,,SAV,200,,,,,,,,,1,₦500.00,₦500.00,₦500.00,,,0,Paid,Delivered,Ada,BOM-2,,\n'
  + '2026-09-03,K cool,Poster,,Flex,180,,,,,,,,,1,₦500.00,₦0.00,₦900.00,₦100.00,₦50.00,0,Part,Delivered,Ada,BOM-3,,\n'
  + '2026-09-04,,No name,,Flex,180,,,,,,,,,1,₦1.00,₦0.00,₦1.00,,,0,Paid,Delivered,Ada,BOM-4,,\n';
const NAMES = 'name_in_sheet,same_person_as\nK cool,Kcool\n';
const files = (over: Record<string, string> = {}) => ({ sales: SALES, names: NAMES, ignore: '', ...over });

let db: PGlite;
afterEach(async () => { await db?.close(); });
const rows = async (sql: string, params: unknown[] = []) => (await db.query<Record<string, string>>(sql, params)).rows;
async function opening() {
  const owner = (await rows("insert into bomedia.staff(display_name,login_name) values('Owner','owner') returning id"))[0].id;
  await postOpening(db, buildOpeningPlan({ startDate: 'item,value\nopening_date,2026-10-18\n', owing: '', credits: '',
    loans: 'who,type,amount_naira,date\nLender,loan you owe,100,2026-09-01\n' }), { actorId: owner });
}

describe('history plan', () => {
  const simpleHeader = 'DATE,CLIENT NAME,AMOUNT (₦),INITIAL PAYMENT (₦),ADDITIONAL PAYMENT 1,ADDITIONAL PAYMENT 2,Sales ID\n';
  it('requires all identity/money headers and a known sale amount while blank initial payment means nothing paid', () => {
    const sale = '2026-10-01,Alpha,100,,,,A1\n';
    expect(buildHistoryPlan({ sales: simpleHeader + sale }).rows[0]).toMatchObject({ amountKobo: '10000', paidKobo: '0', owedKobo: '10000' });
    expect(() => buildHistoryPlan({ sales: simpleHeader + sale.replace(',100,', ',,') })).toThrow(/exact naira amount/);
    for (const header of simpleHeader.trim().split(',')) {
      expect(() => buildHistoryPlan({ sales: simpleHeader.replace(header, `wrong-${header}`) + sale })).toThrow(/missing required headers/);
    }
  });
  it('keeps physical CSV positions across blank lines and quoted multiline cells', () => {
    const csv = 'a,b\r\n\r\n"two\r\nlines",x\r\nlast,y\r\n';
    expect(parseCsvDocument(csv).records.map((r: { line: number; recordIndex: number }) => [r.line, r.recordIndex])).toEqual([[2, 2], [3, 3], [5, 4]]);
    const sales = simpleHeader + '2026-10-01,Alpha,100,0,10,,A1\n\n2026-10-01,Beta,200,0,20,,B1\n2026-10-01,Gamma,300,0,30,,C1\n';
    const result = buildHistoryPlan({ sales, ignore: 'sheet_row,payment,expected_amount_naira,reason\n4,1,20,owner confirmed\n' });
    expect(result.rows.map((r: { sheetRow: number; paidKobo: string }) => [r.sheetRow, r.paidKobo])).toEqual([[2, '1000'], [4, '0'], [5, '3000']]);
    expect(result.ignored).toEqual([expect.objectContaining({ sheetRow: 4, amount: '2000' })]);
  });
  it('requires the expected ignored amount and refuses a mismatch or duplicate exception', () => {
    const sales = simpleHeader + '2026-10-01,Alpha,100,0,20,,A1\n';
    expect(() => buildHistoryPlan({ sales, ignore: 'sheet_row,payment,reason\n2,1,owner confirmed\n' })).toThrow(/expected_amount_naira/);
    for (const expected of ['', '10']) {
      expect(() => buildHistoryPlan({ sales, ignore: `sheet_row,payment,expected_amount_naira,reason\n2,1,${expected},owner confirmed\n` })).toThrow(/expected_amount_naira/);
    }
    expect(() => buildHistoryPlan({ sales, ignore: 'sheet_row,payment,expected_amount_naira,reason\n2,1,20,yes\n2,1,20,yes\n' })).toThrow(/repeats/);
  });
  it('groups by name ignoring spaces and capitals, applies the owner decisions and reports rows it cannot place', () => {
    const plan = buildHistoryPlan(files());
    expect(plan.totals).toMatchObject({ rows: 3, customers: 2, orders: 3, totalKobo: '440000', paidKobo: '165000' });
    expect(plan.customers.map((c: { name: string }) => c.name).sort()).toEqual(['Kay', 'Kcool']);
    expect(plan.skipped).toEqual([expect.objectContaining({ sheetRow: 5, reason: 'no customer name' })]);
    expect(plan.rows[0]).toMatchObject({ sheetRow: 2, owedKobo: '200000', note: '5FT: 5' });
    expect(plan.rows[2]).toMatchObject({ paidKobo: '15000', owedKobo: '75000' });
  });
  it('leaves out a payment the owner called a mistake, and says so', () => {
    const plan = buildHistoryPlan(files({ ignore: 'sheet_row,payment,expected_amount_naira,reason\n4,2,50,mistake\n' }));
    expect(plan.rows[2]).toMatchObject({ paidKobo: '10000', owedKobo: '80000' });
    expect(plan.ignored).toEqual([expect.objectContaining({ sheetRow: 4, payment: '2', amount: '5000' })]);
  });
  it('refuses an ignore decision that points at nothing, and a bad amount', () => {
    expect(() => buildHistoryPlan(files({ ignore: 'sheet_row,payment,expected_amount_naira,reason\n5,1,0,x\n' }))).toThrow(/not a row with a customer name/);
    expect(() => buildHistoryPlan(files({ sales: SALES.replace('₦500.00,₦500.00,₦500.00', '₦500.00,₦500.00,five') }))).toThrow(/exact naira amount/);
  });
  it('changes with the file, so a different export is never mixed in', () => {
    expect(buildHistoryPlan(files()).batch).not.toBe(buildHistoryPlan(files({ sales: SALES + '2026-09-05,Kay,More,,Flex,180,,,,,,,,,1,₦1.00,₦0.00,₦1.00,,,0,Paid,Delivered,Ada,BOM-5,,\n' })).batch);
  });
});

describe('history import', () => {
  it('rolls back a failure after the first 400-row batch, then imports read-only history with capped, zero-owed overpayments', async () => {
    db = await testDatabase();
    await opening();
    const plan = buildHistoryPlan({ sales: 'DATE,CLIENT NAME,AMOUNT (₦),INITIAL PAYMENT (₦),ADDITIONAL PAYMENT 1,ADDITIONAL PAYMENT 2,Sales ID\n' +
      Array.from({ length: 1001 }, (_, i) => `2026-10-01,New Customer,100,101,,,S${i}\n`).join('') });
    let batches = 0;
    const faulty = { transaction: (work: (tx: unknown) => Promise<unknown>) => db.transaction(tx => work({ query: async (sql: string, params: unknown[] = []) => {
      if (sql.startsWith('insert into bomedia.legacy_sales') && ++batches === 2) throw new Error('synthetic interruption after 400 rows');
      return tx.query(sql, params);
    } })) };
    await expect(importHistory(faulty, plan)).rejects.toThrow(/after 400/);
    expect(batches).toBe(2);
    expect((await rows('select count(*)::int n from bomedia.legacy_sales'))[0].n).toBe(0);
    expect((await rows('select count(*)::int n from bomedia.customers'))[0].n).toBe(0);
    await importHistory(db, plan);
    expect((await verifyHistory(db, plan)).verified).toBe(true);
    const customer = (await rows('select id::text from bomedia.customers'))[0].id;
    const result = (await db.query<{ h: { summary: { rows: number; owed_kobo: string }; rows: { owed_kobo: string }[] } }>(
      'select bomedia.api_customer_history($1) h', [customer])).rows[0].h;
    expect(result.summary).toMatchObject({ rows: 1001, owed_kobo: '0' });
    expect(result.rows).toHaveLength(1000);
    expect(result.rows.every(r => r.owed_kobo === '0')).toBe(true);
    expect((await rows('select owed_kobo::text owed from bomedia.legacy_sales limit 1'))[0].owed).toBe('-100');
    expect((await rows('select count(*)::int n from bomedia.journal_entries'))[0].n).toBe(1);
    expect((await rows('select count(*)::int n from bomedia.jobs'))[0].n).toBe(0);
    expect((await rows('select count(*)::int n from bomedia.inventory_movements'))[0].n).toBe(0);
  });

  it('matches existing customers, creates the rest, is safe to repeat and verifies against the file', async () => {
    db = await testDatabase();
    const existing = (await rows("insert into bomedia.customers(display_name) values('KAY') returning id::text as id"))[0].id;
    await opening();
    const plan = buildHistoryPlan(files());
    const first = await importHistory(db, plan);
    expect(first).toMatchObject({ replay: false, customersCreated: 1, rows: 3 });
    expect((await rows('select count(*)::integer as n from bomedia.customers'))[0].n).toBe(2);
    expect((await rows('select count(*)::integer as n from bomedia.legacy_sales where customer_id=$1', [existing]))[0].n).toBe(2);
    expect(await importHistory(db, plan)).toMatchObject({ replay: true });
    expect(await verifyHistory(db, plan)).toMatchObject({ verified: true });
    const history = (await rows('select bomedia.api_customer_history($1) as r', [existing]))[0].r as unknown as { summary: { rows: number; total_kobo: string }; rows: { sheet_row: number }[] };
    expect(history.summary).toMatchObject({ rows: 2, total_kobo: '350000' });
    expect(history.rows.map(r => r.sheet_row)).toEqual([3, 2]);
  });
  it('refuses a different file, active books, and verify catches a changed row', async () => {
    db = await testDatabase();
    await opening();
    await importHistory(db, buildHistoryPlan(files()));
    await expect(importHistory(db, buildHistoryPlan(files({ ignore: 'sheet_row,payment,expected_amount_naira,reason\n4,2,50,x\n' })))).rejects.toThrow(/different file/);
    await db.query('update bomedia.legacy_sales set paid_kobo = paid_kobo + 1 where sheet_row = 2');
    await expect(verifyHistory(db, buildHistoryPlan(files()))).rejects.toThrow(/paid/);
    await db.close();
    db = await testDatabase();
    await db.query("insert into bomedia.bookkeeping_settings(starts_on,state) values('2026-10-19','setup')");
    await db.query("update bomedia.bookkeeping_settings set state='active'");
    await expect(importHistory(db, buildHistoryPlan(files()))).rejects.toThrow(/already active/);
  });

  it('refuses missing books and setup without a posted opening entry', async () => {
    db = await testDatabase();
    const plan = buildHistoryPlan(files());
    await expect(importHistory(db, plan)).rejects.toThrow(/setup books/);
    await db.exec("insert into bomedia.bookkeeping_settings(starts_on,state) values('2026-10-19','setup')");
    await expect(importHistory(db, plan)).rejects.toThrow(/opening entries/);
    expect((await rows('select count(*)::integer n from bomedia.customers'))[0].n).toBe(0);
  });
});

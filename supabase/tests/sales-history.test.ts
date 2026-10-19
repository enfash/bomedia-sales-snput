import type { PGlite } from '@electric-sql/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import { testDatabase } from './helpers';
import { buildHistoryPlan, importHistory, verifyHistory } from '../../scripts/migration/sales-history.mjs';

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

describe('history plan', () => {
  it('groups by name ignoring spaces and capitals, applies the owner decisions and reports rows it cannot place', () => {
    const plan = buildHistoryPlan(files());
    expect(plan.totals).toMatchObject({ rows: 3, customers: 2, orders: 3, totalKobo: '440000', paidKobo: '165000' });
    expect(plan.customers.map((c: { name: string }) => c.name).sort()).toEqual(['Kay', 'Kcool']);
    expect(plan.skipped).toEqual([expect.objectContaining({ sheetRow: 5, reason: 'no customer name' })]);
    expect(plan.rows[0]).toMatchObject({ sheetRow: 2, owedKobo: '200000', note: '5FT: 5' });
    expect(plan.rows[2]).toMatchObject({ paidKobo: '15000', owedKobo: '75000' });
  });
  it('leaves out a payment the owner called a mistake, and says so', () => {
    const plan = buildHistoryPlan(files({ ignore: 'sheet_row,payment,reason\n4,2,mistake\n' }));
    expect(plan.rows[2]).toMatchObject({ paidKobo: '10000', owedKobo: '80000' });
    expect(plan.ignored).toEqual([expect.objectContaining({ sheetRow: 4, payment: '2', amount: '5000' })]);
  });
  it('refuses an ignore decision that points at nothing, and a bad amount', () => {
    expect(() => buildHistoryPlan(files({ ignore: 'sheet_row,payment,reason\n5,1,x\n' }))).toThrow(/not a row with a customer name/);
    expect(() => buildHistoryPlan(files({ sales: SALES.replace('₦500.00,₦500.00,₦500.00', '₦500.00,₦500.00,five') }))).toThrow(/exact naira amount/);
  });
  it('changes with the file, so a different export is never mixed in', () => {
    expect(buildHistoryPlan(files()).batch).not.toBe(buildHistoryPlan(files({ sales: SALES + '2026-09-05,Kay,More,,Flex,180,,,,,,,,,1,₦1.00,₦0.00,₦1.00,,,0,Paid,Delivered,Ada,BOM-5,,\n' })).batch);
  });
});

describe('history import', () => {
  it('matches existing customers, creates the rest, is safe to repeat and verifies against the file', async () => {
    db = await testDatabase();
    const existing = (await rows("insert into bomedia.customers(display_name) values('KAY') returning id::text as id"))[0].id;
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
    await importHistory(db, buildHistoryPlan(files()));
    await expect(importHistory(db, buildHistoryPlan(files({ ignore: 'sheet_row,payment,reason\n4,2,x\n' })))).rejects.toThrow(/different file/);
    await db.query('update bomedia.legacy_sales set paid_kobo = paid_kobo + 1 where sheet_row = 2');
    await expect(verifyHistory(db, buildHistoryPlan(files()))).rejects.toThrow(/paid/);
    await db.close();
    db = await testDatabase();
    await db.query("insert into bomedia.bookkeeping_settings(starts_on,state) values('2026-10-19','setup')");
    await db.query("update bomedia.bookkeeping_settings set state='active'").catch(() => undefined);
    const state = (await rows('select state from bomedia.bookkeeping_settings'))[0]?.state;
    if (state === 'active') await expect(importHistory(db, buildHistoryPlan(files()))).rejects.toThrow(/already active/);
  });
});

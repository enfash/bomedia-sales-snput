import type { PGlite } from '@electric-sql/pglite';
import { afterEach, expect, it } from 'vitest';
import { testDatabase } from './helpers';
import { snapshotFromSpreadsheet } from '../../scripts/migration/snapshot.mjs';
import { stageSnapshot } from '../../scripts/migration/stage.mjs';
import { importStockRecords, prepareStockImport } from '../../scripts/migration/import-stock.mjs';

const cell = (value: string | number) => {
  const v = typeof value === 'number' ? { numberValue: value } : { stringValue: value };
  return { userEnteredValue: v, effectiveValue: v, formattedValue: String(value) };
};
function source() {
  const tabs: Record<string, (string | number)[][]> = {
    Materials: [
      ['Material ID','Material Name','Width (ft)','Selling Price','Total Remaining (ft)','Total Capacity (ft)','Active Roll ID','Roll Count','Low Stock Threshold (ft)','Notes'],
      ['M1','Material',5,100,20,100,'R1',2,20,'Original note'],
    ],
    Inventory: [
      ['Roll ID','Item Name','Material ID','Width (ft)','Raw Length (ft)','Total Length (ft)','Remaining Length (ft)','Waste Logged (ft)','Unit','Price','Cost','Waste Factor','Cost per Sqft','Low Stock Threshold (ft)','Status','Date Added','Category'],
      ['R1','Material','M1',5,164.04,50,20,3,'m',100,2500,10,12.3456,20,'Low Stock','2026-01-01','Original category'],
      ['R2','Material','M1',5,164.04,50,0,5,'m',100,2500,10,0.000001,20,'Depleted','2026-01-02','Other category'],
    ],
  };
  return snapshotFromSpreadsheet({ spreadsheetId: 'synthetic-stock', properties: { timeZone: 'Africa/Lagos' },
    sheets: Object.entries(tabs).map(([title, rows], sheetId) => ({ properties: { title, sheetId }, data: [{ rowData: rows.map(values => ({ values: values.map(cell) })) }] })),
  }, '2026-10-03T23:30:00.000Z');
}
function edit(snapshot: ReturnType<typeof source>, sheet: number, row: number, column: number, value: string | number) {
  const c = cell(value);
  snapshot.sheets[sheet].rows[row].cells[column] = { entered: c.userEnteredValue, effective: c.effectiveValue, formatted: c.formattedValue };
}
let db: PGlite;
let databaseOpen = false;
async function ready(snapshot = source()) { db = await testDatabase(); databaseOpen = true; await stageSnapshot(db,snapshot,'synthetic/archive.json'); return snapshot; }
afterEach(async () => { if (databaseOpen) { databaseOpen = false; await db.close(); } });

it('preserves already-converted feet, original units, categories, exact fractional-kobo rates and depleted rolls', () => {
  const p = prepareStockImport(source());
  expect(p.rolls[0].data).toMatchObject({ raw_length_ft: '164.040000', original_unit: 'm', category: 'Original category', cost_per_sqft_kobo: '1235', cost_per_sqft_kobo_exact: '1234.560000' });
  expect(p.rolls[1].data.cost_per_sqft_kobo_exact).toBe('0.000100');
  expect(p.rolls).toHaveLength(2);
  expect(p.movements).toHaveLength(1);
  expect(p.movements[0].data).toMatchObject({ kind: 'opening', length_delta_ft: '20.000000', business_date: '2026-10-04', job_id: null });
});

it('imports once with material links, exact totals and matching opening movements, preserving unrelated expenses', async () => {
  const s = await ready();
  await db.query("insert into bomedia.expenses(amount_kobo,category,status) values(123,'Unrelated','Paid')");
  const first = await importStockRecords(db,s);
  expect(first).toMatchObject({ materials: 1, rolls: 2, openingMovements: 1, fieldComparison: 'passed', aggregateComparison: 'passed', replay: false });
  expect(await importStockRecords(db,s)).toEqual({ ...first, replay: true });
  expect((await db.query('select count(*)::integer as n from bomedia.inventory_movements')).rows[0]).toEqual({ n: 1 });
  expect((await db.query('select amount_kobo::text as amount from bomedia.expenses')).rows[0]).toEqual({ amount: '123' });
  expect((await db.query("select count(*)::integer as n from migration.import_runs where importer_version='materials-inventory-v1'")).rows[0]).toEqual({ n: 1 });
  expect((await db.query('select count(*)::integer as n from bomedia.jobs')).rows[0]).toEqual({ n: 0 });
},30000);

it('rejects summary drift, wrong active rolls and over-capacity balances before writing', () => {
  const s = source(); edit(s,0,1,4,21);
  expect(() => prepareStockImport(s)).toThrow('summary differs');
  const wrong = source(); edit(wrong,0,1,6,'MISSING');
  expect(() => prepareStockImport(wrong)).toThrow('blocked');
  const tooMuch = source(); edit(tooMuch,1,1,6,60);
  expect(() => prepareStockImport(tooMuch)).toThrow('blocked');
});

it('does not repair an edited active roll on replay', async () => {
  const s = await ready(); await importStockRecords(db,s);
  await db.query("update bomedia.materials set active_roll_id=(select id from bomedia.inventory_rolls where legacy_roll_id='R2')");
  await expect(importStockRecords(db,s)).rejects.toThrow('Stored stock fields differ');
  expect((await db.query('select r.legacy_roll_id from bomedia.materials m join bomedia.inventory_rolls r on r.id=m.active_roll_id')).rows[0]).toEqual({ legacy_roll_id: 'R2' });
},30000);

it('rolls back newly inserted rows if a later comparison detects changed stock', async () => {
  const s = await ready(); await importStockRecords(db,s);
  await db.query("delete from bomedia.inventory_rolls where legacy_roll_id='R2'");
  await db.query("update bomedia.inventory_rolls set remaining_length_ft=19 where legacy_roll_id='R1'");
  await expect(importStockRecords(db,s)).rejects.toThrow('Stored stock fields differ');
  expect((await db.query('select count(*)::integer as n from bomedia.inventory_rolls')).rows[0]).toEqual({ n: 1 });
},30000);

it('rejects altered staging and disabled pre-cutover imports', async () => {
  const s = await ready(); await db.query("update migration.source_rows set cells='[]' where row_number=2");
  await expect(importStockRecords(db,s)).rejects.toThrow('Hosted stock source differs');
  await db.query("insert into bomedia.idempotency_requests(operation,request_key,payload_sha256,response) values('sale','runtime',$1,'{}')",['a'.repeat(64)]);
  await expect(importStockRecords(db,s)).rejects.toThrow('Runtime writes exist');
  expect((await db.query('select count(*)::integer as n from bomedia.materials')).rows[0]).toEqual({ n: 0 });
},30000);

it('retains formula-error evidence without treating calculated revenue as stock', () => {
  const s = source();
  s.sheets[1].rows[0].cells.push({ entered: { stringValue: 'Expected Revenue' }, effective: { stringValue: 'Expected Revenue' }, formatted: 'Expected Revenue' });
  s.sheets[1].rows[1].cells.push({ entered: { formulaValue: '=1/0' }, effective: { errorValue: { type: 'DIVIDE_BY_ZERO' } }, formatted: '#DIV/0!' });
  const p = prepareStockImport(s);
  expect(p.sourceFormulaErrors).toHaveLength(1);
  expect(p.rolls[0].data.remaining_length_ft).toBe('20.000000');
});

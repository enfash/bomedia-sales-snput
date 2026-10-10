import type { PGlite } from '@electric-sql/pglite';
import { afterEach, expect, it } from 'vitest';
import { testDatabase } from './helpers';
import { snapshotFromSpreadsheet } from '../../scripts/migration/snapshot.mjs';
import { stageSnapshot } from '../../scripts/migration/stage.mjs';
import { importIndependentRecords } from '../../scripts/migration/import-independent.mjs';

const value = (text: string) => ({ userEnteredValue: { stringValue: text }, effectiveValue: { stringValue: text }, formattedValue: text });
function source() {
  return snapshotFromSpreadsheet({ spreadsheetId: 'independent-synthetic', properties: { timeZone: 'Africa/Lagos' }, sheets: [
    { properties: { sheetId: 1, title: 'Expenses' }, data: [{ rowData: [
      ['EXPENSE ID','DATE','AMOUNT','CATEGORY','DESCRIPTION','PAID TO','PAYMENT METHOD','RECEIPT URL','STATUS','Logged By','PAID BY','PAID AT','TIMESTAMP'],
      ['BATCH-X','2026-10-03','123.45','Maintenance','Test cost','Test supplier','Cash','','Paid','Staff','Staff','2026-10-03T10:00:00Z',''],
      ['BATCH-X','2026-10-03','2.05','Maintenance','Second cost','','Cash','','Pending','Staff','','','2026-10-03T11:00:00Z'],
    ].map(row => ({ values: row.map(value) })) }] },
    { properties: { sheetId: 2, title: 'Estimates' }, data: [{ rowData: [
      ['QUOTE ID','DATE','CLIENT NAME','CART DATA'],['Q1','2026-10-03T23:30:00Z','Test customer','[{"id":"legacy-item","quantity":2}]'],
    ].map(row => ({ values: row.map(value) })) }] },
  ] }, '2026-10-04T00:00:00.000Z');
}
let db: PGlite;
async function ready(snapshot = source()) {
  db = await testDatabase();
  await stageSnapshot(db, snapshot, 'synthetic/archive.json');
  return snapshot;
}
afterEach(async () => { await db?.close(); });

it('imports every independent row once, preserves missing timestamps, duplicate expense IDs, cart JSON and review state', async () => {
  const snapshot = await ready();
  await db.query("update migration.source_rows set review_notes='Owner review in progress' where row_number=2");
  const first = await importIndependentRecords(db, snapshot);
  expect(first).toMatchObject({ expenses: 2, estimates: 1, expenseTotalKobo: '12550', replay: false });
  expect(await importIndependentRecords(db, snapshot)).toEqual({ ...first, replay: true });
  expect((await db.query('select occurred_at from bomedia.expenses where description=$1',['Test cost'])).rows[0]).toEqual({ occurred_at: null });
  expect((await db.query('select business_date::text,cart_data from bomedia.estimates')).rows[0]).toEqual({ business_date: '2026-10-04', cart_data: [{ id: 'legacy-item', quantity: 2 }] });
  expect((await db.query("select count(*)::integer as n from migration.source_rows where review_notes='Owner review in progress'")).rows[0]).toEqual({ n: 2 });
  expect((await db.query("select count(*)::integer as n from migration.import_runs where importer_version='expenses-estimates-v1'")).rows[0]).toEqual({ n: 1 });
  expect((await db.query('select count(*)::integer as n from bomedia.payments')).rows[0]).toEqual({ n: 0 });
}, 30_000);

it('rolls back all inserts if an existing imported field has changed', async () => {
  const snapshot = await ready();
  await importIndependentRecords(db, snapshot);
  await db.query("update bomedia.expenses set description='Edited after import' where description='Test cost'");
  await db.query('delete from bomedia.estimates');
  await expect(importIndependentRecords(db, snapshot)).rejects.toThrow('Imported fields differ');
  expect((await db.query('select count(*)::integer as n from bomedia.estimates')).rows[0]).toEqual({ n: 0 });
}, 30_000);

it('refuses incomplete or altered hosted staging', async () => {
  const snapshot = await ready();
  await db.query("update migration.source_rows set cells='[]' where row_number=2");
  await expect(importIndependentRecords(db, snapshot)).rejects.toThrow('Hosted source differs');
  expect((await db.query('select count(*)::integer as n from bomedia.expenses')).rows[0]).toEqual({ n: 0 });
}, 30_000);

it('refuses rehearsal import after any runtime transaction has occurred', async () => {
  const snapshot = await ready();
  await db.query("insert into bomedia.idempotency_requests(operation,request_key,payload_sha256,response) values ('sale','runtime',$1,'{}')",['a'.repeat(64)]);
  await expect(importIndependentRecords(db, snapshot)).rejects.toThrow('Runtime writes exist');
}, 30_000);

it('does not silently discard a receipt link or invent a timezone for an old timestamp', async () => {
  const snapshot = await ready();
  snapshot.sheets[0].rows[1].cells[7] = { entered: { stringValue: 'https://drive.google.com/file/d/test/view' }, effective: { stringValue: 'https://drive.google.com/file/d/test/view' }, formatted: 'https://drive.google.com/file/d/test/view' };
  await expect(importIndependentRecords(db, snapshot)).rejects.toThrow('Receipt-link import');
  snapshot.sheets[0].rows[1].cells[7] = { entered: { stringValue: '' }, effective: { stringValue: '' }, formatted: '' };
  snapshot.sheets[0].rows[1].cells[12] = { entered: { stringValue: '03/10/2026 11:00' }, effective: { stringValue: '03/10/2026 11:00' }, formatted: '03/10/2026 11:00' };
  await expect(importIndependentRecords(db, snapshot)).rejects.toThrow('Ambiguous historical timestamp');
}, 30_000);

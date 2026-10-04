import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { testDatabase } from './helpers';
import { canonicalJson, snapshotFromSpreadsheet, snapshotDigest, inspectSnapshot, encryptArchive, decryptArchive, moneyToKobo, validateSnapshot } from '../../scripts/migration/snapshot.mjs';
import { stageSnapshot } from '../../scripts/migration/stage.mjs';
import { testConnection, serializeMigrationJson } from '../../scripts/migration/cli.mjs';

const text = (value: string) => ({ userEnteredValue: { stringValue: value }, effectiveValue: { stringValue: value }, formattedValue: value });
const raw = {
  spreadsheetId: 'synthetic-workbook', properties: { timeZone: 'Africa/Lagos', locale: 'en_NG' },
  sheets: [
    { properties: { sheetId: 1, title: 'Sales' }, data: [{ rowData: [
      { values: ['DATE', 'Sales ID', 'TRANSACTION ID', 'TIMESTAMP', 'AMOUNT (₦)', 'INITIAL PAYMENT (₦)'].map(text) },
      { values: [...['2026-10-03', 'BOM-1', 'TX-1', '2026-10-03T10:00:00Z'].map(text),
        { userEnteredValue: { formulaValue: '=100*2' }, effectiveValue: { numberValue: 200 }, formattedValue: '₦200.00' }] },
      { values: ['2026-10-03', 'BOM-1', 'TX-1', '', '50'].map(text) },
    ] }] },
    { properties: { sheetId: 2, title: 'Cashiers' }, data: [{ rowData: [
      { values: ['Name', 'Status', 'Passcode'].map(text) },
      { values: ['Test Staff', 'Online', '7654'].map(text) },
    ] }] },
    { properties: { sheetId: 3, title: 'Empty template' } },
    { properties: { sheetId: 4, title: 'Calculator' }, data: [{ startRow: 4, startColumn: 2, rowData: [
      { values: [{ userEnteredValue: { formulaValue: '=Sales!E2' }, effectiveValue: { numberValue: 200 }, formattedValue: '200' }] },
    ] }] },
  ],
};
const timestamp = '2026-10-03T11:00:00.000Z';

it('preserves formulas, effective values, sparse row/column offsets and empty tabs', () => {
  const snapshot = snapshotFromSpreadsheet(raw, timestamp);
  expect(snapshot.sheets).toHaveLength(4);
  expect(snapshot.sheets[0].rows[1].cells[4]).toMatchObject({ entered: { formulaValue: '=100*2' }, effective: { numberValue: 200 } });
  expect(snapshot.sheets[2].rows).toEqual([]);
  expect(snapshot.sheets[3].rows[0]).toMatchObject({ rowNumber: 5, cells: [null, null, { effective: { numberValue: 200 } }] });
});

it('redacts staff PINs and formulas referencing the staff sheet without modifying the source', () => {
  const workbook = structuredClone(raw);
  workbook.sheets[3].data![0].rowData![0].values = [
    { userEnteredValue: { formulaValue: "='Cashiers'!C2" }, effectiveValue: { numberValue: 7654 }, formattedValue: '7654' },
  ];
  const snapshot = snapshotFromSpreadsheet(workbook, timestamp);
  expect(canonicalJson(snapshot)).not.toContain('7654');
  expect(snapshot.sheets[1].rows[1].cells[2]).toEqual({ redacted: true });
  expect(canonicalJson(workbook)).toContain('7654');
});

it('rejects staging a snapshot with restored plaintext PINs', () => {
  const snapshot = snapshotFromSpreadsheet(raw, timestamp);
  snapshot.sheets[1].rows[1].cells[2] = { entered: { stringValue: '7654' }, effective: { stringValue: '7654' }, formatted: '7654' };
  expect(() => validateSnapshot(snapshot)).toThrow('unredacted');
});

it('flags repeated/missing identifiers for review without deduplicating jobs', () => {
  const snapshot = snapshotFromSpreadsheet(raw, timestamp);
  const { report, dispositions } = inspectSnapshot(snapshot);
  expect(snapshot.sheets[0].rows).toHaveLength(3);
  expect(dispositions.get('1:2')).toMatchObject({ disposition: 'quarantined', codes: ['repeated_sales_id', 'repeated_transaction_id'] });
  expect(dispositions.get('1:3')?.codes).toContain('missing_timestamp');
  expect(report.sheets[0].columnTotalsKobo['amount (₦)']).toBe('25000');
  expect(report.financialReconciliation).toBe('not_performed');
});

it('encrypts the complete raw archive and detects a wrong password or modified ciphertext', () => {
  const password = 'synthetic-only-archive-password-32-characters';
  const archive = encryptArchive(raw, password);
  expect(JSON.stringify(archive)).not.toContain('7654');
  expect(decryptArchive(archive, password)).toEqual(raw);
  expect(() => decryptArchive(archive, `${password}-wrong`)).toThrow();
  const bytes = Buffer.from(archive.ciphertext, 'base64'); bytes[0] ^= 1;
  expect(() => decryptArchive({ ...archive, ciphertext: bytes.toString('base64') }, password)).toThrow();
});

it('hashes snapshots independently of object key order and detects changed values', () => {
  const snapshot = snapshotFromSpreadsheet(raw, timestamp);
  expect(snapshotDigest({ ...snapshot, sheets: snapshot.sheets })).toBe(snapshotDigest(snapshot));
  expect(snapshotDigest({ ...snapshot, workbookId: 'different' })).not.toBe(snapshotDigest(snapshot));
});

it.each([['₦1,234.56', '123456'], ['0.005', '1'], ['-0.005', '-1'], ['1.004', '100'], ['0', '0']])(
  'converts %s to exact kobo %s', (input, expected) => expect(moneyToKobo(input)).toBe(expected),
);
it.each(['12,34', '₦oops', 'NaN', '', '9223372036854775808'])('refuses ambiguous or out-of-range money %s', input => {
  expect(() => moneyToKobo(input)).toThrow();
});

it('rounds tiny Sheets numeric residuals to zero without accepting exponential text', () => {
  expect(moneyToKobo(1.1368683772161603e-13)).toBe('0');
  expect(moneyToKobo(-1.1368683772161603e-13)).toBe('0');
  expect(moneyToKobo(Number.MIN_VALUE)).toBe('0');
  expect(() => moneyToKobo('1e3')).toThrow();
});

const ref = 'abcdefghijklmnopqrst';
it('sends JSON-text parameters as arrays/objects rather than double-encoded strings in Postgres.js', () => {
  for (const value of [[{ row_number: 1, cells: [{ effective: { numberValue: 1.1368683772161603e-13 } }] }],
    { gridProperties: { rowCount: 10 }, locale: 'en_NG' }]) {
    expect(JSON.parse(serializeMigrationJson(JSON.stringify(value)))).toEqual(value);
    expect(JSON.parse(serializeMigrationJson(value))).toEqual(value);
  }
});

it('accepts only the explicitly confirmed Supabase project with verified TLS handled by the driver', () => {
  const url = `postgresql://postgres:synthetic@db.${ref}.supabase.co:5432/postgres`;
  expect(testConnection(url, ref, ref)).toBe(url);
  expect(() => testConnection(url, ref, 'another-project')).toThrow();
  expect(() => testConnection(url.replace(ref, 'aaaaaaaaaaaaaaaaaaaa'), ref, ref)).toThrow();
  expect(() => testConnection(`${url}?sslmode=disable`, ref, ref)).toThrow();
  expect(() => testConnection(url.replace(':5432', ':6543'), ref, ref)).toThrow();
});

let db: PGlite;
beforeAll(async () => { db = await testDatabase(); }, 30_000);
afterAll(async () => { await db?.close(); });
it('stages all source rows once, preserves manual review state and writes no business records', async () => {
  const snapshot = snapshotFromSpreadsheet(raw, timestamp);
  const first = await stageSnapshot(db, snapshot, 'synthetic/workbook.encrypted.json');
  const second = await stageSnapshot(db, snapshot, 'synthetic/workbook.encrypted.json');
  expect(second).toEqual(first);
  expect(first).toMatchObject({ sheets: 4, rows: 6, quarantined: 3 });
  expect((await db.query('select * from migration.source_rows')).rows).toHaveLength(6);
  expect((await db.query('select * from bomedia.jobs')).rows).toHaveLength(0);
  const allCells = (await db.query('select cells from migration.source_rows')).rows;
  expect(JSON.stringify(allCells)).not.toContain('7654');
  await db.query("update migration.source_rows set review_notes = 'Reviewed manually' where row_number = 2");
  await stageSnapshot(db, snapshot, 'synthetic/workbook.encrypted.json');
  expect((await db.query("select * from migration.source_rows where review_notes = 'Reviewed manually'")).rows).toHaveLength(2);
});

it('refuses a changed source row under an existing snapshot identity', async () => {
  const snapshot = snapshotFromSpreadsheet(raw, timestamp);
  await db.query("update migration.source_rows set cells = '[]' where row_number = 2");
  await expect(stageSnapshot(db, snapshot, 'synthetic/workbook.encrypted.json')).rejects.toThrow('differs');
});

it('preserves every row across staging batch boundaries and on repeat upload', async () => {
  const workbook = { spreadsheetId: 'batch-boundary-workbook', sheets: [{
    properties: { sheetId: 1, title: 'Reference' }, data: [{ rowData:
      Array.from({ length: 405 }, (_, index) => ({ values: [text(`Row ${index + 1}`)] })),
    }],
  }] };
  const snapshot = snapshotFromSpreadsheet(workbook, timestamp);
  const first = await stageSnapshot(db, snapshot, 'synthetic/batch-archive.json');
  expect(first.rows).toBe(405);
  expect(await stageSnapshot(db, snapshot, 'synthetic/batch-archive.json')).toEqual(first);
});

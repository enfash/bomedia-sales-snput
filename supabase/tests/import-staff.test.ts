import type { PGlite } from '@electric-sql/pglite';
import { afterEach, expect, it } from 'vitest';
import { testDatabase } from './helpers';
import { encryptArchive, snapshotFromSpreadsheet } from '../../scripts/migration/snapshot.mjs';
import { stageSnapshot } from '../../scripts/migration/stage.mjs';
import { importStaffRecords } from '../../scripts/migration/import-staff.mjs';
import { hashPin, verifyPin } from '../../lib/server/pin-credentials.mjs';

const phrase = 'test-only-archive-passphrase-1234567890';
const pin = '00792491';
const value = (text: string) => ({ userEnteredValue: { stringValue: text }, effectiveValue: { stringValue: text }, formattedValue: text });
function fixture(names = ['Staff One', 'Staff Two']) {
  const workbook = { spreadsheetId: 'staff-synthetic', properties: { timeZone: 'Africa/Lagos' }, sheets: [
    { properties: { sheetId: 7, title: 'Cashiers' }, data: [{ rowData: [
      ['Name','Status','Last Login','Last Active','Passcode'],
      [names[0],'Offline','03/10/2026 15:00','2026-10-03T14:00:00Z', `'${pin}`],
      [names[1],'Online','Never','',''],
    ].map(row => ({ values: row.map(value) })) }] },
  ] };
  return { snapshot: snapshotFromSpreadsheet(workbook, '2026-10-03T22:19:01.958Z'), archive: encryptArchive(workbook, phrase), workbook };
}
let db: PGlite | undefined;
afterEach(async () => { await db?.close(); db = undefined; });
async function ready() {
  db = await testDatabase();
  const source = fixture();
  await stageSnapshot(db, source.snapshot, 'test/encrypted.json');
  return source;
}

it('uses randomized fixed-cost scrypt, preserves leading zeros and rejects wrong or malformed credentials', async () => {
  const a = await hashPin(pin), b = await hashPin(pin);
  expect(a).toMatch(/^scrypt\$32768\$8\$3\$[a-f0-9]{32}\$[a-f0-9]{64}$/);
  expect(a).not.toBe(b);
  expect(await verifyPin(pin, a)).toBe(true);
  expect(await verifyPin('792491', a)).toBe(false);
  expect(await verifyPin(pin, a.replace('$32768$', '$1073741824$'))).toBe(false);
  expect(await verifyPin('', a)).toBe(false);
  expect(await verifyPin(pin, null)).toBe(false);
  await expect(hashPin('')).rejects.toThrow('nonempty bounded');
  await expect(hashPin('x'.repeat(513))).rejects.toThrow('nonempty bounded');
});

it('imports staff with hashed PINs, flags missing PINs for reset and replays without rehashing or changing presence', async () => {
  const { snapshot, archive } = await ready();
  const first = await importStaffRecords(db!, snapshot, archive, phrase);
  expect(first).toMatchObject({ staff: 2, hashedPins: 1, requirePinReset: 1, plaintextPersisted: false, replay: false });
  const rows = (await db!.query<{ display_name: string; login_name: string; pin_hash: string | null; disabled_at: string | null; last_login_at: string | null; last_active_at: string | null }>(
    'select display_name,login_name,pin_hash,disabled_at,last_login_at,last_active_at from bomedia.staff order by display_name')).rows;
  expect(await verifyPin(pin, rows[0].pin_hash)).toBe(true);
  expect(rows[1].pin_hash).toBeNull();
  expect(rows.every(row => row.disabled_at === null && row.last_login_at === null && row.last_active_at === null)).toBe(true);
  expect(rows.map(row => row.login_name)).toEqual(['staff one', 'staff two']);
  expect(await importStaffRecords(db!, snapshot, archive, phrase)).toEqual({ ...first, replay: true });
  expect((await db!.query('select pin_hash from bomedia.staff order by display_name')).rows).toEqual(rows.map(row => ({ pin_hash: row.pin_hash })));
  expect(JSON.stringify(first)).not.toContain(pin);
  expect(JSON.stringify(snapshot)).not.toContain(pin);
  expect((await db!.query("select id from migration.import_runs where importer_version='staff-hashed-pins-v1'")).rows).toHaveLength(1);
}, 30_000);

it('refuses modified staging or a mismatched encrypted workbook without importing credentials', async () => {
  const { snapshot, archive, workbook } = await ready();
  workbook.sheets[0].data[0].rowData[1].values[0] = value('Changed name');
  await expect(importStaffRecords(db!, snapshot, encryptArchive(workbook, phrase), phrase)).rejects.toThrow('does not reproduce');
  await db!.query("update migration.source_rows set cells='[]' where row_number=2");
  await expect(importStaffRecords(db!, snapshot, archive, phrase)).rejects.toThrow('Hosted staff source differs');
  expect((await db!.query('select id from bomedia.staff')).rows).toHaveLength(0);
}, 30_000);

it('refuses a credential reset or edited staff record and rolls back any missing-row reinsertion', async () => {
  const { snapshot, archive } = await ready();
  await importStaffRecords(db!, snapshot, archive, phrase);
  await db!.query('update bomedia.staff set pin_hash=$1 where login_name=$2', [await hashPin('different-secret'), 'staff one']);
  await db!.query("delete from bomedia.staff where login_name='staff two'");
  await expect(importStaffRecords(db!, snapshot, archive, phrase)).rejects.toThrow('credential changed');
  expect((await db!.query('select id from bomedia.staff')).rows).toHaveLength(1);
}, 30_000);

it('does not merge staff with colliding normalized names', async () => {
  db = await testDatabase();
  const { snapshot, archive } = fixture(['Staff One', ' staff   ONE ']);
  await stageSnapshot(db, snapshot, 'test/encrypted.json');
  await expect(importStaffRecords(db, snapshot, archive, phrase)).rejects.toThrow('collide');
  expect((await db.query('select id from bomedia.staff')).rows).toHaveLength(0);
}, 30_000);

it('blocks replay once login activity exists even without a financial request', async () => {
  const { snapshot, archive } = await ready();
  await importStaffRecords(db!, snapshot, archive, phrase);
  await db!.query('insert into bomedia.login_attempts(key_hash,window_started_at) values ($1,now())', ['a'.repeat(64)]);
  await expect(importStaffRecords(db!, snapshot, archive, phrase)).rejects.toThrow('Runtime or login activity');
}, 30_000);

it('refuses another manual account rather than overwriting or adopting it', async () => {
  const { snapshot, archive } = await ready();
  await db!.query("insert into bomedia.staff(display_name,login_name) values ('Owner','owner')");
  await expect(importStaffRecords(db!, snapshot, archive, phrase)).rejects.toThrow('different source');
}, 30_000);

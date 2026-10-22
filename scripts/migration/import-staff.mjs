import { canonicalJson, cellValue, decryptArchive, snapshotFromSpreadsheet } from './snapshot.mjs';
import { buildMigrationPlan, sourceCandidateId } from './plan.mjs';
import { hashPin, verifyPin } from '../../lib/server/pin-credentials.mjs';

const VERSION = 'staff-hashed-pins-v1';
const normalize = value => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

// The decrypted workbook and PINs stay inside this function/importer's memory.
// Do not expose them in reports, SQL parameters, logs or a plaintext archive.
function sourceStaff(snapshot, encryptedArchive, passphrase) {
  const workbook = decryptArchive(encryptedArchive, passphrase);
  if (canonicalJson(snapshotFromSpreadsheet(workbook, snapshot.capturedAt)) !== canonicalJson(snapshot)) {
    throw new Error('Encrypted staff source does not reproduce the verified snapshot');
  }
  const plan = buildMigrationPlan(snapshot);
  const sheets = snapshot.sheets.filter(s => s.title === 'Cashiers');
  if (sheets.length !== 1) throw new Error('Exactly one staff source tab is required');
  const sheet = sheets[0];
  const headers = sheet.rows.find(r => r.rowNumber === 1)?.cells.map(c => normalize(cellValue(c))) ?? [];
  if (headers.filter(h => h === 'passcode').length !== 1) throw new Error('Staff Passcode column is missing or ambiguous');
  const column = headers.indexOf('passcode');
  const rawSheet = workbook.sheets.find(s => s.properties.sheetId === sheet.sheetId);
  const secretCells = new Map();
  for (const grid of rawSheet.data ?? []) {
    for (const [offset, row] of (grid.rowData ?? []).entries()) {
      const position = column - (grid.startColumn ?? 0);
      if (position >= 0 && position < (row.values ?? []).length) {
        const cell = row.values[position];
        secretCells.set((grid.startRow ?? 0) + offset + 1, cell ? { entered: cell.userEnteredValue ?? null, effective: cell.effectiveValue ?? null } : null);
      }
    }
  }
  const loginNames = new Set();
  const records = plan.rows.filter(r => r.sheet === 'Cashiers').map(row => {
    if (row.blockers.length) throw new Error('Staff source has mapping blockers');
    const displayName = row.fields.display_name;
    const loginName = normalize(displayName);
    if (!loginName || loginNames.has(loginName)) throw new Error('Staff login names are missing or collide');
    loginNames.add(loginName);
    const secretCell = secretCells.get(row.rowNumber);
    if (secretCell?.effective?.errorValue || secretCell?.entered?.formulaValue) throw new Error('Staff credential needs a separate reset');
    const original = cellValue(secretCell);
    // Preserve the existing login's handling of an apostrophe used for text PINs.
    const pin = String(original ?? '').trim().replace(/^'/, '');
    if (Buffer.byteLength(pin, 'utf8') > 512) throw new Error('Staff credential exceeds supported length');
    return { source: { sheetId: row.sheetId, rowNumber: row.rowNumber }, pin: pin || null,
      data: { id: row.id, display_name: displayName, login_name: loginName } };
  });
  if (!records.length) throw new Error('No staff records found');
  return { digest: plan.snapshotSha256, sheet, records };
}

export async function importStaffRecords(db, snapshot, encryptedArchive, passphrase) {
  const prepared = sourceStaff(snapshot, encryptedArchive, passphrase);
  try {
    return await db.transaction(async tx => {
      await tx.query("select pg_advisory_xact_lock(hashtextextended('bomedia:business-import',0))");
      await tx.query('lock table bomedia.idempotency_requests in exclusive mode');
      await tx.query('lock table bomedia.staff,bomedia.sessions,bomedia.login_attempts in exclusive mode');
      const activity = (await tx.query(`select (select count(*) from bomedia.idempotency_requests)
        + (select count(*) from bomedia.sessions) + (select count(*) from bomedia.login_attempts) as n`)).rows[0].n;
      if (BigInt(activity) !== 0n) throw new Error('Runtime or login activity exists; staff rehearsal import disabled');
      const snapshots = (await tx.query('select id from migration.snapshots where sha256=$1', [prepared.digest])).rows;
      if (snapshots.length !== 1) throw new Error('Verified staff snapshot must be staged first');
      const snapshotId = snapshots[0].id;
      const staged = (await tx.query(`select r.id,s.sheet_id::text as source_sheet_id,r.row_number,r.cells
        from migration.source_rows r join migration.source_sheets s on s.id=r.sheet_id
        where s.snapshot_id=$1 and s.title='Cashiers'`, [snapshotId])).rows;
      const expected = new Map(prepared.sheet.rows.map(r => [r.rowNumber, r.cells]));
      if (staged.length !== expected.size || staged.some(r => String(prepared.sheet.sheetId) !== r.source_sheet_id
        || !expected.has(r.row_number) || canonicalJson(r.cells) !== canonicalJson(expected.get(r.row_number)))) {
        throw new Error('Hosted staff source differs from the verified snapshot');
      }
      const sourceIds = new Map(staged.map(r => [r.row_number, r.id]));
      const foreign = (await tx.query(`select count(*)::integer as n from bomedia.staff b
        left join migration.source_rows r on r.id=b.source_row_id left join migration.source_sheets s on s.id=r.sheet_id
        where s.snapshot_id is distinct from $1::uuid`, [snapshotId])).rows[0].n;
      if (foreign) throw new Error('Staff contains a different source or manually created account');
      for (const record of prepared.records) {
        const sourceId = sourceIds.get(record.source.rowNumber);
        const existing = (await tx.query('select * from bomedia.staff where source_row_id=$1', [sourceId])).rows;
        if (!existing.length) {
          const encoded = record.pin === null ? null : await hashPin(record.pin);
          await tx.query(`insert into bomedia.staff(id,display_name,login_name,pin_hash,source_row_id)
            values ($1,$2,$3,$4,$5)`, [record.data.id, record.data.display_name, record.data.login_name, encoded, sourceId]);
        }
      }
      const stored = (await tx.query('select * from bomedia.staff')).rows;
      if (stored.length !== prepared.records.length) throw new Error('Unexpected staff rows exist');
      for (const record of prepared.records) {
        const row = stored.find(r => r.id === record.data.id);
        if (!row || row.display_name !== record.data.display_name || row.login_name !== record.data.login_name
          || row.source_row_id !== sourceIds.get(record.source.rowNumber) || String(row.credential_revision) !== '0'
          || row.disabled_at !== null || row.last_login_at !== null || row.last_active_at !== null) {
          throw new Error('Staff fields changed; refusing to overwrite');
        }
        if (record.pin === null ? row.pin_hash !== null : !await verifyPin(record.pin, row.pin_hash)) {
          throw new Error('Staff credential changed; refusing to overwrite');
        }
      }
      const report = { version: VERSION, snapshotSha256: prepared.digest, staff: prepared.records.length,
        hashedPins: prepared.records.filter(r => r.pin !== null).length,
        requirePinReset: prepared.records.filter(r => r.pin === null).length,
        fieldComparison: 'passed', credentialVerification: 'passed', plaintextPersisted: false,
        historicalPresence: 'retained_in_source_only', overallMigration: 'reconciling', runtimeEnabled: false };
      const runs = (await tx.query('select reconciliation from migration.import_runs where snapshot_id=$1 and importer_version=$2', [snapshotId, VERSION])).rows;
      if (runs.length > 1 || (runs.length && canonicalJson(runs[0].reconciliation) !== canonicalJson(report))) throw new Error('Staff import evidence changed');
      if (!runs.length) await tx.query(`insert into migration.import_runs(id,snapshot_id,importer_version,status,reconciliation,finished_at)
        values ($1,$2,$3,'reconciling',$4::jsonb,now())`, [sourceCandidateId(prepared.digest, VERSION, 'run'), snapshotId, VERSION, JSON.stringify(report)]);
      return { ...report, replay: runs.length > 0 };
    });
  } finally {
    // JS strings cannot be securely wiped, but no plaintext is retained in results.
    prepared.records.forEach(record => { record.pin = null; });
  }
}

import { mkdir, readFile, writeFile, realpath, readdir } from 'node:fs/promises';
import { resolve, join, relative, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, encryptArchive, decryptArchive, inspectSnapshot, sha256, snapshotDigest, snapshotFromSpreadsheet, validateSnapshot } from './snapshot.mjs';
import { stageSnapshot } from './stage.mjs';
import { applyMigrations } from './apply.mjs';
import { buildMigrationPlan } from './plan.mjs';
import { buildPaymentReconciliation } from './reconcile.mjs';
import { buildPaymentReview, renderPaymentReview } from './review.mjs';
import { importIndependentRecords } from './import-independent.mjs';
import { importStockRecords } from './import-stock.mjs';
import { importStaffRecords } from './import-staff.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
class CommandError extends Error {}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new CommandError(`Set ${name} privately in .env.local before running this command.`);
  return value;
}

async function privateDirectory(name, create = false) {
  if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) throw new CommandError('Supply a snapshot name using only letters, numbers, hyphens and underscores.');
  const base = join(root, 'migration-data');
  await mkdir(base, { recursive: true, mode: 0o700 });
  if (await realpath(base) !== base) throw new CommandError('migration-data must not be a symbolic link.');
  const target = join(base, name);
  if (create) await mkdir(target, { mode: 0o700 }); // Fails rather than overwriting an existing archive.
  if (await realpath(target) !== target) throw new CommandError('Snapshot directory must not be a symbolic link.');
  return target;
}

async function writePrivate(directory, name, value) {
  await writeFile(join(directory, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
}

async function loadSnapshot(directory) {
  const snapshot = JSON.parse(await readFile(join(directory, 'snapshot.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
  const archiveText = await readFile(join(directory, 'workbook.encrypted.json'), 'utf8');
  validateSnapshot(snapshot);
  if (manifest.version !== 1 || manifest.snapshotSha256 !== snapshotDigest(snapshot)
    || manifest.archiveSha256 !== sha256(archiveText)) throw new CommandError('Snapshot or archive checksum mismatch.');
  return { snapshot, archive: JSON.parse(archiveText) };
}

// Used by tests as well as the staging command. No database can be chosen silently.
export function testConnection(connectionString, expectedRef, confirmedRef) {
  if (!expectedRef || confirmedRef !== expectedRef || !/^[a-z0-9]{20}$/.test(expectedRef)) {
    throw new CommandError('Use --confirm-project with the configured SUPABASE_MIGRATION_PROJECT_REF.');
  }
  const url = new URL(connectionString);
  const direct = url.hostname === `db.${expectedRef}.supabase.co` && decodeURIComponent(url.username) === 'postgres';
  const pooled = /^[a-z0-9.-]+\.pooler\.supabase\.com$/.test(url.hostname)
    && decodeURIComponent(url.username) === `postgres.${expectedRef}`;
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || (!direct && !pooled)
    || (url.port && url.port !== '5432') || url.pathname !== '/postgres'
    || !url.password || url.search || url.hash) {
    throw new CommandError('Use the configured project direct/session-pooler postgres URL on port 5432, without query parameters. TLS is configured by the tool.');
  }
  return url.toString();
}

// The query adapter follows pg/PGlite's JSON-text parameter convention.
// Postgres.js otherwise JSON-encodes that text again after learning its SQL type.
export function serializeMigrationJson(value) {
  return JSON.stringify(typeof value === 'string' ? JSON.parse(value) : value);
}

async function withMigrationDatabase(confirmedRef, callback) {
  const connection = testConnection(requiredEnv('SUPABASE_MIGRATION_DATABASE_URL'),
    requiredEnv('SUPABASE_MIGRATION_PROJECT_REF'), confirmedRef);
  const { default: postgres } = await import('postgres');
  const ca = process.env.SUPABASE_CA_CERT_PATH ? await readFile(process.env.SUPABASE_CA_CERT_PATH, 'utf8') : undefined;
  const sql = postgres(connection, { ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
    max: 1, prepare: false, connect_timeout: 15, idle_timeout: 10, onnotice: () => {},
    types: { migrationJson: { to: 114, from: [114, 3802], serialize: serializeMigrationJson, parse: JSON.parse } } });
  const adapter = client => ({ query: async (text, params = []) => ({ rows: await client.unsafe(text, params) }),
    exec: text => client.unsafe(text),
    transaction: callback => client.begin(tx => callback(adapter(tx))) });
  try { return await callback(adapter(sql)); }
  finally { await sql.end({ timeout: 5 }); }
}

async function main() {
  const [command, name, ...options] = process.argv.slice(2);
  if (command === 'help' || !command) {
    console.log('Commands: apply --confirm-project <ref> | export <name> | inspect <name> | plan <name> | reconcile <name> | review <name> | verify-archive <name> | rehearse <name> | rehearse-independent <name> | rehearse-stock <name> | rehearse-staff <name> | stage <name> --confirm-project <ref> | import-independent <name> --confirm-project <ref> | import-stock <name> --confirm-project <ref> | import-staff <name> --confirm-project <ref>');
    return;
  }
  if (!['apply', 'export', 'inspect', 'plan', 'reconcile', 'review', 'verify-archive', 'rehearse', 'rehearse-independent', 'rehearse-stock', 'rehearse-staff', 'stage', 'import-independent', 'import-stock', 'import-staff'].includes(command)) throw new CommandError('Unknown migration command. Run with help.');
  if (command === 'apply') {
    if (name !== '--confirm-project' || options.length !== 1) throw new CommandError('Apply requires --confirm-project <project-ref>.');
    const directory = join(root, 'supabase/migrations');
    const files = await Promise.all((await readdir(directory)).filter(name => name.endsWith('.sql'))
      .map(async name => ({ name, sql: await readFile(join(directory, name), 'utf8') })));
    console.log(JSON.stringify(await withMigrationDatabase(options[0], db => applyMigrations(db, files))));
    return;
  }
  if (command === 'export') {
    if (options.length) throw new CommandError('Export takes only a new snapshot name.');
    const passphrase = requiredEnv('MIGRATION_ARCHIVE_PASSPHRASE');
    if (passphrase.length < 32) throw new CommandError('MIGRATION_ARCHIVE_PASSPHRASE must contain at least 32 characters.');
    const { JWT } = await import('google-auth-library');
    const { google } = await import('googleapis');
    const auth = new JWT({ email: requiredEnv('GOOGLE_CLIENT_EMAIL'),
      key: requiredEnv('GOOGLE_PRIVATE_KEY').replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
    // One GET retains every tab, its metadata and all returned grid data. No Sheets helper that can mutate headers.
    const { data } = await google.sheets({ version: 'v4', auth }).spreadsheets.get({
      spreadsheetId: requiredEnv('GOOGLE_SHEET_ID'), includeGridData: true,
    }, { timeout: 60_000, retry: false });
    const snapshot = snapshotFromSpreadsheet(data);
    const archive = encryptArchive(data, passphrase);
    const directory = await privateDirectory(name, true);
    await writePrivate(directory, 'workbook.encrypted.json', archive);
    await writePrivate(directory, 'snapshot.json', snapshot);
    const archiveBytes = await readFile(join(directory, 'workbook.encrypted.json'));
    await writePrivate(directory, 'manifest.json', { version: 1, snapshotSha256: snapshotDigest(snapshot), archiveSha256: sha256(archiveBytes) });
    await writePrivate(directory, 'inspection.json', inspectSnapshot(snapshot).report);
    console.log(`Saved ${snapshot.sheets.length} tabs to ${relative(root, directory)}. Live Sheets were read only.`);
    return;
  }
  const directory = await privateDirectory(name);
  const { snapshot, archive } = await loadSnapshot(directory);
  if (command === 'review') {
    if (options.length) throw new CommandError('Review takes only a snapshot name.');
    const report = buildPaymentReview(buildMigrationPlan(snapshot), { capturedAt: snapshot.capturedAt });
    const rendered = renderPaymentReview(report);
    const output = join(directory, `payment-review-${new Date().toISOString().replaceAll(':', '-')}`);
    await mkdir(output, { mode: 0o700 });
    await writePrivate(output, 'evidence.json', report);
    await writeFile(join(output, 'start-here.md'), rendered.start, { mode: 0o600, flag: 'wx' });
    await writeFile(join(output, 'review.md'), rendered.full, { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ output: relative(root, output), ...report.summary, status: report.status }));
    return;
  }
  if (command === 'reconcile') {
    if (options.length) throw new CommandError('Reconcile takes only a snapshot name.');
    const report = buildPaymentReconciliation(buildMigrationPlan(snapshot));
    const output = `payment-reconciliation-${new Date().toISOString().replaceAll(':', '-')}.json`;
    await writePrivate(directory, output, report);
    console.log(JSON.stringify({ output: relative(root, join(directory, output)), ...report.summary, status: report.status }));
    return;
  }
  if (command === 'plan') {
    if (options.length) throw new CommandError('Plan takes only a snapshot name.');
    const plan = buildMigrationPlan(snapshot);
    // Unique output: do not overwrite manually reviewed plans.
    const output = `mapping-plan-${new Date().toISOString().replaceAll(':', '-')}.json`;
    await writePrivate(directory, output, plan);
    console.log(JSON.stringify({ output: relative(root, join(directory, output)), ...plan.summary,
      status: plan.status, financialReconciliation: plan.finance.status }));
    return;
  }
  if (command === 'inspect') {
    if (options.length) throw new CommandError('Inspect takes only a snapshot name.');
    const { report } = inspectSnapshot(snapshot);
    console.log(JSON.stringify({ tabs: report.sheets.length, rows: report.sheets.reduce((n, s) => n + s.rows, 0),
      rowsNeedingReview: report.sheets.reduce((n, s) => n + s.issues.length, 0), financialReconciliation: report.financialReconciliation }));
    return;
  }
  if (command === 'verify-archive') {
    if (options.length) throw new CommandError('verify-archive takes only a snapshot name.');
    // Prove recovery without writing any decrypted PINs or workbook cells to disk.
    const workbook = decryptArchive(archive, requiredEnv('MIGRATION_ARCHIVE_PASSPHRASE'));
    if (canonicalJson(snapshotFromSpreadsheet(workbook, snapshot.capturedAt)) !== canonicalJson(snapshot)) {
      throw new CommandError('Decrypted archive does not reproduce the redacted snapshot.');
    }
    console.log('Archive decrypted and matched the snapshot in memory. No plaintext archive was written.');
    return;
  }
  if (['rehearse','rehearse-independent','rehearse-stock','rehearse-staff'].includes(command)) {
    if (options.length) throw new CommandError('Rehearse takes only a snapshot name.');
    const { PGlite } = await import('@electric-sql/pglite');
    const db = new PGlite();
    try {
      const migrations = join(root, 'supabase/migrations');
      for (const file of (await readdir(migrations)).filter(file => file.endsWith('.sql')).sort()) {
        await db.exec(await readFile(join(migrations, file), 'utf8'));
      }
      const first = await stageSnapshot(db, snapshot, `${basename(directory)}/workbook.encrypted.json`);
      const second = await stageSnapshot(db, snapshot, `${basename(directory)}/workbook.encrypted.json`);
      if (canonicalJson(first) !== canonicalJson(second)) throw new CommandError('Repeat import changed staging results.');
      if (command === 'rehearse-staff') {
        const passphrase = requiredEnv('MIGRATION_ARCHIVE_PASSPHRASE');
        const one = await importStaffRecords(db, snapshot, archive, passphrase);
        const two = await importStaffRecords(db, snapshot, archive, passphrase);
        if (!two.replay || canonicalJson({ ...one, replay: true }) !== canonicalJson(two)) throw new CommandError('Repeat staff import changed results.');
        console.log(JSON.stringify({ staff: two.staff, hashedPins: two.hashedPins, requirePinReset: two.requirePinReset,
          fieldComparison: two.fieldComparison, credentialVerification: two.credentialVerification,
          plaintextPersisted: false, repeatImport: 'passed', destination: 'local memory only' }));
        return;
      }
      if (command === 'rehearse-stock') {
        await importIndependentRecords(db, snapshot);
        const one = await importStockRecords(db, snapshot);
        const two = await importStockRecords(db, snapshot);
        if (!two.replay || canonicalJson({ ...one, replay: true }) !== canonicalJson(two)) throw new CommandError('Repeat stock import changed results.');
        console.log(JSON.stringify({ materials: two.materials, rolls: two.rolls, openingMovements: two.openingMovements,
          fieldComparison: two.fieldComparison, aggregateComparison: two.aggregateComparison,
          openingBalanceComparison: two.openingBalanceComparison, repeatImport: 'passed', destination: 'local memory only' }));
        return;
      }
      if (command === 'rehearse-independent') {
        const one = await importIndependentRecords(db, snapshot);
        const two = await importIndependentRecords(db, snapshot);
        if (!two.replay || canonicalJson({ ...one, replay: true }) !== canonicalJson(two)) throw new CommandError('Repeat business import changed results.');
        console.log(JSON.stringify({ expenses: two.expenses, estimates: two.estimates,
          fieldComparison: two.fieldComparison, totalComparison: two.totalComparison, repeatImport: 'passed', destination: 'local memory only' }));
        return;
      }
      console.log(JSON.stringify({ ...first, repeatImport: 'passed', destination: 'local memory only' }));
    } finally { await db.close(); }
    return;
  }
  if (options.length !== 2 || options[0] !== '--confirm-project') throw new CommandError('Hosted writes require --confirm-project <project-ref>.');
  if (command === 'import-staff') {
    const passphrase = requiredEnv('MIGRATION_ARCHIVE_PASSPHRASE');
    const result = await withMigrationDatabase(options[1], db => importStaffRecords(db, snapshot, archive, passphrase));
    console.log(JSON.stringify(result));
    return;
  }
  if (command === 'import-stock') {
    const result = await withMigrationDatabase(options[1], db => importStockRecords(db, snapshot));
    console.log(JSON.stringify({ materials: result.materials, rolls: result.rolls, openingMovements: result.openingMovements,
      fieldComparison: result.fieldComparison, aggregateComparison: result.aggregateComparison,
      openingBalanceComparison: result.openingBalanceComparison, replay: result.replay,
      overallMigration: result.overallMigration, runtimeEnabled: result.runtimeEnabled }));
    return;
  }
  if (command === 'import-independent') {
    const result = await withMigrationDatabase(options[1], db => importIndependentRecords(db, snapshot));
    console.log(JSON.stringify({ expenses: result.expenses, estimates: result.estimates, sourceRows: result.sourceRows,
      fieldComparison: result.fieldComparison, totalComparison: result.totalComparison, replay: result.replay,
      overallMigration: result.overallMigration, runtimeEnabled: result.runtimeEnabled }));
    return;
  }
  console.log(JSON.stringify(await withMigrationDatabase(options[1], db => stageSnapshot(db, snapshot, `${basename(directory)}/workbook.encrypted.json`))));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    // Database/Google exceptions can contain credentials and row values. Never print them.
    console.error(error instanceof CommandError ? error.message
      : 'Migration command failed. Check the configuration, file permissions and snapshot format. No credentials or source data were logged.');
    process.exitCode = 1;
  });
}

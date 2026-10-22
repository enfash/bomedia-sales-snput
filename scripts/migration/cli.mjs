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
import { OpeningError, activateOpening, buildOpeningPlan, createOwner, postOpening, summarizeOpening, verifyOpening } from './opening-balances.mjs';
import { HistoryError, buildHistoryPlan, importHistory, summarizeHistory, verifyHistory } from './sales-history.mjs';
import { applyStock, buildStockPlan, diffStock, exportStockSheet, summarizeStock } from './stock-opening.mjs';
import { RehearsalError, rehearsalTargetFromFiles, resetRehearsal } from './rehearsal-reset.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
class CommandError extends Error {}
// The owner's name decisions must be a real file (only its header line when there are none), so a missing file is never mistaken for "no decisions".
const missingDecisions = error => error.code === 'ENOENT'
  ? Promise.reject(new CommandError('2-name-decisions.csv is missing in this folder. Copy it in (a file with only the header line name_in_sheet,same_person_as is fine when there are no decisions).'))
  : Promise.reject(error);

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

// Opening balances: customer debts and the loan, from the owner-approved CSV files in migration-data/<name>/.
// opening-check reads files only. The other three change the database and need --confirm-project. Nothing starts the books except opening-activate.
async function runOpening(command, name, options) {
  const directory = await privateDirectory(name);
  const read = file => readFile(join(directory, file), 'utf8');
  const plan = buildOpeningPlan({ startDate: await read('1-start-date.csv'), owing: await read('3-customers-who-owe.csv'),
    credits: await read('4-customers-paid-in-advance.csv'), loans: await read('6-loans-and-owner-money.csv'),
    names: await read('2-name-decisions.csv').catch(missingDecisions) });
  if (command === 'opening-check') {
    if (options.length) throw new CommandError('opening-check takes only the folder name and changes nothing.');
    console.log(JSON.stringify(summarizeOpening(plan), null, 2));
    return;
  }
  if (options.length !== 2 || options[0] !== '--confirm-project') throw new CommandError('Hosted writes require --confirm-project <project-ref>.');
  const actorId = command === 'opening-post' ? requiredEnv('SUPABASE_ADMIN_STAFF_ID') : undefined; // verify and activate need no staff id
  const result = await withMigrationDatabase(options[1], db => command === 'opening-post' ? postOpening(db, plan, { actorId })
    : command === 'opening-verify' ? verifyOpening(db, plan) : activateOpening(db, plan));
  console.log(JSON.stringify(result, null, 2));
}

// Opening stock: current prices and the owner's physical count, from migration-data/<name>/materials.csv and rolls.csv. The count date is the opening date in
// migration-data/opening-balances/1-start-date.csv. Run stock-apply BEFORE opening-post; the opening command values the counted stock.
async function runStock(command, name, options) {
  if (command === 'stock-sheet') {
    // stock-sheet <new-folder> --confirm-project <ref>: writes materials.csv and rolls.csv from what the database holds. Reads only; never overwrites a folder.
    if (options.length !== 2 || options[0] !== '--confirm-project') throw new CommandError('stock-sheet needs --confirm-project <project-ref>.');
    const sheet = await withMigrationDatabase(options[1], db => exportStockSheet(db));
    const folder = await privateDirectory(name, true);
    await writeFile(join(folder, 'materials.csv'), sheet.materialsCsv, { mode: 0o600, flag: 'wx' });
    await writeFile(join(folder, 'rolls.csv'), sheet.rollsCsv, { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ folder: relative(root, folder), materials: sheet.materials, rollsListed: sheet.rolls, rollsWithoutSheetId: sheet.withoutId,
      next: 'Type the feet really left on each roll in remaining_ft, delete rows for rolls that are gone, add rows for new rolls, then run stock-check and stock-diff.' }, null, 2));
    return;
  }
  const directory = await privateDirectory(name);
  const read = file => readFile(join(directory, file), 'utf8');
  // A preview (check or diff) may use --date <YYYY-MM-DD> before the opening date is decided. The real apply always uses the opening date in 1-start-date.csv.
  const startAt = options.indexOf('--start-from');
  const startFolder = startAt >= 0 ? options[startAt + 1] : 'opening-balances'; // the folder that holds 1-start-date.csv (a rehearsal uses its own)
  const dateAt = options.indexOf('--date');
  if (dateAt >= 0 && command === 'stock-apply') throw new CommandError('stock-apply uses the opening date from 1-start-date.csv; --date is only for previews.');
  const startRows = (await readFile(join(await privateDirectory(startFolder), '1-start-date.csv'), 'utf8')).split(/\r?\n/).map(l => l.split(','));
  const countDate = dateAt >= 0 ? options[dateAt + 1] : startRows.find(r => r[0]?.trim() === 'opening_date')?.[1]?.trim();
  if (!countDate) throw new CommandError('1-start-date.csv in opening-balances needs opening_date, which is also the stock count date.');
  const plan = buildStockPlan({ materials: await read('materials.csv'), rolls: await read('rolls.csv') }, countDate);
  const allowUncounted = options.includes('--allow-uncounted');
  const zeroUnlisted = options.includes('--zero-unlisted');
  const valueOptions = ['--date', '--start-from'];
  const rest = options.filter((o, i) => o !== '--allow-uncounted' && o !== '--zero-unlisted' && !valueOptions.includes(o) && !(i > 0 && valueOptions.includes(options[i - 1])));
  if (command === 'stock-check') {
    if (rest.length) throw new CommandError('stock-check takes only the folder name and does not open the database.');
    console.log(JSON.stringify({ countDate: plan.countDate, materials: plan.materials.length, rolls: plan.rolls.length, fileSha256: plan.digest }, null, 2));
    return;
  }
  if (rest.length !== 2 || rest[0] !== '--confirm-project') throw new CommandError('This command needs --confirm-project <project-ref>.');
  const actorId = command === 'stock-apply' ? requiredEnv('SUPABASE_ADMIN_STAFF_ID') : undefined; // the read-only diff needs no staff id
  const result = await withMigrationDatabase(rest[1], async db => {
    if (command === 'stock-diff') { const diff = await diffStock(db, plan, { allowUncounted, zeroUnlisted }); return summarizeStock(plan, diff); }
    return applyStock(db, plan, { actorId, allowUncounted, zeroUnlisted });
  });
  console.log(JSON.stringify(result, null, 2));
}

// Customer history: the Sheet's Sales tab as read-only history, from migration-data/<name>/Sales.csv (+ 2-name-decisions.csv and the required ignore-payments.csv; headers only when the owner approved no exceptions).
// history-check reads files only. history-import and history-verify need --confirm-project. Run history-import AFTER opening-post and BEFORE opening-activate.
async function runHistory(command, name, options) {
  const directory = await privateDirectory(name);
  const read = (file, optional) => readFile(join(directory, file), 'utf8').catch(error => optional && error.code === 'ENOENT' ? '' : Promise.reject(error));
  const plan = buildHistoryPlan({ sales: await read('Sales.csv'), names: await read('2-name-decisions.csv'), ignore: await read('ignore-payments.csv') });
  if (command === 'history-check') {
    if (options.length) throw new CommandError('history-check takes only the folder name and changes nothing.');
    console.log(JSON.stringify(summarizeHistory(plan), null, 2));
    return;
  }
  if (options.length !== 2 || options[0] !== '--confirm-project') throw new CommandError('Hosted writes require --confirm-project <project-ref>.');
  console.log(JSON.stringify(await withMigrationDatabase(options[1], db => command === 'history-import' ? importHistory(db, plan) : verifyHistory(db, plan)), null, 2));
}

async function main() {
  const [command, name, ...options] = process.argv.slice(2);
  if (command === 'help' || !command) {
    console.log('Commands: apply --confirm-project <ref> | export <name> | inspect <name> | plan <name> | reconcile <name> | review <name> | verify-archive <name> | rehearse <name> | rehearse-independent <name> | rehearse-stock <name> | rehearse-staff <name> | stage <name> --confirm-project <ref> | import-independent <name> --confirm-project <ref> | import-stock <name> --confirm-project <ref> | import-staff <name> --confirm-project <ref> | opening-check <name> | opening-post|opening-verify|opening-activate <name> --confirm-project <ref> | rehearsal-reset --confirm-project <rehearsal-ref> | owner-create --confirm-project <ref> | history-check <name> | history-import|history-verify <name> --confirm-project <ref> | stock-sheet <new-folder> --confirm-project <ref> | stock-check <name> | stock-diff|stock-apply <name> --confirm-project <ref> [--allow-uncounted | --zero-unlisted] [--start-from <folder>]');
    return;
  }
  if (!['apply', 'export', 'inspect', 'plan', 'reconcile', 'review', 'verify-archive', 'rehearse', 'rehearse-independent', 'rehearse-stock', 'rehearse-staff', 'stage', 'import-independent', 'import-stock', 'import-staff', 'opening-check', 'opening-post', 'opening-verify', 'opening-activate', 'stock-check', 'stock-sheet', 'stock-diff', 'stock-apply', 'owner-create', 'rehearsal-reset', 'history-check', 'history-import', 'history-verify'].includes(command)) throw new CommandError('Unknown migration command. Run with help.');
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
  if (command === 'rehearsal-reset') {
    // rehearsal-reset --confirm-project <ref>: wipes ONLY the project named in .env.rehearsal.local; refuses the live project and the old sandbox.
    const args = process.argv.slice(3);
    if (args.length !== 2 || args[0] !== '--confirm-project') throw new CommandError('rehearsal-reset needs --confirm-project <rehearsal-project-ref>.');
    const { parseEnv } = await import('node:util');
    try { await rehearsalTargetFromFiles(args[1], async file => parseEnv(await readFile(join(root, file), 'utf8'))); }
    catch (error) { throw error instanceof RehearsalError ? new CommandError(error.message) : error; }
    console.log(JSON.stringify(await withMigrationDatabase(args[1], db => resetRehearsal(db)), null, 2));
    return;
  }
  if (command === 'owner-create') {
    // owner-create --confirm-project <ref>  (the folder name slot holds the flag, so read it from the whole argument list)
    const args = process.argv.slice(3);
    if (args.length !== 2 || args[0] !== '--confirm-project') throw new CommandError('owner-create needs --confirm-project <project-ref>.');
    console.log(JSON.stringify(await withMigrationDatabase(args[1], db => createOwner(db)), null, 2));
    return;
  }
  if (command.startsWith('stock-')) {
    try { await runStock(command, name, options); } catch (error) { throw error instanceof OpeningError ? new CommandError(error.message) : error; }
    return;
  }
  if (command.startsWith('history-')) {
    try { await runHistory(command, name, options); } catch (error) { throw error instanceof HistoryError || error instanceof OpeningError ? new CommandError(error.message) : error; }
    return;
  }
  if (command.startsWith('opening-')) {
    try { await runOpening(command, name, options); } catch (error) { throw error instanceof OpeningError ? new CommandError(error.message) : error; }
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
    // Opt-in aid for rehearsals: the error's type and code only (never its message, which can hold row values or credentials).
    if (process.env.BOMEDIA_MIGRATION_DEBUG === '1' && !(error instanceof CommandError)) console.error(`[debug] ${error?.name ?? 'Error'} ${error?.code ?? ''}`.trim());
    process.exitCode = 1;
  });
}

import { buildMigrationPlan, sourceCandidateId } from './plan.mjs';
import { canonicalJson, snapshotDigest } from './snapshot.mjs';

const VERSION = 'expenses-estimates-v1';
function instant(value) {
  if (value === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    || !Number.isFinite(Date.parse(value))) throw new Error('Ambiguous historical timestamp');
  // Reject dates which Date.parse would silently normalize (e.g. February 30).
  const day = value.slice(0, 10);
  if (new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) throw new Error('Invalid historical date');
  return new Date(value).toISOString();
}

export function prepareIndependentImport(snapshot) {
  const plan = buildMigrationPlan(snapshot);
  for (const title of ['Expenses', 'Estimates']) if (plan.summary.missingAppTabs.includes(title)) throw new Error('Required independent-import tab missing');
  const candidates = plan.rows.filter(row => ['Expenses', 'Estimates'].includes(row.sheet));
  if (candidates.some(row => row.blockers.length)) throw new Error('Independent-import rows still have mapping blockers');
  const records = candidates.map(row => {
    const f = row.fields;
    if (row.sheet === 'Expenses') {
      if (f.receipt_url) throw new Error('Receipt-link import requires a reviewed mapping before promotion');
      return { source: { sheetId: row.sheetId, rowNumber: row.rowNumber }, table: 'expenses', data: {
        id: row.id, legacy_expense_id: f.legacy_expense_id, amount_kobo: f.amount_kobo,
        business_date: f.business_date, category: f.category, description: f.description, paid_to: f.paid_to,
        payment_method: f.payment_method, status: f.status, logged_by_snapshot: f.logged_by_snapshot,
        paid_by_snapshot: f.paid_by_snapshot, paid_at: instant(f.paid_at_raw), occurred_at: instant(f.occurred_at_raw),
      } };
    }
    return { source: { sheetId: row.sheetId, rowNumber: row.rowNumber }, table: 'estimates', data: {
      id: row.id, legacy_quote_id: f.legacy_quote_id, client_name_snapshot: f.client_name_snapshot,
      business_date: f.business_date, cart_data: f.cart_data,
    } };
  });
  return { digest: plan.snapshotSha256, records };
}

// This preparatory import is allowed only before any runtime transactions.
// Customer/staff links remain null; their original display names are preserved.
export async function importIndependentRecords(db, snapshot) {
  const { digest, records } = prepareIndependentImport(snapshot);
  if (digest !== snapshotDigest(snapshot)) throw new Error('Snapshot changed while planning');
  const bySource = new Map(snapshot.sheets.flatMap(sheet => sheet.rows.map(row => [`${sheet.sheetId}:${row.rowNumber}`, row.cells])));
  return db.transaction(async tx => {
    await tx.query("select pg_advisory_xact_lock(hashtextextended('bomedia:business-import', 0))");
    // Exclude all runtime writes while checking the pre-cutover guard and importing.
    await tx.query('lock table bomedia.idempotency_requests in exclusive mode');
    if ((await tx.query('select count(*)::integer as count from bomedia.idempotency_requests')).rows[0].count) throw new Error('Runtime writes exist; rehearsal import is disabled');
    const snapshots = (await tx.query('select id from migration.snapshots where sha256 = $1', [digest])).rows;
    if (snapshots.length !== 1) throw new Error('Verified snapshot must be staged first');
    const snapshotId = snapshots[0].id;
    // Avoid mixing historical snapshots or overwriting any existing business data.
    const foreign = (await tx.query(`select count(*)::integer as count from (
      select e.source_row_id from bomedia.expenses e
      union all select q.source_row_id from bomedia.estimates q
    ) b left join migration.source_rows r on r.id=b.source_row_id
      left join migration.source_sheets s on s.id=r.sheet_id
      where s.snapshot_id is distinct from $1::uuid`, [snapshotId])).rows[0].count;
    if (foreign) throw new Error('Business rows belong to another source or snapshot; refusing import');
    await tx.query('lock table bomedia.expenses, bomedia.estimates in exclusive mode');
    const sourceRows = (await tx.query(`select r.id, s.sheet_id::text as source_sheet_id, r.row_number, r.cells
      from migration.source_rows r join migration.source_sheets s on s.id=r.sheet_id
      where s.snapshot_id=$1 and s.title in ('Expenses','Estimates') order by s.position,r.row_number`, [snapshotId])).rows;
    const sourceIds = new Map();
    for (const row of sourceRows) {
      const key = `${row.source_sheet_id}:${row.row_number}`;
      if (!bySource.has(key) || canonicalJson(row.cells) !== canonicalJson(bySource.get(key))) throw new Error('Hosted source differs from verified snapshot');
      sourceIds.set(key, row.id);
    }
    const expectedSourceCount = snapshot.sheets.filter(s => ['Expenses','Estimates'].includes(s.title)).reduce((n, s) => n + s.rows.length, 0);
    if (sourceRows.length !== expectedSourceCount) throw new Error('Hosted independent-import source is incomplete');
    const expenses = [], estimates = [];
    for (const record of records) {
      const sourceRowId = sourceIds.get(`${record.source.sheetId}:${record.source.rowNumber}`);
      if (!sourceRowId) throw new Error('Missing source lineage');
      const data = { ...record.data, source_row_id: sourceRowId };
      (record.table === 'expenses' ? expenses : estimates).push(data);
    }
    // JSON batches avoid one network round trip per field/row. The driver's
    // JSON-text adapter is shared with staging and covered by hosted checks.
    if (expenses.length) await tx.query(`insert into bomedia.expenses
      (id,legacy_expense_id,amount_kobo,business_date,category,description,paid_to,payment_method,status,
       logged_by_snapshot,paid_by_snapshot,paid_at,occurred_at,source_row_id)
      select id,legacy_expense_id,amount_kobo,business_date,category,description,paid_to,payment_method,status,
       logged_by_snapshot,paid_by_snapshot,paid_at,occurred_at,source_row_id
      from jsonb_to_recordset($1::jsonb) as x(id uuid,legacy_expense_id text,amount_kobo bigint,business_date date,
       category text,description text,paid_to text,payment_method text,status text,logged_by_snapshot text,
       paid_by_snapshot text,paid_at timestamptz,occurred_at timestamptz,source_row_id uuid)
      on conflict (source_row_id) do nothing`, [JSON.stringify(expenses)]);
    if (estimates.length) await tx.query(`insert into bomedia.estimates
      (id,legacy_quote_id,client_name_snapshot,business_date,cart_data,source_row_id)
      select id,legacy_quote_id,client_name_snapshot,business_date,cart_data,source_row_id
      from jsonb_to_recordset($1::jsonb) as x(id uuid,legacy_quote_id text,client_name_snapshot text,
       business_date date,cart_data jsonb,source_row_id uuid) on conflict (source_row_id) do nothing`, [JSON.stringify(estimates)]);
    const storedExpenses = (await tx.query(`select id::text,legacy_expense_id,amount_kobo::text,business_date::text,
      category,description,paid_to,payment_method,status,logged_by_snapshot,paid_by_snapshot,
      to_char(paid_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as paid_at,
      to_char(occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as occurred_at,source_row_id::text
      from bomedia.expenses`)).rows;
    const storedEstimates = (await tx.query(`select id::text,legacy_quote_id,client_name_snapshot,business_date::text,
      cart_data,source_row_id::text from bomedia.estimates`)).rows;
    const equalRows = (actual, expected) => canonicalJson([...actual].sort((a,b) => a.id.localeCompare(b.id)))
      === canonicalJson([...expected].sort((a,b) => a.id.localeCompare(b.id)));
    if (!equalRows(storedExpenses, expenses) || !equalRows(storedEstimates, estimates)) throw new Error('Imported fields differ or unexpected business rows exist');
    const expectedTotal = expenses.reduce((n, r) => n + BigInt(r.amount_kobo), 0n).toString();
    const actualTotal = (await tx.query('select coalesce(sum(amount_kobo),0)::text as total from bomedia.expenses')).rows[0].total;
    if (expectedTotal !== actualTotal) throw new Error('Imported expense total differs');
    const report = { version: VERSION, snapshotSha256: digest, expenses: expenses.length, estimates: estimates.length,
      sourceRows: records.length, expenseTotalKobo: actualTotal, fieldComparison: 'passed', totalComparison: 'passed',
      overallMigration: 'reconciling', runtimeEnabled: false };
    const oldRuns = (await tx.query('select id,reconciliation from migration.import_runs where snapshot_id=$1 and importer_version=$2', [snapshotId, VERSION])).rows;
    if (oldRuns.length > 1 || (oldRuns.length && canonicalJson(oldRuns[0].reconciliation) !== canonicalJson(report))) throw new Error('Import evidence changed');
    if (!oldRuns.length) await tx.query(`insert into migration.import_runs(id,snapshot_id,importer_version,status,reconciliation,finished_at)
      values ($1,$2,$3,'reconciling',$4::jsonb,now())`, [sourceCandidateId(digest, VERSION, 'run'), snapshotId, VERSION, JSON.stringify(report)]);
    // Keep quarantine/reviewer dispositions and notes intact. The scoped run
    // plus target source_row_id is the import evidence, not a blanket resolution.
    return { ...report, replay: oldRuns.length > 0 };
  });
}

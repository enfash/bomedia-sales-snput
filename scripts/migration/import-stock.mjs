import { buildMigrationPlan, businessDate, sourceCandidateId } from './plan.mjs';
import { canonicalJson, cellValue, moneyToKobo } from './snapshot.mjs';

const VERSION = 'materials-inventory-v1';
const SCALE = 1000000n;
function micros(value) {
  const text = String(value ?? '').trim();
  if (!/^\d{1,12}(?:\.\d{1,6})?$/.test(text)) throw new Error('Stock measurement/rate needs an exact nonnegative decimal');
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(6, '0'));
}
const fixed = value => `${value / SCALE}.${String(value % SCALE).padStart(6, '0')}`;
const decimal = value => fixed(micros(value));
const sum = (rows, field) => fixed(rows.reduce((n, row) => n + micros(row[field]), 0n));
const same = (a, b) => canonicalJson(a) === canonicalJson(b);
const sorted = rows => [...rows].sort((a, b) => a.id.localeCompare(b.id));

export function prepareStockImport(snapshot) {
  const plan = buildMigrationPlan(snapshot), digest = plan.snapshotSha256;
  const selected = plan.rows.filter(row => ['Materials','Inventory'].includes(row.sheet));
  if (plan.summary.missingAppTabs.some(title => ['Materials','Inventory'].includes(title))
    || selected.some(row => row.blockers.length)) throw new Error('Stock mapping is incomplete or blocked');
  const tables = new Map(snapshot.sheets.map(sheet => {
    const headers = sheet.rows.find(row => row.rowNumber === 1)?.cells.map(cellValue) ?? [];
    return [sheet.sheetId, new Map(sheet.rows.map(row => [row.rowNumber, Object.fromEntries(headers.map((h, i) => [h, cellValue(row.cells[i])]))]))];
  }));
  const materials = [], rolls = [], movements = [], sourceFormulaErrors = [];
  const openingDate = businessDate(snapshot.capturedAt, snapshot.timeZone);
  for (const row of selected) {
    const raw = tables.get(row.sheetId).get(row.rowNumber), f = row.fields;
    const source = { sheetId: row.sheetId, rowNumber: row.rowNumber };
    for (const warning of row.warnings.filter(w => w.startsWith('source_formula_error:'))) {
      sourceFormulaErrors.push({ ...source, warning });
    }
    if (row.sheet === 'Materials') {
      materials.push({ source, data: { id: row.id, legacy_material_id: f.legacy_material_id, name: f.name,
        category: null, width_ft: decimal(raw['Width (ft)']), selling_price_per_sqft_kobo: f.selling_price_per_sqft_kobo,
        low_stock_threshold_ft: decimal(raw['Low Stock Threshold (ft)']), notes: f.notes,
        active_roll_id: row.candidateActiveRollId ?? null }, recorded: {
        remaining: decimal(raw['Total Remaining (ft)']), capacity: decimal(raw['Total Capacity (ft)']),
        count: String(raw['Roll Count']),
      } });
    } else {
      const exactCost = fixed(micros(raw['Cost per Sqft']) * 100n);
      const data = { id: row.id, material_id: row.candidateMaterialId, legacy_roll_id: f.legacy_roll_id,
        item_name: f.item_name, category: raw.Category === null ? null : String(raw.Category),
        width_ft: decimal(raw['Width (ft)']), raw_length_ft: decimal(raw['Raw Length (ft)']),
        total_length_ft: decimal(raw['Total Length (ft)']), remaining_length_ft: decimal(raw['Remaining Length (ft)']),
        waste_length_ft: decimal(raw['Waste Logged (ft)']), original_unit: String(raw.Unit ?? ''),
        purchase_cost_kobo: f.purchase_cost_kobo, selling_price_kobo: f.selling_price_kobo,
        cost_per_sqft_kobo: moneyToKobo(raw['Cost per Sqft']), cost_per_sqft_kobo_exact: exactCost,
        waste_factor: decimal(raw['Waste Factor']), low_stock_threshold_ft: decimal(raw['Low Stock Threshold (ft)']),
        status: String(raw.Status ?? ''), business_date: f.business_date };
      if (!data.material_id || !data.status.trim() || !data.original_unit.trim()) throw new Error('Missing stock relationship, status or original unit');
      if (micros(data.remaining_length_ft) > micros(data.total_length_ft)) throw new Error('Remaining stock exceeds capacity');
      rolls.push({ source, data });
      // Opening CURRENT stock only. Historical sales must not deduct it again.
      // Zero-balance rolls stay present without a prohibited zero movement.
      if (micros(data.remaining_length_ft) > 0n) movements.push({ source, data: {
        id: sourceCandidateId(digest, row.sheetId, `${row.rowNumber}:opening`), roll_id: row.id,
        job_id: null, expense_id: null, created_by: null, kind: 'opening', length_delta_ft: data.remaining_length_ft,
        reason: `Opening balance from verified snapshot ${digest}`, business_date: openingDate,
      } });
    }
  }
  const aggregates = materials.map(material => {
    const children = rolls.filter(roll => roll.data.material_id === material.data.id).map(roll => roll.data);
    const remaining = sum(children, 'remaining_length_ft'), capacity = sum(children, 'total_length_ft');
    if (remaining !== material.recorded.remaining || capacity !== material.recorded.capacity
      || !/^\d+$/.test(material.recorded.count) || BigInt(material.recorded.count) !== BigInt(children.length)) {
      throw new Error('Material summary differs from its source rolls');
    }
    const active = children.find(roll => roll.id === material.data.active_roll_id);
    if ((children.length && !active) || (active && active.selling_price_kobo !== material.data.selling_price_per_sqft_kobo)) {
      throw new Error('Active roll or price does not match material');
    }
    return { material_id: material.data.id, rolls: children.length, remaining_length_ft: remaining,
      total_length_ft: capacity, purchase_cost_kobo: children.reduce((n, r) => n + BigInt(r.purchase_cost_kobo), 0n).toString() };
  });
  return { digest, materials, rolls, movements, aggregates, sourceFormulaErrors };
}

export async function importStockRecords(db, snapshot) {
  const prepared = prepareStockImport(snapshot);
  const { digest, materials, rolls, movements, aggregates, sourceFormulaErrors } = prepared;
  const expectedCells = new Map(snapshot.sheets.flatMap(s => s.rows.map(r => [`${s.sheetId}:${r.rowNumber}`, r.cells])));
  return db.transaction(async tx => {
    await tx.query("select pg_advisory_xact_lock(hashtextextended('bomedia:business-import',0))");
    await tx.query('lock table bomedia.idempotency_requests in exclusive mode');
    if ((await tx.query('select count(*)::integer as n from bomedia.idempotency_requests')).rows[0].n) throw new Error('Runtime writes exist; stock rehearsal import disabled');
    await tx.query('lock table bomedia.materials,bomedia.inventory_rolls,bomedia.inventory_movements in exclusive mode');
    const snapshots = (await tx.query('select id from migration.snapshots where sha256=$1',[digest])).rows;
    if (snapshots.length !== 1) throw new Error('Verified snapshot must be staged first');
    const snapshotId = snapshots[0].id;
    const existing = (await tx.query(`select count(*)::integer as n from (
      select source_row_id from bomedia.materials union all select source_row_id from bomedia.inventory_rolls
      union all select source_row_id from bomedia.inventory_movements
    ) b left join migration.source_rows r on r.id=b.source_row_id left join migration.source_sheets s on s.id=r.sheet_id
      where s.snapshot_id is distinct from $1::uuid`, [snapshotId])).rows[0].n;
    if (existing) throw new Error('Stock contains another source or snapshot');
    const staged = (await tx.query(`select r.id,s.sheet_id::text as source_sheet_id,r.row_number,r.cells
      from migration.source_rows r join migration.source_sheets s on s.id=r.sheet_id
      where s.snapshot_id=$1 and s.title in ('Materials','Inventory')`, [snapshotId])).rows;
    const ids = new Map();
    for (const row of staged) {
      const key = `${row.source_sheet_id}:${row.row_number}`;
      if (!expectedCells.has(key) || !same(row.cells, expectedCells.get(key))) throw new Error('Hosted stock source differs');
      ids.set(key, row.id);
    }
    if (staged.length !== snapshot.sheets.filter(s => ['Materials','Inventory'].includes(s.title)).reduce((n,s) => n+s.rows.length,0)) throw new Error('Hosted stock source incomplete');
    const bind = entries => entries.map(({ source, data }) => {
      const id = ids.get(`${source.sheetId}:${source.rowNumber}`);
      if (!id) throw new Error('Missing stock lineage');
      return { ...data, source_row_id: id };
    });
    const materialRows = bind(materials), rollRows = bind(rolls), movementRows = bind(movements);
    // Break the material/active-roll FK cycle only for newly inserted materials.
    const inserted = (await tx.query(`insert into bomedia.materials
      (id,legacy_material_id,name,category,width_ft,selling_price_per_sqft_kobo,low_stock_threshold_ft,notes,source_row_id)
      select id,legacy_material_id,name,category,width_ft,selling_price_per_sqft_kobo,low_stock_threshold_ft,notes,source_row_id
      from jsonb_to_recordset($1::jsonb) as x(id uuid,legacy_material_id text,name text,category text,width_ft numeric,
        selling_price_per_sqft_kobo bigint,low_stock_threshold_ft numeric,notes text,source_row_id uuid)
      on conflict(source_row_id) do nothing returning id::text`,[JSON.stringify(materialRows)])).rows.map(r => r.id);
    await tx.query(`insert into bomedia.inventory_rolls
      (id,material_id,legacy_roll_id,item_name,category,width_ft,raw_length_ft,total_length_ft,remaining_length_ft,
       waste_length_ft,original_unit,purchase_cost_kobo,selling_price_kobo,cost_per_sqft_kobo,cost_per_sqft_kobo_exact,
       waste_factor,low_stock_threshold_ft,status,business_date,source_row_id)
      select id,material_id,legacy_roll_id,item_name,category,width_ft,raw_length_ft,total_length_ft,remaining_length_ft,
       waste_length_ft,original_unit,purchase_cost_kobo,selling_price_kobo,cost_per_sqft_kobo,cost_per_sqft_kobo_exact,
       waste_factor,low_stock_threshold_ft,status,business_date,source_row_id
      from jsonb_to_recordset($1::jsonb) as x(id uuid,material_id uuid,legacy_roll_id text,item_name text,category text,
       width_ft numeric,raw_length_ft numeric,total_length_ft numeric,remaining_length_ft numeric,waste_length_ft numeric,
       original_unit text,purchase_cost_kobo bigint,selling_price_kobo bigint,cost_per_sqft_kobo bigint,cost_per_sqft_kobo_exact numeric,
       waste_factor numeric,low_stock_threshold_ft numeric,status text,business_date date,source_row_id uuid)
      on conflict(source_row_id) do nothing`,[JSON.stringify(rollRows)]);
    const newMaterials = materialRows.filter(r => inserted.includes(r.id));
    if (newMaterials.length) await tx.query(`update bomedia.materials m set active_roll_id=x.active_roll_id
      from jsonb_to_recordset($1::jsonb) as x(id uuid,active_roll_id uuid) where m.id=x.id`,[JSON.stringify(newMaterials)]);
    await tx.query(`insert into bomedia.inventory_movements
      (id,roll_id,job_id,expense_id,created_by,kind,length_delta_ft,reason,business_date,source_row_id)
      select id,roll_id,job_id,expense_id,created_by,kind,length_delta_ft,reason,business_date,source_row_id
      from jsonb_to_recordset($1::jsonb) as x(id uuid,roll_id uuid,job_id uuid,expense_id uuid,created_by uuid,kind text,
       length_delta_ft numeric,reason text,business_date date,source_row_id uuid) on conflict(id) do nothing`,[JSON.stringify(movementRows)]);
    // Compare all imported fields as strings/JSON; never coerce money to JS floats.
    const actualMaterials = (await tx.query(`select id::text,legacy_material_id,name,category,width_ft::text,
      selling_price_per_sqft_kobo::text,low_stock_threshold_ft::text,notes,active_roll_id::text,source_row_id::text from bomedia.materials`)).rows;
    const actualRolls = (await tx.query(`select id::text,material_id::text,legacy_roll_id,item_name,category,width_ft::text,
      raw_length_ft::text,total_length_ft::text,remaining_length_ft::text,waste_length_ft::text,original_unit,
      purchase_cost_kobo::text,selling_price_kobo::text,cost_per_sqft_kobo::text,cost_per_sqft_kobo_exact::text,waste_factor::text,
      low_stock_threshold_ft::text,status,business_date::text,source_row_id::text from bomedia.inventory_rolls`)).rows;
    const actualMoves = (await tx.query(`select id::text,roll_id::text,job_id::text,expense_id::text,created_by::text,kind,
      length_delta_ft::text,reason,business_date::text,source_row_id::text from bomedia.inventory_movements`)).rows;
    if (!same(sorted(actualMaterials),sorted(materialRows)) || !same(sorted(actualRolls),sorted(rollRows))
      || !same(sorted(actualMoves),sorted(movementRows))) throw new Error('Stored stock fields differ or unexpected records exist');
    const movementCheck = (await tx.query(`select count(*)::integer as n from bomedia.inventory_rolls r
      where r.remaining_length_ft <> coalesce((select sum(m.length_delta_ft) from bomedia.inventory_movements m where m.roll_id=r.id),0)`)).rows[0].n;
    if (movementCheck) throw new Error('Opening movements differ from remaining stock');
    const actualAggregates = (await tx.query(`select material_id::text,count(*)::integer as rolls,
      sum(remaining_length_ft)::numeric(18,6)::text as remaining_length_ft,
      sum(total_length_ft)::numeric(18,6)::text as total_length_ft,sum(purchase_cost_kobo)::text as purchase_cost_kobo
      from bomedia.inventory_rolls group by material_id order by material_id`)).rows;
    const nonempty = aggregates.filter(a => a.rolls).sort((a,b) => a.material_id.localeCompare(b.material_id));
    if (!same(actualAggregates,nonempty)) throw new Error('Imported per-material stock/cost aggregates differ');
    const report = { version: VERSION, snapshotSha256: digest, materials: materialRows.length, rolls: rollRows.length,
      openingMovements: movementRows.length, sourceRows: materialRows.length + rollRows.length,
      fieldComparison: 'passed', aggregateComparison: 'passed', openingBalanceComparison: 'passed',
      sourceFormulaErrors, aggregates, overallMigration: 'reconciling', runtimeEnabled: false };
    const prior = (await tx.query('select reconciliation from migration.import_runs where snapshot_id=$1 and importer_version=$2',[snapshotId,VERSION])).rows;
    if (prior.length>1 || (prior.length && !same(prior[0].reconciliation,report))) throw new Error('Stock import evidence changed');
    if (!prior.length) await tx.query(`insert into migration.import_runs(id,snapshot_id,importer_version,status,reconciliation,finished_at)
      values($1,$2,$3,'reconciling',$4::jsonb,now())`,[sourceCandidateId(digest,VERSION,'run'),snapshotId,VERSION,JSON.stringify(report)]);
    return { ...report, replay: prior.length>0 };
  });
}

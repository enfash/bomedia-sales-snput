import { createHash } from 'node:crypto';
import { OpeningError, nairaToKobo, parseCsv } from './opening-balances.mjs';
import { cutoverTransaction } from './cutover-shared.mjs';
import { readOpeningStock, readStockApproval } from './opening-stock-evidence.mjs';

// Opening stock for the cutover: current prices and the owner's physical count, applied BEFORE any opening entry is posted.
// materials.csv: material_id,name,width_ft,selling_price_naira_per_sqft,low_stock_threshold_ft   (one row per material in the Sheet)
// rolls.csv:     roll_id,material_id,item_name,width_ft,raw_length_ft,total_length_ft,remaining_ft,purchase_cost_naira,selling_price_naira,date_added,note
//                (remaining_ft is the physical count; one row per roll that exists, including rolls now empty)
// Existing rolls change ONLY in remaining length (a dated movement, no journal). Anything else that differs blocks the run for the owner to decide.
// The opening command later values the counted stock (debit Inventory, credit Owner capital); the app cannot sell material without that value.

const sha = text => createHash('sha256').update(text).digest('hex');

const decimal6 = (value, label) => {
  const text = String(value ?? '').replace(/[\s,]/g, '');
  const match = /^(\d{1,12})(?:\.(\d{1,6}))?$/.exec(text);
  if (!match) throw new OpeningError(`${label} "${value}" must be a number with at most six decimals.`);
  return `${BigInt(match[1])}.${(match[2] ?? '').padEnd(6, '0')}`;
};
const micros = text => BigInt(String(text).replace('.', ''));
const isoDate = (value, label) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw new OpeningError(`${label} "${value}" must be a real date written YYYY-MM-DD.`);
  return value;
};

/** Reads the two files into a plan. Throws on anything unclear. */
export function buildStockPlan(files, countDate) {
  const problems = [];
  const date = isoDate(countDate, 'count date');
  const materials = [], rolls = [], seenMaterial = new Set(), seenRoll = new Set();
  parseCsv(files.materials).forEach((row, index) => {
    const line = index + 2, id = (row.material_id ?? '').trim();
    if (!id && !Object.values(row).some(v => v)) return;
    try {
      if (!id) throw new OpeningError('material_id is empty.');
      if (seenMaterial.has(id)) throw new OpeningError(`${id} appears twice.`);
      seenMaterial.add(id);
      const width = decimal6(row.width_ft, 'width_ft');
      if (micros(width) <= 0n) throw new OpeningError('width_ft must be more than zero.');
      materials.push({ id, name: (row.name ?? '').trim(), widthFt: width, priceKobo: nairaToKobo(row.selling_price_naira_per_sqft, 'selling_price_naira_per_sqft'),
        thresholdFt: decimal6(row.low_stock_threshold_ft, 'low_stock_threshold_ft') });
      if (!materials.at(-1).name) throw new OpeningError('name is empty.');
    } catch (error) { problems.push(`materials.csv line ${line} (${id || 'no id'}): ${error.message}`); }
  });
  parseCsv(files.rolls).forEach((row, index) => {
    const line = index + 2, id = (row.roll_id ?? '').trim();
    if (!id && !Object.values(row).some(v => v)) return;
    try {
      if (!id) throw new OpeningError('roll_id is empty.');
      if (seenRoll.has(id)) throw new OpeningError(`${id} appears twice.`);
      seenRoll.add(id);
      const materialId = (row.material_id ?? '').trim();
      if (!materialId) throw new OpeningError('material_id is empty.');
      const roll = { id, materialId, itemName: (row.item_name ?? '').trim(), widthFt: decimal6(row.width_ft, 'width_ft'), rawFt: decimal6(row.raw_length_ft, 'raw_length_ft'),
        totalFt: decimal6(row.total_length_ft, 'total_length_ft'), remainingFt: decimal6(row.remaining_ft, 'remaining_ft'),
        costKobo: nairaToKobo(row.purchase_cost_naira, 'purchase_cost_naira'), priceKobo: row.selling_price_naira ? nairaToKobo(row.selling_price_naira, 'selling_price_naira') : null,
        dateAdded: row.date_added ? isoDate(row.date_added.trim(), 'date_added') : null, note: (row.note ?? '').trim() };
      if (!roll.itemName) throw new OpeningError('item_name is empty.');
      if (micros(roll.remainingFt) > micros(roll.totalFt)) throw new OpeningError('remaining_ft is more than total_length_ft.');
      if (micros(roll.totalFt) <= 0n) throw new OpeningError('total_length_ft must be more than zero.');
      if (BigInt(roll.costKobo) <= 0n) throw new OpeningError('purchase_cost_naira must be more than zero, or stock cannot be valued.');
      rolls.push(roll);
    } catch (error) { problems.push(`rolls.csv line ${line} (${id || 'no id'}): ${error.message}`); }
  });
  for (const roll of rolls) if (!seenMaterial.has(roll.materialId)) problems.push(`Roll ${roll.id}: material ${roll.materialId} is not in materials.csv.`);
  if (problems.length) {
    const shown = problems.slice(0, 25);
    throw new OpeningError(`The stock files cannot be used yet (${problems.length} problem${problems.length === 1 ? '' : 's'}):\n- ${shown.join('\n- ')}${problems.length > shown.length ? `\n- ...and ${problems.length - shown.length} more` : ''}`);
  }
  materials.sort((a, b) => a.id.localeCompare(b.id)); rolls.sort((a, b) => a.id.localeCompare(b.id));
  return { countDate: date, materials, rolls, digest: sha(JSON.stringify({ date, materials, rolls })) };
}

const csvCell = value => { const text = String(value ?? ''); return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; };
const csvLine = cells => cells.map(csvCell).join(',') + '\n';
const trimNumber = text => String(text ?? '').replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
const naira = koboText => koboText == null ? '' : `${BigInt(koboText) / 100n}.${(BigInt(koboText) % 100n).toString().padStart(2, '0')}`;

/**
 * Writes the two stock files from what the database holds today, so the owner only has to type the feet really left on each roll
 * (remaining_ft), delete rows for rolls that are gone and add rows for new ones. Reads only. Rolls with nothing left are not listed.
 * Rolls the app created itself have no Sheet roll ID, so they cannot be listed in rolls.csv; they are returned in `withoutId` for the owner to see.
 */
export async function exportStockSheet(db) {
  const q = async (text, params = []) => (await db.query(text, params)).rows;
  const materials = await q(`select legacy_material_id, name, width_ft::text as width_ft, selling_price_per_sqft_kobo::text as price, low_stock_threshold_ft::text as threshold
    from bomedia.materials where legacy_material_id is not null order by legacy_material_id`);
  const rolls = await q(`select r.legacy_roll_id, m.legacy_material_id, r.item_name, r.width_ft::text as width_ft, r.raw_length_ft::text as raw, r.total_length_ft::text as total, r.remaining_length_ft::text as remaining,
      r.purchase_cost_kobo::text as cost, r.selling_price_kobo::text as price, coalesce(r.business_date, r.created_at::date)::text as added, r.id::text as id, r.item_name as name
    from bomedia.inventory_rolls r join bomedia.materials m on m.id=r.material_id where r.remaining_length_ft > 0 order by r.legacy_roll_id nulls last, r.id`);
  const listed = rolls.filter(r => r.legacy_roll_id !== null && r.legacy_material_id !== null);
  const withoutId = rolls.filter(r => r.legacy_roll_id === null || r.legacy_material_id === null).map(r => `${r.name} (${trimNumber(r.remaining)} ft)`);
  const materialsCsv = csvLine(['material_id', 'name', 'width_ft', 'selling_price_naira_per_sqft', 'low_stock_threshold_ft'])
    + materials.map(m => csvLine([m.legacy_material_id, m.name, trimNumber(m.width_ft), naira(m.price), trimNumber(m.threshold)])).join('');
  const rollsCsv = csvLine(['roll_id', 'material_id', 'item_name', 'width_ft', 'raw_length_ft', 'total_length_ft', 'remaining_ft', 'purchase_cost_naira', 'selling_price_naira', 'date_added', 'note'])
    + listed.map(r => csvLine([r.legacy_roll_id, r.legacy_material_id, r.item_name, trimNumber(r.width_ft), trimNumber(r.raw ?? r.total), trimNumber(r.total), trimNumber(r.remaining), naira(r.cost), naira(r.price), r.added, 'from the app: type the feet really left in remaining_ft'])).join('');
  return { materialsCsv, rollsCsv, materials: materials.length, rolls: listed.length, withoutId };
}

const kobo = value => `₦${(BigInt(value) / 100n).toLocaleString('en-NG')}.${(BigInt(value) % 100n).toString().padStart(2, '0')}`;

/** Compares the plan with what the database holds. Changes nothing. */
export async function diffStock(db, plan, { allowUncounted = false, zeroUnlisted = false } = {}) {
  const q = async (text, params = []) => (await db.query(text, params)).rows;
  const dbMaterials = new Map((await q(`select id::text, legacy_material_id, name, width_ft::text as width_ft, selling_price_per_sqft_kobo::text as price, low_stock_threshold_ft::text as threshold, active_roll_id::text as active_roll_id
    from bomedia.materials where legacy_material_id is not null`)).map(m => [m.legacy_material_id, m]));
  const allRolls = await q(`select r.id::text, r.legacy_roll_id, r.width_ft::text as width_ft, r.total_length_ft::text as total, r.remaining_length_ft::text as remaining, r.purchase_cost_kobo::text as cost, m.legacy_material_id
    from bomedia.inventory_rolls r join bomedia.materials m on m.id=r.material_id`);
  const dbRolls = new Map();
  for (const roll of allRolls.filter(r => r.legacy_roll_id !== null)) {
    if (dbRolls.has(roll.legacy_roll_id)) throw new OpeningError(`Ambiguous database roll ID ${roll.legacy_roll_id}. Nothing was changed.`);
    dbRolls.set(roll.legacy_roll_id, roll);
  }
  const out = { materialsNew: [], materialsChanged: [], materialsNameDiffers: [], rollsNew: [], rollsRecounted: [], rollsUnchanged: 0, blocked: [], uncounted: [], valueKobo: 0n };
  for (const m of plan.materials) {
    const have = dbMaterials.get(m.id);
    if (!have) { out.materialsNew.push(m.id); continue; }
    if (micros(decimal6(have.width_ft, 'db')) !== micros(m.widthFt)) out.blocked.push(`Material ${m.id}: width is ${have.width_ft} ft in the database but ${m.widthFt} in the file.`);
    if (have.name !== m.name) out.materialsNameDiffers.push(`${m.id}: "${have.name}" in the database, "${m.name}" in the file (name left as it is)`);
    if (have.price !== m.priceKobo || micros(decimal6(have.threshold, 'db')) !== micros(m.thresholdFt)) out.materialsChanged.push(m.id);
  }
  for (const r of plan.rolls) {
    const have = dbRolls.get(r.id);
    out.valueKobo += (micros(r.remainingFt) * BigInt(r.costKobo) * 2n + micros(r.totalFt)) / (micros(r.totalFt) * 2n); // remaining / total x cost, rounded half up
    if (!have) { out.rollsNew.push(r.id); continue; }
    if (have.legacy_material_id !== r.materialId) out.blocked.push(`Roll ${r.id}: belongs to material ${have.legacy_material_id} in the database but ${r.materialId} in the file.`);
    if (micros(decimal6(have.width_ft, 'db')) !== micros(r.widthFt)) out.blocked.push(`Roll ${r.id}: width is ${have.width_ft} ft in the database but ${r.widthFt} in the file. The owner must decide which is right.`);
    if (micros(decimal6(have.total, 'db')) !== micros(r.totalFt)) out.blocked.push(`Roll ${r.id}: total length is ${have.total} ft in the database but ${r.totalFt} in the file. The owner must decide which is right.`);
    if (have.cost !== r.costKobo) out.blocked.push(`Roll ${r.id}: purchase cost is ${kobo(have.cost)} in the database but ${kobo(r.costKobo)} in the file. The owner must decide which is right.`);
    if (micros(decimal6(have.remaining, 'db')) !== micros(r.remainingFt)) out.rollsRecounted.push({ id: r.id, from: have.remaining, to: r.remainingFt }); else out.rollsUnchanged++;
  }
  const fileRolls = new Set(plan.rolls.map(r => r.id));
  const omitted = allRolls.filter(r => !fileRolls.has(r.legacy_roll_id) && micros(decimal6(r.remaining, 'db')) > 0n);
  for (const have of omitted) out.uncounted.push(`${have.legacy_roll_id ?? `database roll ${have.id}`} (${have.remaining} ft)`);
  // The owner says every roll not listed is gone: those rolls are set to zero (a dated movement) instead of blocking the run.
  if (zeroUnlisted) {
    for (const have of omitted) {
      out.rollsRecounted.push({ id: have.legacy_roll_id ?? `database roll ${have.id}`, databaseId: have.id, from: have.remaining, to: '0.000000', note: 'none found at the count' });
    }
    out.zeroed = out.uncounted.length;
    out.uncounted = [];
  }
  if (allowUncounted && !zeroUnlisted) {
    for (const have of omitted) {
      if (have.cost === null || BigInt(have.cost) <= 0n || micros(decimal6(have.total, 'db')) <= 0n) {
        out.blocked.push(`Uncounted roll ${have.legacy_roll_id ?? have.id} needs a positive purchase cost and total length.`);
        continue;
      }
      const remaining = micros(decimal6(have.remaining, 'db')), total = micros(decimal6(have.total, 'db'));
      out.valueKobo += (remaining * BigInt(have.cost) * 2n + total) / (total * 2n);
    }
  }
  if (out.uncounted.length && !allowUncounted) out.blocked.push(`${out.uncounted.length} roll(s) with stock in the database are not in rolls.csv, so they were not counted: ${out.uncounted.slice(0, 10).join(', ')}${out.uncounted.length > 10 ? ', ...' : ''}. List them with their counted length (0 if gone).`);
  const byGroup = new Map();
  for (const m of plan.materials) { const key = m.name.trim().replace(/\s+/g, ' ').toLowerCase().replace(/\s*\d+\s*ft$/, ''); byGroup.set(key, new Set([...(byGroup.get(key) ?? []), m.priceKobo])); }
  out.priceDisagreements = [...byGroup].filter(([, prices]) => prices.size > 1).map(([name]) => name);
  out.ok = out.blocked.length === 0;
  return out;
}

export const summarizeStock = (plan, diff) => ({ countDate: plan.countDate, materialsInFile: plan.materials.length, rollsInFile: plan.rolls.length,
  newMaterials: diff.materialsNew.length, materialsWithNewPriceOrThreshold: diff.materialsChanged.length, nameDifferences: diff.materialsNameDiffers, sizesWithDifferentPrices: diff.priceDisagreements,
  newRolls: diff.rollsNew.length, rollsRecounted: diff.rollsRecounted.length, ofWhichSetToZeroBecauseNotListed: diff.zeroed ?? 0, rollsAlreadyMatching: diff.rollsUnchanged,
  newRollIds: diff.rollsNew, changes: diff.rollsRecounted.map(c => `${c.id}: ${Number(c.from)} ft -> ${Number(c.to)} ft${c.note ? ' (not on the count list)' : ''}`),
  countedStockValue: kobo(diff.valueKobo.toString()), rollsNotInFile: diff.uncounted.length, blockers: diff.blocked, planSha256: plan.digest });

/**
 * Applies prices, new materials and rolls, and the counted lengths. Only before any opening entry exists and while no runtime write exists.
 * Safe to repeat with the same files (the second run changes nothing).
 */
export async function applyStock(db, plan, { actorId, allowUncounted = false, zeroUnlisted = false }) {
  if (!/^[0-9a-f-]{36}$/.test(String(actorId))) throw new OpeningError('The owner staff id is required.');
  return cutoverTransaction(db, OpeningError, async tx => {
    if (!(await tx.query('select 1 from bomedia.staff where id=$1 and disabled_at is null', [actorId])).rows.length) throw new OpeningError('The owner staff account was not found or is disabled.');
    const books = (await tx.query('select state from bomedia.bookkeeping_settings where singleton')).rows[0];
    if (books && books.state !== 'setup') throw new OpeningError('The books are already active. Stock can no longer be loaded this way. Nothing was changed.');
    if ((await tx.query('select count(*)::integer as n from bomedia.journal_entries')).rows[0].n) throw new OpeningError('Journal entries already exist, so opening stock cannot be loaded. Nothing was changed.');
    if ((await tx.query('select count(*)::integer as n from bomedia.idempotency_requests')).rows[0].n) throw new OpeningError('Runtime writes already exist. Nothing was changed.');
    const diff = await diffStock(tx, plan, { allowUncounted, zeroUnlisted });
    if (!diff.ok) throw new OpeningError(`Blocked, nothing was changed:\n- ${diff.blocked.join('\n- ')}`);

    // The app reverts any price change unless this setting is on for the statement (it protects the owner's prices); it is on only inside this transaction.
    await tx.query("select set_config('bomedia.material_price_edit','on',true)");
    const materialIds = new Map((await tx.query('select id::text as id, legacy_material_id from bomedia.materials where legacy_material_id is not null')).rows.map(m => [m.legacy_material_id, m.id]));
    for (const m of plan.materials) {
      if (materialIds.has(m.id)) {
        await tx.query('update bomedia.materials set selling_price_per_sqft_kobo=$2, low_stock_threshold_ft=$3 where id=$1 and (selling_price_per_sqft_kobo<>$2 or low_stock_threshold_ft<>$3)',
          [materialIds.get(m.id), m.priceKobo, m.thresholdFt]);
      } else {
        materialIds.set(m.id, (await tx.query('insert into bomedia.materials(legacy_material_id,name,width_ft,selling_price_per_sqft_kobo,low_stock_threshold_ft) values($1,$2,$3,$4,$5) returning id::text as id',
          [m.id, m.name, m.widthFt, m.priceKobo, m.thresholdFt])).rows[0].id);
      }
    }
    const reason = `Opening count ${plan.countDate}`;
    const move = async (rollId, delta, why) => tx.query(`insert into bomedia.inventory_movements(roll_id,kind,length_delta_ft,reason,business_date,created_by)
      values($1,$2,$3,$4,$5,$6)`, [rollId, why.kind, delta, why.reason, plan.countDate, actorId]);
    const newIds = new Set(diff.rollsNew);
    for (const r of plan.rolls) {
      const material = plan.materials.find(m => m.id === r.materialId);
      if (newIds.has(r.id)) {
        const rollId = (await tx.query(`insert into bomedia.inventory_rolls(material_id,legacy_roll_id,item_name,width_ft,raw_length_ft,total_length_ft,remaining_length_ft,original_unit,
            purchase_cost_kobo,selling_price_kobo,low_stock_threshold_ft,business_date)
          values($1,$2,$3,$4,$5,$6,$7,'ft',$8,$9,$10,$11) returning id::text as id`,
          [materialIds.get(r.materialId), r.id, r.itemName, r.widthFt, r.rawFt, r.totalFt, r.remainingFt, r.costKobo, r.priceKobo, material.thresholdFt, r.dateAdded ?? plan.countDate])).rows[0].id;
        // Derived figures, the same way the app's restock fills them in.
        await tx.query(`update bomedia.inventory_rolls set cost_per_sqft_kobo=round(purchase_cost_kobo::numeric/(width_ft*total_length_ft))::bigint,
          cost_per_sqft_kobo_exact=round(purchase_cost_kobo::numeric/(width_ft*total_length_ft),6), waste_factor=10,
          status=bomedia.roll_status(remaining_length_ft, low_stock_threshold_ft) where id=$1`, [rollId]);
        if (micros(r.remainingFt) > 0n) {
          await move(rollId, r.remainingFt, { kind: 'opening', reason: `Opening stock ${plan.countDate}${r.note ? ` - ${r.note}` : ''}`.slice(0, 300) });
          await tx.query('update bomedia.materials set active_roll_id=$2 where id=$1 and active_roll_id is null', [materialIds.get(r.materialId), rollId]);
        }
      }
    }
    for (const change of diff.rollsRecounted) {
      const r = plan.rolls.find(x => x.id === change.id);
      const to = r ? r.remainingFt : change.to;
      const note = r ? r.note : change.note;
      const delta = micros(to) - micros(decimal6(change.from, 'db'));
      const abs = delta < 0n ? -delta : delta;
      const text = `${delta < 0n ? '-' : ''}${abs / 1000000n}.${(abs % 1000000n).toString().padStart(6, '0')}`;
      const rollId = change.databaseId ?? (await tx.query('select id::text as id from bomedia.inventory_rolls where legacy_roll_id=$1', [change.id])).rows[0].id;
      await tx.query('update bomedia.inventory_rolls set remaining_length_ft=$2 where id=$1', [rollId, to]);
      await tx.query('update bomedia.inventory_rolls set status=bomedia.roll_status(remaining_length_ft, low_stock_threshold_ft) where id=$1', [rollId]);
      await move(rollId, text, { kind: 'adjustment', reason: `${reason}${note ? ` - ${note}` : ''}`.slice(0, 300) });
    }
    const stock = await readOpeningStock(tx);
    if (stock.valueKobo !== diff.valueKobo.toString()) throw new OpeningError('Applied stock value differs from the preview. Nothing was changed.');
    const details = { countDate: plan.countDate, planSha256: plan.digest, ...stock };
    const previous = await readStockApproval(tx);
    if (!previous || ['countDate', 'planSha256', 'fingerprint', 'valueKobo', 'rolls'].some(key => previous.details[key] !== details[key])) {
      await tx.query("insert into bomedia.audit_events(actor_id,action,entity_type,details) values($1,'opening_stock_approved','cutover',$2::jsonb)", [actorId, JSON.stringify(details)]);
    }
    return { applied: true, ...summarizeStock(plan, diff), approvedStockFingerprint: stock.fingerprint };
  });
}

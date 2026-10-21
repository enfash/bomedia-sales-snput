import { createHash } from 'node:crypto';
import { OpeningError } from './cutover-shared.mjs';

/**
 * Exactly the set valued by opening-post: every roll with positive remaining length. The rows are share-locked, so inside a transaction they cannot
 * change between this check and the commit that activates the books.
 */
export async function readOpeningStock(db) {
  const rolls = (await db.query(`select r.id::text, r.material_id::text, r.legacy_roll_id,
    r.item_name, r.status, r.width_ft::text, m.width_ft::text as material_width_ft, m.active_roll_id::text as material_active_roll_id, r.total_length_ft::text, r.remaining_length_ft::text, r.purchase_cost_kobo::text,
    r.selling_price_kobo::text as roll_price_kobo, m.selling_price_per_sqft_kobo::text as material_price_kobo, m.low_stock_threshold_ft::text as material_threshold_ft,
    case when r.purchase_cost_kobo > 0 and r.total_length_ft > 0 then bomedia.roll_value(r,r.remaining_length_ft)::text end as value_kobo
    from bomedia.inventory_rolls r join bomedia.materials m on m.id=r.material_id where r.remaining_length_ft>0 order by r.id for share of r, m`)).rows;
  if (rolls.some(r => r.value_kobo == null)) throw new OpeningError('Every roll with stock needs a positive purchase cost and total length before opening.');
  // The app sells only from rolls that are Active or Low stock and as wide as their material (see the sale functions), so approved stock must be sellable.
  const unsellable = rolls.filter(r => !['active', 'low stock'].includes(String(r.status).toLowerCase()) || r.width_ft !== r.material_width_ft);
  if (unsellable.length) throw new OpeningError(`${unsellable.length} roll(s) with stock cannot be sold by the app (status must be Active or Low stock, and the roll as wide as its material): ${unsellable.slice(0, 5).map(r => r.item_name).join(', ')}. Fix them before opening.`);
  return { fingerprint: createHash('sha256').update(JSON.stringify(rolls)).digest('hex'),
    valueKobo: rolls.reduce((total, r) => total + BigInt(r.value_kobo), 0n).toString(), rolls: rolls.length };
}

export async function readStockApproval(db) {
  return (await db.query(`select id::text, details from bomedia.audit_events
    where action='opening_stock_approved' and entity_type='cutover' order by created_at desc, id desc limit 1`)).rows[0] ?? null;
}

export function stockApprovalMatches(stock, approval, openingDate) {
  // A genuinely empty database needs no physical-count approval. A recorded count must always match.
  if (!approval) return stock.rolls === 0;
  const a = approval.details;
  return a.countDate === openingDate && a.fingerprint === stock.fingerprint && a.valueKobo === stock.valueKobo &&
    a.rolls === stock.rolls && /^[a-f0-9]{64}$/.test(a.planSha256);
}

export const stockEvidence = (stock, approval) => `stock fingerprint ${stock.fingerprint}; stock plan ${approval?.details.planSha256 ?? 'empty'}; stock approval ${approval?.id ?? 'empty'}`;

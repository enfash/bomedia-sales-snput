import { createHash } from 'node:crypto';
import { OpeningError } from './cutover-shared.mjs';

/** Exactly the set valued by opening-post: every roll with positive remaining length. */
export async function readOpeningStock(db) {
  const rolls = (await db.query(`select r.id::text, r.material_id::text, r.legacy_roll_id,
    r.width_ft::text, r.total_length_ft::text, r.remaining_length_ft::text, r.purchase_cost_kobo::text,
    case when r.purchase_cost_kobo > 0 and r.total_length_ft > 0 then bomedia.roll_value(r,r.remaining_length_ft)::text end as value_kobo
    from bomedia.inventory_rolls r where r.remaining_length_ft>0 order by r.id`)).rows;
  if (rolls.some(r => r.value_kobo == null)) throw new OpeningError('Every roll with stock needs a positive purchase cost and total length before opening.');
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

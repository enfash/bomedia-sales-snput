// The restock, waste and count forms share these rules. Pure: Stock entry and the Inventory popups both build their entries here,
// so a message or a check can never differ between the two screens.
import { formatKobo } from './accounting-money';
import { nairaToKobo } from './accounting-entry';
import { normalizePaymentMethod, type PaymentMethod } from './payment-methods';
import { recordedAs, rollRawFeet, usableFeet, type RollLengthChoice } from './roll-length';

export type StockMaterial = { id: string; name: string; width_ft: string; remaining_length_ft: string; roll_count: number; available?: boolean };
export type StockRoll = { id: string; material_id: string; legacy_roll_id: string | null; item_name: string; width_ft: string; total_length_ft: string;
  remaining_length_ft: string; purchase_cost_kobo: string | null; status: string };
export type PaymentMethodOption = { method: PaymentMethod; label: string };
export type StockOperation = 'restocks' | 'waste' | 'stock-counts';
export type StockEntryDraft = { ok: true; operation: StockOperation; payload: Record<string, unknown>; summary: string } | { ok: false; error: string };

export const feetPattern = /^(0|[1-9][0-9]{0,5})(\.[0-9]{1,6})?$/;
export const ft = (value: string) => `${Number(value).toLocaleString('en-NG', { maximumFractionDigits: 2 })} ft`;
export const rollName = (roll: StockRoll) => roll.legacy_roll_id || `${roll.item_name} ${Number(roll.width_ft)}ft`;
export const inStock = (roll: StockRoll) => ['active', 'low stock'].includes(roll.status.toLowerCase()) && Number(roll.remaining_length_ft) > 0;
export const materialName = (material: StockMaterial) => `${material.name} ${Number(material.width_ft)} ft`;

// Display estimate only; the server computes the exact kobo from the roll's cost.
export function valueChange(roll: StockRoll, newRemaining: number): number | null {
  if (!roll.purchase_cost_kobo || Number(roll.total_length_ft) <= 0) return null;
  const value = (remaining: number) => Math.round(remaining / Number(roll.total_length_ft) * Number(roll.purchase_cost_kobo));
  return value(newRemaining) - value(Number(roll.remaining_length_ft));
}

export type RestockInput = { material: StockMaterial | undefined; rollCount: string; length: RollLengthChoice; cost: string; method: PaymentMethod | '';
  businessDate: string; supplier: string; reference: string; methodLabel: (method: string) => string };
export const rollCountOf = (value: string) => (/^[1-9][0-9]?$/.test(value) ? Number(value) : 0);

export function restockDraft(input: RestockInput): StockEntryDraft {
  const count = rollCountOf(input.rollCount), rawFeet = rollRawFeet(input.length), usable = usableFeet(rawFeet), costKobo = nairaToKobo(input.cost);
  if (!input.material || !count || !rawFeet || !usable || costKobo === null || BigInt(costKobo) < BigInt(Math.max(count, 1))) {
    return { ok: false, error: 'Choose the material and enter the rolls, length per roll and total paid.' };
  }
  if (!normalizePaymentMethod(input.method)) return { ok: false, error: 'Choose Cash, Transfer or POS.' };
  return { ok: true, operation: 'restocks',
    payload: { materialId: input.material.id, rollCount: input.rollCount, rawLengthFt: rawFeet, totalCostKobo: costKobo, paymentMethod: input.method, businessDate: input.businessDate,
      ...(input.supplier.trim() ? { supplier: input.supplier.trim() } : {}), ...(input.reference.trim() ? { reference: input.reference.trim() } : {}) },
    summary: `Restock ${count} x ${input.material.name} ${Number(input.material.width_ft)}ft, ${formatKobo(costKobo)} by ${input.methodLabel(input.method)} on ${input.businessDate}` };
}

/** The live summary under the restock form, or null until there is enough to describe. */
export function restockPreview(input: RestockInput): { title: string; detail: string; costPerSqft: string | null } | null {
  const count = rollCountOf(input.rollCount), usable = usableFeet(rollRawFeet(input.length)), costKobo = nairaToKobo(input.cost);
  if (!input.material || !count || !usable || !costKobo || costKobo === '0') return null;
  const sqft = Number(input.material.width_ft) * usable * count;
  const perSqft = sqft > 0 ? Number(costKobo) / sqft : 0;
  return { title: `${count} roll${count === 1 ? '' : 's'} of ${materialName(input.material)} · ${ft(String(usable * count))} usable`,
    detail: `${formatKobo(costKobo)}${input.method ? ` by ${input.methodLabel(input.method)}` : ''} · about ${formatKobo((BigInt(costKobo) / BigInt(count)).toString())} per roll`,
    costPerSqft: perSqft > 0 ? `costs about ${formatKobo(String(Math.round(perSqft)))} per sq ft` : null };
}
export { recordedAs };

export type WasteInput = { roll: StockRoll | undefined; length: string; reason: string; businessDate: string; responsible: string; note: string };
export function wasteDraft(input: WasteInput): StockEntryDraft {
  const wasteFt = feetPattern.test(input.length) ? Number(input.length) : 0;
  if (!input.roll || !inStock(input.roll) || wasteFt <= 0 || wasteFt > Number(input.roll.remaining_length_ft) || !input.reason) {
    return { ok: false, error: 'Choose a roll, a waste length no more than it has left, and a reason.' };
  }
  return { ok: true, operation: 'waste',
    payload: { rollId: input.roll.id, lengthFt: input.length, reason: input.reason, businessDate: input.businessDate,
      ...(input.responsible.trim() ? { responsible: input.responsible.trim() } : {}), ...(input.note.trim() ? { note: input.note.trim() } : {}) },
    summary: `Waste ${ft(input.length)} from ${rollName(input.roll)} on ${input.businessDate}: ${input.reason}` };
}
export function wastePreview(input: Pick<WasteInput, 'roll' | 'length'>): { title: string; detail: string } | null {
  const wasteFt = feetPattern.test(input.length) ? Number(input.length) : 0;
  const value = input.roll && wasteFt > 0 && wasteFt <= Number(input.roll.remaining_length_ft) ? valueChange(input.roll, Number(input.roll.remaining_length_ft) - wasteFt) : null;
  return input.roll && value !== null ? { title: `${ft(input.length)} of ${rollName(input.roll)} wasted`, detail: `About ${formatKobo(String(-value))} of material, counted as waste` } : null;
}

export type CountInput = { roll: StockRoll | undefined; counted: string; reason: string; businessDate: string };
export function countDraft(input: CountInput): StockEntryDraft {
  const measured = feetPattern.test(input.counted) ? Number(input.counted) : null;
  const difference = input.roll && measured !== null ? measured - Number(input.roll.remaining_length_ft) : 0;
  if (!input.roll || measured === null || measured > Number(input.roll.total_length_ft) || difference === 0 || input.reason.trim().length < 3) {
    return { ok: false, error: 'Choose the roll, enter a measured length that differs, and explain why.' };
  }
  return { ok: true, operation: 'stock-counts',
    payload: { rollId: input.roll.id, countedLengthFt: input.counted, reason: input.reason.trim(), businessDate: input.businessDate },
    summary: `Count ${rollName(input.roll)}: ${ft(input.roll.remaining_length_ft)} to ${ft(input.counted)} on ${input.businessDate}` };
}
/**
 * What the count changes: the feet difference, with an estimated value when the roll's cost is known, or a warning when the
 * measured length is longer than the roll can be. A roll with no recorded cost still gets its feet difference, just no value.
 */
export function countPreview(input: Pick<CountInput, 'roll' | 'counted'>): { kind: 'change'; difference: number; value: number | null } | { kind: 'too-long'; limit: string } | null {
  const measured = feetPattern.test(input.counted) ? Number(input.counted) : null;
  if (!input.roll || measured === null) return null;
  const difference = measured - Number(input.roll.remaining_length_ft);
  if (difference === 0) return null;
  if (measured > Number(input.roll.total_length_ft)) return { kind: 'too-long', limit: input.roll.total_length_ft };
  return { kind: 'change', difference, value: valueChange(input.roll, measured) };
}

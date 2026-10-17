// How the correct and cancel screens read a correction plan and decide who may ask. Pure helpers: no styling, no data access.
import type { ApprovalRuleRow } from './approvals-view';
import type { CorrectionPlan } from './server/sale-corrections';

export type CorrectionAccess = { isOwner: boolean; enabled: boolean; days: number };
export const accessFrom = (payload: { rules: ApprovalRuleRow[]; isOwner: boolean } | null): CorrectionAccess | null => {
  if (!payload) return null;
  const rule = payload.rules.find((r) => r.kind === 'edit_old');
  return { isOwner: payload.isOwner, enabled: Boolean(rule?.enabled), days: Number(rule?.params.days) || 7 };
};

const dayNumber = (date: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86_400_000 : NaN; };
/** The owner may always change a sale; a cashier only when the owner allows it and the sale is recent enough. */
export function canChangeSale(access: CorrectionAccess | null, saleDate: string | null | undefined, today: string): boolean {
  if (!access) return false;
  if (access.isOwner) return true;
  if (!access.enabled || !saleDate) return false;
  const age = dayNumber(today) - dayNumber(saleDate);
  return Number.isFinite(age) && age <= access.days;
}

const money = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: kobo % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const feet = (n: number) => `${+n.toFixed(2)} ft`;
type RollLine = { roll: string; length_ft: string };
const byRoll = (lines: RollLine[]) => {
  const out = new Map<string, number>();
  for (const l of lines) out.set(l.roll, (out.get(l.roll) ?? 0) + Number(l.length_ft));
  return [...out.entries()];
};

/** What a set of plans does, in plain figures: the sale total, stock, what was paid and any credit left. */
export function effectOf(plans: CorrectionPlan[]) {
  const oldTotal = plans.reduce((s, p) => s + Number(p.old_amount_kobo), 0), newTotal = plans.reduce((s, p) => s + Number(p.new_amount_kobo), 0);
  const paid = plans.reduce((s, p) => s + Number(p.paid_kobo), 0);
  const back = byRoll(plans.flatMap((p) => p.returns)), taken = byRoll(plans.flatMap((p) => p.takes));
  const stock = [
    ...(back.length ? [`${back.map(([roll, n]) => `${feet(n)} back to ${roll}`).join(', ')}`] : []),
    ...(taken.length ? [`${taken.map(([roll, n]) => `${feet(n)} ${back.length ? 'taken' : `taken from ${roll}`}`).join(', ')}`] : []),
  ];
  const credit = Math.max(0, paid - newTotal);
  return { oldTotal, newTotal, paid, stock: stock.length ? stock.join(', ') : 'No stock moves', credit, oldText: money(oldTotal), newText: money(newTotal), paidText: money(paid), creditText: money(credit) };
}

// Plain wording and small helpers for the approval screens. Pure, no styling or data access.
export type ApprovalKind = 'date' | 'price' | 'expense_limit' | 'edit_old';
export type ApprovalRuleRow = { kind: ApprovalKind; enabled: boolean; params: { days?: number; percent?: number; amount_kobo?: number } };

export const RULE_INFO: Record<ApprovalKind, { title: string; description: string; lead: string; unit: string; fieldLabel: string; max: number }> = {
  date: { lead: 'Allow', title: 'A different date', description: 'A sale entered with a date other than today (Lagos time) waits for you.', unit: 'days from today', fieldLabel: 'Days allowed from today', max: 30 },
  price: { lead: 'Allow', title: 'A different price', description: 'A print price higher or lower than the list price waits for you.', unit: '% either way', fieldLabel: 'Percent allowed either way', max: 100 },
  expense_limit: { lead: 'Above ₦', title: 'A large expense', description: 'A single expense above this amount waits for you. Paying an approved expense later never asks again.', unit: '', fieldLabel: 'Expense limit in naira', max: 1_000_000_000 },
  edit_old: { lead: 'Up to', title: 'Correcting or cancelling a sale', description: 'Switch on to let cashiers ask for a change to a recent sale. You approve each one. Off: only you can change a sale. You can always change any sale yourself, with no approval.', unit: 'days old', fieldLabel: 'Days a sale can still be changed', max: 90 },
};
/** The number shown in the rule's box: days, percent, or naira. */
export const ruleLimit = (rule: ApprovalRuleRow | undefined) => rule?.kind === 'expense_limit' ? (Number(rule.params.amount_kobo) || 0) / 100 : Number(rule?.kind === 'date' || rule?.kind === 'edit_old' ? rule.params.days : rule?.params.percent) || 0;

// What makes a sale need the owner, worked out on the device so the cashier is asked for a reason before saving.
// This mirrors the database rule (the database still decides); a mismatch only means the server answers instead.
export type EntryChange =
  | { kind: 'date'; asked: string; today: string; daysOff: number }
  | { kind: 'price'; item: string; listKobo: number; typedKobo: number; percentOff: number }
  | { kind: 'expense_limit'; category: string; description: string; paidTo: string; amountKobo: number; limitKobo: number };
type PricedItem = { kind: 'print' | 'service'; ref: string; description: string; priceKobo: string };
type CatalogMaterial = { id?: string; ref: string; priceKobo: string };

const dayNumber = (date: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86_400_000 : NaN; };

export function entryChanges(input: { businessDate: string; today: string; items: PricedItem[]; materials: CatalogMaterial[] }, rules: ApprovalRuleRow[]): EntryChange[] {
  const out: EntryChange[] = [];
  const date = rules.find((r) => r.kind === 'date' && r.enabled);
  if (date) {
    const daysOff = Math.abs(dayNumber(input.businessDate) - dayNumber(input.today));
    if (Number.isFinite(daysOff) && daysOff > ruleLimit(date)) out.push({ kind: 'date', asked: input.businessDate, today: input.today, daysOff });
  }
  const price = rules.find((r) => r.kind === 'price' && r.enabled);
  if (price) {
    const percent = ruleLimit(price);
    for (const item of input.items) {
      if (item.kind !== 'print') continue;
      const list = Number(input.materials.find((m) => m.id === item.ref || m.ref === item.ref)?.priceKobo), typed = Number(item.priceKobo);
      if (!(list > 0) || !(typed > 0)) continue;
      if (Math.abs(typed - list) * 100 > percent * list) out.push({ kind: 'price', item: item.description, listKobo: list, typedKobo: typed, percentOff: Math.round((typed - list) * 1000 / list) / 10 });
    }
  }
  return out;
}

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: kobo % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const longDate = (value: string) => {
  const day = dayNumber(value);
  return Number.isNaN(day) ? 'a different date' : new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(day * 86_400_000));
};
const days = (n: number) => (n === 1 ? '1 day' : `${n} days`);
export const changeTitle = (change: EntryChange) => (change.kind === 'date' ? 'Date' : change.kind === 'price' ? 'Price' : 'Expense');
export function changeText(change: EntryChange) {
  if (change.kind === 'date') return `${longDate(change.asked)}, not today (${days(change.daysOff)} ${dayNumber(change.asked) < dayNumber(change.today) ? 'back' : 'ahead'})`;
  if (change.kind === 'expense_limit') return `${change.category}${change.description ? `: ${change.description}` : ''}, ${naira(change.amountKobo)}${change.paidTo ? ` to ${change.paidTo}` : ''} (the limit is ${naira(change.limitKobo)})`;
  return `${change.item}: ${naira(change.typedKobo)} per sq ft, list is ${naira(change.listKobo)} (${Math.abs(change.percentOff)}% ${change.percentOff > 0 ? 'higher' : 'lower'})`;
}

// A held sale as the owner's and the cashier's lists receive it.
export type ApprovalChangeRow =
  | { kind: 'date'; normal: string; asked: string; days_off: number }
  | { kind: 'price'; item: string; material: string; list_per_sqft_kobo: string; typed_per_sqft_kobo: string; percent_off: number }
  | { kind: 'expense_limit'; category: string; description: string; paid_to: string; amount_kobo: string; limit_kobo: string };
export type ApprovalRow = {
  id: string; operation: 'screen_order' | 'screen_expense' | 'sale_correction'; status: 'pending' | 'approved' | 'declined' | 'expired'; kinds: string[]; changes: ApprovalChangeRow[];
  summary: { kind?: string; client?: string; sales_id?: string; total_kobo?: string; items?: (string | { category?: string; description?: string; paid_to?: string; amount_kobo?: string })[] }; reason: string; requested_by: string | null;
  created_at: string; expires_at: string; decided_at: string | null; decided_by: string | null; decision_note: string | null;
  last_error: string | null; sales_id: string | null; reference: string | null;
};
export const STATUS_LABEL: Record<ApprovalRow['status'], string> = { pending: 'Waiting for approval', approved: 'Approved', declined: 'Declined', expired: 'Expired' };

// The database's change record in the same plain words the cashier saw.
export function rowChange(change: ApprovalChangeRow): EntryChange {
  if (change.kind === 'date') return { kind: 'date', asked: change.asked, today: change.normal, daysOff: Math.abs(change.days_off) };
  if (change.kind === 'expense_limit') return { kind: 'expense_limit', category: change.category, description: change.description ?? '', paidTo: change.paid_to ?? '', amountKobo: Number(change.amount_kobo), limitKobo: Number(change.limit_kobo) };
  return { kind: 'price', item: change.item, listKobo: Number(change.list_per_sqft_kobo), typedKobo: Number(change.typed_per_sqft_kobo), percentOff: Number(change.percent_off) };
}
export const rowTotalKobo = (row: ApprovalRow) => (/^[0-9]{1,15}$/.test(row.summary?.total_kobo ?? '') ? Number(row.summary.total_kobo) : 0);
/** What kind of entry a request is, in one word. */
export const rowKind = (row: ApprovalRow) => row.operation === 'screen_expense' ? 'Expense' : row.operation === 'sale_correction' ? (row.kinds.includes('cancellation') ? 'Cancellation' : 'Correction') : 'Sale';
export const rowItems = (row: ApprovalRow) => row.operation === 'sale_correction' ? [row.summary?.sales_id, ...(row.changes as unknown as { before?: { description?: string } }[]).slice(0, 2).map((c) => c.before?.description)].filter(Boolean).join(' · ') : (Array.isArray(row.summary?.items)
  ? row.summary.items.map((i) => (typeof i === 'string' ? i : [i?.category, i?.description].filter(Boolean).join(': '))).filter(Boolean).join(', ') : '');
/** What the request is called in plain words: who it is for. A sale names the client; an expense names the payee or the category. */
export const rowTitle = (row: ApprovalRow) => row.operation === 'sale_correction' ? row.summary?.client || 'A sale' : row.operation === 'screen_expense'
  ? (typeof row.summary?.items?.[0] === 'object' && row.summary.items[0]?.paid_to) || 'An expense' : row.summary?.client || 'A sale';
export const koboNaira = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: kobo % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** Which logged expenses are above the limit, worked out on the device so the cashier is asked for a reason before sending. Mirrors the database. */
export function expenseChanges(items: { amountKobo: string; category: string; description: string; paidTo: string }[], rules: ApprovalRuleRow[]): EntryChange[] {
  const rule = rules.find((r) => r.kind === 'expense_limit' && r.enabled);
  if (!rule) return [];
  const limit = Number(rule.params.amount_kobo) || 0;
  return items.filter((i) => Number(i.amountKobo) > limit).map((i) => ({ kind: 'expense_limit' as const, category: i.category, description: i.description, paidTo: i.paidTo, amountKobo: Number(i.amountKobo), limitKobo: limit }));
}

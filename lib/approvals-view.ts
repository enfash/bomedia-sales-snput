// Plain wording and small helpers for the approval screens. Pure, no styling or data access.
export type ApprovalKind = 'date' | 'price' | 'expense_limit' | 'edit_old';
export type ApprovalRuleRow = { kind: ApprovalKind; enabled: boolean; params: { days?: number; percent?: number } };

export const RULE_INFO: Record<ApprovalKind, { title: string; description: string; unit: string; fieldLabel: string; max: number }> = {
  date: { title: 'A different date', description: 'A sale entered with a date other than today (Lagos time) waits for you.', unit: 'days from today', fieldLabel: 'Days allowed from today', max: 30 },
  price: { title: 'A different price', description: 'A print price higher or lower than the list price waits for you.', unit: '% either way', fieldLabel: 'Percent allowed either way', max: 100 },
  expense_limit: { title: 'A large expense', description: 'Expenses above an amount wait for you.', unit: '', fieldLabel: '', max: 0 },
  edit_old: { title: 'Editing or deleting older records', description: 'Changes to records from earlier days wait for you.', unit: '', fieldLabel: '', max: 0 },
};
export const ruleLimit = (rule: ApprovalRuleRow | undefined) => Number(rule?.kind === 'date' ? rule.params.days : rule?.params.percent) || 0;

// What makes a sale need the owner, worked out on the device so the cashier is asked for a reason before saving.
// This mirrors the database rule (the database still decides); a mismatch only means the server answers instead.
export type EntryChange =
  | { kind: 'date'; asked: string; today: string; daysOff: number }
  | { kind: 'price'; item: string; listKobo: number; typedKobo: number; percentOff: number };
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
export const changeTitle = (change: EntryChange) => (change.kind === 'date' ? 'Date' : 'Price');
export function changeText(change: EntryChange) {
  if (change.kind === 'date') return `${longDate(change.asked)}, not today (${days(change.daysOff)} ${dayNumber(change.asked) < dayNumber(change.today) ? 'back' : 'ahead'})`;
  return `${change.item}: ${naira(change.typedKobo)} per sq ft, list is ${naira(change.listKobo)} (${Math.abs(change.percentOff)}% ${change.percentOff > 0 ? 'higher' : 'lower'})`;
}

// A held sale as the owner's and the cashier's lists receive it.
export type ApprovalChangeRow =
  | { kind: 'date'; normal: string; asked: string; days_off: number }
  | { kind: 'price'; item: string; material: string; list_per_sqft_kobo: string; typed_per_sqft_kobo: string; percent_off: number };
export type ApprovalRow = {
  id: string; status: 'pending' | 'approved' | 'declined' | 'expired'; kinds: string[]; changes: ApprovalChangeRow[];
  summary: { client?: string; total_kobo?: string; items?: string[] }; reason: string; requested_by: string | null;
  created_at: string; expires_at: string; decided_at: string | null; decided_by: string | null; decision_note: string | null;
  last_error: string | null; sales_id: string | null;
};
export const STATUS_LABEL: Record<ApprovalRow['status'], string> = { pending: 'Waiting for approval', approved: 'Approved', declined: 'Declined', expired: 'Expired' };

// The database's change record in the same plain words the cashier saw.
export function rowChange(change: ApprovalChangeRow): EntryChange {
  if (change.kind === 'date') return { kind: 'date', asked: change.asked, today: change.normal, daysOff: Math.abs(change.days_off) };
  return { kind: 'price', item: change.item, listKobo: Number(change.list_per_sqft_kobo), typedKobo: Number(change.typed_per_sqft_kobo), percentOff: Number(change.percent_off) };
}
export const rowTotalKobo = (row: ApprovalRow) => (/^[0-9]{1,15}$/.test(row.summary?.total_kobo ?? '') ? Number(row.summary.total_kobo) : 0);
export const rowItems = (row: ApprovalRow) => (Array.isArray(row.summary?.items) ? row.summary.items.filter((i) => typeof i === 'string').join(', ') : '');
export const koboNaira = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: kobo % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

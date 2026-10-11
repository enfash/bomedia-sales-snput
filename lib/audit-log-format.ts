// Turns raw audit entries into plain sentences for the owner. Pure helpers, no styling or data access.
import { nairaLabel } from './materials-format';
export type AuditCategory = 'signins' | 'staff' | 'sales' | 'expenses' | 'stock' | 'settings' | 'other';
export type AuditEntryView = { id: string; at: string; action: string; category: AuditCategory; actor_name: string | null;
  details: Record<string, unknown> };

export const CATEGORY_LABEL: Record<AuditCategory, string> = {
  signins: 'Sign-ins', staff: 'Staff', sales: 'Sales and payments', expenses: 'Expenses', stock: 'Stock', settings: 'Settings', other: 'Other',
};
const TIME_ZONE = 'Africa/Lagos';
const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: kobo % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const sentence = (value: string) => { const spaced = value.replace(/_/g, ' ').trim(); return spaced.charAt(0).toUpperCase() + spaced.slice(1); };
// A plain calendar date ("2026-10-31") as "31 October 2026"; anything else reads as "a date" rather than raw text.
const dateLabel = (value: unknown) => {
  const match = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!match) return 'a date';
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? 'a date' : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
};
// Kobo kept as text in the audit details becomes "₦250"; anything unreadable becomes empty so the sentence stays plain.
const koboLabel = (value: unknown) => (typeof value === 'string' && /^[0-9]{1,12}$/.test(value) ? nairaLabel(value) : '');
const asText = (value: unknown) => (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : '');

// Staff entries name the cashier they were about; older entries do not, so fall back to a plain phrase.
const target = (entry: AuditEntryView, fallback: string) => (typeof entry.details.name === 'string' && entry.details.name ? entry.details.name : fallback);

const ACTIONS: Record<string, string | ((entry: AuditEntryView) => string)> = {
  staff_login: 'signed in', staff_logout: 'signed out',
  staff_create: (e) => `added ${target(e, 'a cashier')}`,
  staff_reset: (e) => `reset the PIN for ${target(e, 'a cashier')}`,
  staff_disable: (e) => `removed ${target(e, 'a cashier')}`,
  staff_restore: (e) => `restored ${target(e, 'a cashier')}`,
  material_price_changed: (e) => `changed the price of ${asText(e.details.name) || 'a material'} ${koboLabel(e.details.from) ? `from ${koboLabel(e.details.from)} ` : ''}to ${koboLabel(e.details.to) || 'a new price'} per sq ft`,
  material_renamed: (e) => `renamed the material ${asText(e.details.from) || 'a material'} to ${asText(e.details.to) || 'a new name'}`,
  material_added: (e) => `added the material ${asText(e.details.name) || ''}${koboLabel(e.details.to) ? ` at ${koboLabel(e.details.to)} per sq ft` : ''}`.trim(),
  material_size_added: (e) => `added the size ${asText(e.details.name) || 'a size'}`,
  material_size_saved: (e) => e.details.enabled === true ? `turned on ${asText(e.details.name) || 'a size'}` : e.details.enabled === false ? `turned off ${asText(e.details.name) || 'a size'}` : `changed the settings of ${asText(e.details.name) || 'a size'}`,
  books_closed: (e) => `closed the books through ${dateLabel(e.details.to)}`,
  staff_hidden: (e) => `hid ${target(e, 'a cashier')} from the staff lists`,
  staff_unhidden: (e) => `showed ${target(e, 'a cashier')} in the staff lists again`,
  staff_sign_out: (e) => { const n = Number(e.details.sessions); return `signed ${target(e, 'a cashier')} out${Number.isFinite(n) ? ` of ${n} session${n === 1 ? '' : 's'}` : ''}`; },
  staff_single_session: (e) => `turned one device per cashier ${e.details.enabled === true ? 'on' : e.details.enabled === false ? 'off' : 'on or off'}`,
  sale_recorded: 'recorded a sale',
  payment_recorded: (e) => {
    const kobo = Number(e.details.amount_kobo);
    const how = asText(e.details.method);
    return `recorded a payment${Number.isFinite(kobo) && e.details.amount_kobo !== undefined ? ` of ${naira(kobo)}` : ''}${how ? ` (${sentence(how)})` : ''}`;
  },
  quote_saved: 'saved a quote', customer_created: 'added a customer',
  expense_logged: 'logged an expense', expense_paid: 'paid an expense',
  stock_restocked: 'restocked a roll',
  business_details_saved: 'changed the business details', payment_method_saved: 'changed a payment method',
  expense_category_saved: (e) => {
    const name = typeof e.details.name === 'string' && e.details.name ? ` ${e.details.name}` : '';
    if (Array.isArray(e.details.changed) && e.details.changed.includes('added')) return `added the expense category${name}`.trim();
    if (Array.isArray(e.details.changed) && e.details.changed.includes('access_owner')) return `made the expense category${name} owner only`;
    if (Array.isArray(e.details.changed) && e.details.changed.includes('access_everyone')) return `let all staff log the expense category${name}`;
    if (Array.isArray(e.details.changed) && e.details.changed.includes('access_chosen')) return `chose which staff can log the expense category${name}`;
    if (e.details.enabled === true) return `turned the expense category${name} on`;
    if (e.details.enabled === false) return `turned the expense category${name} off`;
    return 'changed an expense category';
  },
  service_saved: 'saved a service', services_reordered: 'reordered the services',
  job_status: "changed a job's status", journal_posted: 'posted an accounting entry',
};

export function describeAudit(entry: AuditEntryView): { who: string; text: string } {
  const who = entry.actor_name || (entry.details.admin_identity ? 'Owner' : 'The system');
  const known = ACTIONS[entry.action];
  const text = typeof known === 'function' ? known(entry) : known ?? (entry.action.startsWith('price_') ? 'handled a price request' : sentence(entry.action).toLowerCase());
  return { who, text };
}

// Extra facts shown when a row is opened. Only keys the server allows ever reach here.
export function detailLines(entry: AuditEntryView): { label: string; value: string }[] {
  const d = entry.details, lines: { label: string; value: string }[] = [];
  if (Array.isArray(d.changed) && d.changed.length) lines.push({ label: 'Changed', value: d.changed.map((v) => sentence(asText(v))).join(', ') });
  if (typeof d.label === 'string' && d.label) lines.push({ label: 'Name', value: d.label });
  if (typeof d.name === 'string' && d.name && !entry.action.startsWith('staff_')) lines.push({ label: 'Name', value: d.name });
  if (typeof d.method === 'string' && d.method) lines.push({ label: 'Method', value: sentence(d.method) });
  if (typeof d.amount_kobo === 'number') lines.push({ label: 'Amount', value: naira(d.amount_kobo) });
  if (d.from !== undefined || d.to !== undefined) lines.push({ label: 'Status', value: `${sentence(asText(d.from) || 'none')} to ${sentence(asText(d.to) || 'none')}` });
  else if (typeof d.status === 'string' && d.status) lines.push({ label: 'Status', value: sentence(d.status) });
  if (typeof d.enabled === 'boolean') lines.push({ label: 'Now', value: d.enabled ? 'On' : 'Off' });
  if (typeof d.sessions === 'number') lines.push({ label: 'Sessions ended', value: String(d.sessions) });
  if (typeof d.admin_identity === 'string' && d.admin_identity) lines.push({ label: 'Done by', value: d.admin_identity });
  return lines;
}

const dayKey = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(date);
export const timeLabel = (iso: string) =>
  new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TIME_ZONE }).format(new Date(iso)).replace(/\s?(AM|PM)/, (_, x: string) => ` ${x.toLowerCase()}`);
export function dayLabel(iso: string, now: Date = new Date()): string {
  const day = dayKey(new Date(iso));
  if (day === dayKey(now)) return 'Today';
  if (day === dayKey(new Date(now.getTime() - 86_400_000))) return 'Yesterday';
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TIME_ZONE });
}
export function groupByDay(entries: AuditEntryView[], now: Date = new Date()): { label: string; entries: AuditEntryView[] }[] {
  const groups: { key: string; label: string; entries: AuditEntryView[] }[] = [];
  for (const entry of entries) {
    const key = dayKey(new Date(entry.at)), last = groups[groups.length - 1];
    if (last && last.key === key) last.entries.push(entry);
    else groups.push({ key, label: dayLabel(entry.at, now), entries: [entry] });
  }
  return groups.map(({ label, entries: items }) => ({ label, entries: items }));
}

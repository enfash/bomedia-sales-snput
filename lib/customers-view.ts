// How the Customers screens read and arrange customers. Pure helpers: no styling, no data access.
import type { CustomerRow } from './server/customers';

/** One customer as the list shows them. Money is whole kobo. `id` is only there when the customer is in the database. */
export type CustomerItem = {
  id?: string; reference?: string; name: string; contact: string; notes: string; orders: number;
  /** Everything the customer has spent (Sheet history plus the new app) when the database can say; otherwise what the books hold. */
  totalKobo: number; paidKobo: number; owedKobo: number; lastOrderDate: string | null; createdAt?: string;
  /** The split of `totalKobo`: spent before the new app (Sheet history) and since. Only when the database can say. */
  beforeKobo?: number; sinceKobo?: number;
};
export type CustomerSort = 'name' | 'orders' | 'spent' | 'owed';
export type SortOrder = 'asc' | 'desc';

/** Lifetime spend and orders when the row carries them, else what the books hold. */
export const spentKobo = (row: CustomerRow) => Number(row.spent_kobo ?? row.total_kobo) || 0;
export const lifetimeOrders = (row: CustomerRow) => Number(row.orders_lifetime ?? row.orders) || 0;

export const fromApi = (row: CustomerRow): CustomerItem => ({
  id: row.id, reference: row.reference, name: row.name, contact: row.contact ?? '', notes: row.notes ?? '', orders: lifetimeOrders(row),
  totalKobo: spentKobo(row), paidKobo: Number(row.paid_kobo) || 0, owedKobo: Number(row.owed_kobo) || 0,
  lastOrderDate: row.last_order_date, createdAt: row.created_at,
  ...(row.spent_before_kobo !== undefined && row.spent_since_kobo !== undefined ? { beforeKobo: Number(row.spent_before_kobo) || 0, sinceKobo: Number(row.spent_since_kobo) || 0 } : {}),
});

const naira = (value: unknown) => Math.round((parseFloat(String(value ?? '0').replace(/[^\d.-]/g, '')) || 0) * 100);
const pick = (row: Record<string, string>, ...keys: string[]) => { for (const key of keys) if (row[key]) return row[key]; return ''; };

/** The old way, for a sheet-backed app: customers are whatever names appear on the sales rows. They have no ID and no profile. */
export function fromSales(sales: Record<string, string>[]): CustomerItem[] {
  const map = new Map<string, CustomerItem>();
  for (const s of sales) {
    const name = (pick(s, 'CLIENT NAME', 'Client Name') || 'Walking Customer').trim();
    const contact = pick(s, 'CONTACT', 'Contact').trim();
    const total = naira(pick(s, 'AMOUNT (₦)', 'Amount (₦)'));
    const paid = naira(pick(s, 'INITIAL PAYMENT (₦)', 'Initial Payment (₦)')) + naira(pick(s, 'ADDITIONAL PAYMENT 1', 'Additional Payment 1')) + naira(pick(s, 'ADDITIONAL PAYMENT 2', 'Additional Payment 2'));
    const date = pick(s, 'DATE', 'Date') || null;
    const existing = map.get(name);
    if (existing) {
      existing.orders += 1; existing.totalKobo += total; existing.paidKobo += paid; existing.owedKobo += Math.max(0, total - paid);
      if (date && (!existing.lastOrderDate || new Date(date) > new Date(existing.lastOrderDate))) existing.lastOrderDate = date;
      if (!existing.contact && contact) existing.contact = contact;
    } else map.set(name, { name, contact, notes: '', orders: 1, totalKobo: total, paidKobo: paid, owedKobo: Math.max(0, total - paid), lastOrderDate: date });
  }
  return [...map.values()];
}

/** Name, phone digits or customer ID, ignoring case; optionally only those who still owe. */
export function filterCustomers(rows: CustomerItem[], search: string, owingOnly: boolean, noPhoneOnly = false): CustomerItem[] {
  const q = search.trim().toLowerCase(), digits = q.replace(/\D/g, '');
  return rows.filter((c) => (!owingOnly || c.owedKobo > 0) && (!noPhoneOnly || !c.contact.trim())
    && (!q || c.name.toLowerCase().includes(q) || (c.reference ?? '').toLowerCase().includes(q) || (digits.length >= 3 && c.contact.replace(/\D/g, '').includes(digits))));
}

export function sortCustomers(rows: CustomerItem[], by: CustomerSort, order: SortOrder): CustomerItem[] {
  const value = (a: CustomerItem, b: CustomerItem) => by === 'name' ? a.name.localeCompare(b.name) : by === 'orders' ? a.orders - b.orders : by === 'spent' ? a.totalKobo - b.totalKobo : a.owedKobo - b.owedKobo;
  return [...rows].sort((a, b) => (order === 'asc' ? value(a, b) : -value(a, b)) || a.name.localeCompare(b.name));
}

export function summarise(rows: CustomerItem[]) {
  const owing = rows.filter((c) => c.owedKobo > 0);
  const top = rows.length ? rows.reduce((best, c) => (c.totalKobo > best.totalKobo ? c : best), rows[0]) : null;
  const topDebtor = owing.length ? owing.reduce((best, c) => (c.owedKobo > best.owedKobo ? c : best), owing[0]) : null;
  return { count: rows.length, owedKobo: owing.reduce((sum, c) => sum + c.owedKobo, 0), owingCount: owing.length, top: top && top.totalKobo > 0 ? top : null, topDebtor };
}

/** ₦400, ₦72k, ₦1.25m: short enough for a badge. */
export function shortNaira(kobo: number): string {
  const n = kobo / 100;
  if (n >= 1_000_000) return `₦${+(n / 1_000_000).toFixed(2)}m`;
  if (n >= 10_000) return `₦${Math.round(n / 1000)}k`;
  return `₦${n.toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;
}
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
export const orderWord = (n: number) => `${n} order${n === 1 ? '' : 's'}`;

const dayFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' });
const clockFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' });
export const dayLabel = (value: string | null | undefined) => { const d = value ? new Date(value) : null; return d && !Number.isNaN(d.getTime()) ? dayFormat.format(d) : '—'; };
export const timeLabel = (value: string) => { const d = new Date(value); return Number.isNaN(d.getTime()) ? '' : clockFormat.format(d); };

export const FIELD_LABEL: Record<string, string> = { name: 'name', contact: 'phone number', notes: 'notes' };
/** The CSV the list exports. */
export function toCsv(rows: CustomerItem[]): string {
  const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  return [['ID', 'Name', 'Phone', 'Orders', 'Spent (₦)', 'Owes (₦)', 'Last order'], ...rows.map((c) => [c.reference ?? '', c.name, c.contact || '', c.orders, (c.totalKobo / 100).toFixed(2), (c.owedKobo / 100).toFixed(2), c.lastOrderDate ?? ''])]
    .map((r) => r.map(cell).join(',')).join('\n');
}

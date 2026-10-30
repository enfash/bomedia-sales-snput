// How one item of an order reads on the customer's Sales tab: plain words, no row numbers or codes. Pure, no styling.
import { koboNaira } from './approvals-view';

/** One item as the profile feed sends it. */
export type SaleItemRaw = { description: string; material?: string | null; quantity?: string | null; width_ft?: string | null; height_ft?: string | null; amount_kobo: string };
export type SaleItem = { name: string; size: string; amount: string };
export type RecordSaleItem = { description: string; amount: number; raw?: Record<string, string> };

const PLAIN_NUMBER = /^\d+(\.\d+)?$/;
const trimNumber = (value: string) => (PLAIN_NUMBER.test(value) ? String(Number(value)) : value);

/** "4.2x4.2in" or "16x8ft" to "4.2 × 4.2 in" or "16 × 8 ft"; anything else is shown as typed. */
function readableSize(raw: string): string {
  const match = raw.trim().match(/^(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(ft|in|m|cm|mm)?$/i);
  return match ? `${trimNumber(match[1])} × ${trimNumber(match[2])} ${(match[3] ?? 'ft').toLowerCase()}` : raw.trim();
}

/** "SAV print job [5x2.5ft]" to its name and size. The size is only taken from square brackets at the end. */
function splitBracketSize(text: string): { name: string; size: string } {
  const match = text.trim().match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
  return match ? { name: match[1].trim() || text.trim(), size: readableSize(match[2]) } : { name: text.trim(), size: '' };
}

/** Opening debts carry the Sheet's own wording: "Opening balance from Sheet row 3833: SAV print job [5x2.5ft] (BOM-…, sold 2026-10-24)". */
export function plainDescription(description: string): string {
  const stripped = description.trim().replace(/^Opening balance from Sheet row \d+:\s*/i, '').replace(/\s*\([^()]*\bsold \d{4}-\d{2}-\d{2}\)\s*$/i, '');
  return stripped || description.trim();
}

export function saleItem(raw: SaleItemRaw): SaleItem {
  const { name, size: bracketSize } = splitBracketSize(plainDescription(raw.description));
  const width = raw.width_ft ? trimNumber(raw.width_ft) : '', height = raw.height_ft ? trimNumber(raw.height_ft) : '';
  const fromJob = width && height && Number(width) > 0 && Number(height) > 0 ? `${width} × ${height} ft` : '';
  const quantity = Number(raw.quantity) > 1 ? `${trimNumber(String(raw.quantity))} pieces` : '';
  return { name, size: [bracketSize || fromJob, quantity].filter(Boolean).join(' · '), amount: koboNaira(Number(raw.amount_kobo) || 0) };
}

/** Use the same item wording on Records and invoices that the customer Sales history uses. */
export function recordSaleItem(record: RecordSaleItem): SaleItem {
  const raw = record.raw ?? {};
  const custom = String(raw.custom ?? raw.CUSTOM ?? '').trim();
  const dimensions = custom.match(/^(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)$/i);
  return saleItem({
    description: record.description,
    quantity: raw.QTY ?? raw.Qty ?? raw.Quantity ?? null,
    width_ft: dimensions?.[1] ?? null,
    height_ft: dimensions?.[2] ?? null,
    amount_kobo: String(Math.round((record.amount || 0) * 100)),
  });
}

/** Opening debts were created together, so the database cannot tell their order apart: put them back in the Sheet's row order. New sales keep the order they were made in. */
export function inSheetOrder(items: SaleItemRaw[]): SaleItemRaw[] {
  const row = (item: SaleItemRaw) => Number(item.description.match(/^Opening balance from Sheet row (\d+):/i)?.[1] ?? NaN);
  return items.every((item) => Number.isFinite(row(item))) ? [...items].sort((a, b) => row(a) - row(b)) : items;
}

export const itemCount = (count: number) => `${count} item${count === 1 ? '' : 's'}`;

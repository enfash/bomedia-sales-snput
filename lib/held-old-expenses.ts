import { legacyQueueHold, type PaymentContext } from './payment-outbox';
import { dayFromText, naira } from './expense-list';
import { parseAmount } from './financial-utils';
import type { QueueItem } from './store';

// Expenses saved on a phone under the old Sheets app and still waiting when Postgres took over. The sync manager holds
// them (it never sends them), so this turns each one into plain words and into the values the Log expense form takes.

export type HeldExpenseLine = {
  date: string; amount: string; category: string; description: string; paidTo: string; paymentMethod: string; status: 'Paid' | 'Unpaid';
  /** The old receipt link points at the old storage, so it is not carried over. */
  hadReceipt: boolean;
};
export type HeldExpense = { id: string; savedAt: number; lines: HeldExpenseLine[] };

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

function lineFrom(raw: unknown): HeldExpenseLine | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const amount = text(row.AMOUNT) || (typeof row.AMOUNT === 'number' ? String(row.AMOUNT) : '');
  if (!(parseAmount(amount) > 0)) return null;
  return {
    date: dayFromText(text(row.DATE)), amount: String(parseAmount(amount)), category: text(row.CATEGORY), description: text(row.DESCRIPTION),
    paidTo: text(row['PAID TO']), paymentMethod: text(row['PAYMENT METHOD']), status: text(row.STATUS) === 'Paid' ? 'Paid' : 'Unpaid',
    hadReceipt: text(row['RECEIPT URL']) !== '',
  };
}

/** Held old expenses on this device. Empty unless Postgres is in charge, because Sheets mode still sends them. */
export function heldOldExpenses(queue: QueueItem[], backend: PaymentContext['backend'] | null): HeldExpense[] {
  if (backend !== 'postgres') return [];
  const held: HeldExpense[] = [];
  for (const item of queue) {
    if (item.type !== 'expense' || !legacyQueueHold(item, backend)) continue;
    const rows = item.data && item.data.batch === true && Array.isArray(item.data.items) ? item.data.items : [item.data];
    const lines = rows.map(lineFrom).filter((line: HeldExpenseLine | null): line is HeldExpenseLine => line !== null);
    if (lines.length) held.push({ id: item.id, savedAt: item.timestamp, lines });
  }
  return held;
}

/** One line in plain words, e.g. "₦4,500 · Transport · Bolt · 24 Oct". */
export function describeHeldLine(line: HeldExpenseLine): string {
  const day = line.date ? new Date(`${line.date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '';
  return [naira(parseAmount(line.amount)), line.category, line.paidTo || line.description, day].filter(Boolean).join(' · ');
}

/** The form's row shape. The receipt link is left out on purpose. */
export function prefillRow(line: HeldExpenseLine): Record<string, string> {
  return { DATE: line.date, AMOUNT: line.amount, CATEGORY: line.category, DESCRIPTION: line.description, 'PAID TO': line.paidTo, 'PAYMENT METHOD': line.paymentMethod, 'RECEIPT URL': '', STATUS: line.status };
}

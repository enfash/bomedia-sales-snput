import { parseAmount } from '@/lib/financial-utils';

export type Expense = {
  _expenseId?: string; _amountKobo?: string; _payable?: boolean; _backend?: string;
  "EXPENSE ID"?: string;
  _rowIndex?: number;
  DATE: string; AMOUNT: string; CATEGORY: string; DESCRIPTION: string;
  "PAID TO": string; "PAYMENT METHOD": string; "RECEIPT URL": string;
  "Logged By": string; STATUS: string; "PAID BY": string; "PAID AT": string; TIMESTAMP: string;
};

export type StatusFilter = 'All' | 'Unpaid' | 'Paid';
export type ExpenseDay = { date: string; label: string; total: number; items: Expense[] };
export type ExpenseSummary = { monthSpent: number; monthCount: number; monthStart: string; owed: number; owedCount: number; paid: number; paidCount: number };

export const expenseAmount = (expense: Expense) => parseAmount(expense.AMOUNT);
export const isPaidExpense = (expense: Expense) => expense.STATUS === 'Paid';

/** The calendar day a date text belongs to, as YYYY-MM-DD, or '' when it cannot be read. */
export function dayFromText(text: string): string {
  const raw = (text || '').trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

/** The calendar day an expense belongs to, as YYYY-MM-DD, or '' when its date cannot be read. */
export const expenseDay = (expense: Expense): string => dayFromText(expense.DATE);

/** Whole naira without decimals, otherwise exactly two (₦700, ₦2,000.01). */
export function naira(value: number): string {
  const kobo = Math.round(Math.abs(value) * 100);
  const whole = Math.floor(kobo / 100).toLocaleString('en-NG');
  const cents = kobo % 100;
  return `${value < 0 ? '-' : ''}₦${whole}${cents ? `.${String(cents).padStart(2, '0')}` : ''}`;
}

const dayBefore = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
};

// Fixed three-letter names: Intl writes "Sept" on some devices.
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** "TODAY · 11 OCT", "YESTERDAY · 10 OCT", otherwise "9 OCT 2026". */
export function dayLabel(date: string, today: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const short = `${d} ${MONTHS[m - 1]}`;
  if (date === today) return `TODAY · ${short}`;
  if (date === dayBefore(today)) return `YESTERDAY · ${short}`;
  return y === Number(today.slice(0, 4)) ? short : `${short} ${y}`;
}

/** "1 Oct" for the first day of the month a summary covers. */
export const sinceLabel = (monthStart: string) => `1 ${MONTHS[Number(monthStart.slice(5, 7)) - 1][0]}${MONTHS[Number(monthStart.slice(5, 7)) - 1].slice(1).toLowerCase()}`;

export function summarise(expenses: Expense[], today: string): ExpenseSummary {
  const month = today.slice(0, 7);
  const summary: ExpenseSummary = { monthSpent: 0, monthCount: 0, monthStart: `${month}-01`, owed: 0, owedCount: 0, paid: 0, paidCount: 0 };
  for (const expense of expenses) {
    const amount = expenseAmount(expense);
    if (!isPaidExpense(expense)) { summary.owed += amount; summary.owedCount += 1; }
    if (!expenseDay(expense).startsWith(month)) continue;
    summary.monthSpent += amount; summary.monthCount += 1;
    if (isPaidExpense(expense)) { summary.paid += amount; summary.paidCount += 1; }
  }
  return summary;
}

export function filterExpenses(expenses: Expense[], status: StatusFilter, query: string): Expense[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return expenses.filter((expense) => {
    if (status === 'Paid' && !isPaidExpense(expense)) return false;
    if (status === 'Unpaid' && isPaidExpense(expense)) return false;
    if (!words.length) return true;
    const haystack = [expense.CATEGORY, expense['PAID TO'], expense.DESCRIPTION, expense['Logged By'], expense.AMOUNT].join(' ').toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

/** Newest day first; expenses with an unreadable date go last under their own heading. */
export function groupByDay(expenses: Expense[], today: string): ExpenseDay[] {
  const days = new Map<string, Expense[]>();
  for (const expense of expenses) {
    const key = expenseDay(expense);
    days.set(key, [...(days.get(key) ?? []), expense]);
  }
  return [...days.entries()]
    .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : b.localeCompare(a)))
    .map(([date, items]) => ({ date, label: date ? dayLabel(date, today) : 'NO DATE', total: items.reduce((sum, item) => sum + expenseAmount(item), 0), items }));
}

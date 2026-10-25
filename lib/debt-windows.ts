// How much customers still owe from today's jobs and from the last 7 days. Pure: the same rule the cashier home used.
import { isSameDay, isWithinInterval, subDays } from 'date-fns';

import { processDebtData } from './financial-utils';

const dateOf = (row: Record<string, unknown>) => new Date(String(row.DATE || row.Date || ''));

export function debtWindows(sales: Record<string, unknown>[], now = new Date()) {
  const today = sales.filter((row) => { const d = dateOf(row); return !Number.isNaN(d.getTime()) && isSameDay(d, now); });
  const week = sales.filter((row) => { const d = dateOf(row); return !Number.isNaN(d.getTime()) && isWithinInterval(d, { start: subDays(now, 7), end: now }); });
  const day = processDebtData(today), last7 = processDebtData(week);
  return { today: day.totalDebt, todayCount: day.count, week: last7.totalDebt, weekCount: last7.count };
}

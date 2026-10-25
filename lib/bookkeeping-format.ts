// Calendar-date wording for the Bookkeeping period page. Dates are plain "YYYY-MM-DD" values with no time zone, so everything
// here works in UTC to avoid the day ever shifting.
const parts = (value: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null; };
const fmt = (date: Date, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' }).format(date);
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);
const monthEnd = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));

/** "31 October 2026" */
export function longDate(value: string): string { const d = parts(value); return d ? fmt(d, { day: 'numeric', month: 'long', year: 'numeric' }) : value; }
/** "October 2026" */
export function monthYear(value: string): string { const d = parts(value); return d ? fmt(d, { month: 'long', year: 'numeric' }) : value; }

/**
 * The next month that will become closable and the day it does: the month after the last closed day (or the start of the books),
 * which can be closed from the 1st of the following month. The year is added only when it is not the current one.
 */
export function nextCloseWindow(startsOn: string, closedThrough: string | null, today: string): { month: string; opensOn: string } | null {
  const start = parts(startsOn), closed = closedThrough ? parts(closedThrough) : null, now = parts(today);
  if (!start || !now || (closedThrough && !closed)) return null;
  const base = closed ? addDays(closed, 1) : start;
  const opens = addDays(monthEnd(base), 1);
  return { month: fmt(base, { month: 'long' }), opensOn: fmt(opens, opens.getUTCFullYear() === now.getUTCFullYear() ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' }) };
}

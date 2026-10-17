import { describe, expect, it } from 'vitest';
import { dayLabel, shortDay, sinceLabel, expenseDay, filterExpenses, groupByDay, naira, summarise, type Expense } from './expense-list';

const make = (over: Partial<Expense>): Expense => ({
  DATE: '2026-10-11', AMOUNT: '500', CATEGORY: 'Ink', DESCRIPTION: '', 'PAID TO': '', 'PAYMENT METHOD': '', 'RECEIPT URL': '',
  'Logged By': 'Ada', STATUS: 'Paid', 'PAID BY': '', 'PAID AT': '', TIMESTAMP: '', ...over,
});

// The five sandbox expenses from the design: Transport is made unpaid so every state shows.
const sample: Expense[] = [
  make({ CATEGORY: 'Ink', AMOUNT: '700', 'PAID TO': 'Test shop', DESCRIPTION: 'Tunde ink' }),
  make({ CATEGORY: 'Ink', AMOUNT: '500', 'PAID TO': 'Test shop', DESCRIPTION: 'Ada ink' }),
  make({ CATEGORY: 'Equipment', AMOUNT: '1,000', 'PAID TO': 'Test shop', DESCRIPTION: 'Ada equipment' }),
  make({ CATEGORY: 'Transport', AMOUNT: '2000.01', DATE: '2026-10-10', STATUS: 'Unpaid', 'PAID TO': 'Sandbox test driver', DESCRIPTION: 'Delivery' }),
  make({ CATEGORY: 'Office Supplies', AMOUNT: '₦1,234.56', DATE: '2026-10-10', 'PAID TO': 'Sandbox test supplier', DESCRIPTION: 'Stationery' }),
];

describe('naira', () => {
  it('drops the decimals only when there are none', () => {
    expect(naira(700)).toBe('₦700');
    expect(naira(2000.01)).toBe('₦2,000.01');
    expect(naira(1234.5)).toBe('₦1,234.50');
    expect(naira(0)).toBe('₦0');
  });
});

describe('expenseDay', () => {
  it('reads ISO dates and timestamps without shifting the day', () => {
    expect(expenseDay(make({ DATE: '2026-10-11' }))).toBe('2026-10-11');
    expect(expenseDay(make({ DATE: '2026-10-11T23:30:00.000Z' }))).toBe('2026-10-11');
  });
  it('returns an empty day for text that is not a date', () => {
    expect(expenseDay(make({ DATE: '' }))).toBe('');
    expect(expenseDay(make({ DATE: 'soon' }))).toBe('');
  });
});

describe('dayLabel', () => {
  it('names today and yesterday, then plain dates', () => {
    expect(dayLabel('2026-10-11', '2026-10-11')).toBe('TODAY · 11 OCT');
    expect(dayLabel('2026-10-10', '2026-10-11')).toBe('YESTERDAY · 10 OCT');
    expect(dayLabel('2026-10-03', '2026-10-11')).toBe('3 OCT');
    expect(dayLabel('2025-12-31', '2026-10-11')).toBe('31 DEC 2025');
  });
  it('knows yesterday across a month boundary', () => {
    expect(dayLabel('2026-09-30', '2026-10-01')).toBe('YESTERDAY · 30 SEP');
  });
});

describe('summarise', () => {
  it('totals the month, what is paid, and what is still owed', () => {
    const summary = summarise(sample, '2026-10-11');
    expect(summary.monthSpent).toBeCloseTo(5434.57, 2);
    expect(summary.monthCount).toBe(5);
    expect(summary.owed).toBeCloseTo(2000.01, 2);
    expect(summary.owedCount).toBe(1);
    expect(summary.paid).toBeCloseTo(3434.56, 2);
    expect(summary.paidCount).toBe(4);
  });
  it('counts unpaid expenses from earlier months as owed, but not as spent this month', () => {
    const old = make({ DATE: '2026-08-02', AMOUNT: '9000', STATUS: 'Unpaid' });
    const summary = summarise([...sample, old], '2026-10-11');
    expect(summary.owed).toBeCloseTo(11000.01, 2);
    expect(summary.monthSpent).toBeCloseTo(5434.57, 2);
  });
  it('treats an empty status as unpaid', () => {
    expect(summarise([make({ STATUS: '' })], '2026-10-11').owedCount).toBe(1);
  });
});

describe('filterExpenses', () => {
  it('filters by status', () => {
    expect(filterExpenses(sample, 'Unpaid', '').map((e) => e.CATEGORY)).toEqual(['Transport']);
    expect(filterExpenses(sample, 'Paid', '')).toHaveLength(4);
    expect(filterExpenses(sample, 'All', '')).toHaveLength(5);
  });
  it('searches category, payee and note together, ignoring case', () => {
    expect(filterExpenses(sample, 'All', 'ink')).toHaveLength(2);
    expect(filterExpenses(sample, 'All', 'DRIVER')).toHaveLength(1);
    expect(filterExpenses(sample, 'All', 'ink tunde')).toHaveLength(1);
    expect(filterExpenses(sample, 'All', 'zzz')).toHaveLength(0);
  });
  it('combines status and search', () => {
    expect(filterExpenses(sample, 'Unpaid', 'ink')).toHaveLength(0);
  });
});

describe('groupByDay', () => {
  it('groups newest first with a total per day', () => {
    const days = groupByDay(sample, '2026-10-11');
    expect(days.map((d) => d.label)).toEqual(['TODAY · 11 OCT', 'YESTERDAY · 10 OCT']);
    expect(days[0].total).toBeCloseTo(2200, 2);
    expect(days[1].total).toBeCloseTo(3234.57, 2);
    expect(days[0].items).toHaveLength(3);
  });
  it('puts an expense with no readable date last under its own heading', () => {
    const days = groupByDay([make({ DATE: 'soon' }), ...sample], '2026-10-11');
    expect(days.at(-1)?.label).toBe('NO DATE');
  });
});

describe('sinceLabel', () => {
  it('names the first day of the month', () => {
    expect(sinceLabel('2026-10-01')).toBe('1 Oct');
    expect(sinceLabel('2026-09-01')).toBe('1 Sep');
  });
});

describe('shortDay', () => {
  it('reads a day as "8 Oct"', () => {
    expect(shortDay('2026-10-08')).toBe('8 Oct');
    expect(shortDay('2026-09-30')).toBe('30 Sep');
  });
});

import { describe, expect, it } from 'vitest';
import { buildRecords, filterByDate, filterRecords, groupStatus, groupUnits, mapExpense, mapSale, parseSheetDate, sortRecords, summarise, type Row } from './records-view';

// Local-time dates, so these hold in any time zone (a bare "2026-10-11" is read as UTC midnight).
const NOW = new Date(2026, 9, 11, 14, 0, 0);
const sale = (over: Row = {}): Row => ({
  DATE: '2026-10-11T09:00:00', 'CLIENT NAME': 'Adeola Stores', 'JOB DESCRIPTION': 'Flex print job', 'AMOUNT (₦)': '₦10,000',
  'PAYMENT STATUS': 'Unpaid', 'AMOUNT DIFFERENCES': '10000', 'Logged By': 'Ada', 'Sales ID': '', _rowIndex: '2', ...over,
});
const expense = (over: Row = {}): Row => ({ DATE: '2026-10-11T08:00:00', AMOUNT: '₦184,000.00', 'PAID TO': 'Test shop', CATEGORY: 'Ink', DESCRIPTION: '', 'Logged By': 'Tunde', _rowIndex: '3', ...over });

describe('mapSale', () => {
  it('maps the sheet payment status to the status the page shows', () => {
    expect(mapSale(sale({ 'PAYMENT STATUS': 'Paid' }), false).status).toBe('Settled');
    expect(mapSale(sale({ 'PAYMENT STATUS': 'Part-payment' }), false).status).toBe('Part-payment');
    expect(mapSale(sale({ 'PAYMENT STATUS': 'Unpaid' }), false).status).toBe('In Progress');
    expect(mapSale(sale({ 'PAYMENT STATUS': '' }), false).status).toBe('In Progress');
  });
  it('shows a waiting entry as Syncing whatever its payment status says', () => {
    expect(mapSale(sale({ 'PAYMENT STATUS': 'Paid' }), true, 5).status).toBe('Syncing');
  });
  it('reads currency-formatted amounts and keeps the sign of the sheet difference column', () => {
    const paid = mapSale(sale({ 'AMOUNT (₦)': '₦1,530,383.30', 'AMOUNT DIFFERENCES': '-250' }), false);
    expect(paid.amount).toBeCloseTo(1530383.3, 2);
    expect(paid.balance).toBe(-250);
  });
  it('fills defaults for missing fields', () => {
    const r = mapSale({}, false);
    expect(r.client).toBe('N/A');
    expect(r.description).toBe('—');
    expect(r.loggedBy).toBe('Unknown');
    expect(r.jobStatus).toBe('Quoted');
    expect(r.date).toBe('N/A');
    expect(r.salesId).toBe('');
  });
  it('writes the date as "Oct 11, 2026"', () => {
    expect(parseSheetDate('2026-10-11T09:00:00')).toBe('Oct 11, 2026');
    expect(parseSheetDate('not a date')).toBe('not a date');
  });
  it('reads the row number and the sales ID under either spelling', () => {
    const r = mapSale(sale({ 'Sales ID': '', 'SALES ID': 'BOM-1', _rowIndex: '7' }), false);
    expect(r.salesId).toBe('BOM-1');
    expect(r.rowIndex).toBe(7);
  });
});

describe('mapExpense', () => {
  it('does not lose a currency-formatted amount', () => {
    expect(mapExpense(expense(), false).amount).toBe(184000);
  });
  it('reads an unpaid expense as In Progress and a paid or status-less one as Settled', () => {
    expect(mapExpense(expense({ STATUS: 'Unpaid' }), false).status).toBe('In Progress');
    expect(mapExpense(expense({ STATUS: 'Paid' }), false).status).toBe('Settled');
    expect(mapExpense(expense(), false).status).toBe('Settled');
    expect(mapExpense(expense({ STATUS: 'Unpaid' }), true).status).toBe('Syncing');
  });
  it('is settled unless it is waiting, names the payee, and falls back to the category', () => {
    const r = mapExpense(expense(), false);
    expect(r.status).toBe('Settled');
    expect(r.client).toBe('Test shop');
    expect(r.description).toBe('Ink');
    expect(mapExpense(expense(), true).status).toBe('Syncing');
  });
});

describe('buildRecords', () => {
  const queue = [
    { type: 'sale', timestamp: 10, data: ['2026-10-11', 'Grace Church', 'Banner', '0803', 'Flex', 0, 0, 0, 0, 0, 0, 0, 1, 0, '0', 0, 0, 0, 0, 'Unpaid', 'Quoted', 'Ada', 'BOM-9'] },
    { type: 'expense', timestamp: 11, data: { batch: true, items: [expense({ CATEGORY: 'Transport' }), expense({ CATEGORY: 'Ink' })] } },
    { type: 'expense', timestamp: 12, data: expense({ CATEGORY: 'Equipment' }) },
    { type: 'payment', timestamp: 13, data: {} },
  ];
  const input = { sales: [sale()], expenses: [expense()], queue };

  it('lists waiting sales, waiting expenses, saved sales, then saved expenses for the owner', () => {
    const records = buildRecords('owner', input);
    expect(records.map((r) => `${r.type}:${r.isPending ? 'waiting' : 'saved'}`)).toEqual([
      'Sale:waiting', 'Expense:waiting', 'Expense:waiting', 'Expense:waiting', 'Sale:saved', 'Expense:saved',
    ]);
  });
  it('turns a waiting sale entry into a Syncing row with a zero balance', () => {
    const [first] = buildRecords('owner', input);
    expect(first).toMatchObject({ client: 'Grace Church', status: 'Syncing', balance: 0, salesId: 'BOM-9', loggedBy: 'Ada', isPending: true, timestamp: 10 });
  });
  it('gives the cashier sales only', () => {
    const records = buildRecords('cashier', input);
    expect(records.every((r) => r.type === 'Sale')).toBe(true);
    expect(records).toHaveLength(2);
  });
});

describe('filterByDate: owner', () => {
  const records = buildRecords('owner', { sales: [sale({ DATE: '2026-10-11T09:00:00' }), sale({ DATE: '2026-10-01T09:00:00' }), sale({ DATE: '2026-08-01T09:00:00' })], expenses: [], queue: [] });
  const none = { start: '', end: '' };
  it('keeps everything for all time', () => { expect(filterByDate('owner', records, 'all', none, NOW)).toHaveLength(3); });
  it('keeps the last 7 and 30 days', () => {
    expect(filterByDate('owner', records, '7d', none, NOW)).toHaveLength(1);
    expect(filterByDate('owner', records, '30d', none, NOW)).toHaveLength(2);
  });
  it('keeps a custom range, whole end day included', () => {
    expect(filterByDate('owner', records, 'custom', { start: '2026-10-01', end: '2026-10-11' }, NOW)).toHaveLength(2);
  });
  it('keeps a record whose date cannot be read', () => {
    const odd = buildRecords('owner', { sales: [sale({ DATE: 'soon' })], expenses: [], queue: [] });
    expect(filterByDate('owner', odd, '7d', none, NOW)).toHaveLength(1);
  });
});

describe('filterByDate: cashier', () => {
  const none = { start: '', end: '' };
  const records = buildRecords('cashier', { sales: [
    sale({ DATE: '2026-10-11T09:00:00', 'AMOUNT DIFFERENCES': '0' }),
    sale({ DATE: '2026-10-08T09:00:00', 'AMOUNT DIFFERENCES': '500' }),
    sale({ DATE: '2026-10-08T09:00:00', 'AMOUNT DIFFERENCES': '0' }),
    sale({ DATE: '2026-09-01T09:00:00', 'AMOUNT DIFFERENCES': '9000' }),
  ], expenses: [], queue: [] });
  it('shows today plus anything from the last week that is still owed', () => {
    const shown = filterByDate('cashier', records, 'today', none, NOW);
    expect(shown.map((r) => r.balance)).toEqual([0, 500]);
  });
  it('drops a sale with no readable date', () => {
    const odd = buildRecords('cashier', { sales: [sale({ DATE: '' }), sale({ DATE: 'soon' })], expenses: [], queue: [] });
    expect(filterByDate('cashier', odd, '30d', none, NOW)).toHaveLength(0);
  });
  it('shows nothing for a custom range that is not filled in', () => {
    expect(filterByDate('cashier', records, 'custom', none, NOW)).toHaveLength(0);
  });
});

describe('filterRecords', () => {
  const records = buildRecords('owner', {
    sales: [sale({ 'CLIENT NAME': 'Adeola Stores', 'AMOUNT DIFFERENCES': '500' }), sale({ 'CLIENT NAME': 'Settled Co', 'AMOUNT DIFFERENCES': '0', 'PAYMENT STATUS': 'Paid' })],
    expenses: [expense({ 'PAID TO': 'Adeola Supplies' })],
    queue: [],
  });
  it('searches client, description and, for the owner, the date', () => {
    expect(filterRecords('owner', records, { search: 'adeola', tab: 'All', sortBy: 'date' })).toHaveLength(2);
    // A sale's date reads "Oct 11, 2026" but an expense keeps its raw date text, so only sales match this search (as before).
    expect(filterRecords('owner', records, { search: 'Oct 11', tab: 'All', sortBy: 'date' })).toHaveLength(2);
    const cashierRows = buildRecords('cashier', { sales: [sale()], expenses: [], queue: [] });
    expect(filterRecords('cashier', cashierRows, { search: 'Oct 11', tab: 'All', sortBy: 'date' })).toHaveLength(0);
  });
  it('splits sales and expenses by tab', () => {
    expect(filterRecords('owner', records, { search: '', tab: 'Sales', sortBy: 'date' })).toHaveLength(2);
    expect(filterRecords('owner', records, { search: '', tab: 'Expenses', sortBy: 'date' })).toHaveLength(1);
  });
  it('sorting by debt keeps only sales that still owe, and drops expenses and settled sales', () => {
    const shown = filterRecords('owner', records, { search: '', tab: 'All', sortBy: 'debt' });
    expect(shown).toHaveLength(1);
    expect(shown[0].client).toBe('Adeola Stores');
  });
  it('treats a balance inside half a naira as square', () => {
    const near = buildRecords('cashier', { sales: [sale({ 'AMOUNT DIFFERENCES': '0.4' })], expenses: [], queue: [] });
    expect(filterRecords('cashier', near, { search: '', tab: 'All', sortBy: 'debt' })).toHaveLength(0);
  });
  it('the Pending tab keeps only waiting entries', () => {
    const queue = [{ type: 'sale', timestamp: 1, data: ['2026-10-11', 'Grace Church', 'Banner', '', 'Flex', 0, 0, 0, 0, 0, 0, 0, 1, 0, '0', 0, 0, 0, 0, 'Unpaid', 'Quoted', 'Ada', ''] }];
    const rows = buildRecords('cashier', { sales: [sale()], expenses: [], queue });
    expect(filterRecords('cashier', rows, { search: '', tab: 'Pending', sortBy: 'date' })).toHaveLength(1);
  });
});

describe('sortRecords', () => {
  const rows = buildRecords('owner', { sales: [
    sale({ DATE: '2026-10-10T09:00:00', 'CLIENT NAME': 'Zed', _rowIndex: '4', 'AMOUNT DIFFERENCES': '100' }),
    sale({ DATE: '2026-10-11T09:00:00', 'CLIENT NAME': 'Amy', _rowIndex: '2', 'AMOUNT DIFFERENCES': '900' }),
    sale({ DATE: '2026-10-11T09:00:00', 'CLIENT NAME': 'Bob', _rowIndex: '3', 'AMOUNT DIFFERENCES': '0' }),
  ], expenses: [expense({ DATE: '2026-10-11T09:00:00', 'PAID TO': 'Cee' })], queue: [] });
  it('puts the newest first by default, then the order they were saved', () => {
    expect(sortRecords('owner', rows, 'date', 'desc').map((r) => r.client)).toEqual(['Cee', 'Bob', 'Amy', 'Zed']);
    expect(sortRecords('owner', rows, 'date', 'asc').map((r) => r.client)).toEqual(['Zed', 'Amy', 'Bob', 'Cee']);
  });
  it('sorts by name', () => {
    expect(sortRecords('owner', rows, 'name', 'asc').map((r) => r.client)).toEqual(['Amy', 'Bob', 'Cee', 'Zed']);
  });
  it('sorts by debt, with an expense counting as no debt for the owner', () => {
    expect(sortRecords('owner', rows, 'debt', 'desc').map((r) => r.client).slice(0, 2)).toEqual(['Amy', 'Zed']);
  });
  it('puts a waiting entry after a saved one on the same day', () => {
    const queue = [{ type: 'sale', timestamp: 1, data: ['2026-10-11T09:00:00', 'Waiting Co', 'x', '', 'Flex', 0, 0, 0, 0, 0, 0, 0, 1, 0, '0', 0, 0, 0, 0, 'Unpaid', 'Quoted', 'Ada', ''] }];
    const mixed = buildRecords('cashier', { sales: [sale({ 'CLIENT NAME': 'Saved Co' })], expenses: [], queue });
    expect(sortRecords('cashier', mixed, 'date', 'asc').map((r) => r.client)).toEqual(['Saved Co', 'Waiting Co']);
  });
});

describe('summarise', () => {
  it('totals sales, expenses, profit and what is still owed', () => {
    const rows = buildRecords('owner', { sales: [
      sale({ 'AMOUNT (₦)': '1000', 'AMOUNT DIFFERENCES': '400' }),
      sale({ 'AMOUNT (₦)': '2000', 'AMOUNT DIFFERENCES': '-50' }),
      sale({ 'AMOUNT (₦)': '500', 'AMOUNT DIFFERENCES': '0' }),
    ], expenses: [expense({ AMOUNT: '₦300' })], queue: [] });
    expect(summarise(rows)).toEqual({ sales: 3500, salesCount: 3, expenses: 300, expenseCount: 1, net: 3200, owed: 400, owedCount: 1 });
  });
  it('never lets an overpayment offset a debt', () => {
    const rows = buildRecords('owner', { sales: [sale({ 'AMOUNT DIFFERENCES': '1000' }), sale({ 'AMOUNT DIFFERENCES': '-900' })], expenses: [], queue: [] });
    expect(summarise(rows).owed).toBe(1000);
  });
});

describe('groupUnits and groupStatus', () => {
  const rows = buildRecords('owner', { sales: [
    sale({ 'CLIENT NAME': 'A', 'Sales ID': 'BOM-1', 'PAYMENT STATUS': 'Paid' }),
    sale({ 'CLIENT NAME': 'Solo', 'Sales ID': '' }),
    sale({ 'CLIENT NAME': 'A', 'Sales ID': 'BOM-1', 'PAYMENT STATUS': 'Part-payment' }),
  ], expenses: [expense({ 'Sales ID': 'BOM-1' })], queue: [] });
  it('folds sales with the same ID into one batch at the first item\'s place', () => {
    const units = groupUnits(rows);
    expect(units.map((u) => (u.type === 'group' ? `group:${u.salesId}:${u.items.length}` : `flat:${u.record.client}`))).toEqual(['group:BOM-1:2', 'flat:Solo', 'flat:Test shop']);
  });
  it('reads a batch status from its items', () => {
    const [a, , b] = rows;
    expect(groupStatus([a, b])).toBe('Part-payment');
    expect(groupStatus([a])).toBe('Settled');
    expect(groupStatus([{ ...a, status: 'Syncing' }, b])).toBe('Syncing');
    expect(groupStatus([{ ...a, status: 'In Progress' }, { ...b, status: 'Settled' }])).toBe('In Progress');
  });
});

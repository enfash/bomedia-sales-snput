import { describe, expect, it } from 'vitest';
import { filterCustomers, fromApi, fromSales, initials, shortNaira, sortCustomers, summarise, toCsv, type CustomerItem } from './customers-view';

const c = (over: Partial<CustomerItem>): CustomerItem => ({ name: 'A', contact: '', notes: '', orders: 1, totalKobo: 0, paidKobo: 0, owedKobo: 0, lastOrderDate: null, ...over });
const rows = [
  c({ id: '1', reference: 'CUS-0001', name: 'Adeola Stores', contact: '0803 111 2222', orders: 4, totalKobo: 137000000, owedKobo: 125000000 }),
  c({ id: '2', reference: 'CUS-0002', name: 'Grace Chapel', contact: '0803', orders: 1, totalKobo: 960000 }),
  c({ id: '3', reference: 'CUS-0007', name: 'Zed Events', orders: 2, totalKobo: 3600000 }),
];

describe('filter and sort', () => {
  it('lists only customers with no phone number, and combines that with search', () => {
    expect(filterCustomers(rows, '', false, true).map((r) => r.name)).toEqual(['Zed Events']);
    expect(filterCustomers(rows, 'adeola', false, true)).toEqual([]);
    expect(filterCustomers(rows, '', false, false)).toHaveLength(3);
  });
  it('finds by name, customer ID or phone digits, ignoring case and spacing', () => {
    expect(filterCustomers(rows, 'adeola', false).map((r) => r.reference)).toEqual(['CUS-0001']);
    expect(filterCustomers(rows, 'cus-0007', false).map((r) => r.name)).toEqual(['Zed Events']);
    expect(filterCustomers(rows, '0803 111', false).map((r) => r.name)).toEqual(['Adeola Stores']);
    expect(filterCustomers(rows, '', false)).toHaveLength(3);
  });
  it('can show only customers who owe', () => {
    expect(filterCustomers(rows, '', true).map((r) => r.name)).toEqual(['Adeola Stores']);
  });
  it('sorts by each column in both directions, falling back to the name', () => {
    expect(sortCustomers(rows, 'name', 'asc').map((r) => r.name)).toEqual(['Adeola Stores', 'Grace Chapel', 'Zed Events']);
    expect(sortCustomers(rows, 'spent', 'desc').map((r) => r.name)).toEqual(['Adeola Stores', 'Zed Events', 'Grace Chapel']);
    expect(sortCustomers(rows, 'owed', 'desc')[0].name).toBe('Adeola Stores');
    expect(sortCustomers(rows, 'orders', 'asc')[0].name).toBe('Grace Chapel');
  });
});

describe('summary and wording', () => {
  it('counts customers, who owes and the top spender', () => {
    expect(summarise(rows)).toMatchObject({ count: 3, owingCount: 1, owedKobo: 125000000 });
    expect(summarise(rows).top?.name).toBe('Adeola Stores');
    expect(summarise(rows).topDebtor?.name).toBe('Adeola Stores');
    expect(summarise([])).toEqual({ count: 0, owedKobo: 0, owingCount: 0, top: null, topDebtor: null });
  });
  it('shortens money for badges', () => {
    expect(shortNaira(40000)).toBe('₦400');
    expect(shortNaira(7200000)).toBe('₦72k');
    expect(shortNaira(125000000)).toBe('₦1.25m');
  });
  it('makes initials', () => {
    expect(initials('Adeola Stores')).toBe('AS');
    expect(initials('  ')).toBe('?');
  });
});

describe('sources', () => {
  it('reads the database row into numbers', () => {
    const item = fromApi({ id: 'x', reference: 'CUS-0001', name: 'N', contact: '', notes: '', orders: 2, total_kobo: '500', paid_kobo: '200', owed_kobo: '300', last_order_date: '2026-10-12', created_at: '2026-10-03' });
    expect(item).toMatchObject({ id: 'x', orders: 2, totalKobo: 500, owedKobo: 300, lastOrderDate: '2026-10-12' });
  });
  it('groups sheet rows by name when there is no database, as before', () => {
    const sheet = [
      { 'CLIENT NAME': 'Ada', CONTACT: '', 'AMOUNT (₦)': '1000', 'INITIAL PAYMENT (₦)': '400', DATE: '2026-10-01' },
      { 'CLIENT NAME': 'Ada', CONTACT: '0803', 'AMOUNT (₦)': '500', 'INITIAL PAYMENT (₦)': '500', DATE: '2026-10-05' },
    ];
    expect(fromSales(sheet)).toEqual([{ name: 'Ada', contact: '0803', notes: '', orders: 2, totalKobo: 150000, paidKobo: 90000, owedKobo: 60000, lastOrderDate: '2026-10-05' }]);
  });
  it('exports a quoted CSV', () => {
    expect(toCsv([c({ reference: 'CUS-0001', name: 'A "B"', totalKobo: 100 })])).toContain('"CUS-0001","A ""B""","","1","1.00","0.00",""');
  });
});

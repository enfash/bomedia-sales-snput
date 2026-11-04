import { describe, expect, it } from 'vitest';
import { buildCashierOrders, owingOrders, reminderText } from './cashier-home-view';
import type { Row } from './records-view';

const job = (over: Row): Row => ({
  DATE: '2026-11-03',
  'CLIENT NAME': 'Adaeze',
  'CONTACT': '0803 111 2222',
  'JOB DESCRIPTION': 'Banner',
  'MATERIAL': 'Vinyl',
  'AMOUNT (₦)': '0',
  'AMOUNT DIFFERENCES': '0',
  'INITIAL PAYMENT (₦)': '0',
  'PAYMENT STATUS': 'Unpaid',
  'JOB STATUS': 'Printing',
  ...over,
});

// A 5-job order: total ₦200,000, ₦110,000 in, ₦90,000 still owed.
const bigOrder: Row[] = [
  job({ 'SALES ID': 'SO-1042', 'JOB DESCRIPTION': 'Banner', 'AMOUNT (₦)': '50000', 'AMOUNT DIFFERENCES': '0', 'INITIAL PAYMENT (₦)': '50000', 'PAYMENT STATUS': 'Paid' }),
  job({ 'SALES ID': 'SO-1042', 'JOB DESCRIPTION': 'Flyers', 'AMOUNT (₦)': '20000', 'AMOUNT DIFFERENCES': '20000', 'PAYMENT STATUS': 'Unpaid' }),
  job({ 'SALES ID': 'SO-1042', 'JOB DESCRIPTION': 'Stickers', 'AMOUNT (₦)': '30000', 'AMOUNT DIFFERENCES': '30000', 'PAYMENT STATUS': 'Unpaid' }),
  job({ 'SALES ID': 'SO-1042', 'JOB DESCRIPTION': 'Foam board', 'AMOUNT (₦)': '40000', 'AMOUNT DIFFERENCES': '0', 'INITIAL PAYMENT (₦)': '40000', 'PAYMENT STATUS': 'Paid' }),
  job({ 'SALES ID': 'SO-1042', 'JOB DESCRIPTION': 'Vinyl wrap', 'AMOUNT (₦)': '60000', 'AMOUNT DIFFERENCES': '40000', 'INITIAL PAYMENT (₦)': '20000', 'PAYMENT STATUS': 'Part-payment' }),
];

describe('buildCashierOrders', () => {
  it('groups a 5-job order into one order with its total, owed balance and pill', () => {
    const [order] = buildCashierOrders(bigOrder);
    expect(buildCashierOrders(bigOrder)).toHaveLength(1);
    expect(order).toMatchObject({ salesId: 'SO-1042', client: 'Adaeze', total: 200000, owed: 90000, pill: 'Part-payment' });
    expect(order.jobs.map((j) => j.description)).toEqual(['Banner', 'Flyers', 'Stickers', 'Foam board', 'Vinyl wrap']);
  });

  it('shows a 1-job order as a single-job order with its own Sales ID', () => {
    const [order] = buildCashierOrders([job({ 'SALES ID': 'SO-2000', 'AMOUNT (₦)': '15000', 'AMOUNT DIFFERENCES': '15000' })]);
    expect(order).toMatchObject({ salesId: 'SO-2000', total: 15000, owed: 15000, pill: 'Owes' });
    expect(order.jobs).toHaveLength(1);
  });

  it('keeps a job with no Sales ID as its own single-job order', () => {
    const orders = buildCashierOrders([
      job({ 'JOB DESCRIPTION': 'Card', 'AMOUNT (₦)': '5000', 'AMOUNT DIFFERENCES': '0', 'INITIAL PAYMENT (₦)': '5000', 'PAYMENT STATUS': 'Paid' }),
      job({ 'SALES ID': '', 'JOB DESCRIPTION': 'Mug', 'AMOUNT (₦)': '3000', 'AMOUNT DIFFERENCES': '3000' }),
    ]);
    expect(orders).toHaveLength(2);
    expect(orders[0]).toMatchObject({ salesId: '', pill: 'Paid', total: 5000 });
    expect(orders[1]).toMatchObject({ salesId: '', pill: 'Owes', owed: 3000 });
  });

  it('does not let an overpaid job cancel another job’s debt in the same order', () => {
    const [order] = buildCashierOrders([
      job({ 'SALES ID': 'SO-3000', 'AMOUNT (₦)': '10000', 'AMOUNT DIFFERENCES': '-5000', 'INITIAL PAYMENT (₦)': '15000' }),
      job({ 'SALES ID': 'SO-3000', 'AMOUNT (₦)': '10000', 'AMOUNT DIFFERENCES': '10000' }),
    ]);
    expect(order.owed).toBe(10000);
    expect(order.pill).toBe('Part-payment');
  });

  it('reads an order with a queued job as Syncing, not as Paid', () => {
    const [order] = buildCashierOrders([
      job({ 'SALES ID': 'SO-4000', 'JOB DESCRIPTION': 'Banner', 'AMOUNT (₦)': '0', 'AMOUNT DIFFERENCES': '0', __isPending: 'true' }),
      job({ 'SALES ID': 'SO-4000', 'JOB DESCRIPTION': 'Flyers', 'AMOUNT (₦)': '20000', 'AMOUNT DIFFERENCES': '0', 'PAYMENT STATUS': 'Paid' }),
    ]);
    expect(order.pill).toBe('Syncing');
  });

  it('keeps a queued job with no Sales ID as its own row', () => {
    const orders = buildCashierOrders([job({ 'SALES ID': '', __isPending: 'true' })]);
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ salesId: '', pill: 'Syncing' });
  });
});

describe('owingOrders', () => {
  it('keeps only orders that still owe, largest balance first', () => {
    const orders = buildCashierOrders([
      job({ 'SALES ID': 'SO-A', 'AMOUNT (₦)': '5000', 'AMOUNT DIFFERENCES': '5000' }),
      job({ 'SALES ID': 'SO-B', 'AMOUNT (₦)': '9000', 'AMOUNT DIFFERENCES': '0', 'INITIAL PAYMENT (₦)': '9000', 'PAYMENT STATUS': 'Paid' }),
      job({ 'SALES ID': 'SO-C', 'AMOUNT (₦)': '12000', 'AMOUNT DIFFERENCES': '12000' }),
    ]);
    expect(owingOrders(orders).map((o) => o.salesId)).toEqual(['SO-C', 'SO-A']);
  });
});

describe('reminderText', () => {
  it('uses the order’s total balance and lists every job description', () => {
    const [order] = buildCashierOrders(bigOrder);
    const text = reminderText(order, (n) => `₦${n.toLocaleString()}`);
    expect(text).toContain('*₦90,000*');
    expect(text).toContain('on your order: Banner, Flyers, Stickers, Foam board, Vinyl wrap.');
  });
});

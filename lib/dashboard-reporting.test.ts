import { expect, it } from 'vitest';
import { dashboardExtraIncomeRows, dashboardStockPurchaseRows, dashboardTradingRows, extraIncomeNaira, readDashboardReporting, stockPurchasesNaira, type DashboardRow } from './dashboard-reporting';
import { processDebtData } from './financial-utils';

const context = { backend: 'postgres', startsOn: '2026-10-26' } as const;
it('counts stock purchases as cash out only inside the PostgreSQL books', () => {
  const rows = [
    { business_date: '2026-10-28', amount_kobo: '110200000' },
    { business_date: '2026-10-25', amount_kobo: '5000000' },
    { business_date: '2026-10-29', amount_kobo: 'wrong' },
  ];
  const purchases = dashboardStockPurchaseRows(rows, context);
  expect(purchases).toEqual([rows[0]]);
  expect(stockPurchasesNaira(purchases)).toBe(1_102_000);
  expect(220_000 + stockPurchasesNaira(purchases)).toBe(1_322_000);
  expect(dashboardStockPurchaseRows(rows, { backend: 'sheets' })).toEqual([]);
});

it('counts extra income only from dated confirmed receipts, separately from sales and old rounding',()=>{
  const extra={DATE:'2026-10-26','PAYMENT TYPE':'Extra income',_extraIncomeKobo:'77000'};
  const rows=dashboardExtraIncomeRows([extra,{...extra,DATE:'2026-10-25'},{...extra,'PAYMENT TYPE':'Rounding'},{...extra,_extraIncomeKobo:'wrong'}],context);
  expect(rows).toEqual([extra]);
  expect(extraIncomeNaira(rows)).toBe(770);
  expect(dashboardExtraIncomeRows([extra],null)).toEqual([]);
});
const opening: DashboardRow = { _jobId: 'opening-job', DATE: '2026-10-25', 'Logged By': 'Sheet opening balance',
  'CLIENT NAME': 'Old customer', 'AMOUNT (₦)': '20000', 'ADDITIONAL PAYMENT 1': '5000', 'JOB STATUS': 'Delivered' };
const sale: DashboardRow = { _jobId: 'new-job', DATE: '2026-10-26', 'Logged By': 'Ada',
  'CLIENT NAME': 'New customer', 'AMOUNT (₦)': '10000.25', 'INITIAL PAYMENT (₦)': '4000', 'JOB STATUS': 'Quoted' };

it('keeps opening collections in debt while only new trading enters revenue', () => {
  // A ₦100,000 historical sale with ₦80,000 paid starts as a ₦20,000 debt.
  // Another ₦5,000 collected now reduces debt, but does not create sales revenue.
  const rows = [opening, sale];
  const original = structuredClone(rows);
  const trading = dashboardTradingRows(rows, [], context);
  expect(trading.sales).toEqual([sale]);
  expect(trading.sales.reduce((sum, row) => sum + Number(row['AMOUNT (₦)']), 0)).toBe(10000.25);
  expect(processDebtData(rows).totalDebt).toBe(21000.25);
  expect(rows).toEqual(original);
});

it('never treats opening jobs as sales even if their date is inside the new books', () => {
  expect(dashboardTradingRows([{ ...opening, DATE: '2026-10-26' }], [], context).sales).toEqual([]);
});

it('excludes fully paid historical rows, stale Sheets rows, cancelled and pending sales', () => {
  const paidHistory = { ...sale, DATE: '2026-10-25', 'INITIAL PAYMENT (₦)': '10000.25' };
  const sheetRow = { ...sale, _jobId: '' };
  expect(dashboardTradingRows([paidHistory, sheetRow, { ...sale, 'JOB STATUS': 'Cancelled' },
    { ...sale, __isPending: 'true' }, sale], [], context).sales).toEqual([sale]);
});

it('keeps free services and genuine sales whose descriptions mention opening balances', () => {
  const free = { ...sale, 'AMOUNT (₦)': '0', 'JOB DESCRIPTION': 'Opening balance poster' };
  expect(dashboardTradingRows([free], [], context).sales).toEqual([free]);
});

it('uses the same books boundary for expenses, retaining current unpaid expenses', () => {
  const expense = { DATE: '2026-10-26', AMOUNT: '2000', STATUS: 'Unpaid' };
  const rows = [{ ...expense, DATE: '2026-10-25' }, { ...expense, STATUS: 'Cancelled' },
    { ...expense, __isPending: 'true' }, { ...expense, DATE: 'invalid' }, expense];
  expect(dashboardTradingRows([sale], rows, context).expenses).toEqual([expense]);
});

it('does not invent zero-valued historical reporting when the boundary is unknown', () => {
  expect(readDashboardReporting(undefined)).toBeNull();
  expect(dashboardTradingRows([opening, sale], [{ DATE: '2026-10-26', AMOUNT: '2000' }], null))
    .toEqual({ sales: [], expenses: [] });
});

it('validates reporting dates rather than accepting malformed or rolled-over dates', () => {
  for (const startsOn of ['', '2026-02-30', '2026-13-01', '26/10/2026', null]) {
    expect(readDashboardReporting({ backend: 'postgres', startsOn })).toBeNull();
  }
  expect(readDashboardReporting(context)).toEqual(context);
  expect(readDashboardReporting({ backend: 'unknown' })).toBeNull();
});

it('preserves the historical Sheets reporting path', () => {
  const sales = [opening, sale], expenses = [{ DATE: '2026-01-01', AMOUNT: '2000' }];
  expect(dashboardTradingRows(sales, expenses, { backend: 'sheets' })).toEqual({ sales, expenses });
});

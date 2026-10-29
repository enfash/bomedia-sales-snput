export type DashboardRow = Record<string, string>;
export type DashboardReporting = { backend: 'sheets' } | { backend: 'postgres'; startsOn: string };
export type DashboardStockPurchase = { business_date: string; amount_kobo: string };

/** Extra income follows the receipt date, even when the associated sale is later cancelled. */
export function dashboardExtraIncomeRows(payments: DashboardRow[], reporting: DashboardReporting | null) {
  if (reporting?.backend !== 'postgres') return [];
  return payments.filter(row => row['PAYMENT TYPE'] === 'Extra income' && isDate(row.DATE)
    && row.DATE >= reporting.startsOn && /^[1-9][0-9]*$/.test(row._extraIncomeKobo || ''));
}
export const extraIncomeNaira = (payments: DashboardRow[]) => Number(payments.reduce((sum,row) => sum + BigInt(row._extraIncomeKobo),BigInt(0)))/100;

/** Stock purchases are cash out, but not immediate profit expenses. */
export function dashboardStockPurchaseRows<T extends DashboardStockPurchase>(purchases: T[], reporting: DashboardReporting | null): T[] {
  if (reporting?.backend !== 'postgres') return [];
  return purchases.filter(row => isDate(row.business_date) && row.business_date >= reporting.startsOn
    && /^[0-9]+$/.test(row.amount_kobo));
}

export const stockPurchasesNaira = (purchases: DashboardStockPurchase[]) =>
  Number(purchases.reduce((sum, row) => sum + BigInt(row.amount_kobo), BigInt(0))) / 100;

function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** An unavailable accounting boundary must not turn historical balances into revenue. */
export function readDashboardReporting(value: unknown): DashboardReporting | null {
  if (!value || typeof value !== 'object') return null;
  const context = value as Record<string, unknown>;
  if (context.backend === 'sheets') return { backend: 'sheets' };
  return context.backend === 'postgres' && isDate(context.startsOn)
    ? { backend: 'postgres', startsOn: context.startsOn } : null;
}

/** Only trading views use these subsets. The original feed remains intact for debt collection. */
export function dashboardTradingRows(sales: DashboardRow[], expenses: DashboardRow[], reporting: DashboardReporting | null) {
  if (!reporting) return { sales: [], expenses: [] };
  if (reporting.backend === 'sheets') return { sales, expenses };
  const inBooks = (row: DashboardRow) => isDate(row.DATE) && row.DATE >= reporting.startsOn && row.__isPending !== 'true';
  return {
    sales: sales.filter(row => inBooks(row) && Boolean(row._jobId)
      && row['Logged By'] !== 'Sheet opening balance' && row['JOB STATUS'] !== 'Cancelled'),
    expenses: expenses.filter(row => inBooks(row) && row.STATUS !== 'Cancelled'),
  };
}

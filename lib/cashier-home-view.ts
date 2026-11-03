// The cashier home page shows today's sales one order at a time (a Sales ID is one order). This is the grouping and
// the numbers behind each order. The page does the rendering; payment logic stays where it was.
import type { UnifiedRecord } from '@/components/manage-sale-action';
import { collectableAmount } from '@/lib/balance-display';
import { parseAmount } from '@/lib/financial-utils';
import { groupUnits, mapSale, type DisplayUnit, type Row } from '@/lib/records-view';

export type OrderPill = 'Paid' | 'Part-payment' | 'Owes' | 'Syncing';

export type CashierOrder = {
  /** The Sales ID, or '' for a job with none, which is its own single-job order. */
  salesId: string;
  client: string;
  contact: string;
  jobs: UnifiedRecord[];
  total: number;
  /** Still owed across the order's jobs. An overpaid job does not cancel another job's debt. */
  owed: number;
  pill: OrderPill;
};

/** Money already in against one job: the initial payment plus any additional payments. */
const paidIn = (record: UnifiedRecord) =>
  parseAmount(record.raw['INITIAL PAYMENT (₦)'] || record.raw['INITIAL PAYMENT'] || record.raw['Initial Payment']) +
  (record.additionalPayment1 ?? 0) + (record.additionalPayment2 ?? 0);

const orderOf = (unit: DisplayUnit): CashierOrder => {
  const jobs = unit.type === 'group' ? unit.items : [unit.record];
  const total = jobs.reduce((sum, job) => sum + job.amount, 0);
  const owed = jobs.reduce((sum, job) => sum + collectableAmount(job.balance, !!job.raw?._jobId), 0);
  const moneyIn = jobs.reduce((sum, job) => sum + paidIn(job), 0);
  // A queued job has no amount yet, so an order with one reads Syncing rather than a false Paid.
  const pill: OrderPill = jobs.some((job) => job.isPending) ? 'Syncing'
    : owed <= 0 ? 'Paid'
    : moneyIn > 0 ? 'Part-payment'
    : 'Owes';
  return {
    salesId: unit.type === 'group' ? unit.salesId : '',
    client: jobs[0].client,
    contact: jobs.map((job) => job.contact).find(Boolean) ?? '',
    jobs,
    total,
    owed,
    pill,
  };
};

/** Today's sales rows, grouped by Sales ID in the order they first appear. */
export function buildCashierOrders(rows: Row[]): CashierOrder[] {
  const records = rows.map((row) => mapSale(row, row.__isPending === 'true'));
  return groupUnits(records).map(orderOf);
}

/** The orders that still owe, largest balance first. */
export const owingOrders = (orders: CashierOrder[]) =>
  orders.filter((order) => order.owed > 0).sort((a, b) => b.owed - a.owed);

/** The WhatsApp reminder: the order's total balance and the descriptions of its jobs. */
export function reminderText(order: CashierOrder, money: (amount: number) => string) {
  const jobs = order.jobs.map((job) => job.description).join(', ');
  return `Hello *${order.client}*, this is a reminder from *BOMedia*. You have an outstanding balance of *${money(order.owed)}* on your order: ${jobs}. Kindly settle at your earliest convenience. Thank you!`;
}

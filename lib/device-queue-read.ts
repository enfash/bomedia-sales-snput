import { summarizeDeviceQueue, type DeviceQueueSummary, type LegacyQueueItem } from './device-queue-status';
import { readExpenses } from './expense-outbox';
import { readOrders } from './order-outbox';
import { readPaymentOutbox } from './payment-outbox';

// Browser only. Reads whatever is waiting on this phone. A queue that cannot be read counts as one entry kept for review,
// never as "nothing waiting".
export function readDeviceQueue(legacy: LegacyQueueItem[]): DeviceQueueSummary {
  let unreadable = 0;
  const safe = <T,>(read: () => T[]): T[] => { try { return read(); } catch { unreadable += 1; return []; } };
  return summarizeDeviceQueue({ legacy, expenses: safe(() => readExpenses(localStorage)), orders: safe(() => readOrders(localStorage)),
    payments: safe(() => readPaymentOutbox(localStorage)), unreadable });
}

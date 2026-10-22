// Plain-words summary of entries still waiting on this device, for the owner's System status page.
// Pure: the page reads the device queues and passes them in, so this never touches storage or the network.
export type LegacyQueueItem = { type: 'sale' | 'expense' | 'payment' | 'payment_batch' | 'sale_status'; retryCount?: number; lastError?: string };
export type OutboxEntry = { state: 'pending' | 'review' | 'auth' };
export type DeviceQueueRow = { label: string; detail: string; attention: boolean };
export type DeviceQueueSummary = { total: number; needsAttention: number; rows: DeviceQueueRow[] };

// The sync manager gives up retrying after this many attempts and shows its red banner.
export const QUEUE_MAX_RETRIES = 3;
const LEGACY_LABEL = { sale: 'Sale', expense: 'Expense', payment: 'Payment', payment_batch: 'Batch payment', sale_status: 'Job status change' } as const;
const OUTBOX_DETAIL = { pending: 'Waiting to send', review: 'Needs your review', auth: 'Sign in again to send' } as const;

export function summarizeDeviceQueue(input: { legacy: LegacyQueueItem[]; expenses: OutboxEntry[]; orders: OutboxEntry[]; payments: OutboxEntry[]; unreadable?: number }): DeviceQueueSummary {
  const rows: DeviceQueueRow[] = [];
  for (const item of input.legacy) {
    const failed = (item.retryCount ?? 0) >= QUEUE_MAX_RETRIES;
    rows.push({ label: LEGACY_LABEL[item.type] ?? 'Entry', attention: failed,
      detail: failed ? 'Failed after retries' : item.lastError ? 'Waiting to retry' : 'Waiting for network' });
  }
  for (const [label, entries] of [['Expense', input.expenses], ['Sale', input.orders], ['Payment', input.payments]] as const) {
    for (const entry of entries) rows.push({ label, detail: OUTBOX_DETAIL[entry.state], attention: entry.state !== 'pending' });
  }
  for (let i = 0; i < (input.unreadable ?? 0); i++) rows.push({ label: 'Saved entry', detail: 'Cannot be read, kept for review', attention: true });
  // Entries that need a person come first.
  rows.sort((a, b) => Number(b.attention) - Number(a.attention));
  return { total: rows.length, needsAttention: rows.filter(row => row.attention).length, rows };
}

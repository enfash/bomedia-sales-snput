// Decides when the notification poll downloads the sales, expense, inventory and material feeds again.
// The database counter (api_data_revision) moves on every write to those feeds. Staff's "today" expense list also changes at
// Lagos midnight with no write at all, so the date is part of the key.

export const REVISION_CHECK_MS = 30_000;
export const FULL_REFRESH_MS = 30 * 60_000;
export const FALLBACK_REFRESH_MS = 5 * 60_000;
export const IDLE_CHECK_MS = 2 * 60_000;
export const IDLE_AFTER_MS = 2 * 60_000;
export const MAX_RETRY_MS = 5 * 60_000;

export function retryDelay(failures: number): number {
  return Math.min(MAX_RETRY_MS, REVISION_CHECK_MS * 2 ** Math.min(Math.max(0, failures - 1), 4));
}

/** Today's date in Lagos as YYYY-MM-DD, the same day the server uses for "today". */
export function lagosDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(now);
}

/** The key the feeds are stored under, or null when the counter could not be read. */
export function revisionKey(body: unknown, date: string): string | null {
  const revision = (body as { revision?: unknown } | null)?.revision;
  const valid = typeof revision === 'number' ? Number.isSafeInteger(revision) && revision >= 0
    : typeof revision === 'string' && /^\d+$/.test(revision);
  return valid ? `${revision}|${date}` : null;
}

/** An unavailable counter uses a bounded fallback, never a full download on every check. */
export function shouldDownload(state: { key: string | null; lastKey: string | null; lastDownloadAt: number }, now: number): boolean {
  if (state.key === null) return state.lastDownloadAt === 0 || now - state.lastDownloadAt >= FALLBACK_REFRESH_MS;
  return state.key !== state.lastKey || now - state.lastDownloadAt >= FULL_REFRESH_MS;
}

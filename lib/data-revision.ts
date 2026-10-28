// Decides when the notification poll downloads the sales, expense, inventory and material feeds again.
// The database counter (api_data_revision) moves on every write to those feeds. Staff's "today" expense list also changes at
// Lagos midnight with no write at all, so the date is part of the key.

export const REVISION_CHECK_MS = 30_000;
export const FULL_REFRESH_MS = 30 * 60_000;

/** Today's date in Lagos as YYYY-MM-DD, the same day the server uses for "today". */
export function lagosDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(now);
}

/** The key the feeds are stored under, or null when the counter could not be read. */
export function revisionKey(body: unknown, date: string): string | null {
  const revision = (body as { revision?: unknown } | null)?.revision;
  return typeof revision === 'number' || typeof revision === 'string' ? `${revision}|${date}` : null;
}

/** Download when the counter is unreadable (the old behaviour), when it has moved, or when the last download is 30 minutes old. */
export function shouldDownload(state: { key: string | null; lastKey: string | null; lastDownloadAt: number }, now: number): boolean {
  if (state.key === null) return true;
  return state.key !== state.lastKey || now - state.lastDownloadAt >= FULL_REFRESH_MS;
}

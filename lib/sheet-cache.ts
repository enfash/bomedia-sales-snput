/**
 * Server-side in-memory cache for Google Sheets row data.
 *
 * Problem: multiple concurrent requests (dashboard + NotificationManager poll)
 * all call sheet.getRows() independently, opening parallel TCP connections to
 * Google's API. Under slow or congested network conditions this causes
 * UND_ERR_CONNECT_TIMEOUT cascades that make every request hang for 30+ seconds.
 *
 * Solution: share a single in-flight promise per sheet. All callers that arrive
 * while a fetch is already running wait for the same promise instead of opening
 * new connections. Completed results are cached for TTL_MS so subsequent reads
 * within the window are instant.
 */

const TTL_MS = 30_000; // 30 seconds

type Entry = {
  data: any[];
  expiresAt: number;
  promise: Promise<any[]> | null;
};

const cache = new Map<string, Entry>();

/**
 * Fetch rows for `key`, reusing an in-flight request or cached result when
 * available. `fetchFn` is only called when the cache is cold or expired.
 */
export async function getCachedRows(
  key: string,
  fetchFn: () => Promise<any[]>
): Promise<any[]> {
  const now = Date.now();
  const entry = cache.get(key);

  // Return cached data if still fresh
  if (entry && entry.expiresAt > now && !entry.promise) {
    return entry.data;
  }

  // Share an already-running fetch instead of starting a new one
  if (entry?.promise) {
    return entry.promise;
  }

  // Start a new fetch and store the promise immediately so concurrent callers share it
  const promise: Promise<any[]> = fetchFn()
    .then((data) => {
      cache.set(key, { data, expiresAt: Date.now() + TTL_MS, promise: null });
      return data;
    })
    .catch((err) => {
      // Clear the entry on failure so the next caller retries rather than
      // getting a permanently broken entry.
      cache.delete(key);
      throw err;
    });

  cache.set(key, {
    data: entry?.data ?? [],
    expiresAt: 0,
    promise,
  });

  return promise;
}

/** Call after any write to a sheet to force the next read to re-fetch. */
export function invalidateSheet(...keys: string[]) {
  for (const key of keys) {
    cache.delete(key);
  }
}

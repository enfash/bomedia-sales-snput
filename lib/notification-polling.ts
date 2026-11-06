import { FALLBACK_REFRESH_MS, IDLE_AFTER_MS, IDLE_CHECK_MS, REVISION_CHECK_MS, lagosDate, retryDelay, revisionKey, shouldDownload } from './data-revision';

export const REVISION_STORAGE_KEY = 'bomedia-notification-revision-v1';
export const REQUEST_TIMEOUT_MS = 15_000;
const FEEDS = ['/api/sales', '/api/expenses', '/api/inventory', '/api/materials'];
export type NotificationFeeds = [Record<string, unknown>[], Record<string, unknown>[], Record<string, unknown>[], Record<string, unknown>[]];
type Check = { scope: string; key: string | null; checkedAt: number; failures: number; retryAt: number; denied: boolean };
type PollOptions = {
  send: typeof fetch;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  locks?: Pick<LockManager, 'request'>;
  scope: () => string;
  enabled: () => boolean;
  cacheVersion: () => unknown;
  apply: (feeds: NotificationFeeds) => void;
};

/** Only revision metadata is shared. Each tab owns its feeds, notification baseline and financial queues. */
export function createNotificationPoller(options: PollOptions) {
  let localCheck: Check | null = null;
  let lastKey: string | null = null;
  let lastDownloadAt = 0;
  let lastDay = '';
  let feedFailures = 0;
  let feedRetryAt = 0;
  let dirty = 0;
  let consumedDirty = 0;
  let dirtyAt = 0;
  let lastActivity = Date.now();
  let stopped = false;
  let running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let currentScope = options.scope();

  const interval = () => Date.now() - lastActivity >= IDLE_AFTER_MS ? IDLE_CHECK_MS : REVISION_CHECK_MS;
  const readCheck = (scope: string): Check | null => {
    let check = localCheck;
    try {
      const stored = JSON.parse(options.storage?.getItem(REVISION_STORAGE_KEY) || 'null') as Check | null;
      if (stored?.scope === scope && (!check || stored.checkedAt >= check.checkedAt)) check = stored;
    } catch { /* Storage denied/corrupt: this tab can still poll independently. */ }
    const now = Date.now();
    if (!check || check.scope !== scope || !Number.isFinite(check.checkedAt) || check.checkedAt > now ||
      now - check.checkedAt > 30 * 60_000 || !Number.isInteger(check.failures) || check.failures < 0 ||
      !Number.isFinite(check.retryAt) || check.retryAt > now + 5 * 60_000 || typeof check.denied !== 'boolean' ||
      !(check.key === null || (typeof check.key === 'string' && /^\d+\|\d{4}-\d{2}-\d{2}$/.test(check.key)))) return null;
    return check;
  };
  const writeCheck = (check: Check) => {
    localCheck = check;
    try { options.storage?.setItem(REVISION_STORAGE_KEY, JSON.stringify(check)); } catch { /* Local backoff still applies. */ }
  };
  const revision = async (scope: string, signal: AbortSignal): Promise<Check | null> => {
    const check = async () => {
      if (stopped || !options.enabled() || scope !== options.scope()) return null;
      const previous = readCheck(scope);
      const now = Date.now();
      // Visibility, connectivity and user activity never bypass a server failure's cooldown.
      if (previous && (now < previous.retryAt || (previous.key?.endsWith(`|${lagosDate()}`) &&
        now - previous.checkedAt < interval() && previous.checkedAt >= dirtyAt))) return previous;
      let key: string | null = null;
      let denied = false;
      try {
        const response = await options.send('/api/accounting/data-revision', { cache: 'no-store', signal });
        denied = response.status === 401 || response.status === 403;
        if (response.ok) key = revisionKey(await response.json(), lagosDate());
      } catch { /* Network errors, invalid JSON and timeouts use the same bounded retry. */ }
      // A timeout is a failure too; an unmount or changed identity must not publish a result.
      if (stopped || scope !== options.scope()) return null;
      const failures = key === null ? (previous?.failures ?? 0) + 1 : 0;
      const result = { scope, key, checkedAt: now, failures, retryAt: key === null ? Date.now() + retryDelay(failures) : 0, denied };
      writeCheck(result);
      return result;
    };
    if (!options.locks || !options.storage) return check();
    // No long-lived leader: a closed/hidden tab cannot monopolise future checks.
    return options.locks.request('bomedia-notification-revision', { ifAvailable: true }, lock => lock ? check() : null);
  };

  const schedule = (delay: number) => {
    clearTimeout(timer);
    if (!stopped) timer = setTimeout(() => void tick(), Math.max(0, delay));
  };
  const tick = async () => {
    if (stopped || running) return;
    if (!options.enabled()) { schedule(interval()); return; }
    running = true;
    let nextDelay = interval();
    const scope = options.scope();
    if (scope !== currentScope) {
      currentScope = scope;
      localCheck = null; lastKey = null; lastDownloadAt = 0; lastDay = ''; feedFailures = 0; feedRetryAt = 0;
    }
    const generation = dirty;
    let fallback = false;
    controller = new AbortController();
    let timeout = setTimeout(() => controller?.abort(), REQUEST_TIMEOUT_MS);
    try {
      const result = await revision(scope, controller.signal);
      if (!result) { nextDelay = 1_000; return; }
      nextDelay = Math.max(interval(), result.retryAt - Date.now());
      fallback = result.key === null && !result.denied;
      if (stopped || !options.enabled() || scope !== options.scope() || result.denied) return;
      const day = lagosDate();
      const due = generation !== consumedDirty || lastDay !== day || shouldDownload({ key: result.key, lastKey, lastDownloadAt }, Date.now());
      if (!due || Date.now() < feedRetryAt) {
        nextDelay = Math.max(nextDelay, feedRetryAt - Date.now());
        return;
      }
      // Each feed batch has its own deadline, independent of the revision request.
      clearTimeout(timeout);
      controller = new AbortController();
      timeout = setTimeout(() => controller?.abort(), REQUEST_TIMEOUT_MS);
      const version = options.cacheVersion();
      const responses = await Promise.all(FEEDS.map(url => options.send(url, { cache: 'no-store', signal: controller!.signal })));
      if (responses.some(response => !response.ok)) throw new Error('Notification feed unavailable');
      const bodies = await Promise.all(responses.map(response => response.json()));
      if (bodies.some(body => !Array.isArray(body?.data))) throw new Error('Invalid notification feed');
      if (stopped || controller.signal.aborted || !options.enabled() || scope !== options.scope()) return;
      // Do not overwrite a save, optimistic balance, or page refresh that completed during this download.
      if (generation !== dirty || version !== options.cacheVersion()) { nextDelay = REVISION_CHECK_MS; return; }
      options.apply(bodies.map(body => body.data) as NotificationFeeds);
      lastKey = result.key;
      lastDay = day;
      lastDownloadAt = Date.now();
      consumedDirty = generation;
      feedFailures = 0; feedRetryAt = 0;
    } catch {
      feedRetryAt = Date.now() + retryDelay(++feedFailures);
      nextDelay = Math.max(nextDelay, feedRetryAt - Date.now());
    } finally {
      clearTimeout(timeout);
      controller?.abort();
      controller = undefined;
      running = false;
      // The full-feed fallback has its own clock; a revision retry must not postpone it indefinitely.
      if (fallback && lastDownloadAt) nextDelay = Math.max(feedRetryAt - Date.now(),
        Math.min(nextDelay, Math.max(REVISION_CHECK_MS, lastDownloadAt + FALLBACK_REFRESH_MS - Date.now())));
      schedule(dirty !== generation ? 0 : nextDelay);
    }
  };
  return {
    start: () => schedule(25_000),
    stop: () => { stopped = true; clearTimeout(timer); controller?.abort(); },
    wake: () => { lastActivity = Date.now(); if (!running) schedule(0); },
    activity: () => {
      const wasIdle = Date.now() - lastActivity >= IDLE_AFTER_MS;
      lastActivity = Date.now();
      if (wasIdle && !running) schedule(0);
    },
    changed: () => { dirty++; dirtyAt = Date.now(); lastActivity = Date.now(); if (!running) schedule(0); },
  };
}

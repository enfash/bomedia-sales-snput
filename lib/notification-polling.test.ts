import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createNotificationPoller, REQUEST_TIMEOUT_MS, REVISION_STORAGE_KEY } from './notification-polling';

const REVISION = '/api/accounting/data-revision';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const instances: ReturnType<typeof createNotificationPoller>[] = [];
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-06T12:00:00Z')); });
afterEach(() => { instances.splice(0).forEach(p => p.stop()); vi.useRealTimers(); });
const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms);
function setup(overrides: Partial<Parameters<typeof createNotificationPoller>[0]> = {}) {
  const send = vi.fn<typeof fetch>(async url => url === REVISION ? json({ revision: '1' }) : json({ data: [] }));
  const apply = vi.fn();
  const poller = createNotificationPoller({ send, apply, scope: () => 'staff-a', enabled: () => true, cacheVersion: () => 1, ...overrides });
  instances.push(poller);
  poller.start();
  return { poller, send, apply };
}
function shared() {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  let held = false;
  const locks = { request: vi.fn(async (_name, _options, callback) => {
    if (held) return callback(null);
    held = true;
    try { return await callback({ name: _name }); } finally { held = false; }
  }) } as unknown as Pick<LockManager, 'request'>;
  return { storage, locks };
}

it('downloads initially, skips unchanged feeds, and refreshes changed revisions', async () => {
  const { send, apply } = setup();
  await advance(25_000);
  expect(send).toHaveBeenCalledTimes(5);
  await advance(30_000);
  expect(send).toHaveBeenCalledTimes(6);
  expect(apply).toHaveBeenCalledTimes(1);
  send.mockImplementation(async url => url === REVISION ? json({ revision: '2' }) : json({ data: [] }));
  await advance(30_000);
  expect(send).toHaveBeenCalledTimes(11);
  expect(apply).toHaveBeenCalledTimes(2);
});

it.each(['http', 'network', 'json', 'invalid'])('backs off %s revision failures without downloading four feeds every check', async failure => {
  const calls: number[] = [];
  const send = vi.fn<typeof fetch>(async url => {
    if (url !== REVISION) return json({ data: [] });
    calls.push(Date.now());
    if (failure === 'network') throw new TypeError('offline');
    if (failure === 'json') return new Response('bad json');
    return failure === 'http' ? json({}, 503) : json({ revision: '' });
  });
  const { poller, apply } = setup({ send });
  await advance(25_000);
  expect(apply).toHaveBeenCalledTimes(1);
  await advance(90_000);
  expect(calls.map(t => t - calls[0])).toEqual([0, 30_000, 90_000]);
  expect(send.mock.calls.filter(([url]) => url !== REVISION)).toHaveLength(4);
  // Repeated focus/online/activity events may not defeat backoff.
  for (let i = 0; i < 5; i++) { poller.wake(); poller.activity(); await advance(1_000); }
  expect(calls).toHaveLength(3);
  await advance(355_000);
  expect(apply).toHaveBeenCalledTimes(2);
});

it('resets revision failure backoff on recovery and notices the new counter', async () => {
  const { send, apply, poller } = setup();
  await advance(25_000);
  send.mockImplementation(async url => url === REVISION ? json({}, 500) : json({ data: [] }));
  await advance(90_000);
  send.mockImplementation(async url => url === REVISION ? json({ revision: '2' }) : json({ data: [] }));
  poller.activity();
  await advance(60_000);
  expect(apply).toHaveBeenCalledTimes(2);
  const checks = send.mock.calls.filter(([url]) => url === REVISION).length;
  poller.activity();
  await advance(30_000);
  expect(send.mock.calls.filter(([url]) => url === REVISION)).toHaveLength(checks + 1);
});

it.each([401, 403])('does not fan out an authentication/permission failure (%s)', async status => {
  const send = vi.fn<typeof fetch>(async () => json({}, status));
  const { apply } = setup({ send });
  await advance(115_000);
  expect(send.mock.calls.every(([url]) => url === REVISION)).toBe(true);
  expect(send).toHaveBeenCalledTimes(3);
  expect(apply).not.toHaveBeenCalled();
});

it('backs off partial feed failures even when revision reads succeed; only applies complete batches', async () => {
  const { send, apply, poller } = setup();
  send.mockImplementation(async url => url === REVISION ? json({ revision: '1' }) : json({ data: [] }, url === '/api/materials' ? 429 : 200));
  await advance(25_000);
  await advance(30_000);
  expect(apply).not.toHaveBeenCalled();
  poller.changed(); await advance(1);
  expect(send.mock.calls.filter(([url]) => url === '/api/sales')).toHaveLength(2);
  await advance(60_000);
  expect(send.mock.calls.filter(([url]) => url === '/api/sales')).toHaveLength(3);
  send.mockImplementation(async url => url === REVISION ? json({ revision: '1' }) : json({ data: [] }));
  await advance(120_000);
  expect(apply).toHaveBeenCalledTimes(1);
});

it('rejects malformed feed payloads instead of clearing valid cached data', async () => {
  const { send, apply } = setup();
  send.mockImplementation(async url => url === REVISION ? json({ revision: '1' }) : json({ error: 'missing data' }));
  await advance(25_000);
  expect(apply).not.toHaveBeenCalled();
});

it('reduces idle checks, resumes on interaction, and skips hidden/offline work', async () => {
  let enabled = true;
  const { send, poller } = setup({ enabled: () => enabled });
  await advance(145_000);
  const count = send.mock.calls.length;
  await advance(119_000);
  expect(send).toHaveBeenCalledTimes(count);
  poller.activity(); await advance(1);
  expect(send).toHaveBeenCalledTimes(count + 1);
  enabled = false;
  await advance(300_000);
  expect(send).toHaveBeenCalledTimes(count + 1);
  enabled = true; poller.wake(); await advance(1);
  expect(send).toHaveBeenCalledTimes(count + 2);
});

it('shares one revision request across tabs but gives both tabs their own feeds and notifications', async () => {
  const coordination = shared();
  const one = setup(coordination);
  const two = setup(coordination);
  await advance(26_000);
  const all = [...one.send.mock.calls, ...two.send.mock.calls];
  expect(all.filter(([url]) => url === REVISION)).toHaveLength(1);
  expect(all.filter(([url]) => url === '/api/sales')).toHaveLength(2);
  expect(one.apply).toHaveBeenCalledOnce(); expect(two.apply).toHaveBeenCalledOnce();
  one.poller.stop();
  await advance(30_000);
  expect(two.send.mock.calls.filter(([url]) => url === REVISION)).toHaveLength(1);
});

it('shares failed-check cooldowns and keeps different identities isolated', async () => {
  const coordination = shared();
  const send = vi.fn<typeof fetch>(async url => url === REVISION ? json({}, 503) : json({ data: [] }));
  const one = setup({ ...coordination, send });
  setup({ ...coordination, send });
  await advance(26_000);
  expect(send.mock.calls.filter(([url]) => url === REVISION)).toHaveLength(1);
  one.poller.stop();
  setup({ ...coordination, send, scope: () => 'staff-b' });
  await advance(25_000);
  expect(send.mock.calls.filter(([url]) => url === REVISION)).toHaveLength(2);
});

it('works without lock support and with corrupt or denied storage', async () => {
  const { send, apply } = setup({ storage: { getItem: () => '{', setItem: () => { throw new Error('denied'); } } });
  await advance(55_000);
  expect(send).toHaveBeenCalledTimes(6);
  expect(apply).toHaveBeenCalledOnce();
});

it('does not apply an old download over an intervening local save', async () => {
  let version = 1;
  const { send, apply, poller } = setup({ cacheVersion: () => version });
  send.mockImplementation(async url => {
    if (url === REVISION) return json({ revision: '1' });
    if (url === '/api/sales') version++;
    return json({ data: [] });
  });
  await advance(25_000);
  expect(apply).not.toHaveBeenCalled();
  send.mockImplementation(async url => url === REVISION ? json({ revision: '2' }) : json({ data: [] }));
  poller.changed(); await advance(1);
  expect(apply).toHaveBeenCalledOnce();
});

it('refreshes on a confirmed local change without waiting for the next scheduled check', async () => {
  const { poller, apply } = setup();
  await advance(25_000);
  await advance(1_000);
  poller.changed(); await advance(1);
  expect(apply).toHaveBeenCalledTimes(2);
});

it('refreshes across Lagos midnight even during a revision outage', async () => {
  vi.setSystemTime(new Date('2026-11-06T22:59:30Z'));
  const send = vi.fn<typeof fetch>(async url => url === REVISION ? json({}, 500) : json({ data: [] }));
  const { apply } = setup({ send });
  await advance(25_000);
  expect(apply).toHaveBeenCalledOnce();
  await advance(30_000);
  expect(apply).toHaveBeenCalledTimes(2);
});

it('aborts hung requests, releases the check lock, and still uses the fallback feeds', async () => {
  const coordination = shared();
  const send = vi.fn<typeof fetch>((url, init) => url !== REVISION ? Promise.resolve(json({ data: [] })) : new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('timeout', 'AbortError')));
  }));
  const { apply } = setup({ ...coordination, send });
  await advance(25_000 + REQUEST_TIMEOUT_MS);
  expect(apply).toHaveBeenCalledOnce();
  expect(JSON.parse(coordination.storage.getItem(REVISION_STORAGE_KEY)!)).toMatchObject({ failures: 1, key: null });
});

it('aborts in-flight work and does not apply data or reschedule after cleanup', async () => {
  let signal: AbortSignal | null | undefined;
  const send = vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => {
    signal = init?.signal;
    signal?.addEventListener('abort', () => reject(new DOMException('unmounted', 'AbortError')));
  }));
  const { poller, apply } = setup({ send });
  await advance(25_000);
  poller.stop();
  expect(signal?.aborted).toBe(true);
  await advance(600_000);
  expect(apply).not.toHaveBeenCalled();
  expect(send).toHaveBeenCalledOnce();
});

it('does not duplicate a slow revision request across overlapping tabs', async () => {
  const coordination = shared();
  let finish!: (response: Response) => void;
  const send = vi.fn<typeof fetch>(url => url === REVISION ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(json({ data: [] })));
  const one = setup({ ...coordination, send });
  const two = setup({ ...coordination, send });
  await advance(26_000);
  expect(send).toHaveBeenCalledOnce();
  finish(json({ revision: '1' }));
  await advance(1_000);
  expect(send.mock.calls.filter(([url]) => url === REVISION)).toHaveLength(1);
  expect(one.apply).toHaveBeenCalledOnce(); expect(two.apply).toHaveBeenCalledOnce();
});

it('discards a response when the identity changes during a request', async () => {
  let scope = 'staff-a';
  const { send, apply } = setup({ scope: () => scope });
  send.mockImplementation(async url => {
    scope = 'staff-b';
    return url === REVISION ? json({ revision: '1' }) : json({ data: [] });
  });
  await advance(25_000);
  expect(apply).not.toHaveBeenCalled();
  expect(send).toHaveBeenCalledOnce();
  await advance(1_000);
  expect(apply).toHaveBeenCalledOnce();
});

it('rechecks a write confirmed during a feed download before applying a snapshot', async () => {
  const { send, apply, poller } = setup();
  let changed = false;
  send.mockImplementation(async url => {
    if (url === '/api/sales' && !changed) { changed = true; poller.changed(); }
    return url === REVISION ? json({ revision: changed ? '2' : '1' }) : json({ data: [] });
  });
  await advance(25_001);
  expect(apply).toHaveBeenCalledOnce();
  expect(send.mock.calls.filter(([url]) => url === '/api/sales')).toHaveLength(2);
});

it('times out a stalled feed batch without overlapping another batch', async () => {
  const signals: AbortSignal[] = [];
  const send = vi.fn<typeof fetch>((url, init) => url === REVISION ? Promise.resolve(json({ revision: '1' })) : new Promise((_resolve, reject) => {
    signals.push(init!.signal!);
    init!.signal!.addEventListener('abort', () => reject(new DOMException('timeout', 'AbortError')));
  }));
  const { apply, poller } = setup({ send });
  await advance(25_000);
  poller.wake(); await advance(REQUEST_TIMEOUT_MS);
  expect(send).toHaveBeenCalledTimes(5);
  expect(signals.every(signal => signal.aborted)).toBe(true);
  expect(apply).not.toHaveBeenCalled();
  await advance(30_000);
  expect(send).toHaveBeenCalledTimes(10);
});

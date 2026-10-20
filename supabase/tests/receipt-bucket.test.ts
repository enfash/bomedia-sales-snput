import { describe, expect, it } from 'vitest';

import { ensureReceiptBucket } from '../../scripts/migration/setup-receipt-storage-live.mjs';

const REF = 'abcdefghijklmnopqrst';
const GOOD = { public: false, file_size_limit: 1048576, allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp'] };
const reply = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as Response;
function fake(first: Response, second?: Response) {
  const calls: { url: string; method: string }[] = [];
  const queue = [first, second].filter(Boolean) as Response[];
  const fetcher = (async (url: string, init?: RequestInit) => { calls.push({ url, method: init?.method ?? 'GET' }); return queue.length > 1 ? queue.shift()! : queue[0]; }) as typeof fetch;
  return { fetcher, calls };
}
const base = { ref: REF, confirmedRef: REF, key: 'sb_secret_test' };

describe('live receipt bucket', () => {
  it('creates a private bucket when none exists, and then checks it', async () => {
    const f = fake(reply(404, { statusCode: '404' }), reply(200, GOOD));
    f.fetcher = ((orig) => (async (url: string, init?: RequestInit) => (init?.method === 'POST' ? reply(200, {}) : orig(url, init))) as typeof fetch)(f.fetcher);
    expect(await ensureReceiptBucket({ ...base, fetcher: f.fetcher })).toMatchObject({ created: true, public: false });
  });
  it('does nothing when the bucket already matches', async () => {
    const f = fake(reply(200, GOOD));
    expect(await ensureReceiptBucket({ ...base, fetcher: f.fetcher })).toMatchObject({ created: false });
    expect(f.calls.every(c => c.method === 'GET')).toBe(true);
  });
  it('refuses a different project, a wrong key and a bucket with other settings, changing nothing', async () => {
    await expect(ensureReceiptBucket({ ...base, confirmedRef: 'zzzzzzzzzzzzzzzzzzzz' })).rejects.toThrow(/not the project/);
    await expect(ensureReceiptBucket({ ...base, key: 'plain' })).rejects.toThrow(/secret key/);
    const f = fake(reply(200, { ...GOOD, public: true }));
    await expect(ensureReceiptBucket({ ...base, fetcher: f.fetcher })).rejects.toThrow(/different settings/);
    expect(f.calls.every(c => c.method === 'GET')).toBe(true);
  });
});

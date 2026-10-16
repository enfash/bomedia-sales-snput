import { describe, expect, it } from 'vitest';
import { isConnectionBusy, poolSettings, withConnectionRetry } from './db-pool';

describe('poolSettings', () => {
  it('keeps one short-lived connection per instance on Vercel', () => {
    expect(poolSettings({ VERCEL: '1' })).toEqual({ max: 1, idle_timeout: 5 });
  });
  it('keeps the usual two connections elsewhere', () => {
    expect(poolSettings({})).toEqual({ max: 2, idle_timeout: 20 });
  });
});

describe('retrying a refused connection', () => {
  const busy = Object.assign(new Error('max clients reached in session mode - max clients are limited to pool_size: 15'), { code: 'EMAXCONNSESSION' });
  const noWait = async () => undefined;

  it('recognises the connection-limit errors and nothing else', () => {
    expect(isConnectionBusy(busy)).toBe(true);
    expect(isConnectionBusy({ code: '53300' })).toBe(true);
    expect(isConnectionBusy(new Error('too many connections for role'))).toBe(true);
    expect(isConnectionBusy(new Error('duplicate key value violates unique constraint'))).toBe(false);
    expect(isConnectionBusy(undefined)).toBe(false);
  });
  it('tries again after a refused connection and then succeeds', async () => {
    let calls = 0;
    const result = await withConnectionRetry(async () => { calls += 1; if (calls < 3) throw busy; return 'ok'; }, { sleep: noWait });
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });
  it('gives up after the last try and shows the real error', async () => {
    let calls = 0;
    await expect(withConnectionRetry(async () => { calls += 1; throw busy; }, { tries: 3, sleep: noWait })).rejects.toBe(busy);
    expect(calls).toBe(3);
  });
  it('never retries an ordinary failure, so nothing can run twice', async () => {
    let calls = 0;
    const failure = new Error('insufficient stock');
    await expect(withConnectionRetry(async () => { calls += 1; throw failure; }, { sleep: noWait })).rejects.toBe(failure);
    expect(calls).toBe(1);
  });
});

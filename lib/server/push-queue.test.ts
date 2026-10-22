import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDispatchQueue } from './push';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('the alert send queue', () => {
  it('hands the send to the after-response hook when one is available (the Vercel case), without a timer', async () => {
    vi.useFakeTimers();
    const run = vi.fn().mockResolvedValue(undefined);
    const tasks: Array<() => Promise<void> | void> = [];
    createDispatchQueue(run, (task) => { tasks.push(task); })();
    expect(tasks).toHaveLength(1);
    expect(run).not.toHaveBeenCalled(); // runs only when the response has been sent
    await tasks[0]();
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(run).toHaveBeenCalledTimes(1); // no second send from a fallback timer
  });

  it('falls back to one coalesced timer send outside a request (scripts and tests)', async () => {
    vi.useFakeTimers();
    const run = vi.fn().mockResolvedValue(undefined);
    const queue = createDispatchQueue(run, () => { throw new Error('after() called outside a request scope'); }, 800);
    queue(); queue(); queue();
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(800);
    expect(run).toHaveBeenCalledTimes(1);
    queue();
    await vi.advanceTimersByTimeAsync(800);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('never lets a failed send crash the request: it only warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const tasks: Array<() => Promise<void> | void> = [];
    createDispatchQueue(() => Promise.reject(new Error('push service down')), (task) => { tasks.push(task); })();
    await expect(tasks[0]()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith('Phone alerts could not be sent:', 'push service down');
  });
});

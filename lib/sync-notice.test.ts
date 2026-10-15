import { describe, expect, it } from 'vitest';
import { CALM_DELAY_MS, isCalmWaiting } from './sync-notice';

describe('isCalmWaiting', () => {
  it('is calm when the entry is just waiting for the server', () => {
    expect(isCalmWaiting('1 payment(s) saved on this device. Waiting to sync.')).toBe(true);
    expect(isCalmWaiting('2 expense submission(s) saved. Waiting to sync.')).toBe(true);
  });
  it('is not calm when there is an error or a real problem', () => {
    expect(isCalmWaiting('1 payment(s) saved on this device. Connection interrupted. The original payment is saved for retry.')).toBe(false);
    expect(isCalmWaiting('Expense confirmed. Refresh Expenses when the connection returns.')).toBe(false);
    expect(isCalmWaiting('')).toBe(false);
  });
  it('holds a calm message back for a few seconds only', () => {
    expect(CALM_DELAY_MS).toBeGreaterThanOrEqual(5000);
    expect(CALM_DELAY_MS).toBeLessThanOrEqual(15000);
  });
});

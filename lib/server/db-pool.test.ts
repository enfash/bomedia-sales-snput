import { describe, expect, it } from 'vitest';
import { poolSettings } from './db-pool';

describe('poolSettings', () => {
  it('keeps one short-lived connection per instance on Vercel', () => {
    expect(poolSettings({ VERCEL: '1' })).toEqual({ max: 1, idle_timeout: 5 });
  });
  it('keeps the usual two connections elsewhere', () => {
    expect(poolSettings({})).toEqual({ max: 2, idle_timeout: 20 });
  });
});

import { expect, it } from 'vitest';
import { readableLogin } from './staff-utils';

it('shows database timestamps as Lagos time and keeps other text', () => {
  expect(readableLogin('2026-10-11T03:06:31.103582+00:00')).toMatch(/^11 Oct,? 4:06\s?am$/i);
  expect(readableLogin('Yesterday 5pm')).toBe('Yesterday 5pm');
  expect(readableLogin(null)).toBe('Never');
});

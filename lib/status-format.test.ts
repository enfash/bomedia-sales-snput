import { expect, it } from 'vitest';
import { formatClock, formatWhen } from './status-format';

const now = new Date('2026-10-11T10:00:00Z'); // 11:00 am in Lagos
it('uses Lagos time and says Today, Yesterday or the date', () => {
  expect(formatWhen('2026-10-11T03:06:00Z', now)).toBe('Today, 4:06 am');
  expect(formatWhen('2026-10-10T22:30:00Z', now)).toBe('Yesterday, 11:30 pm'); // 23:30 Lagos on 10 Oct
  expect(formatWhen('2026-10-08T11:25:00Z', now)).toBe('8 Oct, 12:25 pm');
  expect(formatWhen('2026-10-10T23:30:00Z', now)).toBe('Today, 12:30 am'); // already 11 Oct in Lagos
});
it('handles missing and broken values and a bare clock', () => {
  expect(formatWhen(null, now)).toBe('Nothing saved yet');
  expect(formatWhen('nonsense', now)).toBe('Unknown time');
  expect(formatClock('2026-10-11T03:41:00Z')).toBe('4:41 am');
});

import { expect, it } from 'vitest';
import { longDate, monthYear, nextCloseWindow } from './bookkeeping-format';

it('writes calendar dates in full without any time-zone drift', () => {
  expect(longDate('2026-10-31')).toBe('31 October 2026');
  expect(longDate('2024-02-29')).toBe('29 February 2024');
  expect(monthYear('2026-10-31')).toBe('October 2026');
  expect(longDate('not a date')).toBe('not a date');
});

it('says which month can be closed next and from when', () => {
  expect(nextCloseWindow('2026-10-01', null, '2026-10-11')).toEqual({ month: 'October', opensOn: '1 November' });
  expect(nextCloseWindow('2026-10-15', null, '2026-10-20')).toEqual({ month: 'October', opensOn: '1 November' });
  expect(nextCloseWindow('2026-10-01', '2026-10-31', '2026-11-05')).toEqual({ month: 'November', opensOn: '1 December' });
  expect(nextCloseWindow('2026-10-01', '2026-11-30', '2026-12-05')).toEqual({ month: 'December', opensOn: '1 January 2027' });
  expect(nextCloseWindow('bad', null, '2026-10-11')).toBeNull();
  expect(nextCloseWindow('2026-10-01', 'bad', '2026-10-11')).toBeNull();
});

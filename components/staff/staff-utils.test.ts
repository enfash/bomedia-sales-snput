import { expect, it } from 'vitest';
import { isStaffView, readableLogin, staffInView } from './staff-utils';

it('shows database timestamps as Lagos time and keeps other text', () => {
  expect(readableLogin('2026-10-11T03:06:31.103582+00:00')).toMatch(/^11 Oct,? 4:06\s?am$/i);
  expect(readableLogin('Yesterday 5pm')).toBe('Yesterday 5pm');
  expect(readableLogin(null)).toBe('Never');
});

it('filters staff by view', () => {
  const ada = { removed: false, online: true }, tunde = { removed: false, online: false }, ade = { removed: true, online: false };
  const kemi = { removed: false, online: true, hidden: true };
  const names = (view: 'active' | 'online' | 'hidden' | 'removed' | 'all') =>
    [['Ada', ada], ['Tunde', tunde], ['ade', ade], ['Kemi', kemi]].filter(([, p]) => staffInView(view, p as typeof kemi)).map(([n]) => n);
  expect(names('active')).toEqual(['Ada', 'Tunde']);
  expect(names('online')).toEqual(['Ada']);
  expect(names('hidden')).toEqual(['Kemi']);
  expect(names('removed')).toEqual(['ade']);
  expect(names('all')).toEqual(['Ada', 'Tunde', 'ade', 'Kemi']);
  expect(isStaffView('hidden')).toBe(true);
  expect(isStaffView('everyone')).toBe(false);
});

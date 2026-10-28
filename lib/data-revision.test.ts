import { expect, it } from 'vitest';
import { FULL_REFRESH_MS, lagosDate, revisionKey, shouldDownload } from './data-revision';

const MINUTE = 60_000;

it('reads the day in Lagos, so the change at Lagos midnight is caught even though UTC is still the day before', () => {
  expect(lagosDate(new Date('2026-10-28T23:30:00Z'))).toBe('2026-10-29');
  expect(lagosDate(new Date('2026-10-28T22:30:00Z'))).toBe('2026-10-28');
});

it('keys the stored feeds by counter and day, and gives no key when the counter is missing', () => {
  expect(revisionKey({ revision: 42 }, '2026-10-28')).toBe('42|2026-10-28');
  expect(revisionKey({ revision: '42' }, '2026-10-28')).toBe('42|2026-10-28');
  expect(revisionKey({}, '2026-10-28')).toBeNull();
  expect(revisionKey(null, '2026-10-28')).toBeNull();
});

it('downloads the first time, then skips while the counter and day are unchanged', () => {
  const download = { key: '42|2026-10-28', lastKey: null, lastDownloadAt: 0 };
  expect(shouldDownload(download, 1_000)).toBe(true);
  expect(shouldDownload({ ...download, lastKey: '42|2026-10-28', lastDownloadAt: 1_000 }, 31_000)).toBe(false);
});

it('downloads again as soon as the counter moves', () => {
  expect(shouldDownload({ key: '43|2026-10-28', lastKey: '42|2026-10-28', lastDownloadAt: 1_000 }, 31_000)).toBe(true);
});

it('downloads again when the Lagos day changes, even if nothing was written', () => {
  expect(shouldDownload({ key: '42|2026-10-29', lastKey: '42|2026-10-28', lastDownloadAt: 1_000 }, 31_000)).toBe(true);
});

it('refreshes after 30 minutes even if nothing changed, as a safety net', () => {
  const lastDownloadAt = 1_000;
  expect(shouldDownload({ key: '42|2026-10-28', lastKey: '42|2026-10-28', lastDownloadAt }, lastDownloadAt + FULL_REFRESH_MS - MINUTE)).toBe(false);
  expect(shouldDownload({ key: '42|2026-10-28', lastKey: '42|2026-10-28', lastDownloadAt }, lastDownloadAt + FULL_REFRESH_MS)).toBe(true);
});

it('downloads every time when the counter cannot be read, which is how the poll always worked', () => {
  expect(shouldDownload({ key: null, lastKey: '42|2026-10-28', lastDownloadAt: 1_000 }, 31_000)).toBe(true);
});

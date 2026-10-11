import { expect, it } from 'vitest';
import { canonicalJobStatus, jobStatuses } from './job-status';

it('preserves database statuses and maps only the board equivalents', () => {
  for (const status of jobStatuses) expect(canonicalJobStatus(status)).toBe(status);
  expect(canonicalJobStatus('In Progress')).toBe('Finishing');
  expect(canonicalJobStatus('Pending')).toBe('Quoted');
  expect(canonicalJobStatus('Completed')).toBe('Delivered');
  for (const value of ['', 'Paid', 'Lost', null, {}, 1]) expect(canonicalJobStatus(value)).toBeUndefined();
});

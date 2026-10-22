import { describe, expect, it } from 'vitest';

import { changeSentence, phoneDetail, unseenChanges } from './customer-changes-view';

const change = { at: '2026-10-13T10:00:00Z', by: 'Ada', name: 'Grace Chapel', changes: { contact: { from: '0803', to: '0805' }, notes: { from: null, to: 'pays late' } } };

describe('customer change wording', () => {
  it('says who changed what', () => {
    expect(changeSentence(change)).toBe('Ada changed the phone number and notes of Grace Chapel');
    expect(changeSentence({ ...change, changes: {} })).toBe('Ada changed the details of Grace Chapel');
  });
  it('shows a phone change in full and nothing for other changes', () => {
    expect(phoneDetail(change)).toBe('0803 → 0805');
    expect(phoneDetail({ changes: { notes: { from: null, to: 'x' } } })).toBe('');
    expect(phoneDetail({ changes: { contact: { from: null, to: '0805' } } })).toBe('no number → 0805');
  });
  it('counts what is newer than the last look', () => {
    expect(unseenChanges([change], null)).toBe(1);
    expect(unseenChanges([change], '2026-10-13T09:00:00Z')).toBe(1);
    expect(unseenChanges([change], '2026-10-13T11:00:00Z')).toBe(0);
  });
});

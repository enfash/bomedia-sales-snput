import { describe, expect, it, vi } from 'vitest';

import { DRAFT_MAX_AGE_MS, clearDraft, draftKey, isEmptyDraft, readDraft, restoredDate, writeDraft, type SaleDraft } from './sale-draft';

const memory = (user?: string) => {
  const data = new Map<string, string>(user ? [['userName', user]] : []);
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k), data };
};
const row = { id: 'r1', materialId: 'FLEX', rollLabel: 'FLEX', itemName: 'Flex', widthFt: 5, jobDescription: 'Banner', jobWidth: 4, jobHeight: 8, dimUnit: 'ft' as const,
  qty: 2, costPerSqft: 200, unitSqft: 32, unitCost: 6400, totalAmount: 12800, jobLengthFt: 16, remainingAfterJob: 100, fromInventory: true, isFlipped: false };
const base = (patch: Partial<SaleDraft> = {}): SaleDraft => ({
  version: 1, savedAt: 1_000_000, savedOn: '2026-10-16',
  meta: { date: '2026-10-16', clientName: 'Ola', contact: '', jobStatus: 'Pending', initialPayment: '0' }, paidBy: '', cart: [row], loadedQuote: null, quoteInput: '',
  job: { materialId: '', desc: '', width: '', height: '', qty: '1', price: '', unit: 'ft' }, nlText: '', ...patch,
});
const notify = vi.fn();

describe('sale draft', () => {
  it('keeps a half-filled sale and gives it back', () => {
    const store = memory('ada');
    writeDraft(store, base(), notify);
    expect(readDraft(store, 1_000_500)).toEqual(base());
    expect(notify).toHaveBeenCalled();
  });

  it('keeps each person’s draft apart on a shared phone', () => {
    const ada = memory('ada'), tunde = memory('tunde');
    expect(draftKey(ada)).not.toBe(draftKey(tunde));
    expect(draftKey(memory())).toContain('owner');
  });

  it('removes the draft when the form is empty (after a sale is saved)', () => {
    const store = memory('ada');
    writeDraft(store, base(), notify);
    writeDraft(store, base({ cart: [], meta: { date: '2026-10-16', clientName: '', contact: '', jobStatus: 'Pending', initialPayment: '0' } }), notify);
    expect(store.data.has(draftKey(store))).toBe(false);
  });

  it('counts a typed customer, contact, payment, item size or note as something worth keeping', () => {
    const empty = base({ cart: [], meta: { date: 'd', clientName: '', contact: '', jobStatus: 'Pending', initialPayment: '0' } });
    expect(isEmptyDraft(empty)).toBe(true);
    expect(isEmptyDraft({ ...empty, meta: { ...empty.meta, contact: '0801' } })).toBe(false);
    expect(isEmptyDraft({ ...empty, meta: { ...empty.meta, initialPayment: '5000' } })).toBe(false);
    expect(isEmptyDraft({ ...empty, job: { ...empty.job, width: '4' } })).toBe(false);
    expect(isEmptyDraft({ ...empty, nlText: 'John ordered' })).toBe(false);
  });

  it('drops a draft older than a day', () => {
    const store = memory('ada');
    writeDraft(store, base(), notify);
    expect(readDraft(store, 1_000_000 + DRAFT_MAX_AGE_MS + 1)).toBeNull();
    expect(store.data.has(draftKey(store))).toBe(false);
  });

  it('refuses and removes anything damaged or from another version', () => {
    const store = memory('ada');
    store.setItem(draftKey(store), '{not json');
    expect(readDraft(store)).toBeNull();
    store.setItem(draftKey(store), JSON.stringify({ ...base(), version: 99 }));
    expect(readDraft(store, 1_000_500)).toBeNull();
    store.setItem(draftKey(store), JSON.stringify({ ...base(), cart: [{ id: 1 }] }));
    expect(readDraft(store, 1_000_500)).toBeNull();
    expect(store.data.has(draftKey(store))).toBe(false);
  });

  it('keeps the sale date only when the draft is from today', () => {
    expect(restoredDate(base(), '2026-10-16')).toBe('2026-10-16');
    expect(restoredDate(base({ savedOn: '2026-10-14', meta: { ...base().meta, date: '2026-10-14' } }), '2026-10-16')).toBe('2026-10-16');
  });

  it('never throws when storage is blocked', () => {
    const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
    expect(readDraft(blocked)).toBeNull();
    expect(() => writeDraft(blocked, base(), notify)).not.toThrow();
    expect(() => clearDraft(blocked, notify)).not.toThrow();
  });
});

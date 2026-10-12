import { describe, expect, it } from 'vitest';

import { changeText, entryChanges, type ApprovalRuleRow } from './approvals-view';

const rules = (days: number | null, percent: number | null): ApprovalRuleRow[] => [
  { kind: 'date', enabled: days !== null, params: { days: days ?? 0 } }, { kind: 'price', enabled: percent !== null, params: { percent: percent ?? 0 } }];
const materials = [{ ref: 'FLEX', priceKobo: '28000' }];
const base = { businessDate: '2026-10-12', today: '2026-10-12', materials, items: [{ kind: 'print' as const, ref: 'FLEX', description: 'Flex print', priceKobo: '28000' }] };

describe('entryChanges', () => {
  it('asks for nothing when no rule is on or nothing differs', () => {
    expect(entryChanges({ ...base, businessDate: '2026-10-09' }, rules(null, null))).toEqual([]);
    expect(entryChanges(base, rules(0, 0))).toEqual([]);
  });
  it('flags a date further from today than the allowed days, either direction', () => {
    expect(entryChanges({ ...base, businessDate: '2026-10-09' }, rules(0, null))).toEqual([{ kind: 'date', asked: '2026-10-09', today: '2026-10-12', daysOff: 3 }]);
    expect(entryChanges({ ...base, businessDate: '2026-10-09' }, rules(3, null))).toEqual([]);
    expect(entryChanges({ ...base, businessDate: '2026-10-14' }, rules(1, null))).toHaveLength(1);
  });
  it('flags a print price outside the allowed percent, higher or lower, but never a service', () => {
    const higher = entryChanges({ ...base, items: [{ ...base.items[0], priceKobo: '30000' }] }, rules(null, 5));
    expect(higher).toEqual([{ kind: 'price', item: 'Flex print', listKobo: 28000, typedKobo: 30000, percentOff: 7.1 }]);
    expect(entryChanges({ ...base, items: [{ ...base.items[0], priceKobo: '25000' }] }, rules(null, 5))).toHaveLength(1);
    expect(entryChanges({ ...base, items: [{ ...base.items[0], priceKobo: '29000' }] }, rules(null, 5))).toEqual([]);
    expect(entryChanges({ ...base, items: [{ kind: 'service', ref: 'x', description: 'Design', priceKobo: '99999' }] }, rules(null, 0))).toEqual([]);
  });
  it('says it in plain words', () => {
    const [date, price] = entryChanges({ ...base, businessDate: '2026-10-09', items: [{ ...base.items[0], priceKobo: '30000' }] }, rules(0, 0));
    expect(changeText(date)).toBe('Friday 9 October, not today (3 days back)');
    expect(changeText(price)).toBe('Flex print: ₦300 per sq ft, list is ₦280 (7.1% higher)');
  });
});

import { rowChange, rowItems, rowTotalKobo, type ApprovalRow } from './approvals-view';
describe('rows from the database', () => {
  it('reads a date and a price change into the same words the cashier saw', () => {
    expect(changeText(rowChange({ kind: 'date', normal: '2026-10-12', asked: '2026-10-09', days_off: -3 }))).toBe('Friday 9 October, not today (3 days back)');
    expect(changeText(rowChange({ kind: 'price', item: 'Flex', material: 'Flex', list_per_sqft_kobo: '28000', typed_per_sqft_kobo: '25000', percent_off: -10.7 }))).toBe('Flex: ₦250 per sq ft, list is ₦280 (10.7% lower)');
  });
  it('reads the total and items, tolerating a missing summary', () => {
    const row = { summary: { total_kobo: '4200000', items: ['Flex print', 'Banner'] } } as unknown as ApprovalRow;
    expect(rowTotalKobo(row)).toBe(4200000);
    expect(rowItems(row)).toBe('Flex print, Banner');
    expect(rowTotalKobo({ summary: {} } as unknown as ApprovalRow)).toBe(0);
  });
});

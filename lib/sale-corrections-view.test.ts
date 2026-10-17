import { describe, expect, it } from 'vitest';
import { accessFrom, canChangeSale, effectOf } from './sale-corrections-view';
import type { CorrectionPlan } from './server/sale-corrections';

const rules = (enabled: boolean, days = 7) => ({ isOwner: false, rules: [{ kind: 'edit_old' as const, enabled, params: { days } }] });
const plan = (over: Partial<CorrectionPlan> = {}): CorrectionPlan => ({ mode: 'correct', job_id: 'j', sales_id: 'BOM-1', client: 'A', before: {}, after: {}, returns: [{ roll: 'Flex', length_ft: '4' }], takes: [{ roll: 'Flex', length_ft: '2' }],
  old_amount_kobo: '600000', new_amount_kobo: '200000', paid_kobo: '0', cost_kobo: '0', ...over });

describe('who may change a sale', () => {
  it('lets the owner change any sale', () => {
    expect(canChangeSale({ isOwner: true, enabled: false, days: 7 }, '2020-01-01', '2026-10-12')).toBe(true);
  });
  it('lets a cashier only when the owner switched it on and the sale is recent enough', () => {
    const access = accessFrom(rules(true, 7));
    expect(canChangeSale(access, '2026-10-12', '2026-10-12')).toBe(true);
    expect(canChangeSale(access, '2026-10-05', '2026-10-12')).toBe(true);
    expect(canChangeSale(access, '2026-10-04', '2026-10-12')).toBe(false);
    expect(canChangeSale(accessFrom(rules(false)), '2026-10-12', '2026-10-12')).toBe(false);
    expect(canChangeSale(null, '2026-10-12', '2026-10-12')).toBe(false);
    expect(canChangeSale(access, null, '2026-10-12')).toBe(false);
  });
});

describe('what a change does', () => {
  it('shows the totals and the stock that comes back and goes out', () => {
    const e = effectOf([plan()]);
    expect(e).toMatchObject({ oldText: '₦6,000', newText: '₦2,000', stock: '4 ft back to Flex, 2 ft taken', credit: 0 });
  });
  it('adds up a whole sale and names the credit when more was paid than the new total', () => {
    const e = effectOf([plan({ old_amount_kobo: '1000000', new_amount_kobo: '0', paid_kobo: '500000', returns: [{ roll: 'Flex', length_ft: '6' }], takes: [] }), plan({ old_amount_kobo: '685000', new_amount_kobo: '0', paid_kobo: '0', returns: [{ roll: 'Flex', length_ft: '2' }], takes: [] })]);
    expect(e).toMatchObject({ oldText: '₦16,850', newText: '₦0', paidText: '₦5,000', creditText: '₦5,000', stock: '8 ft back to Flex' });
  });
  it('says so when no stock moves, as for a service', () => {
    expect(effectOf([plan({ returns: [], takes: [] })]).stock).toBe('No stock moves');
  });
});

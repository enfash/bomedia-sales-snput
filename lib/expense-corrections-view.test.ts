import { describe, expect, it } from 'vitest';

import { expenseChangeable, expenseDateOf, expenseEffectOf } from './expense-corrections-view';
import type { ExpensePlan } from './server/expense-corrections';

const plan = (over: Partial<ExpensePlan>): ExpensePlan => ({ mode: 'correct', expense_id: 'x', reference: 'EXP-1', before: {}, after: {}, old_amount_kobo: '6000000', new_amount_kobo: '600000', paid: true, excess_kobo: '5400000', ...over });

describe('expense correction helpers', () => {
  it('says what a paid correction does to the money', () => {
    expect(expenseEffectOf(plan({}))).toMatchObject({ paid: true, oldText: '₦60,000', newText: '₦6,000', paidText: '₦60,000', excess: 5400000, excessText: '₦54,000' });
  });
  it('says nothing is owed after cancelling an unpaid expense', () => {
    expect(expenseEffectOf(plan({ paid: false, new_amount_kobo: '0', excess_kobo: '0' })).owedText).toBe('Nothing');
  });
  it('reads the day from the feed text', () => {
    expect(expenseDateOf('2026-10-12')).toBe('2026-10-12');
    expect(expenseDateOf('')).toBe('');
  });
  it('only offers a change on a books-backed, uncancelled expense with a reference', () => {
    expect(expenseChangeable({ _backend: 'postgres', STATUS: 'Paid', 'EXPENSE ID': 'EXP-20261012-0007' })).toBe(true);
    expect(expenseChangeable({ _backend: 'postgres', STATUS: 'Cancelled', 'EXPENSE ID': 'EXP-20261012-0007' })).toBe(false);
    expect(expenseChangeable({ STATUS: 'Paid', 'EXPENSE ID': 'EXP-1' })).toBe(false);
    expect(expenseChangeable({ _backend: 'postgres', STATUS: 'Paid', 'EXPENSE ID': 'MIG-1' })).toBe(false);
  });
});

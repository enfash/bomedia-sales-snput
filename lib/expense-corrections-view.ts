// How the expense correct and cancel screens read a plan. Pure helpers: no styling, no data access.
import { koboNaira } from './approvals-view';
import type { ExpensePlan } from './server/expense-corrections';

/** What a plan does, in plain figures: the amount, what was already paid out, and what is held to recover. */
export function expenseEffectOf(plan: ExpensePlan) {
  const oldKobo = Number(plan.old_amount_kobo), newKobo = Number(plan.new_amount_kobo), excess = Number(plan.excess_kobo);
  return { paid: plan.paid, oldText: koboNaira(oldKobo), newText: koboNaira(newKobo), paidText: koboNaira(Number(plan.paid_out_kobo) || oldKobo), excess, excessText: koboNaira(excess), owedText: newKobo > 0 ? koboNaira(newKobo) : 'Nothing' };
}

/** The day an expense counts for, from the feed's date text. */
export const expenseDateOf = (text: string) => /^(\d{4}-\d{2}-\d{2})/.exec((text || '').trim())?.[1] ?? '';

/** Whether this expense can be corrected from the screen: books-backed, with a reference, and not already cancelled. */
export const expenseChangeable = (expense: { _backend?: string; STATUS?: string; 'EXPENSE ID'?: string }) =>
  expense._backend === 'postgres' && expense.STATUS !== 'Cancelled' && /^EXP-/.test(expense['EXPENSE ID'] ?? '');

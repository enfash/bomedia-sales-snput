import { callFinancial, type FinancialCall } from './financial-db';
import { FinancialError, validUUID, type FinancialActor } from './financial-service';

export type ExpenseChanges = { amountKobo?: string; category?: string; description?: string; paidTo?: string; businessDate?: string };
export type ExpensePlan = {
  mode: 'correct' | 'cancel'; expense_id: string; reference: string; before: Record<string, unknown>; after: Record<string, unknown>;
  old_amount_kobo: string; new_amount_kobo: string; paid: boolean; paid_out_kobo: string; excess_kobo: string;
};
export type ExpenseHistoryEntry = {
  at: string; kind: 'correction' | 'cancellation'; revision: number; reason: string; by: string | null; approved_by: string | null;
  before: Record<string, unknown>; after: Record<string, unknown>; excess_kobo: string;
};

const invalid = (message: string) => new FinancialError(message, 400, 'INVALID_INPUT');
const CHANGE_KEYS = ['amountKobo', 'category', 'description', 'paidTo', 'businessDate'];
const REFERENCE = /^EXP-[A-Za-z0-9-]{1,40}$/;
function mapError(error: unknown): never {
  const code = (error as { code?: string }).code;
  if (code === '42501') throw new FinancialError('Account access is no longer available.', 403, 'ACTOR_DISABLED');
  if (code === 'P0002') throw new FinancialError(error instanceof Error ? error.message : 'That expense could not be found.', 404, 'NOT_FOUND');
  if (['22023', '23514', '22P02'].includes(code ?? '')) throw new FinancialError(error instanceof Error ? error.message : 'That change cannot be made.', 409, 'CORRECTION_REVIEW_REQUIRED');
  throw error;
}
/** Checks the shape of a request the way the database will, so the person gets a precise message first. */
function target(input: unknown, withReason: boolean) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid('Choose what to change.');
  const body = input as Record<string, unknown>;
  if (Object.keys(body).some((key) => !['requestId', 'mode', 'reference', 'changes', 'reason'].includes(key))) throw invalid('Use the supported correction fields.');
  if (body.mode !== 'correct' && body.mode !== 'cancel') throw invalid('Choose correct or cancel.');
  if (typeof body.reference !== 'string' || !REFERENCE.test(body.reference.trim())) throw invalid('Choose the expense to change.');
  const changes = body.changes === undefined ? {} : body.changes;
  if (!changes || typeof changes !== 'object' || Array.isArray(changes) || Object.keys(changes).some((key) => !CHANGE_KEYS.includes(key))) throw invalid('Use the supported change fields.');
  if (body.mode === 'correct' && !Object.keys(changes).length) throw invalid('Change at least one thing.');
  if (body.mode === 'cancel' && Object.keys(changes).length) throw invalid('A cancelled expense takes no other changes.');
  if (withReason && (typeof body.reason !== 'string' || !body.reason.trim() || body.reason.length > 500)) throw invalid('Say why, in up to 500 characters.');
  return { body, reference: body.reference.trim(), changes: changes as ExpenseChanges };
}

export function createExpenseCorrections(call: FinancialCall = callFinancial) {
  return {
    async preview(input: unknown, actor: FinancialActor, owner: boolean) {
      const { body, reference, changes } = target(input, false);
      try { return (await call<{ plan: ExpensePlan }>('api_expense_detail', 'preview', { mode: body.mode, reference, changes, actor_id: actor.staffId, by_owner: String(owner) })).plan; } catch (error) { return mapError(error); }
    },
    // The server, never the browser, says whether the signed-in person is the owner.
    async request(actor: FinancialActor, isOwner: boolean, input: unknown) {
      const { body, reference, changes } = target(input, true);
      if (!validUUID(actor.staffId)) throw new FinancialError('An enabled accounting identity is required.', 403, 'ACTOR_REQUIRED');
      if (typeof body.requestId !== 'string' || !body.requestId.trim() || body.requestId.length > 200) throw invalid('Request ID is required.');
      try {
        return await call<Record<string, unknown>>('api_expense_correction', body.requestId.trim(), {
          actor_id: actor.staffId.toLowerCase(), mode: body.mode, reference, changes, reason: String(body.reason).trim(), ...(isOwner ? { byOwner: 'true' } : {}),
        });
      } catch (error) { return mapError(error); }
    },
    /** The owner records money coming back on a lowered or cancelled paid expense. */
    async recover(actor: FinancialActor, input: unknown) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid('Choose what was received.');
      const body = input as Record<string, unknown>;
      if (Object.keys(body).some((key) => !['requestId', 'reference', 'amountKobo', 'paymentMethod', 'businessDate'].includes(key))) throw invalid('Use the supported recovery fields.');
      if (!validUUID(actor.staffId)) throw new FinancialError('An enabled accounting identity is required.', 403, 'ACTOR_REQUIRED');
      if (typeof body.requestId !== 'string' || !body.requestId.trim() || body.requestId.length > 200) throw invalid('Request ID is required.');
      if (typeof body.reference !== 'string' || !REFERENCE.test(body.reference.trim())) throw invalid('Choose the expense.');
      if (typeof body.amountKobo !== 'string' || !/^[0-9]{1,15}$/.test(body.amountKobo)) throw invalid('Enter the amount received.');
      if (typeof body.paymentMethod !== 'string' || !body.paymentMethod.trim()) throw invalid('Choose how it was received.');
      if (typeof body.businessDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.businessDate)) throw invalid('Choose the date it was received.');
      try {
        return await call<Record<string, unknown>>('api_expense_recovery', body.requestId.trim(), {
          actor_id: actor.staffId.toLowerCase(), reference: body.reference.trim(), amountKobo: body.amountKobo, paymentMethod: body.paymentMethod.trim(), businessDate: body.businessDate,
        });
      } catch (error) { return mapError(error); }
    },
    async history(reference: unknown, actor: FinancialActor, owner: boolean) {
      if (typeof reference !== 'string' || !REFERENCE.test(reference.trim())) throw invalid('Choose an expense.');
      return call<ExpenseHistoryEntry[]>('api_expense_detail', 'history', {reference: reference.trim(), actor_id: actor.staffId, by_owner: String(owner)});
    },
  };
}
export const expenseCorrections = createExpenseCorrections();

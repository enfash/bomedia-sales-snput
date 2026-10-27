import { callFinancial, type FinancialCall } from './financial-db';
import { FinancialError, validUUID, type FinancialActor } from './financial-service';
import { correctionDateProblem, correctionDateRules } from '../sale-correction-dates';

export type CorrectionChanges = { description?: string; quantity?: string; width?: string; height?: string; unit?: 'ft' | 'in'; priceKobo?: string; materialId?: string; businessDate?: string };
export type CorrectionPlan = {
  mode: 'correct' | 'cancel'; job_id: string; sales_id: string; client: string | null; before: Record<string, unknown>; after: Record<string, unknown>;
  returns: { roll: string; length_ft: string }[]; takes: { roll: string; length_ft: string }[]; old_amount_kobo: string; new_amount_kobo: string; paid_kobo: string; cost_kobo: string;
};
export type SaleHistoryEntry = {
  at: string; kind: 'correction' | 'cancellation'; revision: number; job: string; reason: string; by: string | null; approved_by: string | null;
  before: Record<string, unknown>; after: Record<string, unknown>; stock_returned: { roll: string; length_ft: string }[]; stock_taken: { roll: string; length_ft: string }[];
};

const invalid = (message: string) => new FinancialError(message, 400, 'INVALID_INPUT');
const CHANGE_KEYS = ['description', 'quantity', 'width', 'height', 'unit', 'priceKobo', 'materialId', 'businessDate'];
function mapError(error: unknown): never {
  const code = (error as { code?: string }).code;
  const message = error instanceof Error ? error.message : '';
  if (code === '23514' && /New accounting requires active books|Opening date has not been configured|accounting period is closed/.test(message)) {
    throw new FinancialError('The bookkeeping dates have changed or this date is outside the open books. Refresh the sale and choose an allowed date.', 409, 'CORRECTION_DATE_REQUIRED');
  }
  if (code === '42501') throw new FinancialError('Account access is no longer available.', 403, 'ACTOR_DISABLED');
  if (code === 'P0002') throw new FinancialError(error instanceof Error ? error.message : 'That sale could not be found.', 404, 'NOT_FOUND');
  if (['22023', '23514', '22P02'].includes(code ?? '')) throw new FinancialError(error instanceof Error ? error.message : 'That change cannot be made.', 409, 'CORRECTION_REVIEW_REQUIRED');
  throw error;
}
/** Checks the shape of a request the way the database will, so the person gets a precise message first. */
function target(input: unknown, withReason: boolean) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid('Choose what to change.');
  const body = input as Record<string, unknown>;
  if (Object.keys(body).some((key) => !['requestId', 'mode', 'jobId', 'salesId', 'changes', 'reason'].includes(key))) throw invalid('Use the supported correction fields.');
  if (body.mode !== 'correct' && body.mode !== 'cancel') throw invalid('Choose correct or cancel.');
  if (body.mode === 'correct' && !validUUID(body.jobId)) throw invalid('Choose the job to correct.');
  if (body.mode === 'cancel' && (typeof body.salesId !== 'string' || !body.salesId.trim() || body.salesId.length > 100)) throw invalid('Choose the sale to cancel.');
  const changes = body.changes === undefined ? {} : body.changes;
  if (!changes || typeof changes !== 'object' || Array.isArray(changes) || Object.keys(changes).some((key) => !CHANGE_KEYS.includes(key))) throw invalid('Use the supported change fields.');
  if (body.mode === 'correct' && !Object.keys(changes).length) throw invalid('Change at least one thing.');
  if (body.mode === 'cancel' && Object.keys(changes).length) throw invalid('A cancelled sale takes no other changes.');
  if (withReason && (typeof body.reason !== 'string' || !body.reason.trim() || body.reason.length > 500)) throw invalid('Say why, in up to 500 characters.');
  return { body, changes: changes as CorrectionChanges };
}
const targetFields = (body: Record<string, unknown>) => (body.mode === 'correct' ? { jobId: String(body.jobId).toLowerCase() } : { salesId: String(body.salesId).trim() });

export function createSaleCorrections(call: FinancialCall = callFinancial) {
  return {
    async preview(input: unknown) {
      const { body, changes } = target(input, false);
      try {
        if (body.mode === 'cancel') return await call<{ plans: CorrectionPlan[] }>('api_sale_correction_preview', '', { mode: body.mode, ...targetFields(body), changes });
        const dateRules = correctionDateRules(await call('api_bookkeeping_period', 'current', {}));
        if (Object.hasOwn(changes, 'businessDate')) {
          const problem = correctionDateProblem(changes.businessDate, dateRules);
          if (problem) throw new FinancialError(problem, 409, 'CORRECTION_DATE_REQUIRED');
        }
        const result = await call<{ plans: CorrectionPlan[] }>('api_sale_correction_preview', '', { mode: body.mode, ...targetFields(body), changes });
        return { ...result, dateRules };
      } catch (error) { return mapError(error); }
    },
    // The server, never the browser, says whether the signed-in person is the owner.
    async request(actor: FinancialActor, isOwner: boolean, input: unknown) {
      const { body, changes } = target(input, true);
      if (!validUUID(actor.staffId)) throw new FinancialError('An enabled accounting identity is required.', 403, 'ACTOR_REQUIRED');
      if (typeof body.requestId !== 'string' || !body.requestId.trim() || body.requestId.length > 200) throw invalid('Request ID is required.');
      try {
        // Keep the database's receipt lookup first: a retry must recover a saved
        // correction even if its accounting period has closed since the save.
        return await call<Record<string, unknown>>('api_sale_correction', body.requestId.trim(), {
          actor_id: actor.staffId.toLowerCase(), mode: body.mode, ...targetFields(body), changes, reason: String(body.reason).trim(), ...(isOwner ? { byOwner: 'true' } : {}),
        });
      } catch (error) { return mapError(error); }
    },
    async history(salesId: unknown) {
      if (typeof salesId !== 'string' || !salesId.trim() || salesId.length > 100) throw invalid('Choose a sale.');
      return call<SaleHistoryEntry[]>('api_sale_history', salesId.trim(), {});
    },
  };
}
export const saleCorrections = createSaleCorrections();

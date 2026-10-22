import { callFinancial, type FinancialCall } from './financial-db';
import { FinancialError, validUUID, type FinancialActor } from './financial-service';

export type BookkeepingPeriod =
  | { configured: false; today: string }
  | { configured: true; starts_on: string; state: 'setup' | 'active'; closed_through: string | null; today: string; closable: string[] };

const invalid = (message: string) => new FinancialError(message, 400, 'INVALID_INPUT');

export function createBookkeepingPeriod(call: FinancialCall = callFinancial) {
  return {
    read() { return call<BookkeepingPeriod>('api_bookkeeping_period', 'current', {}); },
    // The database re-checks everything (finished month-end, not already closed, active books); this only gives precise messages first.
    async close(actor: FinancialActor, input: unknown) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid('Choose the month to close.');
      const body = input as Record<string, unknown>;
      if (Object.keys(body).some((key) => key !== 'requestId' && key !== 'through')) throw invalid('Use the supported closing fields.');
      if (!validUUID(actor.staffId)) throw new FinancialError('An enabled accounting identity is required.', 403, 'ACTOR_REQUIRED');
      if (typeof body.requestId !== 'string' || !body.requestId.trim() || body.requestId.length > 200) throw invalid('Request ID is required.');
      if (typeof body.through !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.through)) throw invalid('Choose the month to close.');
      try { return await call<{ closed_through: string }>('api_close_books', body.requestId.trim(), { actor_id: actor.staffId.toLowerCase(), through: body.through }); }
      catch (error) {
        const code = (error as { code?: string }).code;
        if (code === '42501') throw new FinancialError('Account access is no longer available.', 403, 'ACTOR_DISABLED');
        if (code === '22023') throw new FinancialError('That month can no longer be closed. Refresh the page and choose again.', 409, 'PERIOD_REVIEW_REQUIRED');
        if (code === '23514') throw new FinancialError('The books are not active yet, so nothing can be closed.', 409, 'PERIOD_REVIEW_REQUIRED');
        throw error;
      }
    },
  };
}
export const bookkeepingPeriod = createBookkeepingPeriod();

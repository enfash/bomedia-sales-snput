import { callFinancial, type FinancialCall } from './financial-db';
import { FinancialError, validUUID, type FinancialActor } from './financial-service';
import type { SaleItemRaw } from '../customer-sale-items';

export type CustomerRow = {
  id: string; reference: string; name: string; contact: string; notes: string; orders: number;
  total_kobo: string; paid_kobo: string; owed_kobo: string; last_order_date: string | null; created_at: string;
  /** Lifetime figures (migration 55): the Sheet history plus sales made in the new app. Absent until that migration is applied. */
  spent_kobo?: string; spent_before_kobo?: string; spent_since_kobo?: string; orders_lifetime?: number; orders_before?: number; orders_since?: number;
};
export type CustomerProfile = {
  customer: CustomerRow;
  /** `items` is each item of the order (migration 56); absent until that migration is applied. */
  sales: { sales_id: string; date: string | null; jobs: number; what: string; items?: SaleItemRaw[]; total_kobo: string; paid_kobo: string; owed_kobo: string }[];
  payments: { reference: string; date: string | null; amount_kobo: string; method: string; by: string }[];
  changes: { at: string; by: string; changes: Record<string, { from: string | null; to: string | null }> }[];
};

const invalid = (message: string) => new FinancialError(message, 400, 'INVALID_INPUT');
function mapError(error: unknown): never {
  const code = (error as { code?: string }).code;
  if (code === '42501') throw new FinancialError('Account access is no longer available.', 403, 'ACTOR_DISABLED');
  if (code === 'P0002') throw new FinancialError('That customer could not be found.', 404, 'NOT_FOUND');
  if (code === '22023') throw new FinancialError(error instanceof Error ? error.message : 'That change cannot be saved.', 409, 'CUSTOMER_REVIEW_REQUIRED');
  throw error;
}

export type CustomerHistory = {
  summary: { rows: number; orders: number; total_kobo: string; paid_kobo: string; owed_kobo: string; first_date: string | null; last_date: string | null };
  rows: { sheet_row: number; sales_id: string | null; date: string; what: string; material: string | null; quantity: string | null; amount_kobo: string;
    paid_kobo: string; owed_kobo: string; status: string | null; job_status: string | null; logged_by: string | null; note: string | null }[];
};

export type RecentCustomerChange = { id: string; at: string; customer_id: string; reference: string; name: string; by_id: string; by: string; changes: Record<string, { from: string | null; to: string | null }> };

export function createCustomers(call: FinancialCall = callFinancial) {
  return {
    async recentChanges(days = 14) { return call<RecentCustomerChange[]>('api_recent_customer_changes', String(days), {}); },
    async list() { return (await call<{ data: CustomerRow[] }>('api_customers', '', {})).data; },
    // Old sales from the Google Sheet, kept as read-only history. Never part of what the customer owes today.
    async history(id: unknown) {
      if (!validUUID(id)) throw invalid('Choose a customer.');
      try { return await call<CustomerHistory>('api_customer_history', String(id).toLowerCase(), {}); } catch (error) { return mapError(error); }
    },
    async profile(id: unknown) {
      if (!validUUID(id)) throw invalid('Choose a customer.');
      try { return await call<CustomerProfile>('api_customer_profile', String(id).toLowerCase(), {}); } catch (error) { return mapError(error); }
    },
    // The database re-checks every limit; this gives precise messages first and keeps the browser from claiming to be the owner.
    async save(actor: FinancialActor, isOwner: boolean, input: unknown) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid('Choose what to change.');
      const body = input as Record<string, unknown>;
      if (Object.keys(body).some((key) => !['requestId', 'customerId', 'name', 'contact', 'notes'].includes(key))) throw invalid('Use the supported customer fields.');
      if (!validUUID(actor.staffId)) throw new FinancialError('An enabled accounting identity is required.', 403, 'ACTOR_REQUIRED');
      if (typeof body.requestId !== 'string' || !body.requestId.trim() || body.requestId.length > 200) throw invalid('Request ID is required.');
      if (!validUUID(body.customerId)) throw invalid('Choose a customer.');
      for (const key of ['name', 'contact', 'notes'] as const) if (body[key] !== undefined && typeof body[key] !== 'string') throw invalid(`The ${key} must be text.`);
      if (!['name', 'contact', 'notes'].some((key) => body[key] !== undefined)) throw invalid('Change the phone number, the notes or the name.');
      try {
        return await call<{ changed: boolean; customer: CustomerRow }>('api_customer_save', body.requestId.trim(), {
          actor_id: actor.staffId.toLowerCase(), customer_id: String(body.customerId).toLowerCase(),
          ...(body.name !== undefined ? { name: body.name } : {}), ...(body.contact !== undefined ? { contact: body.contact } : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}), ...(isOwner ? { by_owner: true } : {}),
        });
      } catch (error) { return mapError(error); }
    },
  };
}
export const customers = createCustomers();

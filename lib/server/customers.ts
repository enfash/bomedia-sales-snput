import { callFinancial, type FinancialCall } from './financial-db';
import { FinancialError, validUUID, type FinancialActor } from './financial-service';

export type CustomerRow = {
  id: string; reference: string; name: string; contact: string; notes: string; orders: number;
  total_kobo: string; paid_kobo: string; owed_kobo: string; last_order_date: string | null; created_at: string;
};
export type CustomerProfile = {
  customer: CustomerRow;
  sales: { sales_id: string; date: string | null; jobs: number; what: string; total_kobo: string; paid_kobo: string; owed_kobo: string }[];
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

export type RecentCustomerChange = { id: string; at: string; customer_id: string; reference: string; name: string; by_id: string; by: string; changes: Record<string, { from: string | null; to: string | null }> };

export function createCustomers(call: FinancialCall = callFinancial) {
  return {
    async recentChanges(days = 14) { return call<RecentCustomerChange[]>('api_recent_customer_changes', String(days), {}); },
    async list() { return (await call<{ data: CustomerRow[] }>('api_customers', '', {})).data; },
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

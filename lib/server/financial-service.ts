import { normalizePaymentMethod } from '../payment-methods';
import { callFinancial, type FinancialCall } from './financial-db';

export class FinancialError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) { super(message); }
}
export type FinancialActor = { staffId: string };
export type CollectionResult = { payment_id: string; journal_entry_id: string; amount_kobo: string;
  allocations: {job_id: string; amount_kobo: string; kind: 'settlement'}[] };
export type FinancialPage = {data: Record<string, unknown>[]; next_after_id: string | null};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const invalid = (message: string) => new FinancialError(message,400,'INVALID_INPUT');
export function validUUID(value: unknown): value is string {return typeof value==='string' && uuid.test(value);}
function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input!=='object' || Array.isArray(input)) throw invalid('An object is required.');
  return input as Record<string, unknown>;
}
function text(value: unknown, max: number, name: string): string {
  if (typeof value!=='string' || !value.trim() || value.length>max) throw invalid(`${name} is required.`);
  return value.trim();
}
function date(value: unknown) {
  if (typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) throw invalid('Choose a valid business date.');
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10)!==value) throw invalid('Choose a valid business date.');
  return value;
}
export function createFinancialService(call: FinancialCall = callFinancial) {
  return {
    async collect(actor: FinancialActor, input: unknown): Promise<CollectionResult> {
      if (!validUUID(actor.staffId)) throw new FinancialError('Your account needs an accounting identity.',403,'ACTOR_REQUIRED');
      const body = object(input);
      const allowed = new Set(['requestId','expectedStaffId','customerId','jobIds','amountKobo','businessDate','cashAccountCode','method','notes']);
      if (Object.keys(body).some(key=>!allowed.has(key))) throw invalid('Use stable customer/job IDs and the actual payment amount. Legacy row references need review.');
      if (body.expectedStaffId!==undefined && (typeof body.expectedStaffId!=='string' || body.expectedStaffId.toLowerCase()!==actor.staffId.toLowerCase())) throw new FinancialError('Sign in as the staff member who saved this entry.',403,'ACTOR_CHANGED');
      if (!validUUID(body.customerId) || !Array.isArray(body.jobIds) || body.jobIds.length<1 || body.jobIds.length>500
        || !body.jobIds.every(validUUID) || new Set(body.jobIds.map(id=>id.toLowerCase())).size!==body.jobIds.length) {
        throw invalid('Choose one customer and distinct jobs belonging to that customer.');
      }
      if (typeof body.amountKobo!=='string' || !/^[1-9][0-9]{0,18}$/.test(body.amountKobo) || BigInt(body.amountKobo)>BigInt('9223372036854775807')) {
        throw invalid('Enter the positive amount received in whole kobo.');
      }
      const method=normalizePaymentMethod(body.method);
      if (!method) throw invalid('Choose Cash, Transfer or POS.');
      if (body.cashAccountCode!==undefined && (typeof body.cashAccountCode!=='string' || !/^[0-9]{4,8}$/.test(body.cashAccountCode))) throw invalid('Invalid receiving account.');
      const payload: Record<string, unknown> = {actor_id:actor.staffId.toLowerCase(),customer_id:body.customerId.toLowerCase(),
        job_ids:body.jobIds.map(id=>id.toLowerCase()).sort(),amount_kobo:body.amountKobo,business_date:date(body.businessDate),method};
      if (body.cashAccountCode!==undefined) payload.cash_account_code=body.cashAccountCode;
      if (body.notes!==undefined) payload.notes=text(body.notes,2000,'Notes');
      try {return await call<CollectionResult>('api_collect',text(body.requestId,200,'Request ID'),payload);}
      catch (error) {
        const code=(error as {code?:string}).code;
        if (code==='42501') throw new FinancialError('Collector access is no longer available.',403,'ACTOR_DISABLED');
        if (['22023','23514','23503','22P02','22003','22007','22008'].includes(code || '')) {
          throw new FinancialError('Payment was not recorded. Check the selected debt, receiving account, accounting period and request ID. Keep this entry for review.',409,'PAYMENT_REVIEW_REQUIRED');
        }
        throw error;
      }
    },
    async report(from: unknown, through: unknown): Promise<Record<string,unknown>> {
      const start=date(from), end=date(through);
      if (start>end) throw invalid('Reporting start must be before its end.');
      return call<Record<string,unknown>>('api_report',start,{through:end});
    },
    async read(resource: string, filter: Record<string,unknown>): Promise<FinancialPage> {
      if (resource==='payment_methods') {
        if (Object.keys(filter).length) throw invalid('Payment methods do not accept filters.');
        return call<FinancialPage>('api_payment_methods','',{});
      }
      if (!['customers','jobs','payments','cash_accounts','expenses','materials','inventory','estimates'].includes(resource)) throw invalid('Unknown accounting resource.');
      if (Object.keys(filter).some(key=>!['limit','after_id','customer_id'].includes(key))) throw invalid('Unknown filter.');
      if (filter.limit!==undefined && (!Number.isInteger(filter.limit) || Number(filter.limit)<1 || Number(filter.limit)>500)) throw invalid('Limit must be 1 to 500.');
      for (const key of ['after_id','customer_id']) if (filter[key]!==undefined && !validUUID(filter[key])) throw invalid('Invalid record ID.');
      if (filter.customer_id!==undefined && !['customers','jobs','payments'].includes(resource)) throw invalid('Customer filter is not supported here.');
      if (resource==='cash_accounts' && (filter.after_id!==undefined || filter.customer_id!==undefined)) throw invalid('Account filters are not supported.');
      return call<FinancialPage>('api_read',resource,filter);
    },
  };
}
export const financialService = createFinancialService();

import { isUUID, validBusinessDate } from './payment-contract';
import { normalizePaymentMethod, type PaymentMethod } from './payment-methods';
import type { ServicePricing } from './service-pricing';
export type OrderItem = { kind: 'print' | 'service'; ref: string; description: string; quantity: string;
  width?: string; height?: string; unit?: 'ft' | 'in'; priceKobo: string; priceRequestId?: string; approvedUnitKobo?: string };
export type ScreenOrder = { version: 3; backend: 'postgres'; operation: 'sale' | 'quote'; requestId: string;
  expectedStaffId: string; businessDate: string; clientName: string; contact: string; customerId?: string; quoteId?: string;
  jobStatus: string; initialPaymentKobo: string; paymentMethod?: PaymentMethod; totalKobo: string; items: OrderItem[];
  /** Why the cashier chose a different date or price. Required by the database only when the owner has to approve the sale. */
  approvalReason?: string };
export type OrderCatalog = { customers: { id: string; name: string; contact: string | null }[];
  materials: { id: string; ref: string; name: string; width: string; priceKobo: string }[];
  services: { id: string; name: string; pricing: ServicePricing; priceKobo: string | null }[] };
const integer = (x: unknown) => typeof x === 'string' && /^(0|[1-9][0-9]{0,15})$/.test(x);
const dimension = (x: unknown) => typeof x === 'string' && /^[0-9]{1,6}(\.[0-9]{1,6})?$/.test(x) && Number(x) > 0;
export function orderContract(value: unknown): ScreenOrder {
  if (!value || typeof value !== 'object') throw new Error('Invalid saved order.');
  const o = value as ScreenOrder;
  if (o.version !== 3 || o.backend !== 'postgres' || !['sale','quote'].includes(o.operation) || !isUUID(o.requestId)
    || !isUUID(o.expectedStaffId) || !validBusinessDate(o.businessDate) || typeof o.clientName !== 'string' || !o.clientName.trim() || o.clientName.length > 200
    || typeof o.contact !== 'string' || o.contact.length > 100 || !['Quoted','Printing','Finishing','Ready','Delivered'].includes(o.jobStatus)
    || !integer(o.initialPaymentKobo) || !integer(o.totalKobo)
    || (o.operation === 'quote' && o.initialPaymentKobo !== '0')
    || (o.initialPaymentKobo !== '0' && normalizePaymentMethod(o.paymentMethod) !== o.paymentMethod)
    || (o.initialPaymentKobo !== '0' && !o.paymentMethod)
    || (o.customerId !== undefined && !isUUID(o.customerId)) || (o.quoteId !== undefined && !isUUID(o.quoteId))
    || (o.approvalReason !== undefined && (typeof o.approvalReason !== 'string' || o.approvalReason.length > 500))
    || !Array.isArray(o.items) || o.items.length < 1 || o.items.length > 100) throw new Error('Check the order, date, payment and customer before saving.');
  for (const i of o.items) {
    if (!i || !['print','service'].includes(i.kind) || typeof i.ref !== 'string' || !i.ref || i.ref.length > 200
      || typeof i.description !== 'string' || !i.description.trim() || i.description.length > 1000
      || !/^[1-9][0-9]{0,4}$/.test(i.quantity) || Number(i.quantity) > 10000 || !integer(i.priceKobo) || (i.kind === 'print' && i.priceKobo === '0')
      || (i.kind === 'print' && (!dimension(i.width) || !dimension(i.height) || !['ft','in'].includes(i.unit!)))
      || (i.kind === 'service' && (!isUUID(i.ref) || i.width !== undefined || i.height !== undefined))
      || (i.priceRequestId !== undefined && (!isUUID(i.priceRequestId) || !o.quoteId))
      || (i.approvedUnitKobo !== undefined && (!i.priceRequestId || !integer(i.approvedUnitKobo) || i.approvedUnitKobo === '0'))) throw new Error('Check every item’s size, quantity and price.');
  }
  if (orderTotal(o.items) !== o.totalKobo) throw new Error('Order total changed. Review the items again.');
  return o;
}
// Mirrors PostgreSQL's six-decimal feet and per-piece kobo rounding. No float money.
function scaledFeet(text: string, unit: 'ft' | 'in'): bigint {
  if (!dimension(text)) throw new Error('Enter a positive size with up to six decimal places.');
  const [whole, fraction = ''] = text.split('.');
  const scaled = BigInt(whole) * BigInt(1000000) + BigInt(fraction.padEnd(6,'0'));
  return unit === 'in' ? (scaled + BigInt(6)) / BigInt(12) : scaled;
}
export function orderItemTotal(i: OrderItem): string {
  if (!integer(i.priceKobo) || !/^[1-9][0-9]{0,4}$/.test(i.quantity)) throw new Error('Enter a valid price and whole quantity.');
  const unit = i.approvedUnitKobo ? BigInt(i.approvedUnitKobo) : i.kind === 'service' ? BigInt(i.priceKobo) :
    (scaledFeet(i.width!, i.unit!) * scaledFeet(i.height!, i.unit!) * BigInt(i.priceKobo) + BigInt(500000000000)) / BigInt(1000000000000);
  return (unit * BigInt(i.quantity)).toString();
}
export const orderTotal = (items: OrderItem[]) => items.reduce((sum,i)=>sum+BigInt(orderItemTotal(i)),BigInt(0)).toString();
export function confirmedOrder(value: unknown, order: ScreenOrder): boolean {
  const r = value as Record<string, unknown> | null;
  if (!r || r.request_id !== order.requestId || r.actor_id !== order.expectedStaffId || r.business_date !== order.businessDate
    || r.total_kobo !== order.totalKobo || r.initial_payment_kobo !== order.initialPaymentKobo) return false;
  if (order.operation === 'quote') return isUUID(r.estimate_id) && typeof r.quote_number === 'string' && /^QT-\d{5,}$/.test(r.quote_number);
  if (!isUUID(r.order_id) || typeof r.sales_id !== 'string' || !/^BOM-\d{8}-\d{4,}$/.test(r.sales_id)
    || !Array.isArray(r.job_ids) || r.job_ids.length !== order.items.length || !r.job_ids.every(isUUID)
    || !Array.isArray(r.journal_entry_ids) || r.journal_entry_ids.length !== order.items.filter(i=>orderItemTotal(i)!=='0').length || !r.journal_entry_ids.every(isUUID)) return false;
  const receipt = r.initial_payment as Record<string, unknown> | null;
  if (BigInt(order.initialPaymentKobo) > BigInt(order.totalKobo)
    && (!receipt || receipt.amount_kobo !== order.initialPaymentKobo
      || receipt.extra_income_kobo !== (BigInt(order.initialPaymentKobo)-BigInt(order.totalKobo)).toString())) return false;
  return order.initialPaymentKobo === '0' || !!receipt && isUUID(receipt.payment_id) && isUUID(receipt.journal_entry_id);
}

/** A sale the owner has to approve first: the server kept it instead of posting it. */
export type HeldOrder = { status: 'awaiting_approval' | 'declined' | 'expired'; approval_request_id: string; kinds: string[]; decision_note?: string | null };
export function heldOrder(value: unknown): HeldOrder | null {
  const r = value as Record<string, unknown> | null;
  if (!r || !['awaiting_approval', 'declined', 'expired'].includes(String(r.status)) || !isUUID(r.approval_request_id)) return null;
  return { status: r.status as HeldOrder['status'], approval_request_id: r.approval_request_id as string,
    kinds: Array.isArray(r.kinds) ? r.kinds.filter((k): k is string => typeof k === 'string') : [], decision_note: typeof r.decision_note === 'string' ? r.decision_note : null };
}

import { confirmedOrder, orderContract, type ScreenOrder } from './order-contract';
import { paymentContext, type OutboxStorage, type PaymentContext } from './payment-outbox';
export const ORDER_PREFIX = 'bomedia-order-v3:';
export const ORDER_EVENT = 'bomedia-order-outbox';
export const ORDER_RECEIPT = 'bomedia-last-order-confirmation';
export type OrderEntry = { order: ScreenOrder; state: 'pending' | 'review' | 'auth'; error?: string };
export function readOrders(storage: OutboxStorage): OrderEntry[] {
  const result: OrderEntry[] = [];
  for (let i=0;i<storage.length;i++) {
    const key=storage.key(i);
    if (!key?.startsWith(ORDER_PREFIX)) continue;
    try {
      const entry=JSON.parse(storage.getItem(key)!);
      orderContract(entry.order);
      if (key !== ORDER_PREFIX+entry.order.requestId || !['pending','review','auth'].includes(entry.state)) throw new Error();
      result.push(entry);
    } catch { throw new Error('A saved order cannot be read. It is preserved for owner review.'); }
  }
  return result;
}
export function persistOrder(storage: OutboxStorage, order: ScreenOrder): OrderEntry {
  orderContract(order);
  const {requestId: _id,...fields}=order;
  for (const entry of readOrders(storage)) {
    const {requestId: _existing,...before}=entry.order;
    if (JSON.stringify(before)===JSON.stringify(fields)) return entry;
    if (order.quoteId && entry.order.quoteId===order.quoteId) throw new Error('An order using this quote is already pending. Retry that saved order.');
  }
  const key=ORDER_PREFIX+order.requestId;
  if (storage.getItem(key)) throw new Error('This request ID is already in use.');
  const entry: OrderEntry={order,state:'pending'};
  const text=JSON.stringify(entry);storage.setItem(key,text);
  if(storage.getItem(key)!==text)throw new Error('Order could not be stored on this device. Nothing was sent.');
  return entry;
}
export async function deliverOrder(storage: OutboxStorage, entry: OrderEntry, context: PaymentContext, send: typeof fetch): Promise<Record<string,unknown>|null> {
  orderContract(entry.order);
  const key=ORDER_PREFIX+entry.order.requestId;
  const current=storage.getItem(key);
  if(!current || JSON.stringify(JSON.parse(current).order)!==JSON.stringify(entry.order))throw new Error('The saved order changed. Keep it for review.');
  const hold=(state:OrderEntry['state'],error:string)=>{storage.setItem(key,JSON.stringify({...entry,state,error}));return null;};
  if(context.backend!=='postgres')return hold('review','This order belongs to PostgreSQL. It cannot be sent to Sheets.');
  if(context.staffId!==entry.order.expectedStaffId)return hold('auth','Sign in as the staff member who saved this order.');
  try {
    const response=await send('/api/accounting/orders',{method:'POST',headers:{'Content-Type':'application/json','X-Bomedia-Backend':'postgres'},body:JSON.stringify(entry.order)});
    const result=await response.json();
    if(!response.ok)return hold(response.status===401||response.status===403?'auth':response.status>=500||response.status===429?'pending':'review',result.error||'Order needs review.');
    if(!confirmedOrder(result,entry.order))return hold('pending','Confirmation was incomplete. The original order is kept for retry.');
    storage.setItem(ORDER_RECEIPT,JSON.stringify({staffId:entry.order.expectedStaffId,...result}));
    storage.removeItem(key);return result;
  }catch{return hold('pending','Connection interrupted. The same order is kept for retry.');}
}
export async function saveScreenOrder(input: Omit<ScreenOrder,'version'|'backend'|'requestId'|'expectedStaffId'>): Promise<OrderEntry> {
  const context=await paymentContext();
  if(context.backend!=='postgres')throw new Error('This order requires the PostgreSQL sandbox.');
  if(!navigator.locks)throw new Error('Open the secure app in a browser that supports safe offline orders.');
  const entry=await navigator.locks.request('bomedia-order-outbox',()=>persistOrder(localStorage,{
    ...input,version:3,backend:'postgres',requestId:crypto.randomUUID(),expectedStaffId:context.staffId,
  }));
  window.dispatchEvent(new Event(ORDER_EVENT));return entry;
}

export type AccountingOperation='customers'|'sales'|'payments'|'expenses'|'expense-payments'|'restocks'|'waste'|'stock-counts'|'quotes'|'price-requests'|'services';
export type PendingAccountingEntry={version:1;staffId:string;operation:AccountingOperation;requestId:string;payload:Record<string,unknown>;summary:string};
export type PendingStorage=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
const key=(staffId:string)=>`bomedia-accounting-pending-v1:${staffId}`;
export function readPendingAccounting(storage:PendingStorage,staffId:string):PendingAccountingEntry|null {
  const raw=storage.getItem(key(staffId));if(!raw)return null;
  const entry=JSON.parse(raw) as PendingAccountingEntry;
  if(entry.version!==1 || entry.staffId!==staffId || !['customers','sales','payments','expenses','expense-payments','restocks','waste','stock-counts','quotes','price-requests','services'].includes(entry.operation)
    || typeof entry.requestId!=='string' || !entry.requestId || typeof entry.summary!=='string'
    || !entry.payload || typeof entry.payload!=='object' || Array.isArray(entry.payload))throw new Error('A saved entry needs review. It has been preserved on this device.');
  return entry;
}
// Call under a browser Web Lock. Persist BEFORE dispatch and remove only after
// a valid success response. Retries retain the exact original payload and key.
export async function sendAccountingEntry(storage:PendingStorage,entry:PendingAccountingEntry,send:typeof fetch=fetch):Promise<Record<string,unknown>> {
  const existing=readPendingAccounting(storage,entry.staffId);
  if(existing && JSON.stringify(existing)!==JSON.stringify(entry))throw new Error('Finish the saved entry before recording another one.');
  storage.setItem(key(entry.staffId),JSON.stringify(entry));
  const response=await send(`/api/accounting/${entry.operation}`,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({...entry.payload,requestId:entry.requestId,expectedStaffId:entry.staffId})});
  const result=await response.json() as Record<string,unknown>;
  if(!response.ok)throw new Error(typeof result.error==='string' ? result.error : 'Entry is saved on this device. Retry when the service is available.');
  const id=entry.operation==='customers' ? result.customer_id : entry.operation==='sales' ? result.order_id
    : entry.operation==='payments' ? result.payment_id
    : entry.operation==='expenses' || entry.operation==='expense-payments' ? result.expense_id
    : entry.operation==='quotes' ? result.estimate_id : entry.operation==='price-requests' ? result.price_request_id
    : entry.operation==='services' ? result.service_id : result.stock_entry_id;
  if(result.success!==true || typeof id!=='string' || !id)throw new Error('Confirmation was incomplete. Retry the saved entry to check its result.');
  storage.removeItem(key(entry.staffId));
  return result;
}

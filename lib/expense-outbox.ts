import { confirmedExpense, expenseContract, type ExpenseRequest, type ExpenseConfirmation } from './expense-contract';
import { heldOrder } from './order-contract';
import { paymentContext, type OutboxStorage, type PaymentContext } from './payment-outbox';
export const EXPENSE_PREFIX = 'bomedia-expense-v1:';
export const EXPENSE_EVENT = 'bomedia-expense-outbox';
export const EXPENSE_RECEIPT = 'bomedia-last-expense-confirmation';
export const EXPENSE_HELD = 'bomedia-last-expense-held';
/** The owner has to approve this expense first: the server holds it, so it leaves this device's queue. */
export type HeldExpenseResult = { held: true; status: 'awaiting_approval' | 'declined' | 'expired'; approval_request_id: string; kinds: string[]; decision_note?: string | null };
export type ExpenseEntry = { expense: ExpenseRequest; state: 'pending' | 'review' | 'auth'; error?: string };
export function readExpenses(storage: OutboxStorage): ExpenseEntry[] {
  const result: ExpenseEntry[] = [];
  for (let i=0;i<storage.length;i++) {
    const key=storage.key(i);
    if (!key?.startsWith(EXPENSE_PREFIX)) continue;
    try {
      const entry=JSON.parse(storage.getItem(key)!);
      expenseContract(entry.expense);
      if (key !== EXPENSE_PREFIX+entry.expense.requestId || !['pending','review','auth'].includes(entry.state)) throw new Error();
      result.push(entry);
    } catch { throw new Error('A saved expense cannot be read. It is preserved for owner review.'); }
  }
  return result;
}
export function persistExpense(storage: OutboxStorage, expense: ExpenseRequest): ExpenseEntry {
  expenseContract(expense);
  for (const entry of readExpenses(storage)) {
    if (entry.expense.requestId === expense.requestId) {
      if (JSON.stringify(entry.expense) !== JSON.stringify(expense)) throw new Error('This request ID is already in use for different values.');
      return entry;
    }
    if (expense.operation==='pay'&&entry.expense.operation==='pay'&&expense.expenseId===entry.expense.expenseId) throw new Error('Payment of this expense is already pending. Retry the saved payment.');
  }
  const key=EXPENSE_PREFIX+expense.requestId;
  if (storage.getItem(key)) throw new Error('This request ID is already in use.');
  const entry: ExpenseEntry={expense,state:'pending'};
  const text=JSON.stringify(entry);storage.setItem(key,text);
  if(storage.getItem(key)!==text)throw new Error('Expense could not be stored on this device. Nothing was sent.');
  return entry;
}
export async function deliverExpense(storage: OutboxStorage, entry: ExpenseEntry, context: PaymentContext, send: typeof fetch): Promise<ExpenseConfirmation|HeldExpenseResult|null> {
  expenseContract(entry.expense);
  const key=EXPENSE_PREFIX+entry.expense.requestId;
  const current=storage.getItem(key);
  if(!current || JSON.stringify(JSON.parse(current).expense)!==JSON.stringify(entry.expense))throw new Error('The saved expense changed. Keep it for review.');
  const hold=(state:ExpenseEntry['state'],error:string)=>{storage.setItem(key,JSON.stringify({...entry,state,error}));return null;};
  if(context.backend!=='postgres')return hold('review','This expense belongs to PostgreSQL. It cannot be sent to Sheets.');
  if(context.staffId!==entry.expense.expectedStaffId)return hold('auth','Sign in as the staff member who saved this expense.');
  try {
    const response=await send('/api/accounting/expense-entries',{method:'POST',headers:{'Content-Type':'application/json','X-Bomedia-Backend':'postgres'},body:JSON.stringify(entry.expense)});
    const result=await response.json();
    if(!response.ok)return hold(response.status===401||response.status===403?'auth':response.status>=500||response.status===429?'pending':'review',result.error||'Expense needs review.');
    const held=heldOrder(result);
    if(held){storage.setItem(EXPENSE_HELD,JSON.stringify({staffId:entry.expense.expectedStaffId,...held}));storage.removeItem(key);return {...held,held:true};}
    if(!confirmedExpense(result,entry.expense))return hold('pending','Confirmation was incomplete. The original expense is kept for retry.');
    storage.setItem(EXPENSE_RECEIPT,JSON.stringify({staffId:entry.expense.expectedStaffId,...result}));
    storage.removeItem(key);return result;
  }catch{return hold('pending','Connection interrupted. The same expense is kept for retry.');}
}
export async function saveExpenseRequest(input: ({operation:'log';items:import('./expense-contract').ExpenseItem[];approvalReason?:string}|{operation:'pay';expenseId:string;amountKobo:string;businessDate:string;paymentMethod:import('./payment-methods').PaymentMethod})): Promise<ExpenseEntry> {
  const context=await paymentContext();
  if(context.backend!=='postgres')throw new Error('This expense requires the PostgreSQL sandbox.');
  if(!navigator.locks)throw new Error('Open the secure app in a browser that supports safe offline expenses.');
  const entry=await navigator.locks.request('bomedia-expense-outbox',()=>persistExpense(localStorage,{
    ...input,version:1,backend:'postgres',requestId:crypto.randomUUID(),expectedStaffId:context.staffId,
  }));
  window.dispatchEvent(new Event(EXPENSE_EVENT));return entry;
}

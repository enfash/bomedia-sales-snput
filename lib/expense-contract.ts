import { isUUID, validBusinessDate } from './payment-contract';
import { normalizePaymentMethod, type PaymentMethod } from './payment-methods';
export type ExpenseItem = {businessDate:string;amountKobo:string;category:string;description:string;paidTo:string;status:'paid'|'unpaid';paymentMethod?:PaymentMethod;receiptId?:string};
export type ExpenseRequest = {version:1;backend:'postgres';requestId:string;expectedStaffId:string} &
  ({operation:'log';items:ExpenseItem[];/** Why the cashier is spending more than the limit. Required by the database only when the owner has to approve it. */approvalReason?:string}|{operation:'pay';expenseId:string;amountKobo:string;businessDate:string;paymentMethod:PaymentMethod});
const money=(value:unknown):value is string=>typeof value==='string'&&/^[1-9][0-9]{0,18}$/.test(value)&&BigInt(value)<=BigInt('9223372036854775807');
export function expenseContract(value:unknown):ExpenseRequest {
  const e=value as ExpenseRequest;
  if(!e||e.version!==1||e.backend!=='postgres'||!isUUID(e.requestId)||!isUUID(e.expectedStaffId))throw new Error('This expense needs review. Its original identity has been preserved.');
  if(e.operation==='pay') {
    if(!isUUID(e.expenseId)||!money(e.amountKobo)||!validBusinessDate(e.businessDate)||!e.paymentMethod||normalizePaymentMethod(e.paymentMethod)!==e.paymentMethod)throw new Error('Check the expense, payment date and method.');
  } else if(e.operation==='log') {
    if(!Array.isArray(e.items)||!e.items.length||e.items.length>100)throw new Error('Add between one and 100 expenses.');
    if(e.approvalReason!==undefined&&(typeof e.approvalReason!=='string'||e.approvalReason.length>500))throw new Error('Keep the reason under 500 characters.');
    for(const i of e.items) {
      if(!i||!validBusinessDate(i.businessDate)||!money(i.amountKobo)||typeof i.category!=='string'||!i.category.trim()||i.category.length>100
        ||typeof i.description!=='string'||!i.description.trim()||i.description.length>1000||typeof i.paidTo!=='string'||i.paidTo.length>200
        ||!['paid','unpaid'].includes(i.status)||(i.receiptId!==undefined&&!isUUID(i.receiptId))
        ||(i.status==='paid'&&(!i.paymentMethod||normalizePaymentMethod(i.paymentMethod)!==i.paymentMethod))
        ||(i.status==='unpaid'&&i.paymentMethod!==undefined))throw new Error('Check each expense date, positive amount, category, description and payment method.');
    }
  }else throw new Error('Unknown expense operation.');
  return e;
}
export type ExpenseConfirmation={request_id:string;actor_id:string;operation:'log'|'pay';expenses:{expense_id:string;journal_entry_id:string;reference:string;amount_kobo:string;business_date:string;status:'Paid'|'Unpaid';receipt_id:string|null}[]};
export function confirmedExpense(value:unknown,request:ExpenseRequest):value is ExpenseConfirmation {
  const r=value as ExpenseConfirmation;
  if(!r||r.request_id!==request.requestId||r.actor_id!==request.expectedStaffId||r.operation!==request.operation||!Array.isArray(r.expenses))return false;
  const items=request.operation==='log'?request.items:[{...request,status:'paid',receiptId:undefined}];
  return r.expenses.length===items.length&&new Set(r.expenses.map(e=>e.expense_id)).size===items.length&&r.expenses.every((e,index)=>{
    const i=items[index];return isUUID(e.expense_id)&&isUUID(e.journal_entry_id)&&/^EXP-[0-9]{8}-[0-9]{4,}$/.test(e.reference)
      &&e.amount_kobo===i.amountKobo&&e.business_date===i.businessDate&&e.status===(i.status==='paid'?'Paid':'Unpaid')
      &&(request.operation==='pay'?e.expense_id===request.expenseId:e.receipt_id===(i.receiptId||null));
  });
}

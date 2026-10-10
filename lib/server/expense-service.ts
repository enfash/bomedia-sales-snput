import { normalizePaymentMethod } from '../payment-methods';
import { callFinancial,type FinancialCall } from './financial-db';
import { FinancialError,validUUID,type FinancialActor } from './financial-service';

export type ExpenseResult={expense_id:string;journal_entry_id:string;amount_kobo:string;status:'Paid'|'Unpaid'};
const invalid=(message:string)=>new FinancialError(message,400,'INVALID_INPUT');
function object(value:unknown,keys:string[]):Record<string,unknown> {
  if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).some(k=>!keys.includes(k)))
    throw invalid('Use the supported expense fields. Legacy queued expenses need mapping first.');
  return value as Record<string,unknown>;
}
function text(value:unknown,max:number,label:string) {
  if(typeof value!=='string' || !value.trim() || value.length>max)throw invalid(`${label} is required.`);
  return value.trim();
}
function optional(value:unknown,max:number,label:string) {
  if(value===undefined || value==='')return undefined;
  if(typeof value!=='string' || value.length>max)throw invalid(`${label} is too long.`);
  return value.trim() || undefined;
}
function date(value:unknown) {
  if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-'))throw invalid('Choose a valid business date.');
  const parsed=new Date(`${value}T00:00:00Z`);
  if(!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10)!==value)throw invalid('Choose a valid business date.');
  return value;
}
function identity(actor:FinancialActor,body:Record<string,unknown>) {
  if(!validUUID(actor.staffId))throw new FinancialError('An enabled accounting identity is required.',403,'ACTOR_REQUIRED');
  const id=actor.staffId.toLowerCase();
  if(body.expectedStaffId!==undefined && (typeof body.expectedStaffId!=='string' || body.expectedStaffId.toLowerCase()!==id))
    throw new FinancialError('Sign in as the staff member who saved this entry.',403,'ACTOR_CHANGED');
  return id;
}
async function execute(call:FinancialCall,method:'api_expense'|'api_expense_payment',key:string,payload:Record<string,unknown>) {
  try {return await call<ExpenseResult>(method,key,payload);}
  catch(error) {
    const code=(error as {code?:string}).code;
    if(code==='42501')throw new FinancialError('Account access is no longer available.',403,'ACTOR_DISABLED');
    if(['22023','23514','23503','22P02','22003','22007','22008'].includes(code || ''))throw new FinancialError(
      'Expense was not recorded. Check the amount, status, payment method, accounting period and request ID. Keep this entry for review.',409,'EXPENSE_REVIEW_REQUIRED');
    throw error;
  }
}
export function createExpenseService(call:FinancialCall=callFinancial) {
  return {
    async log(actor:FinancialActor,input:unknown) {
      const body=object(input,['requestId','expectedStaffId','businessDate','amountKobo','category','description','paidTo','status','paymentMethod']);
      const actorId=identity(actor,body);
      if(typeof body.amountKobo!=='string' || !/^[1-9][0-9]{0,18}$/.test(body.amountKobo) || BigInt(body.amountKobo)>BigInt('9223372036854775807'))
        throw invalid('Enter the positive expense amount in whole kobo.');
      if(body.status!=='paid' && body.status!=='unpaid')throw invalid('Choose whether the expense is paid or unpaid.');
      const payload:Record<string,unknown>={actor_id:actorId,business_date:date(body.businessDate),amount_kobo:body.amountKobo,
        category:text(body.category,100,'Category'),status:body.status};
      const description=optional(body.description,1000,'Description'),paidTo=optional(body.paidTo,200,'Paid to');
      if(description)payload.description=description;
      if(paidTo)payload.paid_to=paidTo;
      if(body.status==='paid') {
        const method=normalizePaymentMethod(body.paymentMethod);
        if(!method)throw invalid('Choose Cash, Transfer or POS.');
        payload.payment_method=method;
      } else if(body.paymentMethod!==undefined)throw invalid('Choose a payment method only when the expense is paid.');
      return execute(call,'api_expense',text(body.requestId,200,'Request ID'),payload);
    },
    async pay(actor:FinancialActor,input:unknown) {
      const body=object(input,['requestId','expectedStaffId','expenseId','businessDate','paymentMethod']);
      const actorId=identity(actor,body);
      if(!validUUID(body.expenseId))throw invalid('Select an expense by its database ID. Legacy rows need review.');
      const method=normalizePaymentMethod(body.paymentMethod);
      if(!method)throw invalid('Choose Cash, Transfer or POS.');
      return execute(call,'api_expense_payment',text(body.requestId,200,'Request ID'),
        {actor_id:actorId,expense_id:body.expenseId.toLowerCase(),business_date:date(body.businessDate),payment_method:method});
    },
  };
}
export const expenseService=createExpenseService();

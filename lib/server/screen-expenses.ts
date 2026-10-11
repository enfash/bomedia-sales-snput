import { expenseContract } from '../expense-contract';
import { callFinancial, type FinancialCall } from './financial-db';
import { financialHandler, financialIdentity } from './financial-routes';
import { FinancialError } from './financial-service';
import { verifiedAdminIdentity } from './postgres-auth-routes';
export function recordScreenExpense(request:Request,call:FinancialCall=callFinancial) {
  return financialHandler(async()=>{
    const actor=await financialIdentity(true);
    let expense;
    try {expense=expenseContract(await request.json());}catch(e){throw new FinancialError(e instanceof Error?e.message:'Invalid expense.',400,'INVALID_EXPENSE');}
    if(!actor||actor.staffId.toLowerCase()!==expense.expectedStaffId)throw new FinancialError('Sign in as the staff member who saved this expense.',403,'ACTOR_CHANGED');
    const owner=Boolean(await verifiedAdminIdentity());
    if(expense.operation==='pay'&&!owner)throw new FinancialError('Only the owner can mark expenses paid.',403,'OWNER_REQUIRED');
    // byOwner is decided here, never by the browser: it unlocks the owner-only categories.
    const {requestId,expectedStaffId,version:_version,backend:_backend,byOwner:_ignored,...fields}=expense as typeof expense&{byOwner?:unknown};
    try {return await call('api_screen_expense',requestId,{...fields,actor_id:expectedStaffId,...(owner?{byOwner:'true'}:{})});}
    catch(e){
      const code=(e as {code?:string}).code;
      // The database refuses categories the signed-in staff member was not given; say so in plain words.
      if(e instanceof Error&&e.message==='Only the owner can log that category')throw new FinancialError('You do not have access to that expense category. Ask the owner to add you.',409,'EXPENSE_REVIEW_REQUIRED');
      if(['22023','22P02','23514','23505','22003','22007','22008'].includes(code||''))throw new FinancialError(e instanceof Error?e.message:'Expense needs review.',409,'EXPENSE_REVIEW_REQUIRED');
      if(code==='42501')throw new FinancialError('Account access is unavailable.',403,'ACTOR_DISABLED');
      throw e;
    }
  });
}

import { financialHandler,financialIdentity } from './financial-routes';
import { FinancialError } from './financial-service';
import { expenseService } from './expense-service';
import { verifiedAdminIdentity } from './postgres-auth-routes';

async function body(request:Request) {
  try {return await request.json() as unknown;}catch{throw new FinancialError('Invalid expense request.',400,'INVALID_INPUT');}
}
export function logExpense(request:Request) {
  return financialHandler(async()=>{
    const actor=await financialIdentity(true);
    if(!actor)throw new FinancialError('Staff identity required.',403,'ACTOR_REQUIRED');
    return {success:true,...await expenseService.log(actor,await body(request))};
  });
}
// Marking an expense paid stays owner-only, as on the current Expenses screen.
export function payExpense(request:Request) {
  return financialHandler(async()=>{
    if(!await verifiedAdminIdentity())throw new FinancialError('Owner access is required to pay expenses.',403,'OWNER_REQUIRED');
    const actor=await financialIdentity(true);
    if(!actor)throw new FinancialError('Owner accounting identity required.',403,'ACTOR_REQUIRED');
    return {success:true,...await expenseService.pay(actor,await body(request))};
  });
}

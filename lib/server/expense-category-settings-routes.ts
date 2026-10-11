import { financialHandler,financialIdentity } from './financial-routes';
import { FinancialError } from './financial-service';
import { expenseCategorySettings } from './expense-category-settings';
import { verifiedAdminIdentity } from './postgres-auth-routes';

// Owner only: staff keep using the existing expense categories read (enabled only).
export function listExpenseCategorySettings() {
  return financialHandler(async()=>{
    if(!await verifiedAdminIdentity())throw new FinancialError('Owner access is required to see expense category settings.',403,'OWNER_REQUIRED');
    await financialIdentity(false);
    return expenseCategorySettings.list();
  });
}
export function saveExpenseCategorySetting(request:Request) {
  return financialHandler(async()=>{
    if(!await verifiedAdminIdentity())throw new FinancialError('Owner access is required to change expense categories.',403,'OWNER_REQUIRED');
    const actor=await financialIdentity(true);
    if(!actor)throw new FinancialError('Owner accounting identity required.',403,'ACTOR_REQUIRED');
    let body:unknown;
    try {body=await request.json();}catch{throw new FinancialError('Invalid expense category request.',400,'INVALID_INPUT');}
    return {success:true,...await expenseCategorySettings.save(actor,body)};
  });
}

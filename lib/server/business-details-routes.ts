import { financialHandler,financialIdentity } from './financial-routes';
import { FinancialError } from './financial-service';
import { businessDetailsService } from './business-details-service';
import { verifiedAdminIdentity } from './postgres-auth-routes';

// Any signed-in staff member can read the details (receipts need them); only the owner can change them.
export function readBusinessDetails() {
  return financialHandler(async()=>{
    await financialIdentity(false);
    return businessDetailsService.read();
  });
}
export function saveBusinessDetails(request:Request) {
  return financialHandler(async()=>{
    if(!await verifiedAdminIdentity())throw new FinancialError('Owner access is required to change business details.',403,'OWNER_REQUIRED');
    const actor=await financialIdentity(true);
    if(!actor)throw new FinancialError('Owner accounting identity required.',403,'ACTOR_REQUIRED');
    let body:unknown;
    try {body=await request.json();}catch{throw new FinancialError('Invalid business details request.',400,'INVALID_INPUT');}
    return {success:true,...await businessDetailsService.save(actor,body)};
  });
}

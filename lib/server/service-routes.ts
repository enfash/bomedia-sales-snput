import { financialHandler,financialIdentity } from './financial-routes';
import { FinancialError } from './financial-service';
import { serviceCatalog } from './service-catalog';
import { verifiedAdminIdentity } from './postgres-auth-routes';

// Staff see visible services; the owner sees all and is the only one who can change them.
export function listServices() {
  return financialHandler(async()=>{
    await financialIdentity(false);
    return serviceCatalog.list(!!await verifiedAdminIdentity());
  });
}
export function saveService(request:Request) {
  return financialHandler(async()=>{
    if(!await verifiedAdminIdentity())throw new FinancialError('Owner access is required to change services.',403,'OWNER_REQUIRED');
    const actor=await financialIdentity(true);
    if(!actor)throw new FinancialError('Owner accounting identity required.',403,'ACTOR_REQUIRED');
    let body:unknown;
    try {body=await request.json();}catch{throw new FinancialError('Invalid service request.',400,'INVALID_INPUT');}
    return {success:true,...await serviceCatalog.save(actor,body)};
  });
}

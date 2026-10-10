import { financialHandler,financialIdentity } from './financial-routes';
import { FinancialError } from './financial-service';
import { quoteService } from './quote-service';
import { verifiedAdminIdentity } from './postgres-auth-routes';

async function body(request:Request) {
  try {return await request.json() as unknown;}catch{throw new FinancialError('Invalid quote request.',400,'INVALID_INPUT');}
}
export function saveQuote(request:Request) {
  return financialHandler(async()=>{
    const actor=await financialIdentity(true);
    if(!actor)throw new FinancialError('Staff identity required.',403,'ACTOR_REQUIRED');
    return {success:true,...await quoteService.save(actor,await body(request))};
  });
}
export function lookupQuote(request:Request) {
  return financialHandler(async()=>{
    await financialIdentity(false);
    const params=new URL(request.url).searchParams;
    if(Array.from(params.keys()).some(k=>k!=='number') || params.getAll('number').length!==1)throw new FinancialError('Invalid quote filters.',400,'INVALID_INPUT');
    return quoteService.lookup(params.get('number'));
  });
}
// Price requests are decided by the owner only.
export function listPriceRequests() {
  return financialHandler(async()=>{
    if(!await verifiedAdminIdentity())throw new FinancialError('Owner access is required for price requests.',403,'OWNER_REQUIRED');
    return quoteService.requests();
  });
}
export function decidePriceRequest(request:Request) {
  return financialHandler(async()=>{
    if(!await verifiedAdminIdentity())throw new FinancialError('Owner access is required to decide prices.',403,'OWNER_REQUIRED');
    const actor=await financialIdentity(true);
    if(!actor)throw new FinancialError('Owner accounting identity required.',403,'ACTOR_REQUIRED');
    return {success:true,...await quoteService.decide(actor,await body(request))};
  });
}

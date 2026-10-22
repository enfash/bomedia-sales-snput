import { financialHandler,financialIdentity } from './financial-routes';
import { FinancialError } from './financial-service';
import { stockService } from './stock-service';
import { verifiedAdminIdentity } from './postgres-auth-routes';

async function body(request:Request) {
  try {return await request.json() as unknown;}catch{throw new FinancialError('Invalid stock request.',400,'INVALID_INPUT');}
}
// Every stock change (restock, waste, count correction) is owner-only; a cashier can see the stock list and levels but not change them.
function write(request:Request,operation:'restock'|'waste'|'count') {
  return financialHandler(async()=>{
    if(!await verifiedAdminIdentity())throw new FinancialError('Owner access is required for this stock change.',403,'OWNER_REQUIRED');
    const actor=await financialIdentity(true);
    if(!actor)throw new FinancialError('Staff identity required.',403,'ACTOR_REQUIRED');
    return {success:true,...await stockService[operation](actor,await body(request))};
  });
}
export const restockRolls=(request:Request)=>write(request,'restock');
export const logWaste=(request:Request)=>write(request,'waste');
export const correctStockCount=(request:Request)=>write(request,'count');

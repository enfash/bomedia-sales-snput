import { financialHandler,financialIdentity } from './financial-routes';
import { FinancialError } from './financial-service';
import { salesService } from './sales-service';
async function write(request:Request,operation:'customer'|'sale') {
  return financialHandler(async()=>{
    const actor=await financialIdentity(true);
    if(!actor)throw new FinancialError('Collector identity required.',403,'ACTOR_REQUIRED');
    let body:unknown;
    try {body=await request.json();}catch{throw new FinancialError('Invalid request.',400,'INVALID_INPUT');}
    return {success:true,...await salesService[operation](actor,body)};
  });
}
export const createCustomer=(request:Request)=>write(request,'customer');
export const recordSale=(request:Request)=>write(request,'sale');

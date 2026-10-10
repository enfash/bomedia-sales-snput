import { callFinancial,type FinancialCall } from './financial-db';
import { FinancialError,validUUID,type FinancialActor,type FinancialPage } from './financial-service';

const invalid=(message:string)=>new FinancialError(message,400,'INVALID_INPUT');
export function createServiceCatalog(call:FinancialCall=callFinancial) {
  return {
    list(includeHidden:boolean) {return call<FinancialPage>('api_services',includeHidden ? 'all' : 'visible',{});},
    async save(actor:FinancialActor,input:unknown) {
      if(!input || typeof input!=='object' || Array.isArray(input))throw invalid('A service is required.');
      const body=input as Record<string,unknown>;
      if(Object.keys(body).some(k=>!['requestId','expectedStaffId','serviceId','name','pricing','unitPriceKobo','visible'].includes(k)))throw invalid('Use the supported service fields.');
      if(!validUUID(actor.staffId))throw new FinancialError('An enabled accounting identity is required.',403,'ACTOR_REQUIRED');
      if(body.expectedStaffId!==undefined && (typeof body.expectedStaffId!=='string' || body.expectedStaffId.toLowerCase()!==actor.staffId.toLowerCase()))
        throw new FinancialError('Sign in as the staff member who saved this entry.',403,'ACTOR_CHANGED');
      if(typeof body.requestId!=='string' || !body.requestId.trim() || body.requestId.length>200)throw invalid('Request ID is required.');
      if(typeof body.name!=='string' || !body.name.trim() || body.name.length>100)throw invalid('Name the service.');
      if(body.pricing!=='fixed' && body.pricing!=='per_job')throw invalid('Choose fixed price or per job.');
      if(typeof body.visible!=='boolean')throw invalid('Choose whether staff can see it.');
      const payload:Record<string,unknown>={actor_id:actor.staffId.toLowerCase(),name:body.name.trim(),pricing:body.pricing,visible:body.visible};
      if(body.pricing==='fixed') {
        if(typeof body.unitPriceKobo!=='string' || !/^[1-9][0-9]{0,18}$/.test(body.unitPriceKobo))throw invalid('Enter the price in whole kobo.');
        payload.unit_price_kobo=body.unitPriceKobo;
      } else if(body.unitPriceKobo!==undefined)throw invalid('Per-job services have no list price.');
      if(body.serviceId!==undefined) {if(!validUUID(body.serviceId))throw invalid('Unknown service.');payload.service_id=body.serviceId.toLowerCase();}
      try {return await call<{service_id:string}>('api_service_save',body.requestId.trim(),payload);}
      catch(error) {
        const code=(error as {code?:string}).code;
        if(code==='42501')throw new FinancialError('Account access is no longer available.',403,'ACTOR_DISABLED');
        if(['22023','23514','23505','22P02'].includes(code || ''))throw new FinancialError('The service was not saved. Check the name (it must be unique) and price.',409,'SERVICE_REVIEW_REQUIRED');
        throw error;
      }
    },
  };
}
export const serviceCatalog=createServiceCatalog();

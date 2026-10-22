import { callFinancial,type FinancialCall } from './financial-db';
import { FinancialError,validUUID,type FinancialActor,type FinancialPage } from './financial-service';

const invalid=(message:string)=>new FinancialError(message,400,'INVALID_INPUT');
export function createServiceCatalog(call:FinancialCall=callFinancial) {
  return {
    list(includeHidden:boolean) {return call<FinancialPage>('api_services',includeHidden ? 'all' : 'visible',{});},
    /** Staff see visible services in this order; the list must be every service currently visible. */
    async reorder(actor:FinancialActor,input:unknown) {
      if(!input || typeof input!=='object' || Array.isArray(input))throw invalid('A service order is required.');
      const body=input as Record<string,unknown>;
      if(Object.keys(body).some(k=>!['requestId','serviceIds'].includes(k)))throw invalid('Use the supported service fields.');
      if(!validUUID(actor.staffId))throw new FinancialError('An enabled accounting identity is required.',403,'ACTOR_REQUIRED');
      if(typeof body.requestId!=='string' || !body.requestId.trim() || body.requestId.length>200)throw invalid('Request ID is required.');
      if(!Array.isArray(body.serviceIds) || body.serviceIds.length>500 || !body.serviceIds.every(validUUID))throw invalid('Send the services in the order you want.');
      const ids=(body.serviceIds as string[]).map(id=>id.toLowerCase());
      if(new Set(ids).size!==ids.length)throw invalid('Each service can appear once.');
      try {return await call<{reordered:number}>('api_services_reorder',body.requestId.trim(),{actor_id:actor.staffId.toLowerCase(),service_ids:ids});}
      catch(error) {
        const code=(error as {code?:string}).code;
        if(code==='42501')throw new FinancialError('Account access is no longer available.',403,'ACTOR_DISABLED');
        if(['22023','22P02'].includes(code || ''))throw new FinancialError('The service list changed. Reload it and try again.',409,'SERVICE_REVIEW_REQUIRED');
        throw error;
      }
    },
    async save(actor:FinancialActor,input:unknown) {
      if(!input || typeof input!=='object' || Array.isArray(input))throw invalid('A service is required.');
      const body=input as Record<string,unknown>;
      if(Object.keys(body).some(k=>!['requestId','expectedStaffId','serviceId','name','pricing','unitPriceKobo','visible'].includes(k)))throw invalid('Use the supported service fields.');
      if(!validUUID(actor.staffId))throw new FinancialError('An enabled accounting identity is required.',403,'ACTOR_REQUIRED');
      if(body.expectedStaffId!==undefined && (typeof body.expectedStaffId!=='string' || body.expectedStaffId.toLowerCase()!==actor.staffId.toLowerCase()))
        throw new FinancialError('Sign in as the staff member who saved this entry.',403,'ACTOR_CHANGED');
      if(typeof body.requestId!=='string' || !body.requestId.trim() || body.requestId.length>200)throw invalid('Request ID is required.');
      if(typeof body.name!=='string' || !body.name.trim() || body.name.length>100)throw invalid('Name the service.');
      if(!['fixed','variable','per_job'].includes(String(body.pricing)))throw invalid('Choose fixed price, enter amount or owner approves.');
      if(typeof body.visible!=='boolean')throw invalid('Choose whether staff can see it.');
      const payload:Record<string,unknown>={actor_id:actor.staffId.toLowerCase(),name:body.name.trim(),pricing:body.pricing,visible:body.visible};
      if(body.pricing==='fixed') {
        if(typeof body.unitPriceKobo!=='string' || !/^(0|[1-9][0-9]{0,18})$/.test(body.unitPriceKobo))throw invalid('Enter the price in whole kobo.');
        payload.unit_price_kobo=body.unitPriceKobo;
      } else if(body.unitPriceKobo!==undefined)throw invalid('Only fixed-price services have a list price.');
      if(body.serviceId!==undefined) {if(!validUUID(body.serviceId))throw invalid('Unknown service.');payload.service_id=body.serviceId.toLowerCase();}
      try {return await call<{service_id:string}>('api_service_save',body.requestId.trim(),payload);}
      catch(error) {
        const code=(error as {code?:string}).code;
        const detail=error as {message?:string;constraint_name?:string};
        if(body.pricing==='variable'&&((code==='22023'&&detail.message==='Name, pricing and (for fixed services) a price are required')
          ||(code==='23514'&&detail.constraint_name==='services_pricing_check')))
          throw new FinancialError('The database needs the Enter amount update before this service can be saved. Keep this saved entry and retry after the update.',503,'SERVICE_PRICING_UPDATE_REQUIRED');
        if(code==='42501')throw new FinancialError('Account access is no longer available.',403,'ACTOR_DISABLED');
        if(['22023','23514','23505','22P02'].includes(code || ''))throw new FinancialError('The service was not saved. Check the name (it must be unique) and price.',409,'SERVICE_REVIEW_REQUIRED');
        throw error;
      }
    },
  };
}
export const serviceCatalog=createServiceCatalog();

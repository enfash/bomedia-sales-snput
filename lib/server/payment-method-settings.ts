import { callFinancial,type FinancialCall } from './financial-db';
import { FinancialError,validUUID,type FinancialActor,type FinancialPage } from './financial-service';

const invalid=(message:string)=>new FinancialError(message,400,'INVALID_INPUT');
export function createPaymentMethodSettings(call:FinancialCall=callFinancial) {
  return {
    list() {return call<FinancialPage>('api_payment_methods_admin','',{});},
    async save(actor:FinancialActor,input:unknown) {
      if(!input || typeof input!=='object' || Array.isArray(input))throw invalid('A payment method is required.');
      const body=input as Record<string,unknown>;
      if(Object.keys(body).some(k=>!['requestId','method','label','enabled'].includes(k)))throw invalid('Use the supported payment method fields.');
      if(!validUUID(actor.staffId))throw new FinancialError('An enabled accounting identity is required.',403,'ACTOR_REQUIRED');
      if(typeof body.requestId!=='string' || !body.requestId.trim() || body.requestId.length>200)throw invalid('Request ID is required.');
      if(body.method!=='cash' && body.method!=='transfer' && body.method!=='pos')throw invalid('Choose Cash, Transfer or POS.');
      if(typeof body.label!=='string' || !body.label.trim())throw invalid('Give the method a name.');
      if(body.label.trim().length>40)throw invalid('The name is too long (40 characters at most).');
      if(typeof body.enabled!=='boolean')throw invalid('Choose whether staff can use it.');
      try {return await call<{method:string;changed:string[]}>('api_payment_method_save',body.requestId.trim(),{actor_id:actor.staffId.toLowerCase(),method:body.method,label:body.label.trim(),enabled:body.enabled});}
      catch(error) {
        const code=(error as {code?:string}).code;
        if(code==='42501')throw new FinancialError('Account access is no longer available.',403,'ACTOR_DISABLED');
        if(code==='23505')throw new FinancialError('Another method already uses that name.',409,'PAYMENT_METHOD_REVIEW_REQUIRED');
        if(code==='23514')throw new FinancialError('At least one payment method must stay on.',409,'PAYMENT_METHOD_REVIEW_REQUIRED');
        if(['22023','22P02'].includes(code || ''))throw new FinancialError('The payment method was not saved. Check the name and try again.',409,'PAYMENT_METHOD_REVIEW_REQUIRED');
        throw error;
      }
    },
  };
}
export const paymentMethodSettings=createPaymentMethodSettings();

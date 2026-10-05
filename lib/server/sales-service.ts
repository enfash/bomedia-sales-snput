import { normalizePaymentMethod } from '../payment-methods';
import { callFinancial,type FinancialCall } from './financial-db';
import { FinancialError,validUUID,type FinancialActor } from './financial-service';
const invalid=(message: string)=>new FinancialError(message,400,'INVALID_INPUT');
function object(value:unknown,keys:string[]):Record<string,unknown> {
  if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).some(k=>!keys.includes(k)))throw invalid('Use the supported fields and stable database IDs. Legacy queued entries need mapping first.');
  return value as Record<string,unknown>;
}
function text(value:unknown,max:number,label:string) {
  if(typeof value!=='string' || !value.trim() || value.length>max)throw invalid(`${label} is required.`);
  return value.trim();
}
function money(value:unknown,zero=false) {
  if(typeof value!=='string' || !/^(0|[1-9][0-9]{0,18})$/.test(value) || (!zero && value==='0') || BigInt(value)>BigInt('9223372036854775807'))throw invalid('Use whole kobo as a decimal string.');
  return value;
}
function dimension(value:unknown) {
  if(typeof value!=='string' || !/^[0-9]{1,6}(\.[0-9]{1,6})?$/.test(value) || Number(value)<=0)throw invalid('Use positive feet with up to six decimal places.');
  return value;
}
function identity(actor:FinancialActor) {
  if(!validUUID(actor.staffId))throw new FinancialError('An enabled accounting identity is required.',403,'ACTOR_REQUIRED');
  return actor.staffId.toLowerCase();
}
function checkExpectedActor(actor:FinancialActor,body:Record<string,unknown>) {
  if(body.expectedStaffId!==undefined && (typeof body.expectedStaffId!=='string' || body.expectedStaffId.toLowerCase()!==identity(actor)))throw new FinancialError('Sign in as the staff member who saved this entry.',403,'ACTOR_CHANGED');
}
async function execute<T>(call:FinancialCall,method:'api_sale'|'api_customer',key:string,payload:Record<string,unknown>):Promise<T> {
  try {return await call<T>(method,key,payload);}
  catch(error) {
    const code=(error as {code?:string}).code;
    if(code==='42501')throw new FinancialError('Account access is no longer available.',403,'ACTOR_DISABLED');
    if(['22023','23514','23503','22P02','22003','22007','22008'].includes(code || ''))throw new FinancialError(
      'Nothing was recorded. Review the quote, available stock, accounting values, period and request ID before retrying.',409,'SALE_REVIEW_REQUIRED');
    throw error;
  }
}
export function createSalesService(call:FinancialCall=callFinancial) {
  return {
    async customer(actor:FinancialActor,input:unknown) {
      const body=object(input,['requestId','expectedStaffId','name','contact']);
      checkExpectedActor(actor,body);
      return execute<{customer_id:string}>(call,'api_customer',text(body.requestId,200,'Request ID'),{
        actor_id:identity(actor),name:text(body.name,200,'Customer name'),...(body.contact!==undefined ? {contact:text(body.contact,200,'Contact')} : {})});
    },
    async sale(actor:FinancialActor,input:unknown) {
      const body=object(input,['requestId','expectedStaffId','customerId','businessDate','jobs','initialPaymentKobo','cashAccountCode','paymentMethod','quoteId']);
      checkExpectedActor(actor,body);
      if(!validUUID(body.customerId))throw invalid('Select a customer identity.');
      if(typeof body.businessDate!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.businessDate) || body.businessDate.startsWith('0000-')
        || Number.isNaN(Date.parse(body.businessDate)) || new Date(body.businessDate).toISOString().slice(0,10)!==body.businessDate)throw invalid('Use a valid business date.');
      if(!Array.isArray(body.jobs) || body.jobs.length<1 || body.jobs.length>100)throw invalid('Select 1 to 100 tracked jobs.');
      const jobs=body.jobs.map(value=>{
        const job=object(value,['materialId','serviceId','description','quantity','widthFt','heightFt','expectedUnitPriceKobo','priceRequestId']);
        if(job.priceRequestId!==undefined && !validUUID(job.priceRequestId))throw invalid('Invalid price approval.');
        if(typeof job.quantity!=='string' || !/^[1-9][0-9]{0,4}$/.test(job.quantity) || Number(job.quantity)>10000)throw invalid('Use a whole quantity from 1 to 10,000.');
        const approval=job.priceRequestId!==undefined ? {price_request_id:String(job.priceRequestId).toLowerCase()} : {};
        if(job.serviceId!==undefined) {
          if(!validUUID(job.serviceId) || job.materialId!==undefined || job.widthFt!==undefined || job.heightFt!==undefined)throw invalid('Select one service, without a size.');
          return {service_id:job.serviceId.toLowerCase(),description:text(job.description,1000,'Description'),quantity:job.quantity,
            expected_unit_price_kobo:money(job.expectedUnitPriceKobo),...approval};
        }
        if(!validUUID(job.materialId))throw invalid('Select a material identity.');
        return {material_id:job.materialId.toLowerCase(),description:text(job.description,1000,'Description'),quantity:job.quantity,
          width_ft:dimension(job.widthFt),height_ft:dimension(job.heightFt),expected_unit_price_kobo:money(job.expectedUnitPriceKobo),...approval};
      });
      const initial=money(body.initialPaymentKobo ?? '0',true);
      const method=normalizePaymentMethod(body.paymentMethod);
      if(initial!=='0' && !method)throw invalid('Choose Cash, Transfer or POS.');
      if(body.cashAccountCode!==undefined && (typeof body.cashAccountCode!=='string' || !/^[0-9]{4,8}$/.test(body.cashAccountCode)))throw invalid('Invalid receiving account.');
      if(body.quoteId!==undefined && !validUUID(body.quoteId))throw invalid('Invalid quote.');
      const payload:Record<string,unknown>={actor_id:identity(actor),customer_id:body.customerId.toLowerCase(),business_date:body.businessDate,jobs,initial_payment_kobo:initial,
        ...(body.quoteId!==undefined ? {quote_id:String(body.quoteId).toLowerCase()} : {})};
      if(initial!=='0') {payload.payment_method=method;if(body.cashAccountCode!==undefined)payload.cash_account_code=body.cashAccountCode;}
      return execute<{order_id:string;job_ids:string[];total_kobo:string;journal_entry_ids:string[];initial_payment:unknown}>(call,'api_sale',text(body.requestId,200,'Request ID'),payload);
    },
  };
}
export const salesService=createSalesService();

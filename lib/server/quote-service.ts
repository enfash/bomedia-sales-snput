import { callFinancial,type FinancialCall } from './financial-db';
import { FinancialError,validUUID,type FinancialActor,type FinancialPage } from './financial-service';

const invalid=(message:string)=>new FinancialError(message,400,'INVALID_INPUT');
function object(value:unknown,keys:string[]):Record<string,unknown> {
  if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).some(k=>!keys.includes(k)))
    throw invalid('Use the supported quote fields and database IDs.');
  return value as Record<string,unknown>;
}
function text(value:unknown,max:number,label:string,min=1) {
  if(typeof value!=='string' || value.trim().length<min || value.length>max)throw invalid(`${label} is required.`);
  return value.trim();
}
function dimension(value:unknown) {
  if(typeof value!=='string' || !/^[0-9]{1,6}(\.[0-9]{1,6})?$/.test(value) || Number(value)<=0)throw invalid('Use positive feet with up to six decimal places.');
  return value;
}
function date(value:unknown) {
  if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-'))throw invalid('Choose a valid business date.');
  const parsed=new Date(`${value}T00:00:00Z`);
  if(!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10)!==value)throw invalid('Choose a valid business date.');
  return value;
}
function identity(actor:FinancialActor,body:Record<string,unknown>) {
  if(!validUUID(actor.staffId))throw new FinancialError('An enabled accounting identity is required.',403,'ACTOR_REQUIRED');
  const id=actor.staffId.toLowerCase();
  if(body.expectedStaffId!==undefined && (typeof body.expectedStaffId!=='string' || body.expectedStaffId.toLowerCase()!==id))
    throw new FinancialError('Sign in as the staff member who saved this entry.',403,'ACTOR_CHANGED');
  return id;
}
async function execute<T>(call:FinancialCall,method:'api_quote'|'api_price_decision',key:string,payload:Record<string,unknown>) {
  try {return await call<T>(method,key,payload);}
  catch(error) {
    const code=(error as {code?:string}).code;
    if(code==='42501')throw new FinancialError('Account access is no longer available.',403,'ACTOR_DISABLED');
    if(['22023','23514','23503','22P02','22003','22007','22008'].includes(code || ''))throw new FinancialError(
      'Nothing was saved. Check the items, customer, prices and request ID. Keep this entry for review.',409,'QUOTE_REVIEW_REQUIRED');
    throw error;
  }
}
export type QuoteResult={estimate_id:string;quote_number:string;total_kobo:string;items:Record<string,unknown>[];pending_price_requests:number};
export function createQuoteService(call:FinancialCall=callFinancial) {
  return {
    async save(actor:FinancialActor,input:unknown) {
      const body=object(input,['requestId','expectedStaffId','customerId','clientName','businessDate','items','priceRequests']);
      const payload:Record<string,unknown>={actor_id:identity(actor,body),business_date:date(body.businessDate)};
      if(body.customerId!==undefined) {if(!validUUID(body.customerId))throw invalid('Select a customer.');payload.customer_id=body.customerId.toLowerCase();}
      else payload.client_name=text(body.clientName,200,'Customer or client name');
      if(!Array.isArray(body.items) || body.items.length<1 || body.items.length>100)throw invalid('Add 1 to 100 items.');
      payload.items=body.items.map(value=>{
        const item=object(value,['materialId','description','quantity','widthFt','heightFt']);
        if(!validUUID(item.materialId))throw invalid('Select a material.');
        if(typeof item.quantity!=='string' || !/^[1-9][0-9]{0,4}$/.test(item.quantity) || Number(item.quantity)>10000)throw invalid('Use a whole quantity from 1 to 10,000.');
        return {material_id:item.materialId.toLowerCase(),description:text(item.description,1000,'Description'),quantity:item.quantity,
          width_ft:dimension(item.widthFt),height_ft:dimension(item.heightFt)};
      });
      if(body.priceRequests!==undefined) {
        if(!Array.isArray(body.priceRequests) || body.priceRequests.length>100)throw invalid('Invalid price requests.');
        if(body.priceRequests.length && payload.customer_id===undefined)throw invalid('Choose the customer before asking for a price.');
        payload.price_requests=body.priceRequests.map(value=>{
          const req=object(value,['itemIndex','requestedUnitPriceKobo','reason']);
          if(!Number.isInteger(req.itemIndex) || Number(req.itemIndex)<0 || Number(req.itemIndex)>=(payload.items as unknown[]).length)throw invalid('Invalid item.');
          if(typeof req.requestedUnitPriceKobo!=='string' || !/^[1-9][0-9]{0,18}$/.test(req.requestedUnitPriceKobo))throw invalid('Enter the asked price in whole kobo.');
          return {item_index:String(req.itemIndex),requested_unit_price_kobo:req.requestedUnitPriceKobo,reason:text(req.reason,500,'Reason',3)};
        });
      }
      return execute<QuoteResult>(call,'api_quote',text(body.requestId,200,'Request ID'),payload);
    },
    async lookup(number:unknown) {
      const value=typeof number==='string' ? number.trim().toUpperCase() : '';
      if(!/^QT-[0-9]{4,}$/.test(value))throw invalid('Enter a quote number like QT-00042.');
      return call<Record<string,unknown>>('api_quote_lookup',value,{});
    },
    async requests() {return call<FinancialPage>('api_price_requests','',{});},
    async decide(actor:FinancialActor,input:unknown) {
      const body=object(input,['requestId','expectedStaffId','priceRequestId','decision','note']);
      const payload:Record<string,unknown>={actor_id:identity(actor,body)};
      if(!validUUID(body.priceRequestId))throw invalid('Select a price request.');
      if(body.decision!=='approve' && body.decision!=='decline')throw invalid('Approve or decline.');
      payload.price_request_id=body.priceRequestId.toLowerCase();payload.decision=body.decision;
      if(body.note!==undefined && body.note!=='') payload.note=text(body.note,500,'Note');
      return execute<{price_request_id:string;status:string}>(call,'api_price_decision',text(body.requestId,200,'Request ID'),payload);
    },
  };
}
export const quoteService=createQuoteService();

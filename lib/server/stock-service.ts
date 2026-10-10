import { normalizePaymentMethod } from '../payment-methods';
import { callFinancial,type FinancialCall } from './financial-db';
import { FinancialError,validUUID,type FinancialActor } from './financial-service';

export type StockResult={stock_entry_id:string;journal_entry_id:string|null;[key:string]:unknown};
const invalid=(message:string)=>new FinancialError(message,400,'INVALID_INPUT');
function object(value:unknown,keys:string[]):Record<string,unknown> {
  if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).some(k=>!keys.includes(k)))
    throw invalid('Use the supported stock fields and database roll IDs. Legacy row references need mapping first.');
  return value as Record<string,unknown>;
}
function text(value:unknown,max:number,label:string) {
  if(typeof value!=='string' || !value.trim() || value.length>max)throw invalid(`${label} is required.`);
  return value.trim();
}
function optional(value:unknown,max:number,label:string) {
  if(value===undefined || value==='')return undefined;
  if(typeof value!=='string' || value.length>max)throw invalid(`${label} is too long.`);
  return value.trim() || undefined;
}
function feet(value:unknown,label:string,allowZero=false) {
  if(typeof value!=='string' || !/^(0|[1-9][0-9]{0,5})(\.[0-9]{1,6})?$/.test(value) || (!allowZero && Number(value)<=0))
    throw invalid(`${label} must be in feet with up to six decimal places.`);
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
function rollId(value:unknown) {
  if(!validUUID(value))throw invalid('Select a roll by its database ID.');
  return value.toLowerCase();
}
async function execute(call:FinancialCall,method:'api_restock'|'api_waste'|'api_stock_count',key:string,payload:Record<string,unknown>) {
  try {return await call<StockResult>(method,key,payload);}
  catch(error) {
    const code=(error as {code?:string}).code;
    if(code==='42501')throw new FinancialError('Account access is no longer available.',403,'ACTOR_DISABLED');
    if(['22023','23514','23503','22P02','22003','22007','22008'].includes(code || ''))throw new FinancialError(
      'Stock was not changed. Check the roll, length, cost, accounting period and request ID. Keep this entry for review.',409,'STOCK_REVIEW_REQUIRED');
    throw error;
  }
}
export function createStockService(call:FinancialCall=callFinancial) {
  return {
    async restock(actor:FinancialActor,input:unknown) {
      const body=object(input,['requestId','expectedStaffId','materialId','rollCount','rawLengthFt','totalCostKobo','paymentMethod','businessDate','supplier','reference']);
      const actorId=identity(actor,body);
      if(!validUUID(body.materialId))throw invalid('Select a material.');
      if(typeof body.rollCount!=='string' || !/^[1-9][0-9]?$/.test(body.rollCount))throw invalid('Enter 1 to 99 rolls.');
      const raw=feet(body.rawLengthFt,'Roll length');
      if(Number(raw)<=10)throw invalid('Each roll must be longer than the 10 ft setup reserve.');
      if(typeof body.totalCostKobo!=='string' || !/^[1-9][0-9]{0,18}$/.test(body.totalCostKobo) || BigInt(body.totalCostKobo)>BigInt('9223372036854775807')
        || BigInt(body.totalCostKobo)<BigInt(body.rollCount))throw invalid('Enter the total paid in whole kobo.');
      const method=normalizePaymentMethod(body.paymentMethod);
      if(!method)throw invalid('Choose Cash, Transfer or POS.');
      const payload:Record<string,unknown>={actor_id:actorId,material_id:body.materialId.toLowerCase(),roll_count:body.rollCount,
        raw_length_ft:raw,total_cost_kobo:body.totalCostKobo,payment_method:method,business_date:date(body.businessDate)};
      const supplier=optional(body.supplier,200,'Supplier'),reference=optional(body.reference,100,'Reference');
      if(supplier)payload.supplier=supplier;
      if(reference)payload.reference=reference;
      return execute(call,'api_restock',text(body.requestId,200,'Request ID'),payload);
    },
    async waste(actor:FinancialActor,input:unknown) {
      const body=object(input,['requestId','expectedStaffId','rollId','lengthFt','reason','responsible','note','businessDate']);
      const actorId=identity(actor,body);
      const payload:Record<string,unknown>={actor_id:actorId,roll_id:rollId(body.rollId),length_ft:feet(body.lengthFt,'Waste length'),
        reason:text(body.reason,200,'Reason'),business_date:date(body.businessDate)};
      const responsible=optional(body.responsible,100,'Responsible'),note=optional(body.note,500,'Note');
      if(responsible)payload.responsible=responsible;
      if(note)payload.note=note;
      return execute(call,'api_waste',text(body.requestId,200,'Request ID'),payload);
    },
    async count(actor:FinancialActor,input:unknown) {
      const body=object(input,['requestId','expectedStaffId','rollId','countedLengthFt','reason','businessDate']);
      const actorId=identity(actor,body);
      const reason=text(body.reason,500,'Reason');
      if(reason.length<3)throw invalid('Explain the difference.');
      return execute(call,'api_stock_count',text(body.requestId,200,'Request ID'),{actor_id:actorId,roll_id:rollId(body.rollId),
        counted_length_ft:feet(body.countedLengthFt,'Measured length',true),reason,business_date:date(body.businessDate)});
    },
  };
}
export const stockService=createStockService();

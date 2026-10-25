import { callFinancial,type FinancialCall } from './financial-db';
import { FinancialError,validUUID,type FinancialActor,type FinancialPage } from './financial-service';

const invalid=(message:string)=>new FinancialError(message,400,'INVALID_INPUT');
/** Who can log a category: everyone, only the owner, or the owner plus chosen staff. */
function access(body:Record<string,unknown>) {
  if(body.access===undefined) {
    if(body.staffIds!==undefined)throw invalid('Choose who can log this category.');
    return {};
  }
  if(body.access!=='everyone' && body.access!=='owner' && body.access!=='chosen')throw invalid('Choose everyone, owner only or chosen staff.');
  if(body.access!=='chosen') {
    if(body.staffIds!==undefined && !(Array.isArray(body.staffIds) && body.staffIds.length===0))throw invalid('Staff are only chosen with the chosen staff option.');
    return {access:body.access};
  }
  const ids=body.staffIds;
  if(!Array.isArray(ids) || ids.length<1 || ids.length>100 || !ids.every(validUUID))throw invalid('Choose at least one staff member.');
  return {access:'chosen',staff_ids:[...new Set((ids as string[]).map(id=>id.toLowerCase()))]};
}
export function createExpenseCategorySettings(call:FinancialCall=callFinancial) {
  return {
    list() {return call<FinancialPage>('api_expense_categories_admin','',{});},
    async save(actor:FinancialActor,input:unknown) {
      if(!input || typeof input!=='object' || Array.isArray(input))throw invalid('An expense category is required.');
      const body=input as Record<string,unknown>;
      if(Object.keys(body).some(k=>!['requestId','action','name','kind','enabled','access','staffIds'].includes(k)))throw invalid('Use the supported expense category fields.');
      if(!validUUID(actor.staffId))throw new FinancialError('An enabled accounting identity is required.',403,'ACTOR_REQUIRED');
      if(typeof body.requestId!=='string' || !body.requestId.trim() || body.requestId.length>200)throw invalid('Request ID is required.');
      if(typeof body.name!=='string' || !body.name.trim())throw invalid('Give the category a name.');
      if(body.name.trim().length>100)throw invalid('The name is too long (100 characters at most).');
      let payload:Record<string,unknown>;
      if(body.action==='add') {
        if(body.kind!=='everyday' && body.kind!=='capital')throw invalid('Choose Everyday cost or Equipment and assets.');
        if(body.enabled!==undefined)throw invalid('A new category starts turned on.');
        payload={actor_id:actor.staffId.toLowerCase(),action:'add',name:body.name.trim(),kind:body.kind,...access(body)};
      } else if(body.action==='set_enabled') {
        if(typeof body.enabled!=='boolean')throw invalid('Choose whether staff can use it.');
        if(body.kind!==undefined || body.access!==undefined || body.staffIds!==undefined)throw invalid('Only on or off can change here.');
        payload={actor_id:actor.staffId.toLowerCase(),action:'set_enabled',name:body.name.trim(),enabled:body.enabled};
      } else if(body.action==='set_access') {
        if(body.access===undefined)throw invalid('Choose who can log this category.');
        if(body.kind!==undefined || body.enabled!==undefined)throw invalid('Only who can log it can change here.');
        payload={actor_id:actor.staffId.toLowerCase(),action:'set_access',name:body.name.trim(),...access(body)};
      } else throw invalid('Choose add, turn on/off or who can log it.');
      try {return await call<{name:string;changed:string[]}>('api_expense_category_save',body.requestId.trim(),payload);}
      catch(error) {
        const code=(error as {code?:string}).code;
        if(code==='42501')throw new FinancialError('Account access is no longer available.',403,'ACTOR_DISABLED');
        if(code==='23505')throw new FinancialError('Another category already uses that name.',409,'EXPENSE_CATEGORY_REVIEW_REQUIRED');
        if(code==='23514')throw new FinancialError('At least one category must stay on for staff.',409,'EXPENSE_CATEGORY_REVIEW_REQUIRED');
        if(['22023','22P02'].includes(code || ''))throw new FinancialError('The category was not saved. Check the name and try again.',409,'EXPENSE_CATEGORY_REVIEW_REQUIRED');
        throw error;
      }
    },
  };
}
export const expenseCategorySettings=createExpenseCategorySettings();

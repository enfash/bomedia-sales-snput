import { callFinancial,type FinancialCall } from './financial-db';
import { FinancialError,validUUID,type FinancialActor } from './financial-service';

const invalid=(message:string)=>new FinancialError(message,400,'INVALID_INPUT');
const FIELDS=['accountName','accountNumber','bank','phone','email','address'] as const;
type Field=typeof FIELDS[number];
const SNAKE:Record<Field,string>={accountName:'account_name',accountNumber:'account_number',bank:'bank',phone:'phone',email:'email',address:'address'};

// Mirrors the table constraints so the owner gets a specific message instead of a generic rejection.
function checkField(field:Field,value:string) {
  if(field==='accountName' && value.length>120)throw invalid('Account name is too long (120 characters at most).');
  if(field==='accountNumber' && !/^[0-9]{10}$/.test(value))throw invalid('Account number must be exactly 10 digits.');
  if(field==='bank' && value.length>80)throw invalid('Bank name is too long (80 characters at most).');
  if(field==='phone') {
    const digits=value.replace(/[^0-9]/g,'').length;
    if(!/^\+?[0-9][0-9 ()-]*$/.test(value) || digits<7 || digits>15 || value.length>30)throw invalid('Enter a phone number such as +234 802 224 7567.');
  }
  if(field==='email' && (value.length>254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)))throw invalid('Enter a valid email address.');
  if(field==='address' && value.length>300)throw invalid('Address is too long (300 characters at most).');
}

export function createBusinessDetailsService(call:FinancialCall=callFinancial) {
  return {
    read() {return call<Record<string,string|null>>('api_business_details','current',{});},
    async save(actor:FinancialActor,input:unknown) {
      if(!input || typeof input!=='object' || Array.isArray(input))throw invalid('Business details are required.');
      const body=input as Record<string,unknown>;
      if(Object.keys(body).some(k=>k!=='requestId' && !(FIELDS as readonly string[]).includes(k)))throw invalid('Use the supported business detail fields.');
      if(!validUUID(actor.staffId))throw new FinancialError('An enabled accounting identity is required.',403,'ACTOR_REQUIRED');
      if(typeof body.requestId!=='string' || !body.requestId.trim() || body.requestId.length>200)throw invalid('Request ID is required.');
      const payload:Record<string,unknown>={actor_id:actor.staffId.toLowerCase()};
      for(const field of FIELDS) {
        const raw=body[field];
        if(typeof raw!=='string' || !raw.trim())throw invalid(`${field==='accountName' ? 'Account name' : field==='accountNumber' ? 'Account number' : field[0].toUpperCase()+field.slice(1)} is required.`);
        const value=raw.trim();
        checkField(field,value);
        payload[SNAKE[field]]=value;
      }
      try {return await call<{changed:string[]}>('api_business_details_save',body.requestId.trim(),payload);}
      catch(error) {
        const code=(error as {code?:string}).code;
        if(code==='42501')throw new FinancialError('Account access is no longer available.',403,'ACTOR_DISABLED');
        if(['22023','23514','22P02'].includes(code || ''))throw new FinancialError('The business details were not saved. Check each field and try again.',409,'BUSINESS_DETAILS_REVIEW_REQUIRED');
        throw error;
      }
    },
  };
}
export const businessDetailsService=createBusinessDetailsService();

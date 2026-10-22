import { callFinancial,type FinancialCall } from './financial-db';
import { FinancialError,validUUID } from './financial-service';

export const AUDIT_CATEGORIES=['signins','staff','sales','expenses','stock','settings','approvals','other'] as const;
export const AUDIT_RANGES=['today','7d','30d','all'] as const;
export type AuditCategory=typeof AUDIT_CATEGORIES[number];
export type AuditRange=typeof AUDIT_RANGES[number];
export type AuditEntry={id:string;at:string;action:string;category:AuditCategory;actor_id:string|null;actor_name:string|null;
  entity_type:string;details:Record<string,unknown>};
export type AuditPage={data:AuditEntry[];next_before:{at:string;id:string}|null;people:{id:string;name:string}[]};

const invalid=(message:string)=>new FinancialError(message,400,'INVALID_INPUT');
const HOUR=3_600_000,DAY=86_400_000;
// Lagos has no daylight saving: its day starts at 23:00 UTC the evening before.
export function sinceFor(range:AuditRange,now:Date):string|null {
  if(range==='all')return null;
  if(range==='today'){
    const lagos=new Date(now.getTime()+HOUR);
    return new Date(Date.UTC(lagos.getUTCFullYear(),lagos.getUTCMonth(),lagos.getUTCDate())-HOUR).toISOString();
  }
  return new Date(now.getTime()-(range==='7d'?7:30)*DAY).toISOString();
}
export function createAuditLog(call:FinancialCall=callFinancial,clock:()=>Date=()=>new Date()) {
  return {
    async list(input:Record<string,unknown>):Promise<AuditPage> {
      const allowed=['category','staffId','range','beforeAt','beforeId'];
      if(Object.keys(input).some(k=>!allowed.includes(k)))throw invalid('Use the supported audit filters.');
      const payload:Record<string,unknown>={limit:50};
      if(input.category!==undefined&&input.category!==''){
        if(!AUDIT_CATEGORIES.includes(input.category as AuditCategory))throw invalid('Choose a listed kind of activity.');
        payload.category=input.category;
      }
      if(input.staffId!==undefined&&input.staffId!==''){
        if(typeof input.staffId!=='string'||!validUUID(input.staffId))throw invalid('Choose a person from the list.');
        payload.staff_id=input.staffId.toLowerCase();
      }
      const range=(input.range===undefined||input.range==='')?'7d':input.range;
      if(!AUDIT_RANGES.includes(range as AuditRange))throw invalid('Choose Today, 7 days, 30 days or All.');
      const since=sinceFor(range as AuditRange,clock());
      if(since)payload.since=since;
      const hasAt=input.beforeAt!==undefined&&input.beforeAt!=='',hasId=input.beforeId!==undefined&&input.beforeId!=='';
      if(hasAt!==hasId)throw invalid('The page marker is incomplete.');
      if(hasAt){
        if(typeof input.beforeAt!=='string'||Number.isNaN(Date.parse(input.beforeAt))||typeof input.beforeId!=='string'||!validUUID(input.beforeId))
          throw invalid('The page marker is not valid.');
        payload.before_at=input.beforeAt;payload.before_id=input.beforeId.toLowerCase();
      }
      try {return await call<AuditPage>('api_audit_log','',payload);}
      catch(error) {
        if(['22023','22P02','22007'].includes((error as {code?:string}).code||''))throw invalid('Those filters could not be applied.');
        throw error;
      }
    },
  };
}
export const auditLog=createAuditLog();

import { financialHandler,financialIdentity } from './financial-routes';
import { FinancialError } from './financial-service';
import { auditLog } from './audit-log';
import { verifiedAdminIdentity } from './postgres-auth-routes';

// Owner only, read only. Nothing here can write to the log.
export function listAuditLog(request:Request) {
  return financialHandler(async()=>{
    if(!await verifiedAdminIdentity())throw new FinancialError('Owner access is required to see the audit log.',403,'OWNER_REQUIRED');
    await financialIdentity(false);
    const params=new URL(request.url).searchParams;
    const input:Record<string,unknown>={};
    for(const [key,name] of [['category','category'],['staffId','staff'],['range','range'],['beforeAt','beforeAt'],['beforeId','beforeId']] as const){
      const value=params.get(name);if(value!==null)input[key]=value;
    }
    return auditLog.list(input);
  });
}

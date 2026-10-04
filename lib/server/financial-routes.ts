import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { financialApiEnabled } from './financial-db';
import { FinancialError, financialService, validUUID } from './financial-service';
import { verifiedAdminIdentity } from './postgres-auth-routes';
import { postgresAuth } from './postgres-auth';

export async function financialHandler(work: () => Promise<unknown>) {
  try {
    if (!financialApiEnabled()) return NextResponse.json({error:'Accounting API is not enabled.'},{status:404,headers:{'Cache-Control':'no-store'}});
    return NextResponse.json(await work(),{headers:{'Cache-Control':'no-store'}});
  } catch(error) {
    const known=error instanceof FinancialError;
    return NextResponse.json({error:known ? error.message : 'Accounting service is unavailable. Keep your entry and retry with the same request ID.',
      code:known ? error.code : 'ACCOUNTING_UNAVAILABLE'},
      {status:known ? error.status : 503,headers:{'Cache-Control':'no-store'}});
  }
}
export async function financialIdentity(write: boolean) {
  const admin = await verifiedAdminIdentity();
  if (admin) {
    if (!write) return null;
    const staffId=process.env.SUPABASE_ADMIN_STAFF_ID;
    if (!validUUID(staffId)) throw new FinancialError('The owner accounting identity has not been configured.',503,'ADMIN_ACTOR_REQUIRED');
    return {staffId};
  }
  const token=(await cookies()).get('cashier_session')?.value;
  const session=await postgresAuth.session(token);
  if (!session) throw new FinancialError('Please sign in again. Pending entries remain on this device.',401,'SIGN_IN_REQUIRED');
  return {staffId:session.staff_id};
}
export function collectPayment(request: Request) {
  return financialHandler(async()=>{
    const identity=await financialIdentity(true);
    let body: unknown;
    try {body=await request.json();} catch {throw new FinancialError('Invalid payment request.',400,'INVALID_INPUT');}
    if (!identity) throw new FinancialError('Collector identity is required.',403,'ACTOR_REQUIRED');
    return {success:true,...await financialService.collect(identity,body)};
  });
}
export function readFinancialRecords(request: Request) {
  return financialHandler(async()=>{
    await financialIdentity(false);
    const params=new URL(request.url).searchParams;
    const allowed=new Set(['resource','limit','after_id','customer_id']);
    if (Array.from(params.keys()).some(k=>!allowed.has(k) || params.getAll(k).length!==1)) {
      throw new FinancialError('Invalid accounting filters.',400,'INVALID_INPUT');
    }
    const filter: Record<string,unknown>={};
    if (params.has('limit')) filter.limit=Number(params.get('limit'));
    for (const key of ['after_id','customer_id']) if (params.has(key)) filter[key]=params.get(key);
    return financialService.read(params.get('resource') || '',filter);
  });
}

export function readAccountingReport(request: Request) {
  return financialHandler(async()=>{
    if (!await verifiedAdminIdentity()) throw new FinancialError('Owner access is required for accounting reports.',403,'OWNER_REQUIRED');
    const params=new URL(request.url).searchParams;
    if (Array.from(params.keys()).some(k=>!['from','through'].includes(k) || params.getAll(k).length!==1)) {
      throw new FinancialError('Invalid report filters.',400,'INVALID_INPUT');
    }
    return financialService.report(params.get('from'),params.get('through'));
  });
}

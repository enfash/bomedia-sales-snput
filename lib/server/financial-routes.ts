import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { callFinancial,financialApiEnabled } from './financial-db';
import { FinancialError, financialService, validUUID, type FinancialPage } from './financial-service';
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
async function markUnavailable(page: FinancialPage): Promise<FinancialPage> {
  const off=await callFinancial<{id:string}[]>('api_unavailable_materials','current',{});
  const ids=new Set((Array.isArray(off)?off:[]).map(item=>String(item.id).toLowerCase()));
  if(!ids.size)return page;
  return {...page,data:page.data.map(row=>ids.has(String(row.id).toLowerCase())?{...row,available:false}:row)};
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
/** Owner-only categories are hidden from staff unless the owner chose them, and the access fields never reach staff. */
export function categoriesForViewer(page: FinancialPage, viewerId: string | null): FinancialPage {
  if (viewerId === null) return page; // the owner sees every category with its access settings
  const me = viewerId.toLowerCase();
  const allowed = (c: Record<string,unknown>) => c.owner_only !== true || (Array.isArray(c.staff_ids) && c.staff_ids.some(id => String(id).toLowerCase() === me));
  return {...page,data:page.data.filter(allowed).map(({owner_only:_a,staff_ids:_b,...rest})=>rest)};
}
export function readFinancialRecords(request: Request) {
  return financialHandler(async()=>{
    const identity=await financialIdentity(false);
    const params=new URL(request.url).searchParams;
    if (params.get('resource')==='expenses_awaiting' && !await verifiedAdminIdentity()) {
      throw new FinancialError('Owner access is required for expenses awaiting payment.',403,'OWNER_REQUIRED');
    }
    const allowed=new Set(['resource','limit','after_id','customer_id']);
    if (Array.from(params.keys()).some(k=>!allowed.has(k) || params.getAll(k).length!==1)) {
      throw new FinancialError('Invalid accounting filters.',400,'INVALID_INPUT');
    }
    const filter: Record<string,unknown>={};
    if (params.has('limit')) filter.limit=Number(params.get('limit'));
    for (const key of ['after_id','customer_id']) if (params.has(key)) filter[key]=params.get(key);
    const page=await financialService.read(params.get('resource') || '',filter);
    if (params.get('resource')==='expense_categories') return categoriesForViewer(page,identity?identity.staffId:null);
    // Stock entry still lists turned-off sizes (leftover stock must be countable), but marks them.
    if (params.get('resource')==='materials') return markUnavailable(page);
    return page;
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

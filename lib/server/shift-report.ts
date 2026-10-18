import { financialHandler, financialIdentity } from './financial-routes';
import { callFinancial } from './financial-db';
import { verifiedAdminIdentity } from './postgres-auth-routes';
import { FinancialError } from './financial-service';
import type { ShiftData } from '../shift-report';

export async function shiftData(date: string): Promise<ShiftData> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date)
    throw new FinancialError('Choose a valid report date.',400,'INVALID_INPUT');
  const actor = await financialIdentity(true);
  if (!actor) throw new FinancialError('Sign in again.',401,'SIGN_IN_REQUIRED');
  return callFinancial<ShiftData>('api_shift_report',date,{actor_id:actor.staffId,by_owner:String(Boolean(await verifiedAdminIdentity()))});
}
export const readShiftReport = (request: Request) => financialHandler(() => shiftData(new URL(request.url).searchParams.get('date') ?? ''));

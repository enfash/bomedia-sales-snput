import { orderContract } from '../order-contract';
import { callFinancial, type FinancialCall } from './financial-db';
import { financialHandler, financialIdentity } from './financial-routes';
import { FinancialError } from './financial-service';
export function recordScreenOrder(request: Request, call: FinancialCall = callFinancial) {
  return financialHandler(async () => {
    const actor = await financialIdentity(true);
    let order;
    try { order = orderContract(await request.json()); }
    catch (e) { throw new FinancialError(e instanceof Error ? e.message : 'Invalid order.',400,'INVALID_ORDER'); }
    if (!actor || actor.staffId.toLowerCase() !== order.expectedStaffId) throw new FinancialError('Sign in as the staff member who saved this order.',403,'ACTOR_CHANGED');
    const { requestId, expectedStaffId, version: _version, backend: _backend, ...fields } = order;
    try { return await call('api_screen_order',requestId,{...fields,actor_id:expectedStaffId}); }
    catch (e) {
      const code = (e as {code?:string}).code;
      if (['22023','22P02','P0002','23514','23505'].includes(code ?? '')) throw new FinancialError(
        e instanceof Error ? e.message : 'Order needs review before saving.',409,'ORDER_REVIEW_REQUIRED');
      if (code === '42501') throw new FinancialError('Your account cannot save this order.',403,'ACTOR_DISABLED');
      throw e;
    }
  });
}
export function readOrderCatalog(call: FinancialCall = callFinancial) {
  return financialHandler(async () => { await financialIdentity(false); return call('api_order_catalog','',{}); });
}

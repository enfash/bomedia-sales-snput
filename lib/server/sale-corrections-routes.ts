import { financialHandler, financialIdentity } from './financial-routes';
import { FinancialError } from './financial-service';
import { saleCorrections } from './sale-corrections';
import { verifiedAdminIdentity } from './postgres-auth-routes';

async function bodyOf(request: Request) {
  try { return await request.json(); } catch { throw new FinancialError('Invalid correction request.', 400, 'INVALID_INPUT'); }
}
// A sale's history is readable by anyone signed in (it is on the sale they can already open).
export function readSaleHistory(request: Request) {
  return financialHandler(async () => { await financialIdentity(false); return { data: await saleCorrections.history(new URL(request.url).searchParams.get('sales_id')) }; });
}
// `?preview=1` shows what a change would do (money and stock) without doing it; otherwise it asks for, or (owner) makes, the change.
export function changeSale(request: Request) {
  return financialHandler(async () => {
    const preview = new URL(request.url).searchParams.get('preview') === '1';
    const owner = Boolean(await verifiedAdminIdentity());
    const actor = await financialIdentity(true);
    if (!actor) throw new FinancialError('Accounting identity required.', 403, 'ACTOR_REQUIRED');
    const body = await bodyOf(request);
    if (preview) return saleCorrections.preview(body);
    return { success: true, owner, ...await saleCorrections.request(actor, owner, body) };
  });
}

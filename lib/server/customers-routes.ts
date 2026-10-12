import { financialHandler, financialIdentity } from './financial-routes';
import { FinancialError } from './financial-service';
import { customers } from './customers';
import { verifiedAdminIdentity } from './postgres-auth-routes';

// Everyone signed in may read customers: staff pick them at the counter. Only the owner's identity can rename one.
export function readCustomers() {
  return financialHandler(async () => { await financialIdentity(false); return { data: await customers.list() }; });
}
export function readCustomerProfile(request: Request) {
  return financialHandler(async () => { await financialIdentity(false); return customers.profile(new URL(request.url).searchParams.get('id')); });
}
export function saveCustomer(request: Request) {
  return financialHandler(async () => {
    const owner = Boolean(await verifiedAdminIdentity());
    const actor = await financialIdentity(true);
    if (!actor) throw new FinancialError('Accounting identity required.', 403, 'ACTOR_REQUIRED');
    let body: unknown;
    try { body = await request.json(); } catch { throw new FinancialError('Invalid customer change.', 400, 'INVALID_INPUT'); }
    return { success: true, ...await customers.save(actor, owner, body) };
  });
}

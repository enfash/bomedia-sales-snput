import { financialHandler, financialIdentity } from './financial-routes';
import { FinancialError } from './financial-service';
import { bookkeepingPeriod } from './bookkeeping-period';
import { verifiedAdminIdentity } from './postgres-auth-routes';

// Owner only, for reading as well as closing: staff have no reason to see the period controls.
export function readBookkeepingPeriod() {
  return financialHandler(async () => {
    if (!await verifiedAdminIdentity()) throw new FinancialError('Owner access is required for the bookkeeping period.', 403, 'OWNER_REQUIRED');
    await financialIdentity(false);
    return bookkeepingPeriod.read();
  });
}
export function closeBooks(request: Request) {
  return financialHandler(async () => {
    if (!await verifiedAdminIdentity()) throw new FinancialError('Owner access is required to close the books.', 403, 'OWNER_REQUIRED');
    const actor = await financialIdentity(true);
    if (!actor) throw new FinancialError('Owner accounting identity required.', 403, 'ACTOR_REQUIRED');
    let body: unknown;
    try { body = await request.json(); } catch { throw new FinancialError('Invalid closing request.', 400, 'INVALID_INPUT'); }
    return { success: true, ...await bookkeepingPeriod.close(actor, body) };
  });
}

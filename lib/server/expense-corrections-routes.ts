import { financialHandler, financialIdentity } from './financial-routes';
import { FinancialError } from './financial-service';
import { expenseCorrections } from './expense-corrections';
import { verifiedAdminIdentity } from './postgres-auth-routes';

async function bodyOf(request: Request) {
  try { return await request.json(); } catch { throw new FinancialError('Invalid correction request.', 400, 'INVALID_INPUT'); }
}
// History and preview use the same object visibility as the expense feed.
export function readExpenseHistory(request: Request) {
  return financialHandler(async () => { const actor = await financialIdentity(true); if (!actor) throw new FinancialError('Sign in again.',401,'SIGN_IN_REQUIRED'); return { data: await expenseCorrections.history(new URL(request.url).searchParams.get('reference'), actor, Boolean(await verifiedAdminIdentity())) }; });
}
// `?preview=1` shows what a change would do to the books without doing it; otherwise it asks for, or (owner) makes, the change.
export function changeExpense(request: Request) {
  return financialHandler(async () => {
    const preview = new URL(request.url).searchParams.get('preview') === '1';
    const owner = Boolean(await verifiedAdminIdentity());
    const actor = await financialIdentity(true);
    if (!actor) throw new FinancialError('Accounting identity required.', 403, 'ACTOR_REQUIRED');
    const body = await bodyOf(request);
    if (preview) return { plan: await expenseCorrections.preview(body, actor, owner) };
    return { success: true, owner, ...await expenseCorrections.request(actor, owner, body) };
  });
}

// Only the owner records money coming back from a payee.
export function recoverExpense(request: Request) {
  return financialHandler(async () => {
    if (!await verifiedAdminIdentity()) throw new FinancialError('Owner access is required.', 403, 'OWNER_REQUIRED');
    const actor = await financialIdentity(true);
    if (!actor) throw new FinancialError('Accounting identity required.', 403, 'ACTOR_REQUIRED');
    return { success: true, ...await expenseCorrections.recover(actor, await bodyOf(request)) };
  });
}

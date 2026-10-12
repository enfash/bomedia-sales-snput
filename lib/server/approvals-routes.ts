import { financialHandler, financialIdentity } from './financial-routes';
import { FinancialError } from './financial-service';
import { approvals } from './approvals';
import { verifiedAdminIdentity } from './postgres-auth-routes';

const ownerOnly = async (what: string) => {
  if (!await verifiedAdminIdentity()) throw new FinancialError(`Owner access is required ${what}.`, 403, 'OWNER_REQUIRED');
};
async function bodyOf(request: Request) {
  try { return await request.json(); } catch { throw new FinancialError('Invalid approval request.', 400, 'INVALID_INPUT'); }
}

// The owner sees every request. A staff member only ever sees their own, so a cashier can follow what is waiting.
export function readApprovals(request: Request) {
  return financialHandler(async () => {
    const mine = new URL(request.url).searchParams.get('mine') === '1';
    if (!mine) { await ownerOnly('to see approvals'); await financialIdentity(false); return approvals.list(); }
    const actor = await financialIdentity(false);
    if (!actor) throw new FinancialError('Sign in to see your approvals.', 403, 'ACTOR_REQUIRED');
    return approvals.mine(actor);
  });
}
export function decideApproval(request: Request) {
  return financialHandler(async () => {
    await ownerOnly('to approve or decline');
    const actor = await financialIdentity(true);
    if (!actor) throw new FinancialError('Owner accounting identity required.', 403, 'ACTOR_REQUIRED');
    return { success: true, ...await approvals.decide(actor, await bodyOf(request)) as object };
  });
}
// The owner edits these; anyone signed in may read them, so a cashier's device can ask for a reason before sending a sale the owner will have to approve.
// `?for=entry` answers with the rules plus whether the reader is the owner (an owner's own entries are never held).
export function readApprovalRules(request?: Request) {
  return financialHandler(async () => {
    const owner = Boolean(await verifiedAdminIdentity());
    const forEntry = request ? new URL(request.url).searchParams.get('for') === 'entry' : false;
    if (!owner && !forEntry) throw new FinancialError('Owner access is required to see approval rules.', 403, 'OWNER_REQUIRED');
    await financialIdentity(false);
    const rules = await approvals.rules();
    return forEntry ? { rules, isOwner: owner } : rules;
  });
}
export function saveApprovalRule(request: Request) {
  return financialHandler(async () => {
    await ownerOnly('to change approval rules');
    const actor = await financialIdentity(true);
    if (!actor) throw new FinancialError('Owner accounting identity required.', 403, 'ACTOR_REQUIRED');
    return { success: true, ...await approvals.saveRule(actor, await bodyOf(request)) as object };
  });
}

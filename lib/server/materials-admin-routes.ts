import { financialHandler, financialIdentity } from './financial-routes';
import { FinancialError } from './financial-service';
import { materialsAdmin } from './materials-admin';
import { verifiedAdminIdentity } from './postgres-auth-routes';

// Owner only, for reading as well as changing.
export function readMaterialsAdmin() {
  return financialHandler(async () => {
    if (!await verifiedAdminIdentity()) throw new FinancialError('Owner access is required for materials.', 403, 'OWNER_REQUIRED');
    await financialIdentity(false);
    return { data: await materialsAdmin.read() };
  });
}
export function saveMaterial(request: Request) {
  return financialHandler(async () => {
    if (!await verifiedAdminIdentity()) throw new FinancialError('Owner access is required to change materials.', 403, 'OWNER_REQUIRED');
    const actor = await financialIdentity(true);
    if (!actor) throw new FinancialError('Owner accounting identity required.', 403, 'ACTOR_REQUIRED');
    let body: unknown;
    try { body = await request.json(); } catch { throw new FinancialError('Invalid material request.', 400, 'INVALID_INPUT'); }
    return { success: true, ...await materialsAdmin.save(actor, body) };
  });
}

import { callFinancial, type FinancialCall } from './financial-db';
import { FinancialError, validUUID, type FinancialActor } from './financial-service';

export type ApprovalRule = { kind: 'date' | 'price' | 'expense_limit' | 'edit_old'; enabled: boolean; params: Record<string, unknown> };

const invalid = (message: string) => new FinancialError(message, 400, 'INVALID_INPUT');
const object = (input: unknown, message: string) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid(message);
  return input as Record<string, unknown>;
};
const only = (body: Record<string, unknown>, allowed: string[]) => {
  if (Object.keys(body).some((key) => !allowed.includes(key))) throw invalid('Use the supported approval fields.');
};
function mapError(error: unknown): never {
  const code = (error as { code?: string }).code;
  if (code === '42501') throw new FinancialError('Account access is no longer available.', 403, 'ACTOR_DISABLED');
  if (code === '22023') throw new FinancialError(error instanceof Error ? error.message : 'That approval can no longer be changed.', 409, 'APPROVAL_REVIEW_REQUIRED');
  throw error;
}
const requireActor = (actor: FinancialActor) => {
  if (!validUUID(actor.staffId)) throw new FinancialError('An enabled accounting identity is required.', 403, 'ACTOR_REQUIRED');
  return actor.staffId.toLowerCase();
};

export function createApprovals(call: FinancialCall = callFinancial) {
  return {
    rules() { return call<ApprovalRule[]>('api_approval_rules', '', {}); },
    // The database checks the ranges again (days 0-30, percent 0-100); this only gives precise messages first.
    async saveRule(actor: FinancialActor, input: unknown) {
      const body = object(input, 'Choose the rule to change.');
      only(body, ['requestId', 'kind', 'enabled', 'params']);
      const actorId = requireActor(actor);
      if (typeof body.requestId !== 'string' || !body.requestId.trim() || body.requestId.length > 200) throw invalid('Request ID is required.');
      if (typeof body.kind !== 'string' || typeof body.enabled !== 'boolean') throw invalid('Choose the rule and whether it is on.');
      const params = body.params === undefined ? {} : object(body.params, 'Rule settings are not valid.');
      try { return await call('api_approval_rule_save', body.requestId.trim(), { actor_id: actorId, kind: body.kind, enabled: body.enabled, params }); }
      catch (error) { return mapError(error); }
    },
    list() { return call('api_approvals', '', {}); },
    async mine(actor: FinancialActor) {
      const actorId = requireActor(actor);
      try { return await call('api_my_approvals', actorId, {}); } catch (error) { return mapError(error); }
    },
    async decide(actor: FinancialActor, input: unknown) {
      const body = object(input, 'Choose the approval to decide.');
      only(body, ['requestId', 'approvalRequestId', 'decision', 'note']);
      const actorId = requireActor(actor);
      if (typeof body.requestId !== 'string' || !body.requestId.trim() || body.requestId.length > 200) throw invalid('Request ID is required.');
      if (!validUUID(body.approvalRequestId)) throw invalid('Choose the approval to decide.');
      if (body.decision !== 'approve' && body.decision !== 'decline') throw invalid('Choose approve or decline.');
      if (body.note !== undefined && (typeof body.note !== 'string' || body.note.length > 500)) throw invalid('Keep the note under 500 characters.');
      try {
        return await call('api_approval_decision', body.requestId.trim(), {
          actor_id: actorId, approval_request_id: String(body.approvalRequestId).toLowerCase(), decision: body.decision, note: body.note ?? null,
        });
      } catch (error) { return mapError(error); }
    },
  };
}
export const approvals = createApprovals();

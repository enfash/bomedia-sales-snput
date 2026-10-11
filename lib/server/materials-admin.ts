import { nairaToKobo } from '../materials-format';
import { callFinancial, type FinancialCall } from './financial-db';
import { FinancialError, validUUID, type FinancialActor } from './financial-service';

export type MaterialSize = { id: string; code: string; width_ft: string; remaining_ft: string; roll_count: number; low_stock_ft: string;
  notes: string | null; available: boolean; price_kobo: string };
export type MaterialGroup = { name: string; price_kobo: string | null; prices_differ: boolean; sizes: MaterialSize[] };

const invalid = (message: string) => new FinancialError(message, 400, 'INVALID_INPUT');
const ACTIONS = ['set_price', 'rename', 'add_material', 'add_size', 'update_size'] as const;
type Action = typeof ACTIONS[number];
const FIELDS: Record<Action, string[]> = {
  set_price: ['name', 'price'], rename: ['name', 'newName'], add_material: ['name', 'price', 'width', 'lowStock', 'notes'],
  add_size: ['name', 'width', 'lowStock', 'notes'], update_size: ['materialId', 'lowStock', 'notes', 'available'],
};
const text = (value: unknown, label: string, max: number) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw invalid(`${label} is required (at most ${max} characters).`);
  return value.trim();
};
const number = (value: unknown, label: string) => {
  const raw = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!/^[0-9]+(\.[0-9]+)?$/.test(raw)) throw invalid(`Enter ${label} as a number.`);
  return raw;
};

export function createMaterialsAdmin(call: FinancialCall = callFinancial) {
  return {
    read() { return call<MaterialGroup[]>('api_materials_admin', 'current', {}); },
    // Plain checks first for precise messages; the database re-checks everything and is the authority.
    async save(actor: FinancialActor, input: unknown) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid('Choose what to change.');
      const body = input as Record<string, unknown>;
      const action = body.action as Action;
      if (!ACTIONS.includes(action)) throw invalid('Choose what to change.');
      if (Object.keys(body).some((key) => key !== 'requestId' && key !== 'action' && !FIELDS[action].includes(key))) throw invalid('Use the supported material fields.');
      if (!validUUID(actor.staffId)) throw new FinancialError('An enabled accounting identity is required.', 403, 'ACTOR_REQUIRED');
      if (typeof body.requestId !== 'string' || !body.requestId.trim() || body.requestId.length > 200) throw invalid('Request ID is required.');

      const payload: Record<string, unknown> = { actor_id: actor.staffId.toLowerCase(), action };
      if (action !== 'update_size') payload.name = text(body.name, 'The material name', 100);
      if (action === 'rename') payload.new_name = text(body.newName, 'The new name', 100);
      if (action === 'set_price' || action === 'add_material') {
        const kobo = nairaToKobo(body.price);
        if (!kobo || BigInt(kobo) > BigInt(10_000_000)) throw invalid('Enter a price between ₦0.01 and ₦100,000 per sq ft.');
        payload.price_kobo = kobo;
      }
      if (action === 'add_material' || action === 'add_size') payload.width_ft = number(body.width, 'the width in feet');
      if (body.lowStock !== undefined && body.lowStock !== '') payload.low_stock_ft = number(body.lowStock, 'the low-stock level in feet');
      if (action === 'add_material' || action === 'add_size' || action === 'update_size') {
        if (body.notes !== undefined) {
          if (body.notes !== null && (typeof body.notes !== 'string' || body.notes.length > 500)) throw invalid('Notes are at most 500 characters.');
          payload.notes = body.notes;
        }
      }
      if (action === 'update_size') {
        if (typeof body.materialId !== 'string' || !validUUID(body.materialId)) throw invalid('Choose a size.');
        payload.material_id = body.materialId.toLowerCase();
        if (body.available !== undefined) {
          if (typeof body.available !== 'boolean') throw invalid('Choose on or off.');
          payload.available = body.available;
        }
      }
      try { return await call<Record<string, unknown>>('api_material_save', body.requestId.trim(), payload); }
      catch (error) {
        const code = (error as { code?: string }).code;
        if (code === '42501') throw new FinancialError('Account access is no longer available.', 403, 'ACTOR_DISABLED');
        // Our own database messages are already plain words ("That size already exists").
        if ((code === '22023' || code === '23514') && error instanceof Error) throw new FinancialError(error.message, 409, 'MATERIAL_REVIEW_REQUIRED');
        throw error;
      }
    },
  };
}
export const materialsAdmin = createMaterialsAdmin();

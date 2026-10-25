import { describe, expect, it, vi } from 'vitest';
import { createMaterialsAdmin } from './materials-admin';

const actor = { staffId: '00000000-0000-4000-8000-0000000000AA' };
const owner = actor.staffId.toLowerCase();
const id = '00000000-0000-4000-8000-0000000000BB';
const run = (input: unknown, call = vi.fn().mockResolvedValue({ ok: true })) => ({ call, result: createMaterialsAdmin(call).save(actor, input) });

describe('saving a material change', () => {
  it('sends exact kobo and the lower-cased owner identity for a price change', async () => {
    const { call, result } = run({ requestId: ' r1 ', action: 'set_price', name: ' Flex ', price: '₦1,250.5' });
    await result;
    expect(call).toHaveBeenCalledWith('api_material_save', 'r1', { actor_id: owner, action: 'set_price', name: 'Flex', price_kobo: '125050' });
  });

  it('maps each action to its database fields', async () => {
    const cases: [Record<string, unknown>, Record<string, unknown>][] = [
      [{ action: 'rename', name: 'Flex', newName: ' Flex Pro ' }, { action: 'rename', name: 'Flex', new_name: 'Flex Pro' }],
      [{ action: 'add_material', name: 'Banner', price: '280', width: '6', lowStock: '15', notes: 'x' },
        { action: 'add_material', name: 'Banner', price_kobo: '28000', width_ft: '6', low_stock_ft: '15', notes: 'x' }],
      [{ action: 'add_size', name: 'Flex', width: 6 }, { action: 'add_size', name: 'Flex', width_ft: '6' }],
      [{ action: 'update_size', materialId: id.toUpperCase(), lowStock: '35', notes: null, available: false },
        { action: 'update_size', material_id: id.toLowerCase(), low_stock_ft: '35', notes: null, available: false }],
    ];
    for (const [input, fields] of cases) {
      const { call, result } = run({ requestId: 'r', ...input });
      await result;
      expect(call).toHaveBeenCalledWith('api_material_save', 'r', { actor_id: owner, ...fields });
    }
  });

  it('refuses bad input before touching the database', async () => {
    const bad: unknown[] = [null, [], {}, { requestId: 'r' }, { requestId: 'r', action: 'melt' }, { action: 'set_price', name: 'Flex', price: '1' },
      { requestId: 'r', action: 'set_price', name: 'Flex', price: 'free' }, { requestId: 'r', action: 'set_price', name: 'Flex', price: '100001' },
      { requestId: 'r', action: 'set_price', name: '', price: '5' }, { requestId: 'r', action: 'set_price', name: 'Flex', price: '5', width: '4' },
      { requestId: 'r', action: 'set_price', name: 'x'.repeat(101), price: '5' }, { requestId: 'r', action: 'add_size', name: 'Flex', width: 'wide' },
      { requestId: 'r', action: 'update_size', materialId: 'nope' }, { requestId: 'r', action: 'update_size', materialId: id, available: 'yes' },
      { requestId: 'r', action: 'update_size', materialId: id, notes: 'x'.repeat(501) }, { requestId: 'r', action: 'rename', name: 'Flex' }];
    for (const input of bad) {
      const { call, result } = run(input);
      await expect(result).rejects.toMatchObject({ status: 400 });
      expect(call).not.toHaveBeenCalled();
    }
    await expect(createMaterialsAdmin(vi.fn()).save({ staffId: 'not-an-id' }, { requestId: 'r', action: 'set_price', name: 'Flex', price: '5' })).rejects.toMatchObject({ status: 403 });
  });

  it('passes our own plain database messages on, and hides anything else', async () => {
    const refuse = (code: string, message: string) => run({ requestId: 'r', action: 'add_size', name: 'Flex', width: '6' },
      vi.fn().mockRejectedValue(Object.assign(new Error(message), { code }))).result;
    await expect(refuse('22023', 'That size already exists')).rejects.toMatchObject({ status: 409, message: 'That size already exists' });
    await expect(refuse('23514', 'Choose one price for this material first')).rejects.toMatchObject({ status: 409, message: 'Choose one price for this material first' });
    await expect(refuse('42501', 'x')).rejects.toMatchObject({ status: 403 });
    await expect(refuse('XX000', 'raw sql detail')).rejects.toThrow('raw sql detail');
  });
});

it('reads the materials through the database function', async () => {
  const call = vi.fn().mockResolvedValue([{ name: 'Flex' }]);
  expect(await createMaterialsAdmin(call).read()).toEqual([{ name: 'Flex' }]);
  expect(call).toHaveBeenCalledWith('api_materials_admin', 'current', {});
});

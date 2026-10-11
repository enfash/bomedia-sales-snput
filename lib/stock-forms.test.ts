import { describe, expect, it } from 'vitest';
import { countDraft, countPreview, ft, inStock, restockDraft, restockPreview, rollName, wasteDraft, wastePreview, type StockMaterial, type StockRoll } from './stock-forms';

const material: StockMaterial = { id: 'm1', name: 'Flex', width_ft: '10', remaining_length_ft: '152', roll_count: 1 };
const roll = (extra: Partial<StockRoll> = {}): StockRoll => ({ id: 'r1', material_id: 'm1', legacy_roll_id: 'Flex 10ft - Roll 002', item_name: 'Flex', width_ft: '10',
  total_length_ft: '154', remaining_length_ft: '152', purchase_cost_kobo: '6000000', status: 'Active', ...extra });
const label = (method: string) => ({ cash: 'Cash', transfer: 'Transfer', pos: 'POS' }[method] ?? method);
const restock = (extra = {}) => ({ material, rollCount: '1', length: { unit: 'm' as const, choice: '50', other: '' }, cost: '60000', method: 'cash' as const,
  businessDate: '2026-10-11', supplier: '', reference: '', methodLabel: label, ...extra });

describe('restock', () => {
  it('records a 50 M roll as 164 ft and sends exact kobo', () => {
    const draft = restockDraft(restock({ supplier: ' Wuse Prints ' }));
    expect(draft).toEqual({ ok: true, operation: 'restocks',
      payload: { materialId: 'm1', rollCount: '1', rawLengthFt: '164', totalCostKobo: '6000000', paymentMethod: 'cash', businessDate: '2026-10-11', supplier: 'Wuse Prints' },
      summary: 'Restock 1 x Flex 10ft, ₦60,000.00 by Cash on 2026-10-11' });
  });

  it('records a typed other length converted to feet', () => {
    const draft = restockDraft(restock({ length: { unit: 'm', choice: 'other', other: '30' }, rollCount: '2', reference: 'INV-9' }));
    expect(draft).toMatchObject({ ok: true, payload: { rawLengthFt: '98.43', rollCount: '2', reference: 'INV-9' } });
  });

  it('refuses a missing material, count, length, amount or method, and a roll no longer than the reserve', () => {
    const wrong = [{ material: undefined }, { rollCount: '0' }, { rollCount: '100' }, { cost: '' }, { cost: '0' }, { length: { unit: 'ft' as const, choice: 'other', other: '10' } },
      { length: { unit: 'ft' as const, choice: 'other', other: '' } }, { cost: '0.01', rollCount: '5' }];
    for (const extra of wrong) expect(restockDraft(restock(extra))).toEqual({ ok: false, error: 'Choose the material and enter the rolls, length per roll and total paid.' });
    expect(restockDraft(restock({ method: '' }))).toEqual({ ok: false, error: 'Choose Cash, Transfer or POS.' });
  });

  it('previews the roll, the usable feet and the cost per square foot', () => {
    expect(restockPreview(restock())).toEqual({ title: '1 roll of Flex 10 ft · 154 ft usable', detail: '₦60,000.00 by Cash · about ₦60,000.00 per roll', costPerSqft: 'costs about ₦38.96 per sq ft' });
    expect(restockPreview(restock({ rollCount: '2', cost: '130000', method: '' }))?.title).toBe('2 rolls of Flex 10 ft · 308 ft usable');
    expect(restockPreview(restock({ cost: '' }))).toBeNull();
    expect(restockPreview(restock({ material: undefined }))).toBeNull();
  });
});

describe('waste', () => {
  const input = (extra = {}) => ({ roll: roll(), length: '3', reason: 'Customer proof', businessDate: '2026-10-11', responsible: '', note: '', ...extra });
  it('builds the entry and a plain preview', () => {
    expect(wasteDraft(input({ responsible: ' Ada ', note: 'Job 4' }))).toEqual({ ok: true, operation: 'waste',
      payload: { rollId: 'r1', lengthFt: '3', reason: 'Customer proof', businessDate: '2026-10-11', responsible: 'Ada', note: 'Job 4' },
      summary: 'Waste 3 ft from Flex 10ft - Roll 002 on 2026-10-11: Customer proof' });
    expect(wastePreview(input())).toEqual({ title: '3 ft of Flex 10ft - Roll 002 wasted', detail: 'About ₦1,168.83 of material, counted as waste' });
  });
  it('refuses more than the roll has left, a missing reason, an empty roll or no roll', () => {
    const error = { ok: false, error: 'Choose a roll, a waste length no more than it has left, and a reason.' };
    for (const extra of [{ length: '153' }, { length: '0' }, { length: 'x' }, { reason: '' }, { roll: undefined }, { roll: roll({ remaining_length_ft: '0', status: 'Out of Stock' }) }]) expect(wasteDraft(input(extra))).toEqual(error);
    expect(wastePreview(input({ length: '153' }))).toBeNull();
  });
});

describe('count', () => {
  const input = (extra = {}) => ({ roll: roll(), counted: '150', reason: 'Measured after trimming the edge', businessDate: '2026-10-11', ...extra });
  it('builds the correction and shows what changes', () => {
    expect(countDraft(input())).toEqual({ ok: true, operation: 'stock-counts',
      payload: { rollId: 'r1', countedLengthFt: '150', reason: 'Measured after trimming the edge', businessDate: '2026-10-11' },
      summary: 'Count Flex 10ft - Roll 002: 152 ft to 150 ft on 2026-10-11' });
    expect(countPreview(input())).toEqual({ kind: 'change', difference: -2, value: -77922 });
    expect(countPreview(input({ counted: '154' }))).toEqual({ kind: 'change', difference: 2, value: 77922 });
  });
  it('warns when the measured length is longer than the roll, and refuses no change, a short reason or no roll', () => {
    expect(countPreview(input({ counted: '200' }))).toEqual({ kind: 'too-long', limit: '154' });
    expect(countPreview(input({ counted: '152' }))).toBeNull();
    const error = { ok: false, error: 'Choose the roll, enter a measured length that differs, and explain why.' };
    for (const extra of [{ counted: '152' }, { counted: '200' }, { reason: 'ok' }, { reason: '  ' }, { roll: undefined }, { counted: 'x' }]) expect(countDraft(input(extra))).toEqual(error);
  });
});

it('names rolls and stock the way the screens always have', () => {
  expect(rollName(roll())).toBe('Flex 10ft - Roll 002');
  expect(rollName(roll({ legacy_roll_id: null }))).toBe('Flex 10ft');
  expect(ft('286.33333')).toBe('286.33 ft');
  expect(inStock(roll())).toBe(true);
  expect(inStock(roll({ status: 'Low Stock' }))).toBe(true);
  expect(inStock(roll({ status: 'Out of Stock', remaining_length_ft: '0' }))).toBe(false);
  expect(inStock(roll({ remaining_length_ft: '0' }))).toBe(false);
});

it('shows no value, but still the feet, when the roll cost is not known, as for a cashier or an older roll', () => {
  const noCost = { ...roll(), purchase_cost_kobo: undefined as unknown as null };
  expect(wastePreview({ roll: noCost, length: '3' })).toBeNull();
  expect(wasteDraft({ roll: noCost, length: '3', reason: 'Customer proof', businessDate: '2026-10-11', responsible: '', note: '' })).toMatchObject({ ok: true });
  expect(countPreview({ roll: noCost, counted: '150' })).toEqual({ kind: 'change', difference: -2, value: null });
  expect(countPreview({ roll: noCost, counted: '200' })).toEqual({ kind: 'too-long', limit: '154' });
  expect(countDraft({ roll: noCost, counted: '150', reason: 'Measured again', businessDate: '2026-10-11' })).toMatchObject({ ok: true });
});

import { expect, it } from 'vitest';
import { OWNER_ONLY_MATERIAL_FEED, OWNER_ONLY_ROLL_FEED, OWNER_ONLY_STOCK_RECORD, withoutFields } from './owner-only-fields';

it('removes only the named fields and leaves the original rows untouched', () => {
  const rows = [{ a: 1, b: 2, c: 3 }, { a: 4, b: 5 }];
  expect(withoutFields(rows, ['b'])).toEqual([{ a: 1, c: 3 }, { a: 4 }]);
  expect(rows[0]).toEqual({ a: 1, b: 2, c: 3 });
  expect(withoutFields(rows, [])).toEqual(rows);
  expect(withoutFields([], ['b'])).toEqual([]);
});

it('lists the owner cost and earnings fields and never the selling price or stock levels', () => {
  const all = [...OWNER_ONLY_MATERIAL_FEED, ...OWNER_ONLY_ROLL_FEED, ...OWNER_ONLY_STOCK_RECORD] as string[];
  for (const needed of ['Total Spent', 'Total Realised Revenue', 'Cost', 'purchase_cost_kobo']) expect(all).toContain(needed);
  for (const kept of ['Selling Price', 'Price', 'Total Remaining (ft)', 'Remaining Length (ft)', 'remaining_length_ft', 'selling_price_per_sqft_kobo']) expect(all).not.toContain(kept);
});

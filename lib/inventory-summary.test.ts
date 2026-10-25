import { expect, it } from 'vitest';
import { feetText, matchStockMaterial, matchStockRoll, nairaExact, nairaWhole, rollRemainingPercent, rollsOfMaterial, searchMaterials, summarizeInventory, type FeedRow } from './inventory-summary';

const materials: FeedRow[] = [
  { 'Material ID': 'FLEX-10FT', 'Material Name': 'Flex', 'Width (ft)': '10', Status: 'Active', 'Total Spent': '120000', 'Total Remaining Asset Value': '59220.78', 'Total Realised Revenue': '1511300', 'Total Remaining Revenue': '375000' },
  { 'Material ID': 'SAV-4FT', 'Material Name': 'SAV', 'Width (ft)': '4', Status: 'Low Stock', 'Total Spent': '105000', 'Total Remaining Asset Value': '98668.83', 'Total Realised Revenue': '14083.3', 'Total Remaining Revenue': '343600' },
  { 'Material ID': 'FLEX-6FT', 'Material Name': 'Flex', 'Width (ft)': '6', Status: 'Out of Stock', 'Total Spent': '0', 'Total Remaining Asset Value': '0', 'Total Realised Revenue': '0', 'Total Remaining Revenue': '0' },
  { 'Material ID': 'OLD-4FT', 'Material Name': 'Old', 'Width (ft)': '4', Status: 'Depleted' },
];

it('counts health and totals the money, treating depleted as out of stock', () => {
  const s = summarizeInventory(materials);
  expect(s).toMatchObject({ active: 1, low: 1, out: 2, spent: 225000, earned: 1525383.3, stillToEarn: 718600 });
  expect(s.remainingCost).toBeCloseTo(157889.61, 2);
  expect(s.total).toBeCloseTo(2243983.3, 1);
  expect(summarizeInventory([])).toEqual({ active: 0, low: 0, out: 0, spent: 0, remainingCost: 0, earned: 0, stillToEarn: 0, total: 0 });
});

it('writes money and feet the way the page shows them', () => {
  expect(nairaWhole(157889.61)).toBe('₦157,890');
  expect(nairaWhole(0)).toBe('₦0');
  expect(nairaExact(45000)).toBe('₦45,000');
  expect(nairaExact(97.4)).toBe('₦97.4');
  expect(feetText('286.33333')).toBe('286.3 ft');
  expect(feetText(152)).toBe('152 ft');
});

it('finds a size by name or code, ignoring case', () => {
  expect(searchMaterials(materials, ' flex ').map((m) => m['Material ID'])).toEqual(['FLEX-10FT', 'FLEX-6FT']);
  expect(searchMaterials(materials, 'sav-4').map((m) => m['Material ID'])).toEqual(['SAV-4FT']);
  expect(searchMaterials(materials, '')).toBe(materials);
  expect(searchMaterials(materials, 'zzz')).toEqual([]);
});

it('lists a size rolls newest first and measures what is left', () => {
  const rolls: FeedRow[] = [
    { 'Roll ID': 'Flex 10ft - Roll 001', 'Material ID': 'FLEX-10FT', 'Date Added': '2026-10-01', 'Total Length (ft)': '154', 'Remaining Length (ft)': '0' },
    { 'Roll ID': 'Flex 10ft - Roll 002', 'Material ID': 'FLEX-10FT', 'Date Added': '2026-10-07', 'Total Length (ft)': '154', 'Remaining Length (ft)': '152' },
    { 'Roll ID': 'SAV 4ft - Roll 001', 'Material ID': 'SAV-4FT', 'Date Added': '2026-10-01' }];
  expect(rollsOfMaterial(rolls, 'FLEX-10FT').map((r) => r['Roll ID'])).toEqual(['Flex 10ft - Roll 002', 'Flex 10ft - Roll 001']);
  expect(rollRemainingPercent(rolls[1])).toBe(99);
  expect(rollRemainingPercent(rolls[0])).toBe(0);
  expect(rollRemainingPercent(rolls[2])).toBe(0);
  expect(rollRemainingPercent({ 'Total Length (ft)': '100', 'Remaining Length (ft)': '150' })).toBe(100);
});

it('matches feed rows to the stock list by name and width, and by stored roll ID', () => {
  const stock = [{ id: 'a', name: 'FLEX', width_ft: '10.0' }, { id: 'b', name: 'Flex', width_ft: '6' }];
  expect(matchStockMaterial(stock, materials[0])?.id).toBe('a');
  expect(matchStockMaterial(stock, materials[2])?.id).toBe('b');
  expect(matchStockMaterial(stock, materials[1])).toBeUndefined();
  const rolls = [{ id: 'r1', legacy_roll_id: 'Flex 10ft - Roll 002' }, { id: 'r2', legacy_roll_id: null }];
  expect(matchStockRoll(rolls, { 'Roll ID': 'Flex 10ft - Roll 002' })?.id).toBe('r1');
  expect(matchStockRoll(rolls, { 'Roll ID': 'Nope' })).toBeUndefined();
  expect(matchStockRoll(rolls, {})).toBeUndefined();
});

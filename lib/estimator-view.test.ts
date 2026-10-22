import { describe, expect, it } from 'vitest';

import { SIZE_SHORTCUTS, fmtMoney, marginTone, parseNum, groupRolls, rollAreaSqft, shortcutLabel, shortcutSize, toFt } from './estimator-view';

describe('estimator helpers', () => {
  it('turns a shortcut into field values in feet or inches', () => {
    expect(shortcutSize(SIZE_SHORTCUTS[1], 'ft')).toEqual({ width: '4', height: '3' });
    expect(shortcutSize(SIZE_SHORTCUTS[1], 'in')).toEqual({ width: '48', height: '36' });
    expect(shortcutLabel(SIZE_SHORTCUTS[0])).toBe('3×2 ft');
  });
  it('reads numbers and sizes leniently', () => {
    expect(parseNum('₦1,250.5')).toBe(1250.5);
    expect(parseNum(undefined)).toBe(0);
    expect(toFt('48', 'in')).toBe(4);
    expect(toFt('', 'ft')).toBe(0);
    expect(fmtMoney(2500)).toBe('₦2,500');
  });
  it('says how healthy a margin is', () => {
    expect(marginTone(45)).toBe('success');
    expect(marginTone(25)).toBe('warning');
    expect(marginTone(5)).toBe('error');
  });
  it('works out the square feet left on a roll', () => {
    expect(rollAreaSqft({ 'Remaining Length (ft)': '150', 'Width (ft)': '10' })).toBe(1500);
    expect(rollAreaSqft({ Stock: '320', 'Remaining Length (ft)': '150', 'Width (ft)': '10' })).toBe(320);
    expect(rollAreaSqft({})).toBe(0);
  });
  it('groups rolls by material and width and adds their area', () => {
    const groups = groupRolls([
      { 'Item Name': 'SAV', 'Width (ft)': '4', 'Remaining Length (ft)': '30' }, { 'Item Name': 'SAV', 'Width (ft)': '4', 'Remaining Length (ft)': '10' },
      { 'Item Name': 'Flex', 'Width (ft)': '10', 'Remaining Length (ft)': '5' }, { 'Item Name': 'Flex', 'Width (ft)': '6', 'Remaining Length (ft)': '5' },
    ]);
    expect(groups.map((g) => [g.label, g.areaSqft])).toEqual([['Flex 6ft', 30], ['Flex 10ft', 50], ['SAV 4ft', 160]]);
    expect(groupRolls([{ 'Item Name': 'SAV', 'Width (ft)': '4', 'Remaining Length (ft)': '10', 'Total Length (ft)': '50' }])[0]).toMatchObject({ areaSqft: 40, capacitySqft: 200 });
  });
});

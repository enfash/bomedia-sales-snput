import { describe, expect, it } from 'vitest';

import { SIZE_SHORTCUTS, fmtMoney, marginTone, parseNum, shortcutLabel, shortcutSize, toFt } from './estimator-view';

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
});

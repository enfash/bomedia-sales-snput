import { describe, expect, it } from 'vitest';

import { stockMeter } from './stock-meter';

describe('stockMeter', () => {
  it('fills by the share left and stays green when healthy', () => {
    expect(stockMeter(60, 100)).toEqual({ percent: 60, tone: 'success' });
  });
  it('turns amber at a fifth left and red when empty', () => {
    expect(stockMeter(20, 100)).toEqual({ percent: 20, tone: 'warning' });
    expect(stockMeter(0, 100)).toEqual({ percent: 0, tone: 'error' });
  });
  it('lets a given status win over the share', () => {
    expect(stockMeter(80, 100, 'Low Stock').tone).toBe('warning');
    expect(stockMeter(80, 100, 'Out of Stock').tone).toBe('error');
  });
  it('copes with no total, an overfull roll and bad numbers', () => {
    expect(stockMeter(50, 0)).toEqual({ percent: 0, tone: 'success' });
    expect(stockMeter(150, 100).percent).toBe(100);
    expect(stockMeter(Number.NaN, 100)).toEqual({ percent: 0, tone: 'error' });
  });
});

import { describe, expect, it } from 'vitest';
import { collectionLook } from './collection-status';

describe('collectionLook', () => {
  it('is neutral until something has been sold', () => {
    expect(collectionLook(0, 0, 0)).toEqual({ tone: 'none', lead: '', barPercent: 0 });
  });
  it('is red below 40%, with a visible stub at 0%', () => {
    expect(collectionLook(0, 43000, 43000)).toEqual({ tone: 'red', lead: 'Collect now:', barPercent: 3 });
    expect(collectionLook(39, 100, 61).tone).toBe('red');
  });
  it('is amber from 40% and yellow-green from 70%', () => {
    expect(collectionLook(40, 100, 60).tone).toBe('amber');
    expect(collectionLook(69, 100, 31).tone).toBe('amber');
    expect(collectionLook(70, 100, 30)).toEqual({ tone: 'lime', lead: 'Most collected,', barPercent: 70 });
    expect(collectionLook(99, 100, 1).tone).toBe('lime');
  });
  it('is green only when nothing is left to collect', () => {
    expect(collectionLook(100, 100, 0)).toEqual({ tone: 'green', lead: '', barPercent: 100 });
    expect(collectionLook(100, 100, 0.4).tone).toBe('green');
    expect(collectionLook(99.6, 100, 0).tone).toBe('green');
  });
});

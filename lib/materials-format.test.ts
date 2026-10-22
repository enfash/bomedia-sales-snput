import { expect, it } from 'vitest';
import { koboToInput, nairaLabel, nairaToKobo } from './materials-format';

it('turns typed naira into exact kobo', () => {
  expect(nairaToKobo('250')).toBe('25000');
  expect(nairaToKobo(' ₦1,250.5 ')).toBe('125050');
  expect(nairaToKobo('0.07')).toBe('7');
  expect(nairaToKobo(300)).toBe('30000');
  expect(nairaToKobo('19.99')).toBe('1999');
});

it('refuses anything that is not a positive amount with at most two decimals', () => {
  for (const bad of ['', '0', '0.00', '-5', '12.345', 'abc', '1e3', '12,34,5x', null, undefined, {}, '99999999']) expect(nairaToKobo(bad)).toBeNull();
});

it('writes kobo as naira without a pointless .00', () => {
  expect(nairaLabel('25000')).toBe('₦250');
  expect(nairaLabel('125050')).toBe('₦1,250.50');
  expect(nairaLabel(7)).toBe('₦0.07');
});

it('fills a price box from kobo and round-trips', () => {
  expect(koboToInput('25000')).toBe('250');
  expect(koboToInput('125050')).toBe('1250.50');
  expect(koboToInput('7')).toBe('0.07');
  for (const kobo of ['25000', '125050', '7', '1999']) expect(nairaToKobo(koboToInput(kobo))).toBe(kobo);
});

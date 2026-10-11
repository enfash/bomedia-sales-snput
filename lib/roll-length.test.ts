import { expect, it } from 'vitest';
import { choiceForUnit, DEFAULT_ROLL_LENGTH, OTHER_LENGTH, recordedAs, ROLL_LENGTH_PRESETS, rollRawFeet, SETUP_RESERVE_FT, usableFeet } from './roll-length';

it('offers exactly the standard lengths for each unit, and they record the same rolls', () => {
  expect(ROLL_LENGTH_PRESETS.m.map((p) => p.label)).toEqual(['50 M', '100 M']);
  expect(ROLL_LENGTH_PRESETS.ft.map((p) => p.label)).toEqual(['164 ft', '328 ft']);
  expect(ROLL_LENGTH_PRESETS.m.map((p) => p.feet)).toEqual(ROLL_LENGTH_PRESETS.ft.map((p) => p.feet));
});

it('turns a chosen standard length into exact feet', () => {
  expect(rollRawFeet({ unit: 'm', choice: '50', other: '' })).toBe('164');
  expect(rollRawFeet({ unit: 'm', choice: '100', other: '' })).toBe('328');
  expect(rollRawFeet({ unit: 'ft', choice: '164', other: '' })).toBe('164');
  expect(rollRawFeet({ unit: 'ft', choice: '328', other: '' })).toBe('328');
  expect(rollRawFeet(DEFAULT_ROLL_LENGTH)).toBe('164');
});

it('converts a typed other length, in meters or feet, and refuses nonsense', () => {
  expect(rollRawFeet({ unit: 'ft', choice: OTHER_LENGTH, other: '200' })).toBe('200');
  expect(rollRawFeet({ unit: 'ft', choice: OTHER_LENGTH, other: ' 150.5 ' })).toBe('150.5');
  expect(rollRawFeet({ unit: 'm', choice: OTHER_LENGTH, other: '30' })).toBe('98.43');
  expect(rollRawFeet({ unit: 'm', choice: OTHER_LENGTH, other: '2.5' })).toBe('8.2');
  for (const bad of ['', '0', '-5', 'abc', '1e3', '12,5', '1234567']) expect(rollRawFeet({ unit: 'ft', choice: OTHER_LENGTH, other: bad })).toBeNull();
  expect(rollRawFeet({ unit: 'ft', choice: '999', other: '' })).toBeNull();
  expect(rollRawFeet({ unit: 'm', choice: '164', other: '' })).toBeNull();
});

it('keeps the setup reserve back from every roll', () => {
  expect(SETUP_RESERVE_FT).toBe(10);
  expect(usableFeet('164')).toBe(154);
  expect(usableFeet('328')).toBe(318);
  expect(usableFeet('98.43')).toBe(88.43);
  expect(usableFeet('10')).toBe(0);
  expect(usableFeet('5')).toBe(0);
  expect(usableFeet(null)).toBe(0);
});

it('keeps a valid choice when the unit changes and falls back to the first preset otherwise', () => {
  expect(choiceForUnit('ft', '50')).toBe('164');
  expect(choiceForUnit('m', '328')).toBe('50');
  expect(choiceForUnit('m', '100')).toBe('100');
  expect(choiceForUnit('ft', OTHER_LENGTH)).toBe(OTHER_LENGTH);
});

it('says in plain words what will be recorded', () => {
  expect(recordedAs({ unit: 'm', choice: '50', other: '' })).toBe('50 M is recorded as 164 ft.');
  expect(recordedAs({ unit: 'ft', choice: '328', other: '' })).toBe('328 ft is recorded as it is.');
  expect(recordedAs({ unit: 'm', choice: OTHER_LENGTH, other: '30' })).toBe('30 M is recorded as about 98.43 ft.');
  expect(recordedAs({ unit: 'ft', choice: OTHER_LENGTH, other: '200' })).toBe('200 ft is recorded as it is.');
  expect(recordedAs({ unit: 'ft', choice: OTHER_LENGTH, other: '' })).toBe('');
});

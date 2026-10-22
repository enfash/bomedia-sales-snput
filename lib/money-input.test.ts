import { describe, expect, it } from 'vitest';
import { caretFor, cleanMoney, formatMoney, settleMoney, significantBefore } from './money-input';

describe('cleanMoney', () => {
  it('keeps what the screens store plain', () => {
    expect(cleanMoney('1,500,000')).toBe('1500000');
    expect(cleanMoney('₦ 1,200.5')).toBe('1200.5');
    expect(cleanMoney('')).toBe('');
    expect(cleanMoney('abc')).toBe('');
  });
  it('allows one dot and two decimals', () => {
    expect(cleanMoney('12.345')).toBe('12.34');
    expect(cleanMoney('1.2.3')).toBe('1.23');
    expect(cleanMoney('.5')).toBe('0.5');
    expect(cleanMoney('5.')).toBe('5.');
  });
  it('drops leading zeros but keeps a single zero', () => {
    expect(cleanMoney('007')).toBe('7');
    expect(cleanMoney('0')).toBe('0');
    expect(cleanMoney('000')).toBe('0');
    expect(cleanMoney('0.50')).toBe('0.50');
  });
});

describe('formatMoney', () => {
  it('groups thousands', () => {
    expect(formatMoney('1')).toBe('1');
    expect(formatMoney('1000')).toBe('1,000');
    expect(formatMoney('1500000.5')).toBe('1,500,000.5');
    expect(formatMoney('1234567890')).toBe('1,234,567,890');
  });
  it('keeps a trailing dot so a decimal can be typed, and handles blanks', () => {
    expect(formatMoney('12000.')).toBe('12,000.');
    expect(formatMoney('')).toBe('');
    expect(formatMoney('1,200')).toBe('1,200');
  });
});

describe('cursor', () => {
  it('stays after the same digit when a comma appears', () => {
    const typed = '1000'; // the user just typed the last 0 with the cursor at the end
    const formatted = formatMoney(typed);
    expect(formatted).toBe('1,000');
    expect(caretFor(formatted, significantBefore(typed, 4))).toBe(5);
  });
  it('stays in place when typing in the middle', () => {
    // "1,500" with a 2 typed after the first digit: "12,500" before cleaning, cursor after the 2.
    const typed = '12,500';
    const formatted = formatMoney(typed);
    expect(formatted).toBe('12,500');
    expect(caretFor(formatted, significantBefore(typed, 2))).toBe(2);
  });
  it('skips over a comma that the formatting moved', () => {
    const typed = '1,2000'; // typed a 2 after "1,": digits before cursor = 2
    const formatted = formatMoney(typed);
    expect(formatted).toBe('12,000');
    expect(caretFor(formatted, significantBefore(typed, 3))).toBe(2);
  });
  it('handles the start and the end', () => {
    expect(caretFor('1,000', 0)).toBe(0);
    expect(caretFor('1,000', 99)).toBe(5);
  });
});

describe('settleMoney', () => {
  it('drops only a trailing dot', () => {
    expect(settleMoney('1500.')).toBe('1500');
    expect(settleMoney('1500.5')).toBe('1500.5');
    expect(settleMoney('1500')).toBe('1500');
    expect(settleMoney('')).toBe('');
  });
});

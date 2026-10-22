import { describe, expect, it } from 'vitest';
import { phoneProblem } from './new-sale';

describe('phoneProblem', () => {
  it('asks for nothing when the sale is paid in full or free', () => {
    expect(phoneProblem('', 0)).toBe('');
    expect(phoneProblem('', -500)).toBe('');
  });
  it('demands a number when a balance is left', () => {
    expect(phoneProblem('', 1000)).toMatch(/phone number/);
    expect(phoneProblem('   ', 1000)).toMatch(/phone number/);
  });
  it('accepts common Nigerian formats and rejects short or junk numbers', () => {
    expect(phoneProblem('0803 111 2222', 1000)).toBe('');
    expect(phoneProblem('+234 803 111 2222', 1000)).toBe('');
    expect(phoneProblem('12345', 1000)).toMatch(/7 to 15/);
    expect(phoneProblem('abc', 1000)).toMatch(/phone number/);
  });
});

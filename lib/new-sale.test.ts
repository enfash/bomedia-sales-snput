import { describe, expect, it } from 'vitest';
import { paymentSummary, phoneProblem } from './new-sale';

it('shows the full-payment split for the reported amount and exact one-kobo boundaries', () => {
  expect(paymentSummary('3024000','302323000','transfer')).toEqual({ problem:'', helper:'₦3,023,230.00 settles this sale · ₦770.00 extra income (non-refundable).' });
  expect(paymentSummary('1.01','100','cash').helper).toContain('₦0.01 extra income');
  expect(paymentSummary('1','100','cash')).toEqual({ problem:'', helper:'Balance left ₦0.00' });
  expect(paymentSummary('0.99','100','cash').helper).toBe('Balance left ₦0.01');
  expect(paymentSummary('1.001','100','cash').problem).toMatch(/nearest kobo/);
  expect(paymentSummary('1','100','').problem).toMatch(/Choose/);
});

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

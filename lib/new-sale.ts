// Small rules for the New Sale form. Pure, no styling or data access.
import { nairaToKobo } from './accounting-entry';
import { formatKobo } from './accounting-money';

/** Excess money is non-refundable income under the owner's receipt policy. */
export function paymentSummary(value: string, totalKobo: string, method: string) {
  const paid = nairaToKobo(value || '0');
  if (paid === null || paid.length > 16) return { problem: 'Enter a valid payment to the nearest kobo.', helper: '' };
  const difference = BigInt(paid) - BigInt(totalKobo);
  const problem = paid !== '0' && !method ? 'Choose how the customer paid: Cash, Transfer or POS.' : '';
  return { problem, helper: difference > BigInt(0)
    ? `${formatKobo(totalKobo)} settles this sale · ${formatKobo(difference.toString())} extra income (non-refundable).`
    : `Balance left ${formatKobo((-difference).toString())}` };
}

/** A customer who has not paid in full must leave a phone number so they can be reached about the balance. */
export function phoneProblem(contact: string, balanceKobo: number): string {
  if (balanceKobo <= 0) return '';
  const digits = contact.replace(/\D/g, '');
  if (!digits) return 'Enter the customer’s phone number. They still owe a balance.';
  if (digits.length < 7 || digits.length > 15) return 'Enter a phone number with 7 to 15 digits.';
  return '';
}

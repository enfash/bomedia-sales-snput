// Small rules for the New Sale form. Pure, no styling or data access.

/** A customer who has not paid in full must leave a phone number so they can be reached about the balance. */
export function phoneProblem(contact: string, balanceKobo: number): string {
  if (balanceKobo <= 0) return '';
  const digits = contact.replace(/\D/g, '');
  if (!digits) return 'Enter the customer’s phone number. They still owe a balance.';
  if (digits.length < 7 || digits.length > 15) return 'Enter a phone number with 7 to 15 digits.';
  return '';
}

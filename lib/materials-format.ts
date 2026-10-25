// Naira text typed by the owner ("250", "1,250.5", "₦300") to exact kobo, with no floating point involved.
export function nairaToKobo(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).replace(/[₦,\s]/g, '');
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const kobo = BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? '').padEnd(2, '0') || '0');
  return kobo > BigInt(0) ? kobo.toString() : null;
}

/** "₦250" or "₦250.50" from integer kobo text. */
export function nairaLabel(kobo: string | number): string {
  const value = BigInt(kobo);
  const whole = (value / BigInt(100)).toLocaleString('en-NG');
  const cents = value % BigInt(100);
  return `₦${whole}${cents === BigInt(0) ? '' : `.${cents.toString().padStart(2, '0')}`}`;
}

/** Integer kobo text as the number to put in a price box: "250" or "250.50". */
export function koboToInput(kobo: string): string {
  const value = BigInt(kobo);
  const cents = value % BigInt(100);
  return `${value / BigInt(100)}${cents === BigInt(0) ? '' : `.${cents.toString().padStart(2, '0')}`}`;
}

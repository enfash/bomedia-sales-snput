// Typing money with thousands commas. Pure: the screens keep a plain value like "1500000.5" and only the box shows "1,500,000.5".

/** What the screens store: digits, at most one ".", at most 2 decimals, no commas, no needless leading zeros. "" stays "". */
export function cleanMoney(typed: string): string {
  const text = typed.replace(/[^0-9.]/g, '');
  if (!text) return '';
  const dot = text.indexOf('.');
  let whole = dot === -1 ? text : text.slice(0, dot);
  const decimals = dot === -1 ? null : text.slice(dot + 1).replace(/\./g, '').slice(0, 2);
  whole = whole.replace(/^0+(?=\d)/, '');
  if (whole === '' && decimals !== null) whole = '0';
  return decimals === null ? whole : `${whole}.${decimals}`;
}

/** What the box shows: the same value with commas in the whole part. */
export function formatMoney(raw: string): string {
  const clean = cleanMoney(raw);
  const dot = clean.indexOf('.');
  const whole = dot === -1 ? clean : clean.slice(0, dot);
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return dot === -1 ? grouped : `${grouped}${clean.slice(dot)}`;
}

const isSignificant = (char: string) => /[0-9.]/.test(char);

/** How many digits and dots sit before the cursor, ignoring commas. */
export function significantBefore(text: string, caret: number): number {
  let count = 0;
  for (let index = 0; index < Math.min(caret, text.length); index += 1) if (isSignificant(text[index])) count += 1;
  return count;
}

/** The cursor position in the formatted text that sits after the same number of digits and dots. */
export function caretFor(formatted: string, significant: number): number {
  if (significant <= 0) return 0;
  let count = 0;
  for (let index = 0; index < formatted.length; index += 1) {
    if (isSignificant(formatted[index])) count += 1;
    if (count === significant) return index + 1;
  }
  return formatted.length;
}

/** When the box loses focus a lone trailing dot ("1500.") is dropped, so the saved amount is always a clean number. */
export function settleMoney(raw: string): string {
  return raw.endsWith('.') ? raw.slice(0, -1) : raw;
}

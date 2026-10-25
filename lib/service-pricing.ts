import { nairaToKobo } from './accounting-entry';

export type ServicePricing = 'fixed' | 'variable' | 'per_job';

/** Whole kobo back to the text the amount box takes ("150000" gives "1500", "150050" gives "1500.50"). */
export function koboToAmountText(kobo: string): string {
  if (!/^[0-9]{1,16}$/.test(kobo)) return '';
  const value = BigInt(kobo), hundred = BigInt(100), whole = value / hundred, cents = Number(value % hundred);
  return cents ? `${whole}.${String(cents).padStart(2, '0')}` : String(whole);
}

/** A typed service amount must be positive and fit the saved-order contract. */
export function serviceAmountKobo(amount: string): string | null {
  const kobo = nairaToKobo(amount);
  return kobo && /^[1-9][0-9]{0,15}$/.test(kobo) ? kobo : null;
}

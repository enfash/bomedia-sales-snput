import { nairaToKobo } from './accounting-entry';

export type ServicePricing = 'fixed' | 'variable' | 'per_job';

/** A typed service amount must be positive and fit the saved-order contract. */
export function serviceAmountKobo(amount: string): string | null {
  const kobo = nairaToKobo(amount);
  return kobo && /^[1-9][0-9]{0,15}$/.test(kobo) ? kobo : null;
}

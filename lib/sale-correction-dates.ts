export type CorrectionDateRules =
  | { available: true; minDate: string; closedThrough: string | null }
  | { available: false; message: string };

export function validCorrectionDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Send only the date limits to the form, never the owner's period controls. */
export function correctionDateRules(period: unknown): CorrectionDateRules {
  const p = period as Record<string, unknown> | null;
  if (!p || p.configured !== true || p.state !== 'active' || !validCorrectionDate(p.starts_on)
    || (p.closed_through !== null && !validCorrectionDate(p.closed_through))) {
    return { available: false, message: 'Active bookkeeping dates are unavailable. Refresh before correcting this sale.' };
  }
  let minDate = p.starts_on;
  if (typeof p.closed_through === 'string' && p.closed_through >= minDate) {
    const next = new Date(`${p.closed_through}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    minDate = next.toISOString().slice(0, 10);
  }
  return { available: true, minDate, closedThrough: p.closed_through as string | null };
}

export function correctionDateProblem(date: unknown, rules: CorrectionDateRules | null, originalDate?: unknown): string {
  if (!rules) return 'Checking the allowed sale dates…';
  if (!rules.available) return rules.message;
  // A correction also reverses the original journal, which cannot be in closed books.
  if (rules.closedThrough && validCorrectionDate(originalDate) && originalDate <= rules.closedThrough) {
    return `This sale belongs to books closed through ${rules.closedThrough} and cannot be corrected here.`;
  }
  if (!validCorrectionDate(date)) return 'Enter a valid sale date.';
  if (date < rules.minDate) return `Choose a sale date on or after ${rules.minDate}. Earlier dates are outside the open books.`;
  return '';
}

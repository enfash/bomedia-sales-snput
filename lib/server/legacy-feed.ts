// Old screens read Google Sheets rows. With the Postgres runtime on, the old
// GET routes serve the same row shapes from Postgres (api_legacy_feed) and the
// old write routes refuse, so nothing is written to Sheets after cutover.
import { NextResponse } from 'next/server';
import { callFinancial, financialApiEnabled, type FinancialCall } from './financial-db';
import { financialIdentity } from './financial-routes';
import { FinancialError } from './financial-service';
import { OWNER_ONLY_MATERIAL_FEED, OWNER_ONLY_ROLL_FEED, withoutFields } from './owner-only-fields';
import { readDashboardReporting } from '../dashboard-reporting';
import type { BookkeepingPeriod } from './bookkeeping-period';

export type LegacyResource = 'sales' | 'payments' | 'expenses' | 'inventory' | 'materials';
export type LegacyRow = Record<string, string>;
const noStore = { 'Cache-Control': 'no-store' };

/** Today's date in Lagos as YYYY-MM-DD (Lagos has no daylight saving). */
export const lagosToday = (now: Date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(now);
/** Staff see only the expenses they logged today; the owner (viewerId null) sees the whole log. The id key never leaves the server. */
export const expensesForViewer = (rows: LegacyRow[], viewerId: string | null, now: Date = new Date()) =>
  viewerId === null ? rows.map(({ _loggedById: _id, ...row }) => row)
    : rows.filter((row) => row.DATE === lagosToday(now) && (row._loggedById ?? '').toLowerCase() === viewerId.toLowerCase())
      .map(({ _loggedById: _id, ...row }) => row);

export function legacyFeedEnabled(): boolean {
  try { return financialApiEnabled(); } catch { return true; } // misconfigured: fail closed, never fall back to Sheets
}

export async function legacyRows(resource: LegacyResource, call: FinancialCall = callFinancial): Promise<LegacyRow[]> {
  if (!financialApiEnabled()) throw new Error('Accounting API is not enabled.');
  const rows = await call<LegacyRow[]>('api_legacy_feed', resource, {});
  return Array.isArray(rows) ? rows : [];
}

/**
 * Selling screens never see a turned-off size; the Inventory pages ask for everything (`includeUnavailable`) and get an
 * `Available` flag so they can badge it. Matching is by the readable Material ID, which is what the feed already shows.
 */
export async function materialsForViewer(rows: LegacyRow[], includeUnavailable: boolean, call: FinancialCall = callFinancial, owner = true): Promise<LegacyRow[]> {
  const [off, sales] = await Promise.all([
    call<{ id: string; code: string }[]>('api_unavailable_materials', 'current', {}),
    // A cashier never receives earnings, so there is nothing to look up for them.
    owner ? call<{ code: string; sold: string }[]>('api_material_sales', 'current', {}) : Promise.resolve([]),
  ]);
  const offCodes = new Set((Array.isArray(off) ? off : []).map((item) => item.code));
  // Realised revenue is what the material's jobs actually sold for, so changing the price never rewrites past earnings.
  const sold = new Map((Array.isArray(sales) ? sales : []).map((item) => [item.code, item.sold]));
  // Only the owner may ask for turned-off sizes; a cashier is shown just what can be sold.
  const shown = rows
    .filter((row) => (owner && includeUnavailable) || !offCodes.has(row['Material ID']))
    .map((row) => ({ ...row, ...(owner ? { 'Total Realised Revenue': sold.get(row['Material ID']) ?? '0' } : {}), Available: offCodes.has(row['Material ID']) ? 'No' : 'Yes' }));
  return owner ? shown : withoutFields(shown, OWNER_ONLY_MATERIAL_FEED);
}

/** GET handler body: null when Sheets is still authoritative. */
/** Cancelled sales and expenses are left out of every normal list; Records asks for them on their own with `cancelled: 'only'`. */
export const salesByCancellation = (rows: LegacyRow[], mode: 'exclude' | 'only') => rows.filter(((row) => (row['JOB STATUS'] === 'Cancelled' || row['STATUS'] === 'Cancelled') === (mode === 'only')));

export async function legacyFeedResponse(resource: LegacyResource, call: FinancialCall = callFinancial, options: { includeUnavailable?: boolean; cancelled?: 'only'; dashboard?: boolean } = {}): Promise<Response | null> {
  if (!legacyFeedEnabled()) return null;
  try {
    const identity = await financialIdentity(false);
    let reporting;
    if (options.dashboard) {
      if (identity) throw new FinancialError('Owner access is required for dashboard reporting.', 403, 'OWNER_REQUIRED');
      const period = await call<BookkeepingPeriod>('api_bookkeeping_period', 'current', {});
      reporting = readDashboardReporting(period.configured && period.state === 'active'
        ? { backend: 'postgres', startsOn: period.starts_on } : null);
      if (!reporting) throw new FinancialError('The active bookkeeping period is unavailable. Try again shortly.', 503, 'REPORTING_UNAVAILABLE');
    }
    const rows = await legacyRows(resource, call);
    const data = resource === 'expenses' ? salesByCancellation(expensesForViewer(rows, identity ? identity.staffId : null), options.cancelled === 'only' ? 'only' : 'exclude')
      : resource === 'materials' ? await materialsForViewer(rows, Boolean(options.includeUnavailable), call, !identity)
      : resource === 'inventory' && identity ? withoutFields(rows, OWNER_ONLY_ROLL_FEED)
      : resource === 'sales' ? salesByCancellation(rows, options.cancelled === 'only' ? 'only' : 'exclude') : rows;
    return NextResponse.json({ data, ...(options.dashboard ? { reporting } : {}) }, { headers: noStore });
  } catch (error) {
    if (error instanceof FinancialError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: noStore });
    return NextResponse.json({ error: 'Records are unavailable right now. Try again shortly.', code: 'ACCOUNTING_UNAVAILABLE' },
      { status: 503, headers: noStore });
  }
}

export const MOVED_MESSAGE = 'This screen no longer saves. Record it in Accounting entry (or Stock for rolls).';

/** Write handler guard: a response when the old Sheets write must not run. */
export function legacyWriteBlocked(): Response | null {
  if (!legacyFeedEnabled()) return null;
  return NextResponse.json({ error: MOVED_MESSAGE, code: 'MOVED_TO_ACCOUNTING' }, { status: 409, headers: noStore });
}

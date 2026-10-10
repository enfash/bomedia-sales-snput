// Old screens read Google Sheets rows. With the Postgres runtime on, the old
// GET routes serve the same row shapes from Postgres (api_legacy_feed) and the
// old write routes refuse, so nothing is written to Sheets after cutover.
import { NextResponse } from 'next/server';
import { callFinancial, financialApiEnabled, type FinancialCall } from './financial-db';
import { financialIdentity } from './financial-routes';
import { FinancialError } from './financial-service';

export type LegacyResource = 'sales' | 'payments' | 'expenses' | 'inventory' | 'materials';
export type LegacyRow = Record<string, string>;
const noStore = { 'Cache-Control': 'no-store' };

export function legacyFeedEnabled(): boolean {
  try { return financialApiEnabled(); } catch { return true; } // misconfigured: fail closed, never fall back to Sheets
}

export async function legacyRows(resource: LegacyResource, call: FinancialCall = callFinancial): Promise<LegacyRow[]> {
  if (!financialApiEnabled()) throw new Error('Accounting API is not enabled.');
  const rows = await call<LegacyRow[]>('api_legacy_feed', resource, {});
  return Array.isArray(rows) ? rows : [];
}

/** GET handler body: null when Sheets is still authoritative. */
export async function legacyFeedResponse(resource: LegacyResource, call: FinancialCall = callFinancial): Promise<Response | null> {
  if (!legacyFeedEnabled()) return null;
  try {
    await financialIdentity(false);
    return NextResponse.json({ data: await legacyRows(resource, call) }, { headers: noStore });
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

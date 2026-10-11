import { NextResponse } from 'next/server';
import { financialApiEnabled } from '@/lib/server/financial-db';
import { financialIdentity } from '@/lib/server/financial-routes';
import { FinancialError } from '@/lib/server/financial-service';

export const dynamic = 'force-dynamic';
export async function GET() {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    if (!financialApiEnabled()) return NextResponse.json({ backend: 'sheets' }, { headers });
    const identity = await financialIdentity(true);
    if (!identity) throw new FinancialError('Please sign in again.', 401, 'SIGN_IN_REQUIRED');
    return NextResponse.json({ backend: 'postgres', staffId: identity.staffId.toLowerCase() }, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof FinancialError ? error.message : 'Payment identity is unavailable. Try again.' },
      { status: error instanceof FinancialError ? error.status : 503, headers });
  }
}

import { NextResponse } from 'next/server';
import { financialHandler, financialIdentity } from './financial-routes';
import { financialApiEnabled } from './financial-db';
import { readSystemStatus, sheetsStatus } from './system-status';
import { verifiedAdminIdentity } from './postgres-auth-routes';

const headers = { 'Cache-Control': 'no-store' };

// Owner only, read only. Unlike other accounting routes it answers when the accounting API is off, because
// "still saving to Google Sheets" is exactly what the owner may need to see.
export async function getSystemStatus() {
  if (!await verifiedAdminIdentity()) {
    return NextResponse.json({ error: 'Owner access is required to see system status.', code: 'OWNER_REQUIRED' }, { status: 403, headers });
  }
  if (!financialApiEnabled()) return NextResponse.json(sheetsStatus(new Date(), process.env.BOMEDIA_SANDBOX === 'true'), { headers });
  return financialHandler(async () => {
    await financialIdentity(false);
    return readSystemStatus();
  });
}

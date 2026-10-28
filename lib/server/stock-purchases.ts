import { NextResponse } from 'next/server';
import { callFinancial, type FinancialCall } from './financial-db';
import { financialHandler } from './financial-routes';
import { FinancialError, validUUID } from './financial-service';
import { verifiedAdminIdentity } from './postgres-auth-routes';

export function readStockPurchases(request: Request, call: FinancialCall = callFinancial) {
  // The legacy Sheets restock already creates an expense. Never add it again.
  if (process.env.AUTH_BACKEND !== 'postgres' && process.env.POSTGRES_FINANCIAL_API_ENABLED !== 'true') {
    return Promise.resolve(NextResponse.json({ data: [], next_after_id: null }, { headers: { 'Cache-Control': 'no-store' } }));
  }
  return financialHandler(async () => {
    if (!await verifiedAdminIdentity()) throw new FinancialError('Owner access is required for stock purchase costs.', 403, 'OWNER_REQUIRED');
    const params = new URL(request.url).searchParams;
    if (Array.from(params.keys()).some(k => !['limit', 'after_id'].includes(k) || params.getAll(k).length !== 1)
      || (params.has('limit') && !/^(?:[1-9][0-9]?|[1-4][0-9]{2}|500)$/.test(params.get('limit')!))
      || (params.has('after_id') && !validUUID(params.get('after_id')))) {
      throw new FinancialError('Invalid stock purchase filters.', 400, 'INVALID_INPUT');
    }
    return call('api_stock_purchases', 'list', {
      ...(params.has('limit') ? { limit: Number(params.get('limit')) } : {}),
      ...(params.has('after_id') ? { after_id: params.get('after_id') } : {}),
    });
  });
}

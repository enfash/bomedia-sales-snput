import { readStockPurchases } from '@/lib/server/stock-purchases';

export const dynamic = 'force-dynamic';
export const GET = (request: Request) => readStockPurchases(request);

import { changeSale, readSaleHistory } from '@/lib/server/sale-corrections-routes';
export const dynamic = 'force-dynamic';
export const GET = readSaleHistory;
export const POST = changeSale;

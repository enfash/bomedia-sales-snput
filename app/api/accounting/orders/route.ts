import { recordScreenOrder, readOrderCatalog } from '@/lib/server/screen-orders';
export const dynamic = 'force-dynamic';
export const POST = (request: Request) => recordScreenOrder(request);
export const GET = () => readOrderCatalog();

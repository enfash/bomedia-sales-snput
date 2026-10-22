import { decidePriceRequest,listPriceRequests } from '@/lib/server/quote-routes';
export const dynamic = 'force-dynamic';
export const GET = listPriceRequests;
export const POST = decidePriceRequest;

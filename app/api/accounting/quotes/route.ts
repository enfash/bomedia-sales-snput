import { lookupQuote,saveQuote } from '@/lib/server/quote-routes';
export const dynamic = 'force-dynamic';
export const GET = lookupQuote;
export const POST = saveQuote;

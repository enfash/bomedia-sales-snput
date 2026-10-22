import { closeBooks, readBookkeepingPeriod } from '@/lib/server/bookkeeping-period-routes';
export const dynamic = 'force-dynamic';
export const GET = readBookkeepingPeriod;
export const POST = closeBooks;

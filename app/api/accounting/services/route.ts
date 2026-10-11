import { listServices,reorderServices,saveService } from '@/lib/server/service-routes';
export const dynamic = 'force-dynamic';
export const GET = listServices;
export const POST = saveService;
export const PUT = reorderServices;

import { createCustomer } from '@/lib/server/sales-routes';
import { readCustomers } from '@/lib/server/customers-routes';
export const dynamic = 'force-dynamic';
export const GET = readCustomers;
export const POST = createCustomer;

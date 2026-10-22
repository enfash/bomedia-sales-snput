import { readCustomerProfile, saveCustomer } from '@/lib/server/customers-routes';
export const dynamic = 'force-dynamic';
export const GET = readCustomerProfile;
export const POST = saveCustomer;

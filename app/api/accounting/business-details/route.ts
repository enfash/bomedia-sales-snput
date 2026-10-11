import { readBusinessDetails,saveBusinessDetails } from '@/lib/server/business-details-routes';

export const GET = readBusinessDetails;
export const POST = saveBusinessDetails;

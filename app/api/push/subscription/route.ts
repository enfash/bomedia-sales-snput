import { phoneAlertState, turnOffPhone, turnOnPhone } from '@/lib/server/push-routes';
export const dynamic = 'force-dynamic';
export const GET = phoneAlertState;
export const POST = turnOnPhone;
export const DELETE = turnOffPhone;

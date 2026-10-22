import { listPaymentMethodSettings,savePaymentMethodSetting } from '@/lib/server/payment-method-settings-routes';
export const dynamic = 'force-dynamic';
export const GET = listPaymentMethodSettings;
export const POST = savePaymentMethodSetting;

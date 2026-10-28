import { callFinancial } from '@/lib/server/financial-db';
import { financialHandler } from '@/lib/server/financial-routes';

export const dynamic = 'force-dynamic';

// The change counter for the sales, expense, inventory and material feeds. Tiny on purpose: it is read every 30 seconds.
export function GET() {
  return financialHandler(() => callFinancial('api_data_revision', '', {}));
}

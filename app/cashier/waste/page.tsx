import { redirect } from 'next/navigation';
import LegacyWastePage from '@/components/legacy-waste-page';
import { financialApiEnabled } from '@/lib/server/financial-db';

export const dynamic = 'force-dynamic';
// Only the owner logs waste now (on the Stock page); a cashier sees the stock list on the Stock check page. The old Google Sheets page stays only until the sheets are retired.
export default function WastePage() {
  if (financialApiEnabled()) redirect('/cashier/inventory');
  return <LegacyWastePage />;
}

import { InventoryPage } from '@/components/inventory/inventory-page';
import { LegacyInventoryPage } from '@/components/inventory/legacy-inventory-page';
import { financialApiEnabled } from '@/lib/server/financial-db';

export const dynamic = 'force-dynamic';
// New books switched on: the redesigned page. Still on Google Sheets: the previous page, whose forms save to Sheets.
export default function OwnerInventoryPage() {
  return financialApiEnabled() ? <InventoryPage /> : <LegacyInventoryPage />;
}

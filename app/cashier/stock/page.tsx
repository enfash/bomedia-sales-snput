import { notFound, redirect } from 'next/navigation';
import { StockEntry } from '@/components/stock-entry';
import { financialApiEnabled } from '@/lib/server/financial-db';
import { financialIdentity } from '@/lib/server/financial-routes';
import { verifiedAdminIdentity } from '@/lib/server/postgres-auth-routes';

export const dynamic='force-dynamic';
export default async function StockPage() {
  if(!financialApiEnabled())notFound();
  const actor=await financialIdentity(true);
  if(!actor)notFound();
  // Only the owner changes stock. A cashier looks at the stock list and levels on the Stock check page.
  if(!await verifiedAdminIdentity())redirect('/cashier/inventory');
  return <StockEntry staffId={actor.staffId} isOwner/>;
}

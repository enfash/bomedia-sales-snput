import { notFound } from 'next/navigation';
import { StockEntry } from '@/components/stock-entry';
import { financialApiEnabled } from '@/lib/server/financial-db';
import { financialIdentity } from '@/lib/server/financial-routes';
import { verifiedAdminIdentity } from '@/lib/server/postgres-auth-routes';

export const dynamic='force-dynamic';
export default async function StockPage() {
  if(!financialApiEnabled())notFound();
  const actor=await financialIdentity(true);
  if(!actor)notFound();
  return <StockEntry staffId={actor.staffId} isOwner={!!await verifiedAdminIdentity()}/>;
}

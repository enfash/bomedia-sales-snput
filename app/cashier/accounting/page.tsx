import { notFound } from 'next/navigation';
import { AccountingEntry } from '@/components/accounting-entry';
import { financialApiEnabled } from '@/lib/server/financial-db';
import { financialIdentity } from '@/lib/server/financial-routes';
import { verifiedAdminIdentity } from '@/lib/server/postgres-auth-routes';

export const dynamic='force-dynamic';
export default async function AccountingPage() {
  if(!financialApiEnabled())notFound();
  const actor=await financialIdentity(true);
  if(!actor)notFound();
  return <AccountingEntry staffId={actor.staffId} isOwner={!!await verifiedAdminIdentity()}/>;
}

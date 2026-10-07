import { notFound } from 'next/navigation';
import { AccountingEntry } from '@/components/accounting-entry';
import { financialApiEnabled } from '@/lib/server/financial-db';
import { financialIdentity } from '@/lib/server/financial-routes';
import { verifiedAdminIdentity } from '@/lib/server/postgres-auth-routes';

export const dynamic='force-dynamic';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Params=Promise<Record<string,string|string[]|undefined>>;
export default async function AccountingPage({searchParams}:{searchParams:Params}) {
  // Old screens' "Record payment" buttons open the Payment tab for one customer.
  const params=await searchParams;
  const customer=typeof params.customer==='string' && uuid.test(params.customer) ? params.customer.toLowerCase() : undefined;
  const payments=params.tab==='payments';
  if(!financialApiEnabled())notFound();
  const actor=await financialIdentity(true);
  if(!actor)notFound();
  return <AccountingEntry staffId={actor.staffId} isOwner={!!await verifiedAdminIdentity()}
    initialOperation={payments ? 'payments' : undefined} initialCustomerId={payments ? customer : undefined}/>;
}

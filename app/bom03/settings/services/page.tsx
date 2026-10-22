import { notFound } from 'next/navigation';
import { ServicesManager } from '@/components/services-manager';
import { financialApiEnabled } from '@/lib/server/financial-db';
import { financialIdentity } from '@/lib/server/financial-routes';

export const dynamic='force-dynamic';
export default async function SettingsServicesPage() {
  if(!financialApiEnabled())return <ServicesManager staffId={null}/>;
  const actor=await financialIdentity(true);
  if(!actor)notFound();
  return <ServicesManager staffId={actor.staffId}/>;
}

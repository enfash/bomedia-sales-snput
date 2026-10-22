import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { verifiedAdminIdentity } from '@/lib/server/postgres-auth-routes';

export const dynamic='force-dynamic';
export default async function SettingsLayout({children}:{children:ReactNode}) {
  if(!await verifiedAdminIdentity())redirect('/bom03/login');
  return children;
}

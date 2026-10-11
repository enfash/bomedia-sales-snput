"use client";

import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@mui/material';
import { ArrowLeft } from 'lucide-react';
import { backLinkStyles as styles } from '@/app/theme';

/** The one back link every page uses: an arrow and the name of where it goes, at the left edge above the page title. */
export function BackLink({ href, label }: { href: string; label: string }) {
  return <Button color="inherit" component={NextLink} href={href} startIcon={<ArrowLeft size={18} />} sx={styles.link}>{label}</Button>;
}

/** The back link for pages reached from the home screen: Dashboard for the owner, Home for the cashier, chosen from the route. */
export function HomeBackLink() {
  const cashier = usePathname().startsWith('/cashier');
  return <BackLink href={cashier ? '/cashier' : '/bom03'} label={cashier ? 'Home' : 'Dashboard'} />;
}

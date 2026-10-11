"use client";

import NextLink from 'next/link';
import { Button } from '@mui/material';
import { ArrowLeft } from 'lucide-react';
import { backLinkStyles as styles } from '@/app/theme';

/** The one back link every page uses: an arrow and the name of where it goes, at the left edge above the page title. */
export function BackLink({ href, label }: { href: string; label: string }) {
  return <Button color="inherit" component={NextLink} href={href} startIcon={<ArrowLeft size={18} />} sx={styles.link}>{label}</Button>;
}

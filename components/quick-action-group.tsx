"use client";

import type { ReactNode } from 'react';
import Link from 'next/link';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { quickActionStyles } from '@/app/theme';

type Action = { label: string; icon: ReactNode } & (
  { href: string; onClick?: never } | { href?: never; onClick: () => void | Promise<void> }
);

/** Links and actions occupy identical grid cells and share one button style. */
export function QuickActionGroup({ actions }: { actions: Action[] }) {
  return <Box sx={quickActionStyles.container}>
    <Box role="group" aria-label="Quick actions" sx={quickActionStyles.grid}>
      {actions.map(action => action.href ?
        <Button key={action.label} component={Link} href={action.href} variant="outlined" startIcon={action.icon} sx={quickActionStyles.button}>{action.label}</Button> :
        <Button key={action.label} onClick={action.onClick} variant="outlined" startIcon={action.icon} sx={quickActionStyles.button}>{action.label}</Button>)}
    </Box>
  </Box>;
}

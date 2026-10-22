"use client";

import { IconButton } from '@mui/material';
import { RefreshCw } from 'lucide-react';
import { recordsStyles as styles } from '@/app/theme';

/** The refresh control that sits beside a page title (Records, Board, Stock check), so the page needs no row of its own for it. */
export function RefreshButton({ label, busy = false, onClick }: { label: string; busy?: boolean; onClick: () => void }) {
  return <IconButton aria-label={busy ? `Updating ${label}` : `Refresh ${label}`} aria-busy={busy} disabled={busy} sx={styles.refreshIcon} onClick={onClick}>
    <RefreshCw size={18} />
  </IconButton>;
}

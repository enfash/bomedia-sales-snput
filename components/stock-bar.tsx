"use client";

import { Box, LinearProgress } from '@mui/material';

import { stockBarStyles as styles } from '@/app/theme';
import { stockMeter } from '@/lib/stock-meter';

/** The same bar everywhere stock shows: how much is left out of what there was, green, amber when low, red when out. */
export function StockBar({ remaining, capacity, status = '', compact = false, label }: { remaining: number; capacity: number; status?: string; compact?: boolean; label?: string }) {
  const { percent, tone } = stockMeter(remaining, capacity, status);
  return <Box sx={compact ? styles.compact : styles.bar}>
    <LinearProgress variant="determinate" value={percent} color={tone} aria-label={label ?? `${percent}% left`} sx={compact ? styles.trackCompact : styles.track} />
  </Box>;
}

"use client";

import NextLink from 'next/link';
import { Box, Button, Typography } from '@mui/material';

import { approvalsWaitingStyles as styles } from '@/app/theme';
import { useApprovalsCount } from '@/lib/approvals-count';

/** "3 waiting for your approval" with a Review button. Shows nothing when nothing is waiting. */
export function ApprovalsWaitingCard({ onNavigate }: { onNavigate?: () => void }) {
  const count = useApprovalsCount();
  if (!count) return null;
  return <Box sx={styles.card}>
    <Box sx={styles.text}>
      <Typography sx={styles.title}>{count} waiting for your approval</Typography>
      <Typography sx={styles.sub}>Held until you decide. Not counted in sales or expenses yet.</Typography>
    </Box>
    <Button variant="contained" component={NextLink} href="/bom03/approvals" onClick={onNavigate}>Review</Button>
  </Box>;
}

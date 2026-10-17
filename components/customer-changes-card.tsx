"use client";

import { Box, Typography } from '@mui/material';
import { UserCog } from 'lucide-react';

import { customerChangeCardStyles as styles } from '@/app/theme';
import { changeSentence, phoneDetail } from '@/lib/customer-changes-view';
import { timeLabel } from '@/lib/customers-view';
import type { RecentCustomerChange } from '@/lib/server/customers';

/** In the owner's bell: customer details staff changed lately, each opening that customer's profile. */
export function CustomerChangesCard({ changes, onOpen }: { changes: RecentCustomerChange[]; onOpen: (change: RecentCustomerChange) => void }) {
  if (!changes.length) return null;
  return <Box sx={styles.card}>
    <Box sx={styles.head}><Box component="span" sx={styles.icon}><UserCog size={16} /></Box><Typography sx={styles.title}>Customer changes by staff</Typography></Box>
    {changes.slice(0, 5).map((change) => <Box key={change.id} component="button" type="button" sx={styles.row} onClick={() => onOpen(change)} aria-label={`Open ${change.name}`}>
      <Typography component="span" sx={styles.text}>{changeSentence(change)}</Typography>
      <Typography component="span" variant="caption" color="text.secondary">{[phoneDetail(change), timeLabel(change.at)].filter(Boolean).join(' · ')}</Typography>
    </Box>)}
  </Box>;
}

"use client";

import { Box, Typography } from '@mui/material';

import { phoneAlertsStyles as styles } from '@/app/theme';
import { BackLink } from '@/components/back-link';
import { PhoneAlertsPanel } from '@/components/phone-alerts-panel';

/** The page around the panel: a back link and a heading. The owner reaches it from Settings, a cashier from the bell. */
export function PhoneAlertsPage({ role }: { role: 'owner' | 'cashier' }) {
  return <Box sx={styles.page}>
    <BackLink href={role === 'owner' ? '/bom03/settings' : '/cashier'} label={role === 'owner' ? 'Settings' : 'Home'} />
    <Box sx={styles.heading}>
      <Typography variant="h3" component="h1">Phone alerts</Typography>
      <Typography color="text.secondary">{role === 'owner' ? 'Get a buzz on your phone when something needs you, even when the app is closed.' : 'Hear straight away when the owner answers something you sent.'}</Typography>
    </Box>
    <PhoneAlertsPanel role={role} />
  </Box>;
}

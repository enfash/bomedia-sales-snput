"use client";

import { useRouter } from 'next/navigation';
import { Box, Typography } from '@mui/material';

import { phoneAlertsStyles as styles } from '@/app/theme';
import { usePhoneAlerts } from '@/components/use-phone-alerts';

/** At the top of the bell: always a way to the Phone alerts page, saying whether this phone has alerts on. */
export function PhoneAlertsPrompt({ role, onNavigate }: { role: 'owner' | 'cashier'; onNavigate: () => void }) {
  const router = useRouter();
  const alerts = usePhoneAlerts('/');
  if (!alerts.ready) return null;
  const configured = !!alerts.state?.configured, on = !!alerts.state?.this_phone;
  const blocked = alerts.permission === 'denied';
  const text = !configured ? (role === 'owner' ? 'Phone alerts are not set up on the server yet.' : 'Phone alerts are not set up yet.')
    : on ? 'Phone alerts are on for this phone.' : blocked ? 'Phone alerts are blocked for this phone.' : 'Turn on alerts for this phone. You will be asked once.';
  const action = !configured ? 'Details' : on ? 'Manage' : 'Turn on';
  return <Box component="button" type="button" sx={on || !configured ? styles.promptQuiet : styles.prompt} onClick={() => { onNavigate(); router.push(role === 'owner' ? '/bom03/settings/phone-alerts' : '/cashier/alerts'); }}>
    <Typography component="span" sx={styles.promptText}>{text}</Typography>
    <Typography component="span" sx={styles.promptAction}>{action}</Typography>
  </Box>;
}

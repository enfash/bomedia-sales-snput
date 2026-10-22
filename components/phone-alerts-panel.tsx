"use client";

import { Alert, Box, Button, Paper, Switch, Typography } from '@mui/material';

import { phoneAlertsStyles as styles } from '@/app/theme';
import { usePhoneAlerts } from '@/components/use-phone-alerts';
import { CASHIER_ALERTS, OWNER_ALERTS } from '@/lib/phone-alerts-view';
import { LoadingState } from '@/components/loading-state';

const dateText = (value: string | null) => (value ? new Date(value).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }) : '');

/** Turn this phone's alerts on or off, choose what to hear about, and see or remove your phones. One panel for the owner and the cashier. */
export function PhoneAlertsPanel({ role }: { role: 'owner' | 'cashier' }) {
  const alerts = usePhoneAlerts(role === 'owner' ? '/bom03/approvals' : '/cashier');
  const { state } = alerts;
  const choices = role === 'owner' ? OWNER_ALERTS : CASHIER_ALERTS;
  const on = !!state?.this_phone;

  if (!alerts.ready) return <LoadingState pieces={[{ k: 'cards', n: 2 }]} label="Loading phone alerts" />;
  return <>
    {alerts.error && <Alert severity="error">{alerts.error}</Alert>}
    {state && !state.configured && <Alert severity="info">Phone alerts are not set up on this server yet. {role === 'owner' ? 'Add the alert keys to the server (npm run push:keys prints them) and reload.' : 'Ask the owner to set them up.'}</Alert>}

    {alerts.homeScreen ? <Paper variant="outlined" sx={styles.helpCard}>
      <Typography variant="h6" component="h2">First, add BOMedia to your Home Screen</Typography>
      <Typography color="text.secondary">An iPhone only allows alerts for apps on the Home Screen. It takes a minute and you do it once.</Typography>
      <Box component="ol" sx={styles.steps}>
        {['Open this page in Safari (not inside another app).', 'Tap the Share button at the bottom of Safari.', 'Choose Add to Home Screen, then Add.', 'Open BOMedia from the new icon and come back to this page.'].map((text, index) => (
          <Box component="li" key={text} sx={styles.step}><Box component="span" sx={styles.stepNumber}>{index + 1}</Box><Typography>{text}</Typography></Box>
        ))}
      </Box>
      <Typography variant="body2" color="text.secondary">Needs iOS 16.4 or newer. Android phones and computers skip this step.</Typography>
    </Paper> : !alerts.supported ? <Alert severity="warning">This browser cannot receive phone alerts. Use Chrome on an Android phone or a computer, or add the app to the Home Screen on an iPhone.</Alert>
    : state?.configured && <Paper variant="outlined" sx={styles.phoneCard}>
      <Box sx={styles.phoneTop}>
        <Box>
          <Typography variant="h6" component="h2">This phone</Typography>
          <Typography variant="body2" color="text.secondary">{on ? 'Alerts are on for this phone.' : 'Alerts are off for this phone.'}</Typography>
        </Box>
        <Switch checked={on} disabled={alerts.busy} onChange={(_, value) => void (value ? alerts.turnOn() : alerts.turnOff())} slotProps={{ input: { 'aria-label': 'Alerts on this phone' } }} />
      </Box>
      {alerts.permission === 'denied' && <Alert severity="warning">Alerts are blocked for this phone. Allow notifications for BOMedia in the phone or browser settings, then turn them on again.</Alert>}
      {on ? <Button variant="outlined" color="inherit" disabled={alerts.busy} onClick={() => void alerts.sendTest()}>Send a test alert</Button>
        : <Button variant="contained" size="large" disabled={alerts.busy || alerts.permission === 'denied'} onClick={() => void alerts.turnOn()}>{alerts.busy ? 'Turning on…' : 'Turn on phone alerts'}</Button>}
      {!on && <Typography variant="body2" color="text.secondary">Your phone asks for permission once.</Typography>}
    </Paper>}

    {state?.configured && <Box sx={styles.section}>
      <Typography variant="h6" component="h2">Tell me about</Typography>
      <Paper variant="outlined" sx={styles.list}>
        {choices.map((choice) => <Box key={choice.kind} sx={styles.switchRow}>
          <Box><Typography sx={{ fontWeight: 700 }}>{choice.title}</Typography><Typography variant="body2" color="text.secondary">{choice.text}</Typography></Box>
          <Switch checked={!state.off.includes(choice.kind)} onChange={(_, value) => void alerts.setSwitch(choice.kind, value)} slotProps={{ input: { 'aria-label': choice.title } }} />
        </Box>)}
      </Paper>
      <Typography variant="body2" color="text.secondary">Alerts never show money. They say who and what, and tapping opens the right screen.</Typography>
    </Box>}

    {state && state.devices.length > 0 && <Box sx={styles.section}>
      <Typography variant="h6" component="h2">Your phones and computers</Typography>
      <Paper variant="outlined" sx={styles.list}>
        {state.devices.map((device) => <Box key={device.id} sx={styles.deviceRow}>
          <Box>
            <Box sx={styles.deviceName}>{device.label}{device.this_phone && <Box component="span" sx={styles.thisPill}>This phone</Box>}</Box>
            <Typography variant="body2" color="text.secondary">Added {dateText(device.added)}{device.last_used ? ` · last alert ${dateText(device.last_used)}` : ''}</Typography>
          </Box>
          <Button color="error" size="small" disabled={alerts.busy} onClick={() => void alerts.turnOff(device.id)}>Remove</Button>
        </Box>)}
      </Paper>
    </Box>}
  </>;
}

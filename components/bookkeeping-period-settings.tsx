"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Checkbox, FormControlLabel, MenuItem, Paper, Skeleton, TextField, Typography } from '@mui/material';
import { CheckCircle2 } from 'lucide-react';
import { settingsStyles, systemStatusStyles as styles } from '@/app/theme';
import { ResponsiveSheet } from '@/components/responsive-sheet';
import { longDate, monthYear, nextCloseWindow } from '@/lib/bookkeeping-format';
import { readDeviceQueue } from '@/lib/device-queue-read';
import type { DeviceQueueSummary } from '@/lib/device-queue-status';
import { useSyncStore } from '@/lib/store';
import { BackLink } from '@/components/back-link';

type Period = { configured: false; today: string }
  | { configured: true; starts_on: string; state: 'setup' | 'active'; closed_through: string | null; today: string; closable: string[] };
const ENDPOINT = '/api/accounting/bookkeeping-period';
const message = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Try again.');

export function BookkeepingPeriodSettings() {
  const legacy = useSyncStore((state) => state.pendingQueue);
  const [period, setPeriod] = useState<Period | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [through, setThrough] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [queue, setQueue] = useState<DeviceQueueSummary | null>(null);
  const requestId = useRef<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(ENDPOINT, { cache: 'no-store' });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error || 'The bookkeeping period could not be loaded. Try again.');
    setPeriod(result);
    // Start on the oldest month still open, so a month is never skipped by accident.
    if (result.configured && result.closable.length) setThrough(result.closable[result.closable.length - 1]);
    else setThrough('');
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => { try { await load(); } catch (cause) { if (active) setError(message(cause)); } });
    return () => { active = false; };
  }, [load]);

  function openConfirm() { requestId.current = null; setUnderstood(false); setError(''); setQueue(readDeviceQueue(legacy)); setConfirming(true); }
  async function close() {
    if (busy || !understood || !through) return;
    requestId.current ??= crypto.randomUUID();
    setBusy(true); setError('');
    try {
      const response = await fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requestId: requestId.current, through }) });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'The books were not closed. Try again.');
      requestId.current = null; setConfirming(false); setSuccess(`The books are closed through ${longDate(result.closed_through)}.`);
      await load();
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  }

  const ready = period?.configured ? period : null;
  const next = ready ? nextCloseWindow(ready.starts_on, ready.closed_through, ready.today) : null;
  return <Box sx={settingsStyles.page}>
    <BackLink href="/bom03/settings" label="Settings" />
    <Box sx={[settingsStyles.heading, styles.stack]}>
      <Typography variant="h3" component="h1">Bookkeeping period</Typography>
      <Typography color="text.secondary">Close finished months so their figures can never change. Only you can do this.</Typography>
    </Box>
    {error && !confirming && <Alert severity="error" sx={styles.alert}>{error}</Alert>}
    {success && <Alert severity="success" sx={styles.alert}>{success}</Alert>}
    {!period && !error && <Box sx={styles.stack}>{[0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={120} />)}</Box>}
    {period && !period.configured && <Alert severity="info">Bookkeeping has not been set up yet, so there is nothing to close.</Alert>}
    {ready && <Box sx={styles.stack}>
      {ready.closed_through && <Box sx={[styles.banner, styles.bannerOk]} role="status">
        <Box sx={styles.bannerIconOk}><CheckCircle2 size={28} /></Box>
        <Box>
          <Typography variant="h6" component="p">{monthYear(ready.closed_through)} is closed</Typography>
          <Typography variant="body2" color="text.secondary">Its figures can no longer change</Typography>
        </Box>
      </Box>}

      <Paper variant="outlined" sx={styles.card}>
        <Typography variant="overline" sx={styles.label}>Your books</Typography>
        <Box sx={styles.line}><Typography sx={styles.strong}>Started on</Typography><Typography color="text.secondary">{longDate(ready.starts_on)}</Typography></Box>
        <Box sx={styles.line}><Typography sx={styles.strong}>Status</Typography>
          <Box component="span" sx={[styles.chip, ready.state === 'active' ? styles.chipInfo : styles.chipWarn]}>{ready.state === 'active' ? 'Active' : 'Not active yet'}</Box></Box>
        <Box sx={styles.line}><Typography sx={styles.strong}>Closed through</Typography>
          <Typography color="text.secondary">{ready.closed_through ? longDate(ready.closed_through) : 'No month closed yet'}</Typography></Box>
      </Paper>

      <Paper variant="outlined" sx={styles.card}>
        <Typography variant="overline" sx={styles.label}>Close a month</Typography>
        {ready.state !== 'active' ? <Typography>The books are not active yet, so nothing can be closed.</Typography>
          : ready.closable.length ? <Typography>{ready.closable.length === 1 ? `${monthYear(ready.closable[0])} has finished. You can close it now.` : 'These months have finished. Choose how far to close.'}</Typography>
          : next && <Typography>{next.month} is still open, so there is nothing to close yet. You can close it from <strong>{next.opensOn}</strong>.</Typography>}
        <TextField select label="Close through" size="small" value={through} disabled={!ready.closable.length} onChange={(event) => setThrough(event.target.value)}
          slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}>
          {ready.closable.length ? ready.closable.map((date) => <MenuItem key={date} value={date}>{longDate(date)}</MenuItem>)
            : <MenuItem value="">No month available yet</MenuItem>}
        </TextField>
        <Button variant="contained" disabled={!ready.closable.length || !through} onClick={openConfirm}>
          {through ? `Close through ${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${through}T00:00:00Z`))}` : 'Close through month-end'}
        </Button>
      </Paper>

      <Paper variant="outlined" sx={styles.card}>
        <Typography variant="overline" sx={styles.label}>What closing does</Typography>
        <Typography variant="body2">After a month is closed, nobody, including you, can add or change anything dated on or before its last day.</Typography>
        <Typography variant="body2">It cannot be undone from the app.</Typography>
        <Typography variant="body2" color="text.secondary">Only whole, finished months can be closed, so a mis-click can never lock days you still need.</Typography>
      </Paper>
    </Box>}

    <ResponsiveSheet open={confirming} onClose={() => setConfirming(false)} title={through ? `Close the books through ${longDate(through)}?` : 'Close the books?'} busy={busy}
      footer={<Box sx={settingsStyles.footer}>
        <Button color="inherit" disabled={busy} onClick={() => setConfirming(false)}>Cancel</Button>
        <Button variant="contained" color="error" disabled={busy || !understood} onClick={() => void close()}>{busy ? 'Closing…' : 'Close the books'}</Button>
      </Box>}>
      <Box sx={[styles.stack, settingsStyles.form]}>
        {error && <Alert severity="error">{error}</Alert>}
        <Typography>From now on nobody, including you, can add or change anything dated on or before {through ? longDate(through) : 'that day'}. <strong>This cannot be undone.</strong></Typography>
        <Paper variant="outlined" sx={[styles.card, styles.cardWarn]}>
          <Typography sx={styles.strong}>Check before you close</Typography>
          <Typography variant="body2">
            {queue && queue.total > 0
              ? `This phone still has ${queue.total} entr${queue.total === 1 ? 'y' : 'ies'} waiting. Let ${queue.total === 1 ? 'it' : 'them'} save first: any dated on or before ${through ? longDate(through) : 'that day'} will be refused. `
              : 'This phone has no waiting entries. '}
            Entries waiting on other phones cannot be checked from here. Ask staff to open the app and let it save everything first, because any entry still waiting that falls in a closed month will be refused.
          </Typography>
        </Paper>
        <FormControlLabel control={<Checkbox checked={understood} disabled={busy} onChange={(event) => setUnderstood(event.target.checked)} />} label="I understand this cannot be undone." />
      </Box>
    </ResponsiveSheet>
  </Box>;
}

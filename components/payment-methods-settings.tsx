"use client";

import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, FormControlLabel, Paper, Skeleton, Stack, Switch, TextField, Typography } from '@mui/material';

import { paymentMethodStyles as styles, settingsStyles } from '@/app/theme';
import { ResponsiveSheet } from './responsive-sheet';
import { BackLink } from '@/components/back-link';

type Method = { method: 'cash' | 'transfer' | 'pos'; label: string; enabled: boolean; account_code: string; account_name: string };
const ENDPOINT = '/api/accounting/payment-method-settings';
const message = (error: unknown) => (error instanceof Error ? error.message : 'Payment methods could not be loaded. Try again.');

export function PaymentMethodsSettings() {
  const [methods, setMethods] = useState<Method[] | null>(null);
  const [error, setError] = useState(''), [success, setSuccess] = useState(''), [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Method | null>(null), [label, setLabel] = useState(''), [enabled, setEnabled] = useState(true);
  // One id per unsaved edit, so a double tap or a retry after a dropped connection saves once.
  const requestId = useRef<string | null>(null);

  async function load() {
    const response = await fetch(ENDPOINT, { cache: 'no-store' }), result = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(result?.data)) throw new Error(result?.error || 'Payment methods could not be loaded.');
    setMethods(result.data);
  }
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => { try { await load(); } catch (cause) { if (active) setError(message(cause)); } });
    return () => { active = false; };
  }, []);

  function edit(method: Method) { setEditing(method); setLabel(method.label); setEnabled(method.enabled); requestId.current = null; setError(''); setSuccess(''); }
  const onlyOneOn = (methods ?? []).filter((m) => m.enabled).length === 1;
  const lastOn = Boolean(editing?.enabled && onlyOneOn);
  const changed = editing ? label.trim() !== editing.label || enabled !== editing.enabled : false;
  const nameError = !label.trim() ? 'Give the method a name.' : label.trim().length > 40 ? 'At most 40 characters.' : '';

  async function save() {
    if (!editing || busy || nameError || !changed) return;
    requestId.current ??= crypto.randomUUID();
    setBusy(true); setError('');
    try {
      const response = await fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestId: requestId.current, method: editing.method, label: label.trim(), enabled }) });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'The payment method was not saved. Try again.');
      requestId.current = null; setEditing(null); setSuccess('Saved. Staff see the new name and availability when they record a payment.');
      await load();
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  }

  return <Box sx={settingsStyles.page}>
    <BackLink href="/bom03/settings" label="Settings" />
    <Stack spacing={1} sx={settingsStyles.heading}>
      <Typography variant="h3" component="h1">Payment methods</Typography>
      <Typography color="text.secondary">The ways customers can pay. Staff pick one when they record a payment, and the money is recorded in the account shown.</Typography>
    </Stack>
    <Stack spacing={2}>
      {error && !editing && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}
      {!methods && !error && [0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={96} />)}
      <Box sx={styles.list}>
        {methods?.map((m) => <Paper key={m.method} variant="outlined" sx={[styles.row, ...(!m.enabled ? [styles.rowOff] : [])]}>
          <Box sx={styles.grow}>
            <Box sx={styles.top}>
              <Typography variant="h6" component="h2">{m.label}</Typography>
              <Box component="span" sx={[styles.pill, m.enabled ? styles.pillOn : styles.pillOff]}>{m.enabled ? 'Available to staff' : 'Turned off'}</Box>
            </Box>
            <Typography variant="body2" color="text.secondary">Recorded in <strong>{m.account_code} · {m.account_name}</strong></Typography>
          </Box>
          <Button color="inherit" variant="outlined" aria-label={`Edit ${m.label}`} onClick={() => edit(m)}>Edit</Button>
        </Paper>)}
      </Box>
      <Typography variant="body2" color="text.secondary">
        At least one method stays on. Turning a method off hides it from new payments only; past payments keep it. Which account each method is recorded in is part of the accounting setup and is not changed here, and opening balances are handled separately when the books start.
      </Typography>
    </Stack>
    <ResponsiveSheet open={Boolean(editing)} onClose={() => setEditing(null)} title="Edit payment method" busy={busy}
      footer={<Box sx={styles.footer}><Button color="inherit" disabled={busy} onClick={() => setEditing(null)}>Close</Button><Button variant="contained" disabled={busy || !changed || Boolean(nameError)} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</Button></Box>}>
      <Stack spacing={2.5} sx={styles.form}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField label="Name staff see" value={label} disabled={busy} error={Boolean(label) && Boolean(nameError)} helperText={nameError || 'For example “Bank transfer”. Reports use this name too.'}
          onChange={(event) => { requestId.current = null; setLabel(event.target.value); }} slotProps={{ htmlInput: { maxLength: 60 } }} />
        {editing && <Box sx={styles.account}>
          <Typography sx={styles.accountLabel}>Recorded in</Typography>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>{editing.account_code} · {editing.account_name}</Typography>
          <Typography variant="caption" color="text.secondary">Set by the accounting setup, so it cannot be changed here.</Typography>
        </Box>}
        <Box sx={styles.switchRow}>
          <FormControlLabel sx={{ m: 0, flex: 1, alignItems: 'flex-start' }} labelPlacement="start" disabled={busy || lastOn}
            control={<Switch checked={enabled} onChange={(_, value) => { requestId.current = null; setEnabled(value); }} />}
            label={<Box><Typography variant="body2" sx={{ fontWeight: 600 }}>Available to staff</Typography>
              <Typography variant="caption" color="text.secondary">{lastOn ? 'This is the only method that is on, so it must stay on.' : 'Turn off to hide it from new payments. Past payments keep it.'}</Typography></Box>} />
        </Box>
      </Stack>
    </ResponsiveSheet>
  </Box>;
}

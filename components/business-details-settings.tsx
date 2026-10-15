"use client";

import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';

import { businessDetailsStyles as styles, settingsStyles } from '@/app/theme';
import { clearBusinessDetailsCache, parseBusinessDetails, type BusinessDetails } from '@/lib/business-details';
import { BackLink } from '@/components/back-link';
import { LoadingState } from '@/components/loading-state';

type Form = Pick<BusinessDetails, 'accountName' | 'accountNumber' | 'bank' | 'phone' | 'email' | 'address'>;
type Meta = { updatedAt: string | null; updatedBy: string | null };
const ENDPOINT = '/api/accounting/business-details';
const toForm = (d: BusinessDetails): Form => ({ accountName: d.accountName, accountNumber: d.accountNumber, bank: d.bank, phone: d.phone, email: d.email, address: d.address });

// Same rules as the database, so mistakes show here before anything is sent.
function validate(f: Form): Partial<Record<keyof Form, string>> {
  const e: Partial<Record<keyof Form, string>> = {};
  const v = (k: keyof Form) => f[k].trim();
  if (!v('accountName')) e.accountName = 'Enter the account name.'; else if (v('accountName').length > 120) e.accountName = 'At most 120 characters.';
  if (!/^[0-9]{10}$/.test(v('accountNumber'))) e.accountNumber = 'Account number must be exactly 10 digits.';
  if (!v('bank')) e.bank = 'Enter the bank name.'; else if (v('bank').length > 80) e.bank = 'At most 80 characters.';
  const digits = v('phone').replace(/[^0-9]/g, '').length;
  if (!/^\+?[0-9][0-9 ()-]*$/.test(v('phone')) || digits < 7 || digits > 15 || v('phone').length > 30) e.phone = 'Enter a phone number such as +234 802 224 7567.';
  if (v('email').length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v('email'))) e.email = 'Enter a valid email address.';
  if (!v('address')) e.address = 'Enter the address.'; else if (v('address').length > 300) e.address = 'At most 300 characters.';
  return e;
}
const when = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }); };

export function BusinessDetailsSettings() {
  const [saved, setSaved] = useState<Form | null>(null), [form, setForm] = useState<Form | null>(null);
  const [meta, setMeta] = useState<Meta>({ updatedAt: null, updatedBy: null });
  const [touched, setTouched] = useState<Partial<Record<keyof Form, boolean>>>({});
  const [error, setError] = useState(''), [success, setSuccess] = useState(''), [busy, setBusy] = useState(false);
  // One id per unsaved edit: pressing Save twice or retrying after a dropped connection cannot save twice.
  const requestId = useRef<string | null>(null);

  async function load() {
    const res = await fetch(ENDPOINT, { cache: 'no-store' });
    const json = await res.json().catch(() => null);
    const parsed = res.ok ? parseBusinessDetails(json) : null;
    if (!parsed) throw new Error((json && typeof json.error === 'string' && json.error) || 'Business details could not be loaded.');
    setSaved(toForm(parsed)); setForm(toForm(parsed));
    setMeta({ updatedAt: typeof json.updated_at === 'string' ? json.updated_at : null, updatedBy: typeof json.updated_by === 'string' ? json.updated_by : null });
  }
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => { try { await load(); } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'Business details could not be loaded.'); } });
    return () => { active = false; };
  }, []);

  if (!form || !saved) return <Box sx={settingsStyles.page}>
    <BackLink href="/bom03/settings" label="Settings" />
    <Stack spacing={1} sx={settingsStyles.heading}><Typography variant="h3" component="h1">Business details</Typography></Stack>
    {error ? <Alert severity="error">{error}</Alert> : <LoadingState pieces={[{ k: 'form', n: 5 }]} label="Loading business details" />}
  </Box>;

  const errors = validate(form);
  const dirty = (Object.keys(form) as (keyof Form)[]).some((k) => form[k].trim() !== saved[k]);
  const show = (k: keyof Form) => (touched[k] ? errors[k] : undefined);
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    requestId.current = null; setSuccess('');
    setForm({ ...form, [k]: k === 'accountNumber' ? e.target.value.replace(/[^0-9]/g, '').slice(0, 10) : e.target.value });
  };
  const field = (k: keyof Form, label: string, extra: object = {}) => ({
    id: `bd-${k}`, label, value: form[k], onChange: set(k), onBlur: () => setTouched((t) => ({ ...t, [k]: true })),
    error: Boolean(show(k)), helperText: show(k), fullWidth: true, ...extra,
  });

  async function save() {
    if (!form || busy) return;
    setTouched({ accountName: true, accountNumber: true, bank: true, phone: true, email: true, address: true });
    if (Object.keys(errors).length) return;
    requestId.current ??= crypto.randomUUID();
    setBusy(true); setError(''); setSuccess('');
    try {
      const body = Object.fromEntries((Object.keys(form) as (keyof Form)[]).map((k) => [k, form[k].trim()]));
      const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requestId: requestId.current, ...body }) });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error((json && typeof json.error === 'string' && json.error) || 'Business details were not saved. Try again.');
      requestId.current = null; clearBusinessDetailsCache();
      await load(); setTouched({}); setSuccess('Saved. New invoices and receipts will use these details.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Business details were not saved. Try again.'); }
    finally { setBusy(false); }
  }
  function reset() { requestId.current = null; setForm(saved); setTouched({}); setError(''); setSuccess(''); }

  const shown = { ...form, accountName: form.accountName.trim() || '—', accountNumber: form.accountNumber || '—', bank: form.bank.trim() || '—' };
  return <Box sx={settingsStyles.page}>
    <BackLink href="/bom03/settings" label="Settings" />
    <Stack spacing={1} sx={settingsStyles.heading}>
      <Typography variant="h3" component="h1">Business details</Typography>
      <Typography color="text.secondary">Printed on every invoice and receipt. Invoices already sent are not affected.</Typography>
    </Stack>
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}
    <Box sx={styles.layout}>
      <Box component="form" noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <Paper variant="outlined" sx={styles.card} component="section" aria-labelledby="bd-pay">
          <Typography variant="h6" component="h2" id="bd-pay">Payment account</Typography>
          <Typography variant="body2" color="text.secondary">Where customers send transfers</Typography>
          <Box sx={styles.fields}>
            <TextField {...field('accountName', 'Account name')} autoComplete="off" />
            <TextField {...field('accountNumber', 'Account number', { slotProps: { htmlInput: { inputMode: 'numeric', maxLength: 10 } }, sx: styles.digitsInput })} autoComplete="off" helperText={show('accountNumber') || (/^[0-9]{10}$/.test(form.accountNumber) ? '✓ 10 digits' : `${form.accountNumber.length} of 10 digits`)} />
            <TextField {...field('bank', 'Bank')} autoComplete="off" />
          </Box>
        </Paper>
        <Paper variant="outlined" sx={{ ...styles.card, mt: 2 }} component="section" aria-labelledby="bd-contact">
          <Typography variant="h6" component="h2" id="bd-contact">Contact</Typography>
          <Typography variant="body2" color="text.secondary">Shown in the invoice footer</Typography>
          <Box sx={styles.fields}>
            <TextField {...field('phone', 'Phone', { type: 'tel' })} autoComplete="off" helperText={show('phone') || 'The dialable link is made automatically.'} />
            <TextField {...field('email', 'Email', { type: 'email' })} autoComplete="off" />
            <TextField {...field('address', 'Address', { multiline: true, minRows: 3 })} autoComplete="off" />
          </Box>
        </Paper>
        <Box sx={styles.actions}>
          <Button variant="outlined" color="inherit" sx={styles.resetButton} disabled={!dirty || busy} onClick={reset}>Reset</Button>
          <Button type="submit" variant="contained" sx={styles.saveButton} disabled={!dirty || busy}>{busy ? 'Saving…' : 'Save changes'}</Button>
        </Box>
      </Box>
      <Box component="section" aria-labelledby="bd-preview">
        <Typography variant="caption" component="h2" id="bd-preview" sx={styles.previewTitle}>Invoice preview</Typography>
        <Paper variant="outlined" sx={styles.card}>
          <Box sx={styles.previewBox}>
            <Typography sx={styles.previewLabel}>Payment details</Typography>
            {([['Account name', shown.accountName], ['Account number', shown.accountNumber], ['Bank', shown.bank]] as const).map(([l, v]) =>
              <Box key={l} sx={styles.previewRow}><Box component="span" sx={{ color: 'text.secondary' }}>{l}</Box><Box component="strong" sx={styles.previewValue}>{v}</Box></Box>)}
          </Box>
          <Box sx={styles.previewFooter}>
            <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>Thank you for your business!</Typography>
            <Typography variant="caption" color="text.secondary" component="div">{form.phone.trim() || '—'} | {form.email.trim() || '—'}</Typography>
            <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>{form.address.trim() || '—'}</Typography>
          </Box>
        </Paper>
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1.5 }}>
          Only admins can change these. Every save is recorded with who changed it and when.
          {meta.updatedAt ? ` Last changed ${when(meta.updatedAt)}${meta.updatedBy ? ` by ${meta.updatedBy}` : ''}.` : ''}
        </Typography>
      </Box>
    </Box>
  </Box>;
}

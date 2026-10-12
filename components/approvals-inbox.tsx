"use client";

import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Paper, Skeleton, Stack, TextField, Typography } from '@mui/material';

import { approvalInboxStyles as styles, approvalPromptStyles } from '@/app/theme';
import { BackLink } from '@/components/back-link';
import { useFloatingNotice } from '@/components/floating-notice';
import { STATUS_LABEL, changeText, changeTitle, koboNaira, rowChange, rowItems, rowTotalKobo, type ApprovalRow } from '@/lib/approvals-view';

const ENDPOINT = '/api/accounting/approvals';
const PILL = { pending: styles.pillWaiting, approved: styles.pillApproved, declined: styles.pillDeclined, expired: styles.pillExpired } as const;
const when = (iso: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' }).format(new Date(iso));
const message = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Try again.');
export const APPROVALS_CHANGED = 'bomedia-approvals-changed';

export function ApprovalsInbox() {
  const [rows, setRows] = useState<ApprovalRow[] | null>(null);
  const [tab, setTab] = useState<'waiting' | 'decided'>('waiting');
  const [error, setError] = useState(''), [done, setDone] = useState(''), [busy, setBusy] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({}), [problems, setProblems] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const response = await fetch(ENDPOINT, { cache: 'no-store' }), result = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(result?.data)) throw new Error(result?.error || 'Approvals could not be loaded.');
    setRows(result.data);
    window.dispatchEvent(new Event(APPROVALS_CHANGED));
  }, []);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => { try { await load(); } catch (cause) { if (active) setError(message(cause)); } });
    return () => { active = false; };
  }, [load]);
  useFloatingNotice('approvals-done', done ? { tone: 'success', text: done } : null);

  async function decide(row: ApprovalRow, decision: 'approve' | 'decline') {
    if (busy) return;
    setBusy(row.id); setError(''); setDone(''); setProblems((p) => ({ ...p, [row.id]: '' }));
    try {
      const response = await fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestId: crypto.randomUUID(), approvalRequestId: row.id, decision, note: (notes[row.id] ?? '').trim() || undefined }) });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'The decision was not saved. Try again.');
      if (result?.status === 'failed') setProblems((p) => ({ ...p, [row.id]: `It could not be recorded yet: ${result.error || 'please check and try again'}. It is still waiting.` }));
      else setDone(decision === 'approve' ? `Approved. ${row.summary?.client ?? 'The sale'} is now recorded.` : 'Declined. The cashier will see your note.');
      await load();
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(''); }
  }

  const waiting = (rows ?? []).filter((r) => r.status === 'pending'), decided = (rows ?? []).filter((r) => r.status !== 'pending');
  const shown = tab === 'waiting' ? waiting : decided;

  return <Box sx={styles.page}>
    <BackLink href="/bom03" label="Dashboard" />
    <Stack spacing={1} sx={{ mt: 2, mb: 3 }}>
      <Typography variant="h3" component="h1">Approvals</Typography>
      <Typography color="text.secondary">{waiting.length ? `${waiting.length} ${waiting.length === 1 ? 'sale is' : 'sales are'} held until you decide.` : 'Nothing is waiting for you.'} Nothing is recorded or taken from stock before you approve.</Typography>
    </Stack>
    <Box sx={styles.tabs}>
      <Button variant={tab === 'waiting' ? 'contained' : 'outlined'} color={tab === 'waiting' ? 'primary' : 'inherit'} onClick={() => setTab('waiting')}>Waiting {waiting.length}</Button>
      <Button variant={tab === 'decided' ? 'contained' : 'outlined'} color={tab === 'decided' ? 'primary' : 'inherit'} onClick={() => setTab('decided')}>Decided</Button>
    </Box>
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    {!rows && !error && [0, 1].map((i) => <Skeleton key={i} variant="rounded" height={160} sx={{ mb: 1.5 }} />)}
    {rows && !shown.length && <Typography color="text.secondary">{tab === 'waiting' ? 'No sales are waiting.' : 'Nothing has been decided in the last 30 days.'}</Typography>}
    <Box sx={styles.list}>
      {shown.map((row) => <Paper key={row.id} variant="outlined" sx={styles.card}>
        <Box sx={styles.top}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" component="h2">{row.summary?.client || 'A sale'}</Typography>
            <Typography sx={styles.sub}>{rowItems(row) || 'Sale'} · asked by {row.requested_by ?? 'a cashier'} · {when(row.created_at)}</Typography>
          </Box>
          <Typography sx={styles.amount}>{koboNaira(rowTotalKobo(row))}</Typography>
        </Box>
        <Box sx={styles.changes}>
          {row.changes.map((change, index) => { const c = rowChange(change); return <Box key={index} sx={approvalPromptStyles.change}>
            <Box component="span" sx={approvalPromptStyles.changeTitle}>{changeTitle(c)}</Box>{changeText(c)}</Box>; })}
        </Box>
        <Box sx={styles.reason}>{row.requested_by ?? 'The cashier'} says: “{row.reason}”</Box>
        {row.status === 'pending' ? <>
          {problems[row.id] && <Alert severity="warning">{problems[row.id]}</Alert>}
          <Box sx={styles.actions}>
            <TextField size="small" sx={styles.note} placeholder="Note for the cashier (optional)" value={notes[row.id] ?? ''} disabled={busy === row.id}
              onChange={(event) => setNotes((n) => ({ ...n, [row.id]: event.target.value.slice(0, 500) }))} slotProps={{ htmlInput: { 'aria-label': 'Note for the cashier' } }} />
            <Button color="inherit" variant="outlined" disabled={busy === row.id} onClick={() => void decide(row, 'decline')}>Decline</Button>
            <Button variant="contained" disabled={busy === row.id} onClick={() => void decide(row, 'approve')}>Approve</Button>
          </Box>
        </> : <Box sx={styles.pillRow}>
          <Box component="span" sx={PILL[row.status]}>{STATUS_LABEL[row.status]}</Box>
          <Typography sx={styles.sub}>{row.status === 'expired' ? 'Not decided in 7 days' : `${row.decided_by ?? 'You'} · ${row.decided_at ? when(row.decided_at) : ''}`}{row.sales_id ? ` · ${row.sales_id}` : ''}</Typography>
          {row.decision_note && <Typography sx={{ ...styles.sub, width: '100%' }}>“{row.decision_note}”</Typography>}
        </Box>}
      </Paper>)}
    </Box>
  </Box>;
}

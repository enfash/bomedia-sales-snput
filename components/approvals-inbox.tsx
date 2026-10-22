"use client";

import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { CheckCircle2 } from 'lucide-react';

import { approvalInboxStyles as styles, approvalPromptStyles } from '@/app/theme';
import { BackLink } from '@/components/back-link';
import { useFloatingNotice } from '@/components/floating-notice';
import { ExpenseEffectBox } from '@/components/expense-corrections/expense-effect-box';
import { EffectBox } from '@/components/sale-corrections/effect-box';
import { EXPENSE_LABELS, FieldDiff, hasFieldChanges } from '@/components/sale-corrections/field-diff';
import type { ExpensePlan } from '@/lib/server/expense-corrections';
import type { CorrectionPlan } from '@/lib/server/sale-corrections';
import { STATUS_LABEL, changeText, changeTitle, koboNaira, rowChange, isChangeRequest, rowItems, rowKind, rowTitle, rowTotalKobo, type ApprovalRow } from '@/lib/approvals-view';
import { LoadingState } from '@/components/loading-state';

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
      else setDone(decision === 'approve' ? `${isChangeRequest(row) ? `Approved. ${rowTitle(row)} has been changed.` : `Approved. ${rowTitle(row)} is now recorded.`}` : 'Declined. The cashier will see your note.');
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
      <Typography color="text.secondary">{waiting.length ? `${waiting.length} ${waiting.length === 1 ? 'entry is' : 'entries are'} held until you decide. ` : ''}Nothing is recorded, paid out or taken from stock before you approve.</Typography>
    </Stack>
    <Box sx={styles.tabs}>
      <Button variant={tab === 'waiting' ? 'contained' : 'outlined'} color={tab === 'waiting' ? 'primary' : 'inherit'} onClick={() => setTab('waiting')}>Waiting {waiting.length}</Button>
      <Button variant={tab === 'decided' ? 'contained' : 'outlined'} color={tab === 'decided' ? 'primary' : 'inherit'} onClick={() => setTab('decided')}>Decided</Button>
    </Box>
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    {!rows && !error && <LoadingState pieces={[{ k: 'cards', n: 2 }]} label="Loading approvals" />}
    {rows && !shown.length && <Box sx={styles.empty}>
      <Box sx={styles.emptyIcon}><CheckCircle2 size={28} /></Box>
      <Typography sx={styles.emptyTitle}>{tab === 'waiting' ? 'All caught up' : 'Nothing decided yet'}</Typography>
      <Typography variant="body2" sx={styles.emptyText}>{tab === 'waiting'
        ? 'When a cashier asks to change a sale or record an expense, it shows here for you to approve.'
        : 'Entries you approve or decline in the last 30 days are listed here.'}</Typography>
    </Box>}
    <Box sx={styles.list}>
      {shown.map((row) => <Paper key={row.id} variant="outlined" sx={styles.card}>
        <Box sx={styles.top}>
          <Box sx={{ minWidth: 0 }}>
            <Box sx={styles.titleRow}>
              <Typography variant="h6" component="h2">{rowTitle(row)}</Typography>
              <Box component="span" sx={row.operation === 'screen_expense' ? styles.kindExpense : isChangeRequest(row) ? styles.kindChange : styles.kindSale}>{rowKind(row)}</Box>
            </Box>
            <Typography sx={styles.sub}>{rowItems(row) || rowKind(row)} · asked by {row.requested_by ?? 'a cashier'} · {when(row.created_at)}</Typography>
          </Box>
          <Typography sx={[styles.amount, ...(row.operation === 'screen_expense' || row.operation === 'expense_correction' ? [styles.amountOut] : [])]}>{row.operation === 'screen_expense' || row.operation === 'expense_correction' ? '−' : ''}{koboNaira(rowTotalKobo(row))}</Typography>
        </Box>
        {row.operation === 'expense_correction' ? <Box sx={styles.changes}>
          {(row.changes as unknown as ExpensePlan[]).map((plan, index) => plan.mode === 'cancel'
            ? <Box key={index} sx={approvalPromptStyles.change}><Box component="span" sx={approvalPromptStyles.changeTitle}>Cancel this expense</Box></Box>
            : hasFieldChanges(plan.before, plan.after) && <Box key={index} sx={approvalPromptStyles.change}><FieldDiff before={plan.before} after={plan.after} labels={EXPENSE_LABELS} /></Box>)}
          {(row.changes as unknown as ExpensePlan[]).map((plan, index) => <ExpenseEffectBox key={index} plan={plan} cancel={plan.mode === 'cancel'} />)}
        </Box> : row.operation === 'sale_correction' ? <Box sx={styles.changes}>
          {(row.changes as unknown as CorrectionPlan[]).map((plan, index) => plan.mode === 'cancel'
            ? <Box key={index} sx={approvalPromptStyles.change}><Box component="span" sx={approvalPromptStyles.changeTitle}>Cancel {String(plan.before.description ?? 'this job')}</Box></Box>
            : hasFieldChanges(plan.before, plan.after) && <Box key={index} sx={approvalPromptStyles.change}><FieldDiff before={plan.before} after={plan.after} /></Box>)}
          <EffectBox plans={row.changes as unknown as CorrectionPlan[]} cancel={row.kinds.includes('cancellation')} />
        </Box> : <Box sx={styles.changes}>
          {row.changes.map((change, index) => { const c = rowChange(change as Parameters<typeof rowChange>[0]); return <Box key={index} sx={approvalPromptStyles.change}>
            <Box component="span" sx={approvalPromptStyles.changeTitle}>{changeTitle(c)}</Box>{changeText(c)}</Box>; })}
        </Box>}
        <Box sx={styles.reason}>{row.requested_by ?? 'The cashier'} says: “{row.reason}”</Box>
        {row.status === 'pending' ? <>
          {problems[row.id] && <Alert severity="warning">{problems[row.id]}</Alert>}
          <Box sx={styles.actions}>
            <TextField size="small" sx={styles.note} placeholder="Note for the cashier (optional)" value={notes[row.id] ?? ''} disabled={busy === row.id}
              onChange={(event) => setNotes((n) => ({ ...n, [row.id]: event.target.value.slice(0, 500) }))} slotProps={{ htmlInput: { 'aria-label': 'Note for the cashier' } }} />
            <Button color="inherit" variant="outlined" disabled={busy === row.id} onClick={() => void decide(row, 'decline')}>Decline</Button>
            <Button variant="contained" disabled={busy === row.id} onClick={() => void decide(row, 'approve')}>{row.operation === 'screen_expense' ? 'Approve and record' : isChangeRequest(row) ? 'Approve and apply' : 'Approve'}</Button>
          </Box>
        </> : <Box sx={styles.pillRow}>
          <Box component="span" sx={PILL[row.status]}>{STATUS_LABEL[row.status]}</Box>
          <Typography sx={styles.sub}>{row.status === 'expired' ? 'Not decided in 7 days' : `${row.decided_by ?? 'You'} · ${row.decided_at ? when(row.decided_at) : ''}`}{row.reference ?? row.sales_id ? ` · ${row.reference ?? row.sales_id}` : ''}</Typography>
          {row.decision_note && <Typography sx={{ ...styles.sub, width: '100%' }}>“{row.decision_note}”</Typography>}
        </Box>}
      </Paper>)}
    </Box>
  </Box>;
}

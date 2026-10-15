"use client";

import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, TextField, Typography } from '@mui/material';
import { toast } from 'sonner';

import { saleChangeStyles as styles } from '@/app/theme';
import { ExpenseEffectBox } from '@/components/expense-corrections/expense-effect-box';
import { ResponsiveSheet } from '@/components/responsive-sheet';
import type { ExpensePlan } from '@/lib/server/expense-corrections';
import { LoadingState } from '@/components/loading-state';

async function post(body: Record<string, unknown>, preview: boolean) {
  const response = await fetch(`/api/accounting/expense-corrections${preview ? '?preview=1' : ''}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error || 'That could not be checked. Try again.');
  return result;
}

/** Cancel an expense. It stays in the list as Cancelled, with who cancelled it and why. */
export function CancelExpenseSheet({ reference, label, owner, onClose, onDone }: { reference: string; label: string; owner: boolean; onClose: () => void; onDone: () => void }) {
  const [plan, setPlan] = useState<ExpensePlan | null>(null);
  const [problem, setProblem] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [reason, setReason] = useState('');
  const requestId = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      try { const result = await post({ mode: 'cancel', reference }, true); if (active) setPlan(result.plan); }
      catch (cause) { if (active) setProblem(cause instanceof Error ? cause.message : 'This expense cannot be cancelled.'); }
    });
    return () => { active = false; };
  }, [reference]);

  const ready = !!plan && !problem && !!reason.trim() && !busy;
  async function save() {
    if (!ready) return;
    requestId.current ??= crypto.randomUUID();
    setBusy(true); setError('');
    try {
      const result = await post({ requestId: requestId.current, mode: 'cancel', reference, reason: reason.trim() }, false);
      requestId.current = null;
      toast.success(result.status === 'applied' ? 'Expense cancelled. It stays in the list as Cancelled.' : 'Sent to the owner for approval. Nothing changes until it is approved.');
      onDone();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The expense was not cancelled. Try again.'); }
    finally { setBusy(false); }
  }

  return <ResponsiveSheet open onClose={onClose} busy={busy} title="Cancel this expense?" description={`${reference} · ${label}`}
    footer={<Box sx={styles.footer}>
      <Button variant="contained" color="error" size="large" disabled={!ready} onClick={() => void save()}>{busy ? 'Saving…' : owner ? 'Cancel this expense' : 'Send for approval'}</Button>
      <Button color="inherit" variant="outlined" disabled={busy} onClick={onClose}>Keep the expense</Button>
    </Box>}>
    <Box sx={styles.body}>
      <Typography color="text.secondary">The expense stays in the list marked Cancelled, with who cancelled it and why. It is never erased.</Typography>
      {error && <Alert severity="error">{error}</Alert>}
      {problem && <Alert severity="warning">{problem}</Alert>}
      {!plan && !problem && <LoadingState pieces={[{ k: 'cards', n: 1 }]} label="Checking what cancelling changes" />}
      {plan && <ExpenseEffectBox plan={plan} cancel whoApproves={!owner} />}
      <TextField label="Why? (required)" multiline minRows={3} value={reason} onChange={(event) => { requestId.current = null; setReason(event.target.value.slice(0, 500)); }} helperText={`${reason.length} / 500`} />
    </Box>
  </ResponsiveSheet>;
}

"use client";

import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Skeleton, TextField, Typography } from '@mui/material';
import { toast } from 'sonner';

import { saleChangeStyles as styles } from '@/app/theme';
import { EffectBox } from '@/components/sale-corrections/effect-box';
import { ResponsiveSheet } from '@/components/responsive-sheet';
import type { CorrectionPlan } from '@/lib/server/sale-corrections';

async function post(body: Record<string, unknown>, preview: boolean) {
  const response = await fetch(`/api/accounting/sale-corrections${preview ? '?preview=1' : ''}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error || 'That could not be checked. Try again.');
  return result;
}

/** Cancel a whole sale. It stays in Records as Cancelled, with who cancelled it and why; stock goes back on its rolls. */
export function CancelSaleSheet({ salesId, client, owner, onClose, onDone }: { salesId: string; client: string; owner: boolean; onClose: () => void; onDone: () => void }) {
  const [plans, setPlans] = useState<CorrectionPlan[] | null>(null);
  const [problem, setProblem] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [reason, setReason] = useState('');
  const requestId = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      try { const result = await post({ mode: 'cancel', salesId }, true); if (active) setPlans(result.plans); }
      catch (cause) { if (active) setProblem(cause instanceof Error ? cause.message : 'This sale cannot be cancelled.'); }
    });
    return () => { active = false; };
  }, [salesId]);

  const ready = !!plans && !problem && !!reason.trim() && !busy;
  async function save() {
    if (!ready) return;
    requestId.current ??= crypto.randomUUID();
    setBusy(true); setError('');
    try {
      const result = await post({ requestId: requestId.current, mode: 'cancel', salesId, reason: reason.trim() }, false);
      requestId.current = null;
      toast.success(result.status === 'applied' ? 'Sale cancelled. It stays in Records as Cancelled.' : 'Sent to the owner for approval. Nothing changes until it is approved.');
      onDone();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The sale was not cancelled. Try again.'); }
    finally { setBusy(false); }
  }

  return <ResponsiveSheet open onClose={onClose} busy={busy} title="Cancel this sale?" description={`${salesId} · ${client}`}
    footer={<Box sx={styles.footer}>
      <Button variant="contained" color="error" size="large" disabled={!ready} onClick={() => void save()}>{busy ? 'Saving…' : owner ? 'Cancel this sale' : 'Send for approval'}</Button>
      <Button color="inherit" variant="outlined" disabled={busy} onClick={onClose}>Keep the sale</Button>
    </Box>}>
    <Box sx={styles.body}>
      <Typography color="text.secondary">The sale stays in Records marked Cancelled, with who cancelled it and why. It is never erased.</Typography>
      {error && <Alert severity="error">{error}</Alert>}
      {problem && <Alert severity="warning">{problem}</Alert>}
      {!plans && !problem && <Skeleton variant="rounded" height={140} />}
      {plans && <EffectBox plans={plans} cancel whoApproves={!owner} />}
      <TextField label="Why? (required)" multiline minRows={3} value={reason} onChange={(event) => { requestId.current = null; setReason(event.target.value.slice(0, 500)); }} helperText={`${reason.length} / 500`} />
    </Box>
  </ResponsiveSheet>;
}

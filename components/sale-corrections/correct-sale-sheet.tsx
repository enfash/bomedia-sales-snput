"use client";

import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, MenuItem, Skeleton, TextField, Typography } from '@mui/material';
import { toast } from 'sonner';

import { saleChangeStyles as styles } from '@/app/theme';
import { EffectBox } from '@/components/sale-corrections/effect-box';
import { ResponsiveSheet } from '@/components/responsive-sheet';
import { nairaToKobo } from '@/lib/accounting-entry';
import type { CorrectionChanges, CorrectionPlan } from '@/lib/server/sale-corrections';

type Form = { description: string; quantity: string; width: string; height: string; price: string; materialId: string; date: string };
type Material = { id: string; name: string; width: string };
const materialLabel = (m: Material) => `${m.name} · ${Number(m.width)} ft roll`;
const text = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const naira = (kobo: unknown) => { const n = Number(kobo); return Number.isFinite(n) && n > 0 ? String(n / 100) : ''; };

async function post(body: Record<string, unknown>, preview: boolean) {
  const response = await fetch(`/api/accounting/sale-corrections${preview ? '?preview=1' : ''}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error || 'That change could not be checked. Try again.');
  return result;
}

/** Change one job of a sale. It shows what the change will do before anything is sent; the owner applies it at once, a cashier asks. */
export function CorrectSaleSheet({ jobId, description, owner, onClose, onDone }: { jobId: string; description: string; owner: boolean; onClose: () => void; onDone: () => void }) {
  const [base, setBase] = useState<Record<string, unknown> | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [plans, setPlans] = useState<CorrectionPlan[] | null>(null);
  const [problem, setProblem] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [reason, setReason] = useState('');
  const requestId = useRef<string | null>(null);

  // The job as it is now, and the materials to choose from.
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      try {
        const result = await post({ mode: 'correct', jobId, changes: { description } }, true);
        const before = result.plans[0].before as Record<string, unknown>;
        if (!active) return;
        setBase(before);
        setForm({ description: text(before.description), quantity: text(before.quantity), width: text(before.width_ft), height: text(before.height_ft), price: naira(before.price_per_sqft_kobo), materialId: text(before.material_id), date: text(before.business_date) });
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'This sale could not be opened.'); }
      try {
        const response = await fetch('/api/accounting/orders', { cache: 'no-store' }), catalog = await response.json();
        if (active && response.ok && Array.isArray(catalog.materials)) setMaterials(catalog.materials);
      } catch { /* The material cannot be changed without the list; the rest still works. */ }
    });
    return () => { active = false; };
  }, [jobId, description]);

  const service = base ? base.width_ft === null || base.width_ft === undefined : false;
  const changes: CorrectionChanges = {};
  if (base && form) {
    if (form.description.trim() !== text(base.description)) changes.description = form.description.trim();
    if (form.quantity.trim() !== text(base.quantity)) changes.quantity = form.quantity.trim();
    if (!service) {
      if (Number(form.width) !== Number(base.width_ft) || Number(form.height) !== Number(base.height_ft)) { changes.width = form.width.trim(); changes.height = form.height.trim(); changes.unit = 'ft'; }
      const kobo = nairaToKobo(form.price);
      if (kobo && kobo !== text(base.price_per_sqft_kobo)) changes.priceKobo = kobo;
      if (form.materialId && form.materialId !== text(base.material_id)) changes.materialId = form.materialId;
    }
    if (form.date && form.date !== text(base.business_date)) changes.businessDate = form.date;
  }
  const changeKey = JSON.stringify(changes);
  const hasChanges = Object.keys(changes).length > 0;

  // Check the change with the database, a moment after typing stops, so the person sees the effect first.
  useEffect(() => {
    if (!hasChanges) return;
    let active = true;
    const timer = setTimeout(() => {
      void post({ mode: 'correct', jobId, changes: JSON.parse(changeKey) }, true)
        .then((result) => { if (active) { setPlans(result.plans); setProblem(''); } })
        .catch((cause) => { if (active) { setPlans(null); setProblem(cause instanceof Error ? cause.message : 'This change cannot be made.'); } });
    }, 450);
    return () => { active = false; clearTimeout(timer); };
  }, [changeKey, hasChanges, jobId]);

  const set = (key: keyof Form) => (event: { target: { value: string } }) => { requestId.current = null; setForm((f) => (f ? { ...f, [key]: event.target.value } : f)); };
  const ready = hasChanges && !problem && !!plans && !!reason.trim() && !busy;

  async function save() {
    if (!ready) return;
    requestId.current ??= crypto.randomUUID();
    setBusy(true); setError('');
    try {
      const result = await post({ requestId: requestId.current, mode: 'correct', jobId, changes, reason: reason.trim() }, false);
      requestId.current = null;
      toast.success(result.status === 'applied' ? 'Sale corrected. The old version is kept in its history.' : 'Sent to the owner for approval. Nothing changes until it is approved.');
      onDone();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The change was not saved. Try again.'); }
    finally { setBusy(false); }
  }

  return <ResponsiveSheet open onClose={onClose} busy={busy} title="Correct this sale" description={form ? form.description : undefined}
    footer={<Box sx={styles.footer}>
      <Button variant="contained" size="large" disabled={!ready} onClick={() => void save()}>{busy ? 'Saving…' : owner ? 'Save correction' : 'Send for approval'}</Button>
      <Button color="inherit" variant="outlined" disabled={busy} onClick={onClose}>Close</Button>
    </Box>}>
    <Box sx={styles.body}>
      {error && <Alert severity="error">{error}</Alert>}
      {!form && !error && <Skeleton variant="rounded" height={200} />}
      {form && <>
        <TextField label="What is it?" value={form.description} onChange={set('description')} slotProps={{ htmlInput: { maxLength: 1000 } }} />
        <Box sx={service ? styles.row2 : styles.row3}>
          <TextField label="Quantity" type="number" value={form.quantity} onChange={set('quantity')} slotProps={{ htmlInput: { min: 1 } }} />
          {!service && <TextField label="Width (ft)" type="number" value={form.width} onChange={set('width')} />}
          {!service && <TextField label="Height (ft)" type="number" value={form.height} onChange={set('height')} />}
        </Box>
        {!service && <Box sx={styles.row2}>
          <TextField label="Price per sq ft (₦)" type="number" value={form.price} onChange={set('price')} />
          <TextField label="Sale date" type="date" value={form.date} onChange={set('date')} slotProps={{ inputLabel: { shrink: true } }} />
        </Box>}
        {service && <TextField label="Sale date" type="date" value={form.date} onChange={set('date')} slotProps={{ inputLabel: { shrink: true } }} />}
        {!service && materials.length > 0 && <TextField select label="Material" value={form.materialId} onChange={set('materialId')}>
          {materials.map((m) => <MenuItem key={m.id} value={m.id}>{materialLabel(m)}</MenuItem>)}
        </TextField>}
        {problem && <Alert severity="warning">{problem}</Alert>}
        {hasChanges && !problem && (plans ? <EffectBox plans={plans} whoApproves={!owner} /> : <Skeleton variant="rounded" height={120} />)}
        {!hasChanges && <Typography variant="body2" color="text.secondary">Change something above and the effect on the sale and the stock shows here.</Typography>}
        <TextField label="Why? (required)" multiline minRows={2} value={reason} onChange={(event) => { requestId.current = null; setReason(event.target.value.slice(0, 500)); }}
          helperText={`${reason.length} / 500`} />
      </>}
    </Box>
  </ResponsiveSheet>;
}

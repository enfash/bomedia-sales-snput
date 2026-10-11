"use client";

import { useState } from 'react';
import NextLink from 'next/link';
import { Alert, Box, Button, Link, MenuItem, Paper, TextField, Typography } from '@mui/material';
import { PaidBy } from '@/components/paid-by';
import { RollLengthPicker } from '@/components/roll-length-picker';
import { stockFormStyles as styles } from '@/app/theme';
import { formatKobo } from '@/lib/accounting-money';
import { lagosBusinessDate } from '@/lib/accounting-entry';
import { WASTE_REASONS } from '@/lib/constants';
import type { PaymentMethod } from '@/lib/payment-methods';
import { DEFAULT_ROLL_LENGTH, type RollLengthChoice } from '@/lib/roll-length';
import { countDraft, countPreview, ft, inStock, restockDraft, restockPreview, rollCountOf, rollName, wasteDraft, wastePreview } from '@/lib/stock-forms';
import type { StockEntryState } from '@/components/stock/use-stock-entry';

/** Errors, the "saved" message, and the entry still waiting on this device. Shown above whichever form is open. */
export function StockNotices({ stock }: { stock: StockEntryState }) {
  return <>
    {stock.error && <Alert severity="error">{stock.error}</Alert>}
    {stock.success && <Alert severity="success">{stock.success}</Alert>}
    {stock.pending && <Alert severity="warning">
      <Typography>{stock.pending.summary}</Typography>
      <Typography variant="body2">Saved on this device, not yet confirmed. Retry it before recording anything else. It will not be counted twice.</Typography>
      <Button disabled={stock.busy} onClick={stock.retryPending}>Retry saved entry</Button>
    </Alert>}
    {!stock.ready && !stock.pending && <Button disabled={stock.busy} onClick={() => void stock.reload().catch((cause) => stock.setError(cause instanceof Error ? cause.message : 'The stock list could not load.'))}>Reload stock</Button>}
  </>;
}

type FormProps = { stock: StockEntryState; onSaved?: () => void; onCancel?: () => void };
const Actions = ({ stock, onCancel, label }: { stock: StockEntryState; onCancel?: () => void; label: string }) => (
  <Box sx={styles.actions}>
    {onCancel && <Button color="inherit" disabled={stock.busy} onClick={onCancel}>Cancel</Button>}
    <Button type="submit" variant="contained" size="large" disabled={!stock.ready || stock.locked}>{stock.busy ? 'Saving…' : stock.pending ? 'Finish the saved entry first' : label}</Button>
  </Box>
);
const DateField = ({ label, value, onChange, disabled }: { label: string; value: string; onChange: (value: string) => void; disabled: boolean }) => (
  <TextField type="date" label={label} value={value} required disabled={disabled} onChange={(event) => onChange(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} fullWidth />
);

export function RestockForm({ stock, materialId = '', onSaved, onCancel }: FormProps & { materialId?: string }) {
  const [selected, setSelected] = useState(materialId), [rollCount, setRollCount] = useState('1'), [length, setLength] = useState<RollLengthChoice>(DEFAULT_ROLL_LENGTH);
  const [cost, setCost] = useState(''), [method, setMethod] = useState<PaymentMethod | ''>(''), [supplier, setSupplier] = useState(''), [reference, setReference] = useState('');
  const [businessDate, setBusinessDate] = useState(() => lagosBusinessDate());
  const material = stock.materials.find((item) => item.id === selected);
  const input = { material, rollCount, length, cost, method, businessDate, supplier, reference, methodLabel: stock.methodLabel };
  const preview = restockPreview(input), count = rollCountOf(rollCount);
  const reset = () => { setRollCount('1'); setLength(DEFAULT_ROLL_LENGTH); setCost(''); setMethod(''); setSupplier(''); setReference(''); onSaved?.(); };
  return <Box component="form" sx={styles.form} onSubmit={(event) => {
    event.preventDefault(); stock.setError('');
    const draft = restockDraft(input);
    if (!draft.ok) { stock.setError(draft.error); return; }
    stock.submit(draft, reset);
  }}>
    <TextField select label="Material and size" value={selected} required disabled={!stock.ready || stock.locked} onChange={(event) => setSelected(event.target.value)}
      helperText={material ? `In stock now: ${ft(material.remaining_length_ft)} on ${material.roll_count} roll${material.roll_count === 1 ? '' : 's'}.` : 'Choose what you bought.'}>
      {stock.materials.map((item) => <MenuItem key={item.id} value={item.id}>{item.name} · {Number(item.width_ft)} ft wide{item.available === false ? ' (turned off)' : ''}</MenuItem>)}
    </TextField>
    <Typography variant="caption" color="text.secondary">
      Missing a material or size? <Link component={NextLink} href="/bom03/settings/materials">Add it in Settings → Materials</Link>, where its price and width live.
    </Typography>
    <TextField label="Rolls bought" value={rollCount} required disabled={stock.locked} onChange={(event) => setRollCount(event.target.value)} slotProps={{ htmlInput: { inputMode: 'numeric' } }} />
    <RollLengthPicker value={length} onChange={setLength} disabled={stock.locked} />
    <TextField label="Total paid for all rolls (₦)" value={cost} required disabled={stock.locked} onChange={(event) => setCost(event.target.value)} slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
    <PaidBy value={method} onChange={setMethod} disabled={!stock.ready || stock.locked} methods={stock.methods.map((item) => ({ value: item.method, label: item.label }))} />
    <Box sx={styles.row}>
      <DateField label="Date" value={businessDate} onChange={setBusinessDate} disabled={stock.locked} />
      <TextField label="Supplier (optional)" value={supplier} disabled={stock.locked} onChange={(event) => setSupplier(event.target.value)} slotProps={{ htmlInput: { maxLength: 200 } }} fullWidth />
    </Box>
    <TextField label="Invoice or receipt number (optional)" value={reference} disabled={stock.locked} onChange={(event) => setReference(event.target.value)} slotProps={{ htmlInput: { maxLength: 100 } }} />
    {preview && <Alert severity="info" icon={false}>
      <Typography sx={styles.strong}>{preview.title}</Typography>
      <Typography variant="body2">{preview.detail}{preview.costPerSqft ? ` · ${preview.costPerSqft}` : ''}</Typography>
    </Alert>}
    <Actions stock={stock} onCancel={onCancel} label={`Add ${count || ''} roll${count === 1 ? '' : 's'} to stock`} />
  </Box>;
}

function RollSelect({ stock, value, onChange, label, choices }: { stock: StockEntryState; value: string; onChange: (id: string) => void; label: string; choices: typeof stock.rolls }) {
  return <TextField select label={label} value={value} required disabled={!stock.ready || stock.locked} onChange={(event) => onChange(event.target.value)}>
    {choices.map((roll) => <MenuItem key={roll.id} value={roll.id}>{rollName(roll)} · {ft(roll.remaining_length_ft)} left</MenuItem>)}
  </TextField>;
}

export function WasteForm({ stock, rollId = '', onSaved, onCancel }: FormProps & { rollId?: string }) {
  const [selected, setSelected] = useState(rollId), [length, setLength] = useState(''), [reason, setReason] = useState(''), [responsible, setResponsible] = useState(''), [note, setNote] = useState('');
  const [businessDate, setBusinessDate] = useState(() => lagosBusinessDate());
  const roll = stock.rolls.find((item) => item.id === selected);
  const input = { roll, length, reason, businessDate, responsible, note }, preview = wastePreview(input);
  const wasteFt = Number(length);
  return <Box component="form" sx={styles.form} onSubmit={(event) => {
    event.preventDefault(); stock.setError('');
    const draft = wasteDraft(input);
    if (!draft.ok) { stock.setError(draft.error); return; }
    stock.submit(draft, () => { setLength(''); setReason(''); setResponsible(''); setNote(''); onSaved?.(); });
  }}>
    <RollSelect stock={stock} value={selected} onChange={setSelected} label="Which roll?" choices={stock.rolls.filter(inStock)} />
    <TextField label="Length wasted (ft)" value={length} required disabled={stock.locked} onChange={(event) => setLength(event.target.value)} slotProps={{ htmlInput: { inputMode: 'decimal' } }}
      helperText={roll && wasteFt > 0 ? (wasteFt <= Number(roll.remaining_length_ft) ? `Roll will have ${ft(String(Number(roll.remaining_length_ft) - wasteFt))} left.` : `This roll only has ${ft(roll.remaining_length_ft)} left.`) : ' '} />
    <TextField select label="Reason" value={reason} required disabled={stock.locked} onChange={(event) => setReason(event.target.value)}>
      {WASTE_REASONS.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
    </TextField>
    <Box sx={styles.row}>
      <DateField label="Date" value={businessDate} onChange={setBusinessDate} disabled={stock.locked} />
      <TextField label="Responsible (optional)" value={responsible} disabled={stock.locked} onChange={(event) => setResponsible(event.target.value)} slotProps={{ htmlInput: { maxLength: 100 } }} fullWidth />
    </Box>
    <TextField label="Job or note (optional)" value={note} disabled={stock.locked} onChange={(event) => setNote(event.target.value)} slotProps={{ htmlInput: { maxLength: 500 } }} />
    {preview && <Alert severity="info" icon={false}><Typography sx={styles.strong}>{preview.title}</Typography><Typography variant="body2">{preview.detail}</Typography></Alert>}
    <Actions stock={stock} onCancel={onCancel} label="Log waste" />
  </Box>;
}

export function CountForm({ stock, rollId = '', onSaved, onCancel }: FormProps & { rollId?: string }) {
  const [selected, setSelected] = useState(rollId), [counted, setCounted] = useState(''), [reason, setReason] = useState('');
  const [businessDate, setBusinessDate] = useState(() => lagosBusinessDate());
  const roll = stock.rolls.find((item) => item.id === selected);
  const input = { roll, counted, reason, businessDate }, preview = countPreview(input);
  return <Box component="form" sx={styles.form} onSubmit={(event) => {
    event.preventDefault(); stock.setError('');
    const draft = countDraft(input);
    if (!draft.ok) { stock.setError(draft.error); return; }
    stock.submit(draft, () => { setCounted(''); setReason(''); onSaved?.(); });
  }}>
    <RollSelect stock={stock} value={selected} onChange={setSelected} label="Roll counted" choices={stock.rolls} />
    <Box sx={styles.row}>
      <Paper variant="outlined" sx={styles.appSays}>
        <Typography variant="body2" color="text.secondary">App says</Typography>
        <Typography sx={styles.appSaysValue}>{roll ? ft(roll.remaining_length_ft) : '—'}</Typography>
      </Paper>
      <TextField label="Measured on the roll (ft)" value={counted} required disabled={stock.locked} onChange={(event) => setCounted(event.target.value)} slotProps={{ htmlInput: { inputMode: 'decimal' } }} sx={styles.grow} />
    </Box>
    {preview?.kind === 'change' && <Alert severity={preview.difference < 0 ? 'error' : 'success'} icon={false}>
      <Typography sx={styles.strong}>{ft(String(Math.abs(preview.difference)))} {preview.difference < 0 ? 'missing' : 'more than recorded'} · {preview.value < 0 ? '−' : '+'}{formatKobo(String(Math.abs(preview.value)))}</Typography>
    </Alert>}
    {preview?.kind === 'too-long' && <Alert severity="warning">The measured length cannot be more than this roll&apos;s usable length ({ft(preview.limit)}).</Alert>}
    <TextField label="Why is it different?" value={reason} required multiline minRows={3} disabled={stock.locked} onChange={(event) => setReason(event.target.value)}
      helperText="Required. A correction cannot be edited later; a mistake is fixed with another correction." slotProps={{ htmlInput: { maxLength: 500 } }} />
    <DateField label="Count date" value={businessDate} onChange={setBusinessDate} disabled={stock.locked} />
    <Actions stock={stock} onCancel={onCancel} label="Save correction" />
  </Box>;
}

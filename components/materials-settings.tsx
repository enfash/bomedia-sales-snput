"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, FormControlLabel, Paper, Stack, Switch, TextField, Typography } from '@mui/material';
import { AlertTriangle } from 'lucide-react';
import { materialsStyles as styles, settingsStyles, systemStatusStyles as status } from '@/app/theme';
import { ResponsiveSheet } from '@/components/responsive-sheet';
import { koboToInput, nairaLabel } from '@/lib/materials-format';
import { BackLink } from '@/components/back-link';
import { StockBar } from '@/components/stock-bar';
import { LoadingState } from '@/components/loading-state';

type Size = { id: string; code: string; width_ft: string; remaining_ft: string; capacity_ft?: string; roll_count: number; low_stock_ft: string; notes: string | null;
  available: boolean; price_kobo: string };
type Group = { name: string; price_kobo: string | null; prices_differ: boolean; sizes: Size[] };
type Sheet = { kind: 'material'; group: Group } | { kind: 'size'; group: Group; size: Size } | { kind: 'add-size'; group: Group } | { kind: 'add-material' };
const ENDPOINT = '/api/accounting/materials';
const message = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Try again.');
const feet = (value: string) => `${Number(Number(value).toFixed(1)).toLocaleString('en-NG')} ft`;

export function MaterialsSettings() {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [busy, setBusy] = useState(false);
  // One field set for whichever sheet is open.
  const [name, setName] = useState(''), [price, setPrice] = useState(''), [width, setWidth] = useState(''), [lowStock, setLowStock] = useState('20');
  const [notes, setNotes] = useState(''), [available, setAvailable] = useState(true);
  const [fixPrice, setFixPrice] = useState<Record<string, string>>({});
  const requestIds = useRef<Record<string, string>>({});

  const load = useCallback(async () => {
    const response = await fetch(ENDPOINT, { cache: 'no-store' });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error || 'The materials could not be loaded. Try again.');
    setGroups(result.data);
  }, []);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => { try { await load(); } catch (cause) { if (active) setError(message(cause)); } });
    return () => { active = false; };
  }, [load]);

  // The same request keeps its ID until it succeeds, so a retry after a dropped connection can never save twice.
  const requestId = (key: string) => (requestIds.current[key] ??= crypto.randomUUID());
  async function send(key: string, body: Record<string, unknown>) {
    const response = await fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requestId: requestId(key), ...body }) });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error || 'The change was not saved. Try again.');
    delete requestIds.current[key];
    return result;
  }
  async function run(work: () => Promise<string>, close = true) {
    if (busy) return;
    setBusy(true); setError(''); setSuccess('');
    try { const done = await work(); await load(); if (close) setSheet(null); setSuccess(done); }
    catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  }

  function open(next: Sheet) {
    requestIds.current = {}; setError(''); setSuccess('');
    if (next.kind === 'material') { setName(next.group.name); setPrice(next.group.price_kobo ? koboToInput(next.group.price_kobo) : ''); }
    if (next.kind === 'size') { setLowStock(next.size.low_stock_ft); setNotes(next.size.notes ?? ''); setAvailable(next.size.available); }
    if (next.kind === 'add-size') { setWidth(''); setLowStock('20'); setNotes(''); }
    if (next.kind === 'add-material') { setName(''); setPrice(''); setWidth(''); setLowStock('20'); setNotes(''); }
    setSheet(next);
  }

  const saveMaterial = (group: Group) => run(async () => {
    const parts: string[] = [];
    const priceChanged = price.trim() !== (group.price_kobo ? koboToInput(group.price_kobo) : '');
    if (priceChanged) { const done = await send(`price:${group.name}`, { action: 'set_price', name: group.name, price }); parts.push(`${group.name} is now ${nairaLabel(done.price_kobo)} per sq ft for every size.`); }
    if (name.trim() && name.trim() !== group.name) { await send(`rename:${group.name}`, { action: 'rename', name: group.name, newName: name }); parts.push(`Renamed to ${name.trim()}.`); }
    return parts.join(' ') || 'Nothing changed.';
  });
  const saveSize = (group: Group, size: Size) => run(async () => {
    await send(`size:${size.id}`, { action: 'update_size', materialId: size.id, lowStock, notes: notes.trim() === '' ? null : notes, available });
    return `Saved ${group.name} ${feet(size.width_ft)}.`;
  });
  const addSize = (group: Group) => run(async () => { await send(`add-size:${group.name}`, { action: 'add_size', name: group.name, width, lowStock, notes: notes.trim() === '' ? null : notes }); return `Added ${group.name} ${feet(width)}. Add a roll in Stock entry before staff can sell it.`; });
  const addMaterial = () => run(async () => { await send('add-material', { action: 'add_material', name, price, width, lowStock }); return `Added ${name.trim()}. Add a roll in Stock entry before staff can sell it.`; });
  const resolveConflict = (group: Group) => run(async () => {
    const done = await send(`fix:${group.name}`, { action: 'set_price', name: group.name, price: fixPrice[group.name] ?? '' });
    return `${group.name} is now ${nairaLabel(done.price_kobo)} per sq ft for every size.`;
  }, false);

  const needPrice = (groups ?? []).filter((group) => group.prices_differ).length;
  return <Box sx={settingsStyles.page}>
    <BackLink href="/bom03/settings" label="Settings" />
    <Box sx={[settingsStyles.heading, status.stack]}>
      <Typography variant="h3" component="h1">Materials</Typography>
      <Typography color="text.secondary">Each material has one price per square foot that applies to every size. This is the only place a price can be changed.</Typography>
    </Box>
    {error && !sheet && <Alert severity="error" sx={status.alert}>{error}</Alert>}
    {success && <Alert severity="success" sx={status.alert}>{success}</Alert>}
    {!groups && !error && <LoadingState pieces={[{ k: 'cards', n: 2 }]} label="Loading materials" />}
    {groups && <Box sx={status.stack}>
      <Button variant="contained" onClick={() => open({ kind: 'add-material' })}>Add material</Button>
      {needPrice > 0 && <Box sx={[status.banner, status.bannerWarn]} role="status">
        <Box sx={status.bannerIconWarn}><AlertTriangle size={28} /></Box>
        <Box>
          <Typography variant="h6" component="p">{needPrice} material{needPrice === 1 ? '' : 's'} need{needPrice === 1 ? 's' : ''} one price</Typography>
          <Typography variant="body2" color="text.secondary">Their sizes currently have different prices</Typography>
        </Box>
      </Box>}
      {groups.length === 0 && <Alert severity="info">There are no materials yet. Add one to get started.</Alert>}
      {groups.map((group) => <Paper key={group.name} variant="outlined" sx={[status.card, group.prices_differ && status.cardWarn]}>
        <Box sx={status.line}>
          <Typography variant="h5" component="h2" sx={status.big}>{group.name}</Typography>
          {group.prices_differ ? <Box component="span" sx={[status.chip, status.chipWarn]}>Prices differ</Box>
            : <Button size="small" color="inherit" variant="outlined" onClick={() => open({ kind: 'material', group })}>Edit {group.name}</Button>}
        </Box>
        {group.prices_differ ? <>
          <Typography variant="body2">{group.name} sizes are priced differently today. Nothing has changed: sales still use each size&apos;s current price until you choose one price for all of them.</Typography>
          <Box sx={styles.sizeList}>{group.sizes.map((size) => <Box key={size.id} sx={[styles.pricePanel, styles.sizeRow]}>
            <Typography sx={status.strong}>{feet(size.width_ft)} wide</Typography><Typography color="text.secondary">{nairaLabel(size.price_kobo)} per sq ft</Typography></Box>)}</Box>
          <TextField label={`One price for every ${group.name} size (₦ per sq ft)`} size="small" value={fixPrice[group.name] ?? ''} placeholder="Choose a price"
            onChange={(event) => setFixPrice((current) => ({ ...current, [group.name]: event.target.value }))} slotProps={{ htmlInput: { inputMode: 'decimal' }, inputLabel: { shrink: true } }} />
          <Button variant="contained" disabled={busy || !(fixPrice[group.name] ?? '').trim()} onClick={() => void resolveConflict(group)}>Set one price for all {group.name} sizes</Button>
          <Typography variant="caption" color="text.secondary">You are asked to choose because only you know which price is right. Until then a new size cannot be added to {group.name}.</Typography>
        </> : <>
          <Box sx={styles.pricePanel}>
            <Typography variant="h5" component="p" sx={status.big}>{nairaLabel(group.price_kobo ?? '0')} <Typography component="span" color="text.secondary">per sq ft</Typography></Typography>
            <Typography variant="body2" color="text.secondary">Applies to every {group.name} size</Typography>
          </Box>
          <Typography variant="overline" sx={styles.sectionLabel}>Sizes</Typography>
          <Box sx={styles.sizeList}>{group.sizes.map((size) => <Box key={size.id} sx={[styles.sizeRow, !size.available && styles.sizeOff]}>
            <Box sx={styles.sizeMain}>
              <Typography sx={status.strong}>{feet(size.width_ft)} wide</Typography>
              <Typography variant="body2" color="text.secondary">{size.roll_count === 0 ? 'No rolls yet' : `${feet(size.remaining_ft)} left · warns at ${feet(size.low_stock_ft)}`}</Typography>
              <StockBar compact remaining={Number(size.remaining_ft)} capacity={Number(size.capacity_ft ?? 0)} status={size.roll_count === 0 ? 'Out of Stock' : Number(size.remaining_ft) <= Number(size.low_stock_ft) ? 'Low Stock' : ''} />
            </Box>
            <Box sx={styles.sizeActions}>
              <Box component="span" sx={[status.chip, size.available ? styles.chipOn : styles.chipOff]}>{size.available ? 'Available' : 'Turned off'}</Box>
              <Button size="small" color="inherit" variant="outlined" aria-label={`Edit ${group.name} ${feet(size.width_ft)}`} onClick={() => open({ kind: 'size', group, size })}>Edit</Button>
            </Box>
          </Box>)}</Box>
          <Button color="inherit" variant="outlined" onClick={() => open({ kind: 'add-size', group })}>Add a size to {group.name}</Button>
        </>}
      </Paper>)}
      <Typography variant="body2" color="text.secondary" sx={status.note}>Nothing is ever deleted, because past sales refer to it. Turn a size off to hide it from new sales and quotes. Staff can still type a one-off price on a sale; those are flagged for your review.</Typography>
    </Box>}

    <ResponsiveSheet open={sheet !== null} onClose={() => setSheet(null)} busy={busy} title={
        sheet?.kind === 'material' ? `Edit ${sheet.group.name}` : sheet?.kind === 'size' ? `Edit ${sheet.group.name} · ${feet(sheet.size.width_ft)}`
        : sheet?.kind === 'add-size' ? `Add a size to ${sheet.group.name}` : 'Add a material'}
      footer={<Box sx={settingsStyles.footer}>
        <Button color="inherit" disabled={busy} onClick={() => setSheet(null)}>Cancel</Button>
        <Button variant="contained" disabled={busy || !sheet} onClick={() => {
          if (sheet?.kind === 'material') void saveMaterial(sheet.group); else if (sheet?.kind === 'size') void saveSize(sheet.group, sheet.size);
          else if (sheet?.kind === 'add-size') void addSize(sheet.group); else void addMaterial();
        }}>{busy ? 'Saving…' : sheet?.kind === 'add-size' ? 'Add size' : sheet?.kind === 'add-material' ? 'Add material' : 'Save'}</Button>
      </Box>}>
      <Stack spacing={2.5} sx={settingsStyles.form}>
        {error && sheet && <Alert severity="error">{error}</Alert>}
        {sheet?.kind === 'material' && <>
          <TextField label="Name staff see" value={name} onChange={(event) => setName(event.target.value)} disabled={busy} helperText="Renaming changes the name on every size. Codes such as FLEX-10FT never change." />
          <TextField label="Selling price per sq ft (₦)" value={price} onChange={(event) => setPrice(event.target.value)} disabled={busy || sheet.group.prices_differ} slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
          <Box sx={styles.sheetNote}>
            <Typography variant="body2"><strong>One price for every {sheet.group.name} size</strong>, including any size you add later.</Typography>
            <Typography variant="body2" color="text.secondary">The new price applies to new sales and quotes from now on. Past sales keep the price they were sold at. Quotes already saved will ask staff to confirm the new price.</Typography>
          </Box>
        </>}
        {sheet?.kind === 'size' && <>
          <Box><Typography variant="body2" color="text.secondary">Width</Typography><Typography sx={status.strong}>{feet(sheet.size.width_ft)}</Typography>
            <Typography variant="caption" color="text.secondary">A size cannot change width, because rolls and tiling depend on it. For another width, add a new size.</Typography></Box>
          <Box sx={styles.sheetNote}><Typography variant="body2" color="text.secondary">Price</Typography><Typography sx={status.strong}>{nairaLabel(sheet.size.price_kobo)} per sq ft</Typography>
            <Typography variant="caption" color="text.secondary">Set on {sheet.group.name}, and the same for every {sheet.group.name} size. Change it from Edit {sheet.group.name}.</Typography></Box>
          <TextField label="Low-stock warning (ft)" value={lowStock} onChange={(event) => setLowStock(event.target.value)} disabled={busy} slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
          <TextField label="Notes (optional)" value={notes} onChange={(event) => setNotes(event.target.value)} disabled={busy} multiline minRows={2} />
          <FormControlLabel control={<Switch checked={available} disabled={busy} onChange={(event) => setAvailable(event.target.checked)} />} label="Available for new sales and quotes" />
          <Typography variant="caption" color="text.secondary">Turning it off hides this size from New Sale and the Estimator. Its stock still shows on Inventory and in Stock entry.</Typography>
        </>}
        {sheet?.kind === 'add-size' && <>
          <TextField label="Width (ft)" value={width} onChange={(event) => setWidth(event.target.value)} disabled={busy} placeholder="e.g. 6" slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
          <Alert severity="warning">Choose the width carefully. It is fixed once the size is added, because rolls and tiling depend on it. {sheet.group.name} cannot have the same width twice.</Alert>
          <Box sx={styles.sheetNote}><Typography variant="body2" color="text.secondary">Price</Typography><Typography sx={status.strong}>{nairaLabel(sheet.group.price_kobo ?? '0')} per sq ft</Typography>
            <Typography variant="caption" color="text.secondary">Same as every {sheet.group.name} size. Change it from Edit {sheet.group.name}.</Typography></Box>
          <TextField label="Low-stock warning (ft)" value={lowStock} onChange={(event) => setLowStock(event.target.value)} disabled={busy} slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
          <TextField label="Notes (optional)" value={notes} onChange={(event) => setNotes(event.target.value)} disabled={busy} multiline minRows={2} />
          <Typography variant="body2" color="text.secondary">After adding it, add a roll in Stock entry. Until then staff cannot sell this size.</Typography>
        </>}
        {sheet?.kind === 'add-material' && <>
          <TextField label="Name staff see" value={name} onChange={(event) => setName(event.target.value)} disabled={busy} placeholder="e.g. Banner" helperText="Already have this material? Use Add a size on it instead, so the price stays in one place." />
          <TextField label="Selling price per sq ft (₦)" value={price} onChange={(event) => setPrice(event.target.value)} disabled={busy} placeholder="e.g. 280" helperText="One price for every size of this material." slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
          <TextField label="First size: width (ft)" value={width} onChange={(event) => setWidth(event.target.value)} disabled={busy} placeholder="e.g. 6" slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
          <Alert severity="warning">Choose the width carefully. It is fixed once the size is added, because rolls and tiling depend on it. Other sizes can be added later.</Alert>
          <TextField label="Low-stock warning (ft)" value={lowStock} onChange={(event) => setLowStock(event.target.value)} disabled={busy} slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
          <Typography variant="body2" color="text.secondary">After adding it, add a roll in Stock entry. Until then staff cannot sell it.</Typography>
        </>}
      </Stack>
    </ResponsiveSheet>
  </Box>;
}

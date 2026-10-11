"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import NextLink from 'next/link';
import { Alert, Box, Button, LinearProgress, Paper, Skeleton, TextField, Typography } from '@mui/material';
import { ArrowLeft } from 'lucide-react';
import { materialsStyles, inventoryStyles as styles, settingsStyles, statTileStyles, systemStatusStyles as status } from '@/app/theme';
import { ResponsiveSheet } from '@/components/responsive-sheet';
import { StatTile } from '@/components/stat-tile';
import { CountForm, RestockForm, StockNotices, WasteForm } from '@/components/stock/stock-forms';
import { useStockEntry } from '@/components/stock/use-stock-entry';
import { longDate } from '@/lib/bookkeeping-format';
import { feetText, matchStockMaterial, matchStockRoll, nairaExact, nairaWhole, rollRemainingPercent, rollsOfMaterial, searchMaterials, summarizeInventory, toNumber, type FeedRow } from '@/lib/inventory-summary';
import { inStock } from '@/lib/stock-forms';

type Sheet = { kind: 'restock'; materialId: string } | { kind: 'waste'; rollId: string } | { kind: 'count'; rollId: string };
const TITLE = { restock: 'Add roll', waste: 'Log waste', count: 'Count a roll' } as const;
const message = (error: unknown) => (error instanceof Error ? error.message : 'The inventory could not be loaded. Try again.');
const statusTone = (value: string) => (value === 'Active' ? materialsStyles.chipOn : value === 'Low Stock' || value === 'Out of Stock' ? status.chipWarn : materialsStyles.chipOff);
const barColor = (value: string) => (value === 'Active' ? 'success' : value === 'Low Stock' ? 'warning' : 'inherit');

/** The owner's Inventory: what is in stock, what it cost and what it should earn. Roll entry happens in popups that share Stock entry's forms. */
export function InventoryPage() {
  const [materials, setMaterials] = useState<FeedRow[] | null>(null), [rolls, setRolls] = useState<FeedRow[]>([]);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [error, setError] = useState(''), [search, setSearch] = useState(''), [open, setOpen] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null), [sheetKey, setSheetKey] = useState(0), [refreshing, setRefreshing] = useState(false);
  const stock = useStockEntry(staffId);

  const load = useCallback(async () => {
    const [materialsResponse, rollsResponse] = await Promise.all([fetch('/api/materials?all=1', { cache: 'no-store' }), fetch('/api/inventory', { cache: 'no-store' })]);
    const [materialsBody, rollsBody] = await Promise.all([materialsResponse.json().catch(() => null), rollsResponse.json().catch(() => null)]);
    if (!materialsResponse.ok) throw new Error(materialsBody?.error || 'The materials could not be loaded. Try again.');
    if (!rollsResponse.ok) throw new Error(rollsBody?.error || 'The rolls could not be loaded. Try again.');
    setMaterials(materialsBody.data || []); setRolls(rollsBody.data || []);
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      try {
        await load();
        const response = await fetch('/api/accounting/context', { cache: 'no-store' }), body = await response.json().catch(() => null);
        if (active && response.ok && body?.staffId) setStaffId(body.staffId);
      } catch (cause) { if (active) setError(message(cause)); }
    });
    return () => { active = false; };
  }, [load]);

  const refresh = async () => {
    setRefreshing(true); setError('');
    try { await Promise.all([load(), stock.reload()]); } catch (cause) { setError(message(cause)); } finally { setRefreshing(false); }
  };
  const openSheet = (next: Sheet) => { stock.resetRequest(); stock.setError(''); setSheetKey((key) => key + 1); setSheet(next); };
  const saved = () => { setSheet(null); void load().catch((cause) => setError(message(cause))); };

  const summary = useMemo(() => summarizeInventory(materials ?? []), [materials]);
  const shown = useMemo(() => searchMaterials(materials ?? [], search), [materials, search]);
  const sheetOpen = sheet !== null;

  return <Box sx={settingsStyles.page}>
    <Box sx={styles.page}>
      <Button color="inherit" component={NextLink} href="/bom03" startIcon={<ArrowLeft size={18} />} sx={status.note}>Dashboard</Button>
      <Box sx={styles.head}>
        <Typography variant="h3" component="h1">Inventory</Typography>
        <Typography color="text.secondary">Rolls in stock, what they cost and what they should earn.</Typography>
      </Box>
      <Box sx={styles.actions}>
        <Button variant="contained" sx={styles.grow} disabled={!stock.ready} onClick={() => openSheet({ kind: 'restock', materialId: '' })}>Add roll</Button>
        <Button variant="outlined" color="inherit" disabled={refreshing} onClick={() => void refresh()}>{refreshing ? 'Refreshing…' : 'Refresh'}</Button>
      </Box>
      {error && <Alert severity="error">{error}</Alert>}
      {!sheetOpen && <StockNotices stock={stock} />}
      <TextField type="search" label="Search materials" placeholder="Name or code, e.g. Flex or SAV-4FT" value={search} onChange={(event) => setSearch(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />

      {!materials && !error && <Box sx={status.stack}>{[0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={140} />)}</Box>}
      {materials && <>
        <Box sx={statTileStyles.grid3}>
          <StatTile label="Active" value={summary.active} tone="success" />
          <StatTile label="Low stock" value={summary.low} tone={summary.low > 0 ? 'warning' : 'neutral'} />
          <StatTile label="Out of stock" value={summary.out} tone={summary.out > 0 ? 'warning' : 'neutral'} />
        </Box>
        <Box sx={statTileStyles.grid4}>
          <StatTile label="Spent on rolls" value={nairaWhole(summary.spent)} />
          <StatTile label="Cost still in stock" value={nairaWhole(summary.remainingCost)} />
          <StatTile label="Earned so far" value={nairaWhole(summary.earned)} />
          <StatTile label="Still to earn" value={nairaWhole(summary.stillToEarn)} />
        </Box>
        <StatTile wide tone="primary" label="Total expected revenue" value={nairaWhole(summary.total)} />

        <Typography variant="overline" sx={styles.label}>Materials</Typography>
        {materials.length === 0 && <Alert severity="info">There are no materials yet. Add one in Settings → Materials.</Alert>}
        {materials.length > 0 && shown.length === 0 && <Alert severity="info">No material matches &ldquo;{search}&rdquo;.</Alert>}
        <Box sx={styles.cards}>
          {shown.map((row) => {
            const code = row['Material ID'], isOpen = open === code, off = row.Available === 'No', name = `${row['Material Name']} ${Number(row['Width (ft)'])} ft`;
            const sizeRolls = rollsOfMaterial(rolls, code), rollCount = toNumber(row['Roll Count']);
            const stockMaterial = matchStockMaterial(stock.materials, row);
            return <Paper key={code} variant="outlined" sx={[status.card, off && styles.cardOff, isOpen && styles.cardOpen]}>
              <Box sx={styles.titleLine}>
                <Box>
                  <Typography variant="h6" component="h2" sx={styles.name}>{row['Material Name']} <Typography component="span" sx={styles.width}>· {Number(row['Width (ft)'])} ft wide</Typography></Typography>
                  <Typography variant="caption" sx={styles.code}>{code}</Typography>
                </Box>
                <Box sx={styles.chips}>
                  {off && <Box component="span" sx={[status.chip, materialsStyles.chipOff]}>Turned off</Box>}
                  <Box component="span" sx={[status.chip, statusTone(row.Status)]}>{row.Status}</Box>
                </Box>
              </Box>
              <Box sx={status.line}>
                <Typography variant="body2" color="text.secondary">{rollCount === 0 ? 'No rolls yet' : `${rollCount} roll${rollCount === 1 ? '' : 's'}`}</Typography>
                <Typography sx={styles.strong}>{feetText(toNumber(row['Total Remaining (ft)']))} left</Typography>
              </Box>
              <Button color="inherit" variant="outlined" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : code)}>{isOpen ? 'Hide rolls' : 'Show rolls'}</Button>
              {isOpen && <>
                <Box sx={styles.twoUp}>
                  <StatTile label="Cost still in stock" value={nairaWhole(toNumber(row['Total Remaining Asset Value']))} />
                  <StatTile label="Still to earn" value={nairaWhole(toNumber(row['Total Remaining Revenue']))} />
                </Box>
                <Box sx={styles.priceLine}>
                  <Typography variant="body2">Price {nairaExact(toNumber(row['Selling Price']))} per sq ft, set in Settings</Typography>
                  <Button size="small" color="inherit" variant="outlined" component={NextLink} href="/bom03/settings/materials">Edit material</Button>
                </Box>
                <Typography variant="overline" sx={styles.label}>Rolls</Typography>
                {sizeRolls.length === 0 && <Typography variant="body2" color="text.secondary">No rolls yet. Add one below.</Typography>}
                {sizeRolls.map((roll) => {
                  const stockRoll = matchStockRoll(stock.rolls, roll), live = stockRoll ? inStock(stockRoll) : false;
                  return <Box key={roll['Roll ID']} sx={[styles.roll, !live && styles.rollOut]}>
                    <Box sx={styles.rollHead}>
                      <Typography sx={styles.strong}>{roll['Roll ID']}</Typography>
                      <Box component="span" sx={[status.chip, statusTone(roll.Status)]}>{roll.Status}</Box>
                    </Box>
                    <Box sx={styles.progressRow}>
                      <LinearProgress variant="determinate" value={rollRemainingPercent(roll)} color={barColor(roll.Status)} sx={styles.progress} aria-label={`${roll['Roll ID']} remaining`} />
                      <Typography variant="body2" sx={styles.nowrap}>{feetText(toNumber(roll['Remaining Length (ft)']))} of {feetText(toNumber(roll['Total Length (ft)']))}</Typography>
                    </Box>
                    <Typography variant="body2" color="text.secondary">{roll['Date Added'] ? `Bought ${longDate(roll['Date Added'])} · ` : ''}{nairaExact(toNumber(roll.Cost))}</Typography>
                    {stockRoll && <Box sx={styles.rollActions}>
                      {live && <Button color="inherit" variant="outlined" sx={styles.rollButton} onClick={() => openSheet({ kind: 'waste', rollId: stockRoll.id })}>Log waste</Button>}
                      <Button color="inherit" variant="outlined" sx={styles.rollButton} onClick={() => openSheet({ kind: 'count', rollId: stockRoll.id })}>Count</Button>
                    </Box>}
                  </Box>;
                })}
                <Button variant="contained" disabled={!stockMaterial} onClick={() => stockMaterial && openSheet({ kind: 'restock', materialId: stockMaterial.id })}>Add a {name} roll</Button>
              </>}
            </Paper>;
          })}
        </Box>
      </>}
    </Box>

    <ResponsiveSheet open={sheetOpen} onClose={() => setSheet(null)} busy={stock.busy} title={sheet ? TITLE[sheet.kind] : TITLE.restock}>
      <Box sx={styles.sheetBody}>
        <StockNotices stock={stock} />
        {sheet?.kind === 'restock' && <RestockForm key={sheetKey} stock={stock} materialId={sheet.materialId} onSaved={saved} onCancel={() => setSheet(null)} />}
        {sheet?.kind === 'waste' && <WasteForm key={sheetKey} stock={stock} rollId={sheet.rollId} onSaved={saved} onCancel={() => setSheet(null)} />}
        {sheet?.kind === 'count' && <CountForm key={sheetKey} stock={stock} rollId={sheet.rollId} onSaved={saved} onCancel={() => setSheet(null)} />}
      </Box>
    </ResponsiveSheet>
  </Box>;
}

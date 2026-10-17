"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, LinearProgress, Paper, TextField, Typography } from '@mui/material';
import { LoadingState } from '@/components/loading-state';

import { inventoryStyles as styles, settingsStyles, statTileStyles, systemStatusStyles as status } from '@/app/theme';
import { MaterialSizeSummary, barColor } from '@/components/inventory/material-size-summary';
import { StatTile } from '@/components/stat-tile';
import { searchMaterials, summarizeInventory, toNumber, type FeedRow } from '@/lib/inventory-summary';
import { BackLink } from '@/components/back-link';

const message = (error: unknown) => (error instanceof Error ? error.message : 'The stock could not be loaded. Try again.');
const leftPercent = (row: FeedRow) => {
  const capacity = toNumber(row['Total Capacity (ft)']);
  return capacity > 0 ? Math.max(0, Math.min(100, Math.round((toNumber(row['Total Remaining (ft)']) / capacity) * 100))) : 0;
};

/**
 * The cashier's Stock check: what can be sold right now. It reads the selling feed, which leaves out turned-off sizes and (in the new
 * books) every cost and earnings figure, so there is nothing here a cashier should not see. Works the same on Sheets and the new books.
 */
export function CashierInventoryPage() {
  const [materials, setMaterials] = useState<FeedRow[] | null>(null);
  const [error, setError] = useState(''), [search, setSearch] = useState(''), [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch('/api/materials', { cache: 'no-store' });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error || 'The stock could not be loaded. Try again.');
    setMaterials(body.data || []);
  }, []);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => { try { await load(); } catch (cause) { if (active) setError(message(cause)); } });
    return () => { active = false; };
  }, [load]);
  const refresh = async () => { setRefreshing(true); setError(''); try { await load(); } catch (cause) { setError(message(cause)); } finally { setRefreshing(false); } };

  const summary = useMemo(() => summarizeInventory(materials ?? []), [materials]);
  const shown = useMemo(() => searchMaterials(materials ?? [], search), [materials, search]);

  return <Box sx={settingsStyles.page}>
    <Box sx={styles.page}>
      <BackLink href="/cashier" label="Home" />
      <Box sx={styles.head}>
        <Typography variant="h3" component="h1">Stock check</Typography>
        <Typography color="text.secondary">What you can sell right now. Check here before logging a sale.</Typography>
      </Box>
      <Button variant="outlined" disabled={refreshing} onClick={() => void refresh()}>{refreshing ? 'Refreshing…' : 'Refresh'}</Button>
      {error && <Alert severity="error">{error}</Alert>}
      <TextField type="search" label="Search materials" placeholder="Name or code, e.g. Flex or SAV-4FT" value={search} onChange={(event) => setSearch(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />

      {!materials && !error && <LoadingState pieces={[{ k: 'tiles', n: 3, cols: 3 }, { k: 'cards', n: 3 }]} label="Loading stock" />}
      {materials && <>
        <Box sx={statTileStyles.grid3}>
          <StatTile label="Available" value={summary.active} tone="success" />
          <StatTile label="Low stock" value={summary.low} tone={summary.low > 0 ? 'warning' : 'neutral'} />
          <StatTile label="Out of stock" value={summary.out} tone={summary.out > 0 ? 'warning' : 'neutral'} />
        </Box>
        {materials.length === 0 && <Alert severity="info">There is nothing to sell yet. Ask the owner to add stock.</Alert>}
        {materials.length > 0 && shown.length === 0 && <Box sx={[status.card, styles.stockNote]}><Typography sx={styles.strong}>No material matches &ldquo;{search}&rdquo;</Typography><Typography variant="body2">Try a shorter name, or clear the search.</Typography></Box>}
        <Box sx={styles.cards}>
          {shown.map((row) => <Paper key={row['Material ID']} variant="outlined" sx={[status.card, row.Status === 'Low Stock' && status.cardWarn, row.Status === 'Out of Stock' && styles.cardOut]}>
            <MaterialSizeSummary row={row} forCashier />
            <LinearProgress variant="determinate" value={leftPercent(row)} color={barColor(row.Status)} sx={styles.progress} aria-label={`${row['Material Name']} stock left`} />
            {row.Status === 'Low Stock' && <Typography variant="body2" sx={status.testNote}>Running low. Tell the owner.</Typography>}
            {row.Status === 'Out of Stock' && <Typography variant="body2" sx={styles.stockNote}>Not available right now.</Typography>}
          </Paper>)}
        </Box>
        <Typography variant="body2" color="text.secondary" sx={status.note}>Materials the owner has turned off are not listed, because they cannot be sold.</Typography>
      </>}
    </Box>
  </Box>;
}

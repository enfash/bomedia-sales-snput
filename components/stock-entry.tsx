"use client";

import { useState } from 'react';
import { Box, Paper, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { CountForm, RestockForm, StockNotices, WasteForm } from '@/components/stock/stock-forms';
import { useStockEntry } from '@/components/stock/use-stock-entry';
import { settingsStyles, stockFormStyles, systemStatusStyles } from '@/app/theme';

type Tab = 'restocks' | 'waste' | 'stock-counts';

// Stock entry: the owner restocks, logs waste or corrects a roll; a cashier only logs waste. The forms are shared with the Inventory popups.
export function StockEntry({ staffId, isOwner = false }: { staffId: string; isOwner?: boolean }) {
  const stock = useStockEntry(staffId);
  const [tab, setTab] = useState<Tab>(isOwner ? 'restocks' : 'waste');
  return <Box sx={settingsStyles.page}>
    <Box sx={[settingsStyles.heading, systemStatusStyles.stack]}>
      <Typography variant="h3" component="h1">Stock</Typography>
      <Typography color="text.secondary">{isOwner ? 'Restock rolls, log waste or correct a roll after measuring it.' : 'Log material wasted from a roll.'}</Typography>
    </Box>
    <Box sx={systemStatusStyles.stack}>
      <StockNotices stock={stock} />
      <Paper variant="outlined" sx={stockFormStyles.panel}>
        <Box sx={stockFormStyles.form}>
          {isOwner && <ToggleButtonGroup exclusive fullWidth color="primary" aria-label="What are you recording?" value={tab} disabled={stock.locked}
            onChange={(_, value: Tab | null) => { if (value) { setTab(value); stock.resetRequest(); } }}>
            <ToggleButton value="restocks">Restock</ToggleButton><ToggleButton value="waste">Waste</ToggleButton><ToggleButton value="stock-counts">Count</ToggleButton>
          </ToggleButtonGroup>}
          {tab === 'restocks' ? <RestockForm key="restocks" stock={stock} /> : tab === 'waste' ? <WasteForm key="waste" stock={stock} /> : <CountForm key="count" stock={stock} />}
        </Box>
      </Paper>
    </Box>
  </Box>;
}

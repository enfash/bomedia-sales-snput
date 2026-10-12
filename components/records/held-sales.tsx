"use client";

import { useCallback, useEffect, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';

import { heldSalesStyles as styles, approvalInboxStyles as pills } from '@/app/theme';
import { STATUS_LABEL, koboNaira, rowItems, rowTotalKobo, type ApprovalRow } from '@/lib/approvals-view';

const DISMISSED = 'bomedia-held-dismissed';
const readDismissed = (): string[] => { try { return JSON.parse(localStorage.getItem(DISMISSED) || '[]'); } catch { return []; } };

/** The cashier's own sales that the owner has not approved yet, or turned down. Approved ones are ordinary sales and appear in the list below. */
export function HeldSales() {
  const [rows, setRows] = useState<ApprovalRow[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/accounting/approvals?mine=1', { cache: 'no-store' });
      const result = await response.json().catch(() => null);
      if (response.ok && Array.isArray(result?.data)) { setRows(result.data); setDismissed(readDismissed()); }
    } catch { /* Offline: keep what was shown. */ }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
    const timer = setInterval(() => void load(), 30000);
    window.addEventListener('bomedia-data-changed', load);
    return () => { clearInterval(timer); window.removeEventListener('bomedia-data-changed', load); };
  }, [load]);

  const shown = rows.filter((r) => (r.status === 'pending' || r.status === 'declined' || r.status === 'expired') && !dismissed.includes(r.id));
  if (!shown.length) return null;
  const dismiss = (id: string) => { const next = [...readDismissed(), id]; try { localStorage.setItem(DISMISSED, JSON.stringify(next.slice(-200))); } catch { /* Not remembered. */ } setDismissed(next); };

  return <Box sx={styles.list} aria-label="Sales waiting for the owner">
    {shown.map((row) => <Box key={row.id} sx={[styles.card, row.status === 'pending' ? styles.cardWaiting : styles.cardDeclined]}>
      <Box sx={styles.top}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={styles.client}>{row.summary?.client || 'A sale'}</Typography>
          <Typography sx={styles.sub}>{rowItems(row) || 'Sale'}</Typography>
        </Box>
        <Typography sx={styles.amount}>{koboNaira(rowTotalKobo(row))}</Typography>
      </Box>
      <Box sx={pills.pillRow}>
        <Box component="span" sx={row.status === 'pending' ? pills.pillWaiting : row.status === 'declined' ? pills.pillDeclined : pills.pillExpired}>
          {row.status === 'declined' ? 'Declined by the owner' : STATUS_LABEL[row.status]}
        </Box>
      </Box>
      {row.status === 'pending' && <Typography sx={styles.sub}>Not recorded yet. No money is counted and no stock is taken until the owner approves.</Typography>}
      {row.status === 'expired' && <Typography sx={styles.sub}>The owner did not decide in time. Enter the sale again from New Sale.</Typography>}
      {row.status === 'declined' && <>
        {row.decision_note && <Box sx={styles.note}>“{row.decision_note}”</Box>}
        <Typography sx={styles.sub}>It was not recorded. Enter it again from New Sale if it should go ahead.</Typography>
      </>}
      {row.status !== 'pending' && <Button color="inherit" variant="outlined" sx={styles.dismiss} onClick={() => dismiss(row.id)}>Dismiss</Button>}
    </Box>)}
  </Box>;
}

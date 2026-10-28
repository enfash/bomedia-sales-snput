"use client";

import Link from 'next/link';
import { Alert, Box, Button, Typography } from '@mui/material';
import { ResponsiveSheet } from '@/components/responsive-sheet';
import { expenseStyles as styles } from '@/app/theme';
import { formatKobo } from '@/lib/accounting-money';
import type { StockPurchase } from '@/lib/spending-list';

export function StockPurchaseDetails({ purchase, onClose }: { purchase: StockPurchase | null; onClose: () => void }) {
  return <ResponsiveSheet open={Boolean(purchase)} onClose={onClose} title="Stock purchase">
    {purchase && <Box sx={styles.sheetBody}>
      <Typography variant="h5">{formatKobo(purchase.amount_kobo)} · Paid</Typography>
      <Typography>{purchase.description}</Typography>
      <Box sx={styles.facts}>
        {[
          ['Purchase date', purchase.business_date], ['Payment account', purchase.payment_account || 'Not recorded'],
          ['Logged by', purchase.logged_by || 'Not recorded'], ['Invoice or receipt number', purchase.reference || 'Not recorded'],
        ].map(([label, value]) => <Box key={label}>
          <Typography variant="caption" sx={styles.factLabel}>{label}</Typography>
          <Typography sx={styles.factValue}>{value}</Typography>
        </Box>)}
      </Box>
      {purchase.note && <Typography sx={styles.factValue}>{purchase.note}</Typography>}
      <Alert severity="info">Payment was recorded when these rolls were added to stock. Do not log another expense for this purchase. Material cost affects profit as the stock is used.</Alert>
      <Button component={Link} href="/bom03/inventory" variant="outlined">View inventory</Button>
    </Box>}
  </ResponsiveSheet>;
}

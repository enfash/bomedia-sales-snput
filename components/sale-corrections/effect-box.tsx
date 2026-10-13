"use client";

import { Box, Typography } from '@mui/material';

import { saleChangeStyles as styles } from '@/app/theme';
import { effectOf } from '@/lib/sale-corrections-view';
import type { CorrectionPlan } from '@/lib/server/sale-corrections';

/** "What this will do": the sale total, the stock, what was already paid, and any credit left on the account. */
export function EffectBox({ plans, cancel = false, whoApproves = false }: { plans: CorrectionPlan[]; cancel?: boolean; whoApproves?: boolean }) {
  const e = effectOf(plans);
  return <Box sx={[styles.effect, ...(cancel ? [styles.effectCancel] : [])]}>
    <Typography sx={styles.strong}>What this will do</Typography>
    <Box sx={styles.effectLine}><Typography color="text.secondary">Sale total</Typography>
      <Typography sx={styles.effectValue}><Box component="span" sx={styles.was}>{e.oldText}</Box>→ {e.newText}</Typography></Box>
    <Box sx={styles.effectLine}><Typography color="text.secondary">Stock</Typography><Typography sx={styles.effectValue}>{e.stock}</Typography></Box>
    <Box sx={styles.effectLine}><Typography color="text.secondary">Already paid</Typography><Typography sx={styles.effectValue}>{e.paidText}</Typography></Box>
    {e.credit > 0 && <Typography variant="body2">{e.creditText} stays on the customer’s account as credit. Nothing is refunded automatically.</Typography>}
    {whoApproves && <Typography variant="caption" color="text.secondary">Nothing changes until the owner approves.</Typography>}
  </Box>;
}

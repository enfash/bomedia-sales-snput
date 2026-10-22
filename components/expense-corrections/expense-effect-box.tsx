"use client";

import { Box, Typography } from '@mui/material';

import { saleChangeStyles as styles } from '@/app/theme';
import { expenseEffectOf } from '@/lib/expense-corrections-view';
import type { ExpensePlan } from '@/lib/server/expense-corrections';

/** "What this will do" for an expense: the amount, what was already paid out, and what is held to recover. */
export function ExpenseEffectBox({ plan, cancel = false, whoApproves = false }: { plan: ExpensePlan; cancel?: boolean; whoApproves?: boolean }) {
  const e = expenseEffectOf(plan);
  return <Box sx={[styles.effect, ...(cancel ? [styles.effectCancel] : [])]}>
    <Typography sx={styles.strong}>What this will do</Typography>
    <Box sx={styles.effectLine}><Typography color="text.secondary">Expense</Typography>
      <Typography sx={styles.effectValue}><Box component="span" sx={styles.was}>{e.oldText}</Box>→ {e.newText}</Typography></Box>
    {e.paid
      ? <>
        <Box sx={styles.effectLine}><Typography color="text.secondary">Already paid out</Typography><Typography sx={styles.effectValue}>{e.paidText}</Typography></Box>
        {e.excess > 0 && <Box sx={styles.effectLine}><Typography color="text.secondary">To recover</Typography><Typography sx={styles.effectValue}>{e.excessText}</Typography></Box>}
      </>
      : <Box sx={styles.effectLine}><Typography color="text.secondary">Still owed</Typography><Typography sx={styles.effectValue}>{e.owedText}</Typography></Box>}
    {e.paid && e.excess > 0 && <Typography variant="body2">The cash already left, so it is not put back. {e.excessText} is kept as “paid out, to recover” until you get it back.</Typography>}
    {whoApproves && <Typography variant="caption" color="text.secondary">Nothing changes until the owner approves.</Typography>}
  </Box>;
}

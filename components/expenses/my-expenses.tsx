"use client";

import { useCallback, useEffect, useState } from 'react';
import { Box, ButtonBase, Paper, Typography } from '@mui/material';
import { LoadingState } from '@/components/loading-state';
import { Receipt } from 'lucide-react';

import { expenseStyles as styles } from '@/app/theme';
import { ExpenseDetailsSheet } from '@/components/expenses/expense-details-sheet';
import { CorrectedTag } from '@/components/corrected-tag';
import { StatusBadge } from '@/components/status-badge';
import { expenseAmount, naira, type Expense } from '@/lib/expense-list';

/** The cashier's own expenses from today. Tapping one opens it, where they can ask to correct or cancel it when the owner allows that. */
export function MyExpenses({ refreshKey = 0 }: { refreshKey?: number }) {
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [viewing, setViewing] = useState<Expense | null>(null);
  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/expenses', { cache: 'no-store' }), result = await response.json();
      if (!response.ok || !Array.isArray(result.data)) throw new Error();
      setExpenses([...(result.data as Expense[])].reverse());
    } catch { setExpenses((current) => current ?? []); }
  }, []);
  // Reload when the page saves one, and again when the saved entry is confirmed by the server (it arrives a moment after).
  useEffect(() => {
    void Promise.resolve().then(load);
    const reload = () => void load();
    window.addEventListener('bomedia-data-changed', reload);
    window.addEventListener('bomedia-expense-confirmed', reload);
    return () => { window.removeEventListener('bomedia-data-changed', reload); window.removeEventListener('bomedia-expense-confirmed', reload); };
  }, [load, refreshKey]);

  if (!expenses) return <LoadingState pieces={[{ k: 'list', n: 3 }]} label="Loading your expenses" />;
  if (!expenses.length) return null;
  return <Box sx={styles.day}>
    <Box sx={styles.dayHead}><Typography variant="overline" sx={styles.dayLabel}>YOUR EXPENSES TODAY</Typography></Box>
    <Paper variant="outlined" sx={styles.group}>
      {expenses.map((expense, i) => <Box key={expense._expenseId ?? expense._rowIndex ?? i} sx={styles.row}>
        <ButtonBase onClick={() => setViewing(expense)} sx={styles.rowButton} aria-label={`${expense.CATEGORY}, ${naira(expenseAmount(expense))}. Open details`}>
          <Box component="span" sx={styles.iconTile}><Receipt size={18} /></Box>
          <Box sx={styles.rowMain}>
            <Typography component="span" sx={styles.category}>{expense.CATEGORY}</Typography>
            {(expense['PAID TO'] || expense.DESCRIPTION) && <Typography variant="body2" component="span" sx={styles.meta}>{[expense['PAID TO'], expense.DESCRIPTION].filter(Boolean).join(' · ')}</Typography>}
          </Box>
          <Box component="span" sx={styles.rowEnd}>
            <Typography component="span" sx={styles.amount}>{naira(expenseAmount(expense))}</Typography>
            <StatusBadge variant="expenses" status={expense.STATUS || 'Unpaid'} />
            {expense.STATUS !== 'Cancelled' && <CorrectedTag revisions={expense._revisions} />}
          </Box>
        </ButtonBase>
      </Box>)}
    </Paper>
    <ExpenseDetailsSheet expense={viewing} canPay={false} onClose={() => setViewing(null)} onToggle={async () => undefined} onChanged={() => void load()} />
  </Box>;
}

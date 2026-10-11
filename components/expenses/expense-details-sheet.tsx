"use client";

import { useState } from 'react';
import { Alert, Box, Button, Typography } from '@mui/material';
import { ExternalLink } from 'lucide-react';
import { expenseStyles as styles, settingsStyles } from '@/app/theme';
import { ResponsiveSheet } from '@/components/responsive-sheet';
import { StatusBadge } from '@/components/status-badge';
import { expenseAmount, isPaidExpense, naira, type Expense } from '@/lib/expense-list';

/** The expense page's rule for when "Mark as paid" is offered: the old Sheets books allow either direction; the new books only pay a payable, unpaid expense. */
export function canMarkPaid(expense: Expense) {
  return expense._backend === 'postgres' ? !isPaidExpense(expense) && !!expense._payable : !isPaidExpense(expense);
}
export const needsOpeningReview = (expense: Expense) => expense._backend === 'postgres' && !isPaidExpense(expense) && !expense._payable;
const canMarkUnpaid = (expense: Expense) => expense._backend !== 'postgres' && isPaidExpense(expense);

const dateTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const longDay = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value || '—' : date.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
};

function Fact({ label, children, muted = false }: { label: string; children: string; muted?: boolean }) {
  return <Box>
    <Typography variant="overline" sx={styles.factLabel}>{label}</Typography>
    <Typography sx={muted ? styles.factMuted : styles.factValue}>{children}</Typography>
  </Box>;
}

export function ExpenseDetailsSheet({ expense, onClose, onToggle }: {
  expense: Expense | null;
  onClose: () => void;
  onToggle: (expense: Expense, newStatus: 'Paid' | 'Unpaid') => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const paid = expense ? isPaidExpense(expense) : false;

  async function toggle() {
    if (!expense || busy) return;
    setBusy(true);
    try { await onToggle(expense, paid ? 'Unpaid' : 'Paid'); onClose(); } finally { setBusy(false); }
  }

  const action = !expense ? null : canMarkPaid(expense) ? 'Mark as paid' : canMarkUnpaid(expense) ? 'Mark as unpaid' : null;
  return <ResponsiveSheet open={!!expense} onClose={onClose} title={expense?.CATEGORY || 'Expense'} description={expense ? `${longDay(expense.DATE)}${expense['PAID TO'] ? ` · ${expense['PAID TO']}` : ''}` : undefined} busy={busy}
    footer={<Box sx={settingsStyles.footer}>
      <Button color="inherit" disabled={busy} onClick={onClose}>Close</Button>
      {action && <Button variant="contained" disabled={busy} onClick={() => void toggle()}>{busy ? 'Saving…' : action}</Button>}
    </Box>}>
    {expense && <Box sx={styles.sheetBody}>
      <Box sx={paid ? styles.amountPaid : styles.amountOwed}>
        <Box>
          <Typography variant="overline" sx={paid ? styles.amountLabel : styles.amountLabelOwed}>{paid ? 'AMOUNT PAID' : 'AMOUNT OWED'}</Typography>
          <Typography variant="h5" component="p" sx={styles.amountValue}>{naira(expenseAmount(expense))}</Typography>
        </Box>
        <StatusBadge variant="expenses" status={expense.STATUS || 'Unpaid'} />
      </Box>

      <Box sx={styles.facts}>
        <Fact label="PAID TO" muted={!expense['PAID TO']}>{expense['PAID TO'] || '—'}</Fact>
        <Fact label="LOGGED BY" muted={!expense['Logged By']}>{expense['Logged By'] || '—'}</Fact>
        <Fact label="METHOD" muted={!expense['PAYMENT METHOD']}>{expense['PAYMENT METHOD'] || (paid ? '—' : 'Chosen when paid')}</Fact>
        <Fact label="CATEGORY">{expense.CATEGORY || '—'}</Fact>
      </Box>

      {expense.DESCRIPTION && <Box>
        <Typography variant="overline" sx={styles.factLabel}>NOTE</Typography>
        <Typography>{expense.DESCRIPTION}</Typography>
      </Box>}

      {expense['RECEIPT URL'] && <Box component="a" href={expense['RECEIPT URL']} target="_blank" rel="noopener noreferrer" sx={styles.receiptRow}>
        <Typography sx={styles.receiptLabel}>Receipt photo</Typography>
        <Typography component="span" sx={styles.receiptView}>View</Typography>
        <ExternalLink size={16} />
      </Box>}

      {paid && expense['PAID BY'] && <Typography variant="body2" color="success.main">
        Marked paid by <strong>{expense['PAID BY']}</strong>{expense['PAID AT'] ? ` on ${dateTime(expense['PAID AT'])}` : ''}
      </Typography>}
      {needsOpeningReview(expense) && <Alert severity="warning">Opening balance review required. This historical expense has no accepted liability in the books yet. Keep its original amount, date and receipt for the final-import reconciliation.</Alert>}
      {expense._backend === 'postgres' && canMarkPaid(expense) && <Typography variant="body2" sx={styles.hint}>You will choose how it was paid and the date, then confirm.</Typography>}
      {expense['EXPENSE ID'] && <Typography variant="caption" color="text.secondary">{expense['EXPENSE ID']}</Typography>}
    </Box>}
  </ResponsiveSheet>;
}

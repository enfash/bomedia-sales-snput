"use client";

import { useState } from 'react';
import { Alert, Box, Button, Typography } from '@mui/material';
import { ExternalLink } from 'lucide-react';
import { expenseStyles as styles, saleChangeStyles as changeStyles, settingsStyles } from '@/app/theme';
import { ResponsiveSheet } from '@/components/responsive-sheet';
import { StatusBadge } from '@/components/status-badge';
import { RecoverExpenseSheet } from '@/components/expense-corrections/recover-expense-sheet';
import { CancelExpenseSheet } from '@/components/expense-corrections/cancel-expense-sheet';
import { CorrectExpenseSheet } from '@/components/expense-corrections/correct-expense-sheet';
import { ExpenseHistory } from '@/components/expense-corrections/expense-history';
import { useCorrectionAccess } from '@/components/sale-corrections/use-correction-access';
import { lagosBusinessDate } from '@/lib/accounting-entry';
import { koboNaira } from '@/lib/approvals-view';
import { expenseChangeable, expenseDateOf } from '@/lib/expense-corrections-view';
import { expenseAmount, isPaidExpense, naira, type Expense } from '@/lib/expense-list';
import { canChangeSale } from '@/lib/sale-corrections-view';

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

export function ExpenseDetailsSheet({ expense, onClose, onToggle, onChanged, canPay = true }: {
  expense: Expense | null;
  onClose: () => void;
  onToggle: (expense: Expense, newStatus: 'Paid' | 'Unpaid') => Promise<void>;
  onChanged?: () => void;
  /** The owner records payments; a cashier looking at their own expense is not offered "Mark as paid". */
  canPay?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const access = useCorrectionAccess();
  const [changing, setChanging] = useState<'correct' | 'cancel' | 'recover' | null>(null);
  const [changes, setChanges] = useState(0);
  const cancelled = expense?.STATUS === 'Cancelled';
  const mayChange = !!expense && expenseChangeable(expense) && canChangeSale(access, expenseDateOf(expense.DATE), lagosBusinessDate());
  const reference = expense?.['EXPENSE ID'] ?? '';
  const toRecover = Number(expense?._toRecover ?? 0);
  const paid = expense ? isPaidExpense(expense) : false;

  async function toggle() {
    if (!expense || busy) return;
    setBusy(true);
    try { await onToggle(expense, paid ? 'Unpaid' : 'Paid'); onClose(); } finally { setBusy(false); }
  }

  const action = !expense || !canPay ? null : canMarkPaid(expense) ? 'Mark as paid' : canMarkUnpaid(expense) ? 'Mark as unpaid' : null;
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
      {canPay && expense._backend === 'postgres' && canMarkPaid(expense) && <Typography variant="body2" sx={styles.hint}>You will choose how it was paid and the date, then confirm.</Typography>}
      {toRecover > 0 && <Box sx={changeStyles.recover}>
        <Typography sx={changeStyles.strong}>{koboNaira(toRecover)} to recover{expense['PAID TO'] ? ` from ${expense['PAID TO']}` : ''}</Typography>
        <Typography variant="body2" color="text.secondary">The cash already left. This is kept as “paid out, to recover” until it comes back.</Typography>
        {access?.isOwner && <Button variant="outlined" onClick={() => setChanging('recover')}>Record money received</Button>}
      </Box>}
      {cancelled ? <Box component="span" sx={changeStyles.cancelled}>Cancelled</Box> : changes > 0 && <Box component="span" sx={changeStyles.corrected}>Corrected {changes === 1 ? '1 time' : `${changes} times`}</Box>}
      {mayChange && <Box sx={changeStyles.actionsRow}>
        <Button variant="contained" onClick={() => setChanging('correct')}>Correct this expense</Button>
        <Button variant="outlined" color="error" onClick={() => setChanging('cancel')}>Cancel expense</Button>
      </Box>}
      {mayChange && <Typography variant="body2" color="text.secondary">Nothing is erased. Changes are kept in the history below.{access && !access.isOwner ? ` You can ask for a change up to ${access.days} days after; the owner approves it.` : ''}</Typography>}
      {/^EXP-/.test(reference) && <ExpenseHistory reference={reference} onLoaded={setChanges} />}
      {expense['EXPENSE ID'] && <Typography variant="caption" color="text.secondary">{expense['EXPENSE ID']}</Typography>}
    </Box>}
    {expense && changing === 'correct' && <CorrectExpenseSheet expense={expense} owner={!!access?.isOwner} onClose={() => setChanging(null)} onDone={() => { setChanging(null); onChanged?.(); onClose(); }} />}
    {expense && changing === 'recover' && <RecoverExpenseSheet reference={reference} payee={expense['PAID TO'] || expense.CATEGORY} toRecoverKobo={toRecover} onClose={() => setChanging(null)} onDone={() => { setChanging(null); onChanged?.(); onClose(); }} />}
    {expense && changing === 'cancel' && <CancelExpenseSheet reference={reference} label={expense.CATEGORY} owner={!!access?.isOwner} onClose={() => setChanging(null)} onDone={() => { setChanging(null); onChanged?.(); onClose(); }} />}
  </ResponsiveSheet>;
}

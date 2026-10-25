"use client";

import { useState, useSyncExternalStore } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Paper, Typography } from '@mui/material';
import { toast } from 'sonner';

import { heldOldExpenseStyles as styles } from '@/app/theme';
import { ExpenseEntry } from '@/components/expense-entry';
import { ResponsiveSheet } from '@/components/responsive-sheet';
import { describeHeldLine, heldOldExpenses, prefillRow, type HeldExpense } from '@/lib/held-old-expenses';
import { cachedPaymentContext } from '@/lib/payment-outbox';
import { useSyncStore } from '@/lib/store';

const noSubscription = () => () => undefined;
const useMounted = () => useSyncExternalStore(noSubscription, () => true, () => false);

/**
 * Expenses this phone saved under the old Sheets app. The sync manager holds them (it never sends them to the new books);
 * here the person can enter one again through the normal Log expense form, or remove it from the phone.
 */
export function HeldOldExpenses({ onSaved }: { onSaved?: () => void }) {
  const mounted = useMounted();
  const queue = useSyncStore((state) => state.pendingQueue);
  const removeEntry = useSyncStore((state) => state.removeEntry);
  const [again, setAgain] = useState<HeldExpense | null>(null);
  const [removing, setRemoving] = useState<HeldExpense | null>(null);

  const held = mounted ? heldOldExpenses(queue, cachedPaymentContext(localStorage)?.backend ?? null) : [];
  if (!held.length) return null;
  const receipt = again?.lines.some((line) => line.hadReceipt);

  return <>
    <Paper variant="outlined" sx={styles.card}>
      <Box>
        <Typography sx={styles.title}>{held.length === 1 ? '1 expense was saved before the new books' : `${held.length} expenses were saved before the new books`}</Typography>
        <Typography variant="body2" sx={styles.hint}>They are still on this phone and have not been recorded. Enter each one again, or remove it if it was already entered another way.</Typography>
      </Box>
      {held.map((entry) => <Box key={entry.id} sx={styles.row}>
        <Box sx={styles.lines}>{entry.lines.map((line, i) => <Typography key={i} variant="body2" sx={styles.line}>{describeHeldLine(line)}</Typography>)}</Box>
        <Box sx={styles.actions}>
          <Button variant="contained" size="small" sx={styles.button} onClick={() => setAgain(entry)}>Enter again</Button>
          <Button variant="outlined" color="error" size="small" sx={styles.button} onClick={() => setRemoving(entry)}>Remove from this phone</Button>
        </Box>
      </Box>)}
    </Paper>

    <ResponsiveSheet open={again !== null} onClose={() => setAgain(null)} title="Enter this expense again">
      {again && <>
        {receipt && <Alert severity="info">The old receipt photo was not carried over. Attach it again if you still have it.</Alert>}
        <ExpenseEntry embedded prefill={again.lines.map(prefillRow)} onSaved={() => { removeEntry(again.id); setAgain(null); onSaved?.(); }} />
      </>}
    </ResponsiveSheet>

    <Dialog open={removing !== null} onClose={() => setRemoving(null)} fullWidth maxWidth="xs">
      <DialogTitle>Remove from this phone?</DialogTitle>
      <DialogContent>
        <DialogContentText>
          {removing?.lines.length === 1 ? 'This expense' : 'These expenses'} will be gone from this phone and will not be recorded in the new books. Only remove {removing?.lines.length === 1 ? 'it' : 'them'} if already entered another way.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setRemoving(null)}>Keep it</Button>
        <Button color="error" variant="contained" onClick={() => { if (removing) removeEntry(removing.id); setRemoving(null); toast.info('Removed from this phone.'); }}>Remove</Button>
      </DialogActions>
    </Dialog>
  </>;
}

"use client";

import { DateField } from '@/components/date-field';
import { useRef, useState } from 'react';
import { Alert, Box, Button, TextField, Typography } from '@mui/material';
import { toast } from 'sonner';

import { saleChangeStyles as styles } from '@/app/theme';
import { PaidBy } from '@/components/paid-by';
import { ResponsiveSheet } from '@/components/responsive-sheet';
import { lagosBusinessDate, nairaToKobo } from '@/lib/accounting-entry';
import { koboNaira } from '@/lib/approvals-view';
import type { PaymentMethod } from '@/lib/payment-methods';

/** The owner records money a payee gave back on a lowered or cancelled paid expense. */
export function RecoverExpenseSheet({ reference, payee, toRecoverKobo, onClose, onDone }: { reference: string; payee: string; toRecoverKobo: number; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState(String(toRecoverKobo / 100));
  const [date, setDate] = useState(lagosBusinessDate());
  const [method, setMethod] = useState<PaymentMethod | ''>('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const requestId = useRef<string | null>(null);
  const kobo = nairaToKobo(amount);
  const valid = !!kobo && Number(kobo) > 0 && Number(kobo) <= toRecoverKobo && !!method && !!date;

  async function save() {
    if (!valid || busy) return;
    requestId.current ??= crypto.randomUUID();
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/accounting/expense-recoveries', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestId: requestId.current, reference, amountKobo: kobo, paymentMethod: method, businessDate: date }) });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'That could not be recorded. Try again.');
      requestId.current = null;
      toast.success(`${koboNaira(Number(kobo))} received${Number(result.still_to_recover_kobo) > 0 ? `. ${koboNaira(Number(result.still_to_recover_kobo))} still to recover.` : '. Nothing left to recover.'}`);
      onDone();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'That could not be recorded. Try again.'); }
    finally { setBusy(false); }
  }

  return <ResponsiveSheet open onClose={onClose} busy={busy} title="Money received back" description={`${reference} · ${payee}`}
    footer={<Box sx={styles.footer}>
      <Button variant="contained" size="large" disabled={!valid || busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Record money received'}</Button>
      <Button color="inherit" variant="outlined" disabled={busy} onClick={onClose}>Close</Button>
    </Box>}>
    <Box sx={styles.body}>
      <Typography color="text.secondary">{koboNaira(toRecoverKobo)} is still held as “paid out, to recover”. Record what {payee || 'the payee'} gave back. The expense itself does not change.</Typography>
      {error && <Alert severity="error">{error}</Alert>}
      <TextField label="Amount received (₦)" type="number" value={amount} onChange={(event) => { requestId.current = null; setAmount(event.target.value); }}
        slotProps={{ htmlInput: { min: 0, step: '0.01', max: toRecoverKobo / 100 } }} helperText={`Up to ${koboNaira(toRecoverKobo)}`} />
      <DateField label="Date received" value={date} onChange={(next) => { requestId.current = null; setDate(next); }} />
      <PaidBy value={method} onChange={(next) => { requestId.current = null; setMethod(next); }} required />
    </Box>
  </ResponsiveSheet>;
}

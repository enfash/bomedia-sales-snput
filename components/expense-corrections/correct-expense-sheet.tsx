"use client";

import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, MenuItem, Skeleton, TextField, Typography } from '@mui/material';
import { toast } from 'sonner';

import { saleChangeStyles as styles } from '@/app/theme';
import { ExpenseEffectBox } from '@/components/expense-corrections/expense-effect-box';
import { ResponsiveSheet } from '@/components/responsive-sheet';
import { nairaToKobo } from '@/lib/accounting-entry';
import { expenseDateOf } from '@/lib/expense-corrections-view';
import type { Expense } from '@/lib/expense-list';
import type { ExpenseChanges, ExpensePlan } from '@/lib/server/expense-corrections';

type Form = { amount: string; category: string; date: string; paidTo: string; description: string };

async function post(body: Record<string, unknown>, preview: boolean) {
  const response = await fetch(`/api/accounting/expense-corrections${preview ? '?preview=1' : ''}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error || 'That change could not be checked. Try again.');
  return result;
}

/** Change one expense. It shows what the change will do to the books before anything is sent; the owner applies it at once, a cashier asks. */
export function CorrectExpenseSheet({ expense, owner, onClose, onDone }: { expense: Expense; owner: boolean; onClose: () => void; onDone: () => void }) {
  const reference = String(expense['EXPENSE ID']);
  const paid = expense.STATUS === 'Paid';
  const baseKobo = String(expense._amountKobo ?? '');
  const base: Form = { amount: baseKobo ? String(Number(baseKobo) / 100) : '', category: expense.CATEGORY, date: expenseDateOf(expense.DATE), paidTo: expense['PAID TO'] ?? '', description: expense.DESCRIPTION ?? '' };
  const [form, setForm] = useState<Form>(base);
  const [categories, setCategories] = useState<string[]>([expense.CATEGORY]);
  const [plan, setPlan] = useState<ExpensePlan | null>(null);
  const [problem, setProblem] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [reason, setReason] = useState('');
  const requestId = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      try {
        const response = await fetch('/api/accounting/records?resource=expense_categories', { cache: 'no-store' }), body = await response.json();
        if (active && response.ok && Array.isArray(body.data)) setCategories(Array.from(new Set([expense.CATEGORY, ...body.data.map((c: { name: string }) => c.name)])));
      } catch { /* The category cannot be changed without the list; the rest still works. */ }
    });
    return () => { active = false; };
  }, [expense.CATEGORY]);

  const changes: ExpenseChanges = {};
  const kobo = nairaToKobo(form.amount);
  if (kobo && kobo !== baseKobo) changes.amountKobo = kobo;
  if (form.category !== base.category) changes.category = form.category;
  if (form.date && form.date !== base.date) changes.businessDate = form.date;
  if (form.paidTo.trim() !== base.paidTo.trim()) changes.paidTo = form.paidTo.trim();
  if (form.description.trim() !== base.description.trim()) changes.description = form.description.trim();
  const changeKey = JSON.stringify(changes);
  const hasChanges = Object.keys(changes).length > 0;

  // Check the change with the database, a moment after typing stops, so the person sees the effect first.
  useEffect(() => {
    if (!hasChanges) return;
    let active = true;
    const timer = setTimeout(() => {
      void post({ mode: 'correct', reference, changes: JSON.parse(changeKey) }, true)
        .then((result) => { if (active) { setPlan(result.plan); setProblem(''); } })
        .catch((cause) => { if (active) { setPlan(null); setProblem(cause instanceof Error ? cause.message : 'This change cannot be made.'); } });
    }, 450);
    return () => { active = false; clearTimeout(timer); };
  }, [changeKey, hasChanges, reference]);

  const set = (key: keyof Form) => (event: { target: { value: string } }) => { requestId.current = null; setForm((f) => ({ ...f, [key]: event.target.value })); };
  const ready = hasChanges && !problem && !!plan && !!reason.trim() && !busy;

  async function save() {
    if (!ready) return;
    requestId.current ??= crypto.randomUUID();
    setBusy(true); setError('');
    try {
      const result = await post({ requestId: requestId.current, mode: 'correct', reference, changes, reason: reason.trim() }, false);
      requestId.current = null;
      toast.success(result.status === 'applied' ? 'Expense corrected. The old version is kept in its history.' : 'Sent to the owner for approval. Nothing changes until it is approved.');
      onDone();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The change was not saved. Try again.'); }
    finally { setBusy(false); }
  }

  return <ResponsiveSheet open onClose={onClose} busy={busy} title="Correct this expense" description={`${reference} · ${expense.CATEGORY}`}
    footer={<Box sx={styles.footer}>
      <Button variant="contained" size="large" disabled={!ready} onClick={() => void save()}>{busy ? 'Saving…' : owner ? 'Save correction' : 'Send for approval'}</Button>
      <Button color="inherit" variant="outlined" disabled={busy} onClick={onClose}>Close</Button>
    </Box>}>
    <Box sx={styles.body}>
      {error && <Alert severity="error">{error}</Alert>}
      <TextField label="Amount (₦)" type="number" value={form.amount} onChange={set('amount')} slotProps={{ htmlInput: { min: 0, step: '0.01', max: paid && baseKobo ? Number(baseKobo) / 100 : undefined } }}
        helperText={paid ? 'A paid expense can be lowered but not raised. Log any extra as a new expense.' : undefined} />
      <Box sx={styles.row2}>
        <TextField select label="Category" value={form.category} onChange={set('category')}>{categories.map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}</TextField>
        <TextField label="Date" type="date" value={form.date} onChange={set('date')} slotProps={{ inputLabel: { shrink: true } }} />
      </Box>
      <TextField label="Paid to" value={form.paidTo} onChange={set('paidTo')} slotProps={{ htmlInput: { maxLength: 200 } }} />
      <TextField label="What for" value={form.description} onChange={set('description')} slotProps={{ htmlInput: { maxLength: 1000 } }} />
      {problem && <Alert severity="warning">{problem}</Alert>}
      {hasChanges && !problem && (plan ? <ExpenseEffectBox plan={plan} whoApproves={!owner} /> : <Skeleton variant="rounded" height={120} />)}
      {!hasChanges && <Typography variant="body2" color="text.secondary">Change something above and the effect on the books shows here.</Typography>}
      <TextField label="Why? (required)" multiline minRows={2} value={reason} onChange={(event) => { requestId.current = null; setReason(event.target.value.slice(0, 500)); }} helperText={`${reason.length} / 500`} />
    </Box>
  </ResponsiveSheet>;
}

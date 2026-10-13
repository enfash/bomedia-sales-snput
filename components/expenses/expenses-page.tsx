"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, ButtonBase, Paper, Skeleton, TextField, Typography } from '@mui/material';
import { Plus, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { expenseStyles as styles } from '@/app/theme';
import { BackLink } from '@/components/back-link';
import { ExpenseEntry } from '@/components/expense-entry';
import { ExpensePaymentSheet } from '@/components/expense-payment-sheet';
import { ExpenseDetailsSheet, canMarkPaid } from '@/components/expenses/expense-details-sheet';
import { ResponsiveSheet } from '@/components/responsive-sheet';
import { StatTile } from '@/components/stat-tile';
import { CorrectedTag } from '@/components/corrected-tag';
import { StatusBadge } from '@/components/status-badge';
import { lagosBusinessDate } from '@/lib/accounting-entry';
import { expenseAmount, filterExpenses, groupByDay, isPaidExpense, naira, sinceLabel, summarise, type Expense, type StatusFilter } from '@/lib/expense-list';
import { useSyncStore } from '@/lib/store';

const FILTERS: StatusFilter[] = ['All', 'Unpaid', 'Paid'];

function ExpenseRow({ expense, onOpen, onPay }: { expense: Expense; onOpen: (expense: Expense) => void; onPay: (expense: Expense) => void }) {
  const paid = isPaidExpense(expense);
  const cancelled = expense.STATUS === 'Cancelled';
  const note = [expense['PAID TO'], expense.DESCRIPTION].filter(Boolean).join(' · ');
  return <Box sx={styles.row}>
    <ButtonBase onClick={() => onOpen(expense)} sx={styles.rowButton} aria-label={`${expense.CATEGORY}, ${naira(expenseAmount(expense))}, ${cancelled ? 'cancelled' : paid ? 'paid' : 'unpaid'}. Open details`}>
      <Box component="span" sx={[styles.iconTile, !paid && !cancelled && styles.iconTileOwed]}><Receipt size={18} /></Box>
      <Box sx={styles.rowMain}>
        <Typography component="span" sx={styles.category}>{expense.CATEGORY}</Typography>
        {note && <Typography variant="body2" component="span" sx={styles.meta}>{note}</Typography>}
      </Box>
      <Box component="span" sx={styles.rowEnd}>
        <Typography component="span" sx={styles.amount}>{naira(expenseAmount(expense))}</Typography>
        <StatusBadge variant="expenses" status={expense.STATUS || 'Unpaid'} />
        {!cancelled && <CorrectedTag revisions={expense._revisions} />}
      </Box>
    </ButtonBase>
    {canMarkPaid(expense) && <Button variant="outlined" color="primary" sx={styles.payButton} onClick={() => onPay(expense)}>Mark as paid</Button>}
  </Box>;
}

export function ExpensesPage() {
  // Selectors rather than destructuring the whole store: subscribing to
  // everything re-rendered this page on any unrelated write in the app.
  const cachedExpenses = useSyncStore((s) => s.cachedExpenses);
  const lastSyncTime = useSyncStore((s) => s.lastSyncTime);

  const [expenses, setExpenses] = useState<Expense[]>(() => (cachedExpenses.length > 0 ? [...cachedExpenses].reverse() : []));
  const [loading, setLoading] = useState(cachedExpenses.length === 0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>('All');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<Expense | null>(null);
  const [paying, setPaying] = useState<Expense | null>(null);
  const [showCancelled, setShowCancelled] = useState(false);
  const [cancelledRows, setCancelledRows] = useState<Expense[]>([]);
  const showCancelledRef = useRef(false);
  const loadCancelled = useCallback(async () => {
    try { const response = await fetch('/api/expenses?cancelled=only'), result = await response.json(); if (response.ok && Array.isArray(result.data)) setCancelledRows([...(result.data as Expense[])].reverse()); }
    catch { /* The cancelled list is a convenience; the normal list still works. */ }
  }, []);

  const fetchExpenses = useCallback(async () => {
    try {
      const res = await fetch('/api/expenses');
      if (!res.ok) throw new Error('Failed to fetch');
      const { data } = await res.json();
      // Copy before reversing: Array.reverse mutates, and the array handed to the cache must stay as the server sent it.
      setExpenses([...(data as Expense[])].reverse());
      useSyncStore.setState({ cachedExpenses: data });
      setLoadFailed(false);
      if (showCancelledRef.current) await loadCancelled();
    } catch {
      setLoadFailed(true);
      toast.error('Could not load expenses.');
    } finally {
      setLoading(false);
    }
  }, [loadCancelled]);

  // Fetch on mount, and again when a background sync reports new data.
  useEffect(() => { void fetchExpenses(); }, [fetchExpenses, lastSyncTime]);

  useEffect(() => {
    if (cachedExpenses) setExpenses([...cachedExpenses].reverse());
  }, [cachedExpenses]);

  const handleStatusToggle = async (expense: Expense, newStatus: 'Paid' | 'Unpaid') => {
    if (expense._backend === 'postgres') {
      if (newStatus === 'Paid' && expense._payable) setPaying(expense);
      return;
    }
    const timestamp = expense.TIMESTAMP;
    const userName = localStorage.getItem('userName') || 'Unknown';
    try {
      const res = await fetch('/api/expenses', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timestamp, status: newStatus, paidBy: userName }),
      });
      if (!res.ok) throw new Error('Failed to update');
      setExpenses((prev) => prev.map((e) => e.TIMESTAMP === timestamp
        ? { ...e, STATUS: newStatus, 'PAID BY': newStatus === 'Paid' ? userName : '', 'PAID AT': newStatus === 'Paid' ? new Date().toISOString() : '' }
        : e));
      toast.success(`Marked as ${newStatus}`);
    } catch {
      toast.error('Failed to update status. Try again.');
    }
  };

  // The inline "Mark as paid" button shares the sheet's rule, so both routes (Sheets PATCH, or the payment sheet in the new books) behave the same.
  const payFromRow = (expense: Expense) => { void handleStatusToggle(expense, 'Paid'); };

  const today = lagosBusinessDate();
  const shown = useMemo(() => (showCancelled ? [...expenses, ...cancelledRows] : expenses), [expenses, cancelledRows, showCancelled]);
  const summary = useMemo(() => summarise(shown, today), [shown, today]);
  const visible = useMemo(() => filterExpenses(shown, filter, search), [shown, filter, search]);
  const days = useMemo(() => groupByDay(visible, today), [visible, today]);
  const count = (status: StatusFilter) => filterExpenses(shown, status, '').length;
  const searching = search.trim().length > 0;

  return <Box sx={styles.screen}>
    <BackLink href="/bom03" label="Dashboard" />
    <Box sx={styles.heading}>
      <Typography variant="h3" component="h1">Expenses</Typography>
      <Typography color="text.secondary">Money going out. See what is paid and what is still owed.</Typography>
    </Box>

    <Button variant="contained" size="large" startIcon={<Plus size={18} />} onClick={() => setAdding(true)}>New expense</Button>

    {loadFailed && <Alert severity="error" action={<Button color="inherit" onClick={() => { setLoading(true); void fetchExpenses(); }}>Try again</Button>}>
      Expenses could not be loaded. Check your connection. Nothing you logged has been lost.
    </Alert>}

    {loading ? <Box sx={styles.summary}>{[0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={i === 0 ? 96 : 76} />)}</Box> : expenses.length > 0 && <Box sx={styles.summary}>
      <StatTile tone="primary" label="Spent this month" value={naira(summary.monthSpent)} caption={`${summary.monthCount} expense${summary.monthCount === 1 ? '' : 's'} since ${sinceLabel(summary.monthStart)}`} />
      <Box sx={styles.pair}>
        <StatTile tone={summary.owedCount ? 'error' : 'neutral'} label="Still owed" value={naira(summary.owed)} caption={`${summary.owedCount} unpaid`} />
        <StatTile label="Paid this month" value={naira(summary.paid)} caption={`${summary.paidCount} expense${summary.paidCount === 1 ? '' : 's'}`} />
      </Box>
    </Box>}

    {expenses.length > 0 && <>
      <TextField label="Search" placeholder="Category, who was paid, or a note" value={search} onChange={(event) => setSearch(event.target.value)} type="search" slotProps={{ inputLabel: { shrink: true } }} />
      <Box sx={styles.chips} role="group" aria-label="Filter by status">
        {FILTERS.map((name) => <Button key={name} variant={filter === name ? 'contained' : 'outlined'} color="primary" sx={styles.chip} aria-pressed={filter === name} onClick={() => setFilter(name)}>{name} · {count(name)}</Button>)}
        <Button variant={showCancelled ? 'contained' : 'outlined'} color={showCancelled ? 'primary' : 'inherit'} sx={styles.chip} aria-pressed={showCancelled}
          onClick={() => { const next = !showCancelled; showCancelledRef.current = next; setShowCancelled(next); if (next) void loadCancelled(); }}>Show cancelled expenses</Button>
      </Box>
    </>}

    {loading ? <Skeleton variant="rounded" height={220} /> : expenses.length === 0 && !loadFailed ? <Box sx={styles.emptyBox}>
      <Box sx={styles.emptyIcon}><Receipt size={22} /></Box>
      <Typography sx={styles.emptyTitle}>No expenses yet</Typography>
      <Typography variant="body2" sx={styles.emptyText}>Log the first one and it will show here with the month&apos;s total.</Typography>
      <Button variant="contained" onClick={() => setAdding(true)}>New expense</Button>
    </Box> : visible.length === 0 && expenses.length > 0 ? <Box sx={styles.emptyBox}>
      <Typography sx={styles.emptyTitle}>{searching ? `No expense matches "${search.trim()}"` : filter === 'Unpaid' ? 'Nothing is owed' : 'No paid expenses yet'}</Typography>
      <Typography variant="body2" sx={styles.emptyText}>{searching ? 'Try a shorter word, or clear the search.' : filter === 'Unpaid' ? 'Every expense has been paid.' : 'Paid expenses will show here.'}</Typography>
      {(searching || filter !== 'All') && <Button variant="outlined" color="primary" onClick={() => { setSearch(''); setFilter('All'); }}>{searching ? 'Clear search' : 'Show all'}</Button>}
    </Box> : days.map((day) => <Box key={day.date || 'none'} sx={styles.day}>
      <Box sx={styles.dayHead}>
        <Typography variant="overline" sx={styles.dayLabel}>{day.label}</Typography>
        <Typography variant="body2" sx={styles.dayTotal}>{naira(day.total)}</Typography>
      </Box>
      <Paper variant="outlined" sx={styles.group}>
        {day.items.map((expense, i) => <ExpenseRow key={expense._expenseId ?? expense._rowIndex ?? `${expense.TIMESTAMP}-${expense.DESCRIPTION}-${i}`} expense={expense} onOpen={setViewing} onPay={payFromRow} />)}
      </Paper>
    </Box>)}

    <ResponsiveSheet open={adding} onClose={() => setAdding(false)} title="New expense">
      <ExpenseEntry embedded onSaved={() => { void fetchExpenses(); setAdding(false); }} />
    </ResponsiveSheet>
    <ExpenseDetailsSheet expense={viewing} onClose={() => setViewing(null)} onToggle={handleStatusToggle} onChanged={() => void fetchExpenses()} />
    <ExpensePaymentSheet expense={paying} onClose={() => setPaying(null)} />
  </Box>;
}

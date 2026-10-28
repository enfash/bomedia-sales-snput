"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, ButtonBase, Paper, TextField, Typography } from '@mui/material';
import { LoadingState } from '@/components/loading-state';
import { Plus, Receipt, Package } from 'lucide-react';
import { toast } from 'sonner';
import { expenseStyles as styles } from '@/app/theme';
import { BackLink } from '@/components/back-link';
import { ExpenseEntry } from '@/components/expense-entry';
import { HeldOldExpenses } from '@/components/expenses/held-old-expenses';
import { ExpensePaymentSheet } from '@/components/expense-payment-sheet';
import { ExpenseDetailsSheet, canMarkPaid } from '@/components/expenses/expense-details-sheet';
import { ResponsiveSheet } from '@/components/responsive-sheet';
import { StatTile } from '@/components/stat-tile';
import { CorrectedTag } from '@/components/corrected-tag';
import { StatusBadge } from '@/components/status-badge';
import { lagosBusinessDate } from '@/lib/accounting-entry';
import { isPaidExpense, type Expense, type StatusFilter } from '@/lib/expense-list';
import { formatKobo } from '@/lib/accounting-money';
import { fetchStockPurchases, filterSpending, isStockPurchase, spendingAmount, spendingDays, spendingEntries, spendingSummary, type SpendingEntry, type SpendingKind, type StockPurchase } from '@/lib/spending-list';
import { StockPurchaseDetails } from '@/components/expenses/stock-purchase-details';
import { useSyncStore } from '@/lib/store';

const KINDS: SpendingKind[] = ['All spending', 'Other expenses', 'Stock purchases'];
const FILTERS: StatusFilter[] = ['All', 'Unpaid', 'Paid'];

function ExpenseRow({ expense, onOpen, onPay }: { expense: SpendingEntry; onOpen: (expense: SpendingEntry) => void; onPay: (expense: Expense) => void }) {
  const paid = isPaidExpense(expense);
  const cancelled = expense.STATUS === 'Cancelled';
  const note = [expense['PAID TO'], expense.DESCRIPTION].filter(Boolean).join(' · ');
  return <Box sx={styles.row}>
    <ButtonBase onClick={() => onOpen(expense)} sx={styles.rowButton} aria-label={`${expense.CATEGORY}, ${spendingAmount(expense)}, ${cancelled ? 'cancelled' : paid ? 'paid' : 'unpaid'}. Open details`}>
      <Box component="span" sx={[styles.iconTile, !paid && !cancelled && styles.iconTileOwed]}>{isStockPurchase(expense) ? <Package size={18} /> : <Receipt size={18} />}</Box>
      <Box sx={styles.rowMain}>
        <Typography component="span" sx={styles.category}>{isStockPurchase(expense) ? 'Stock purchase' : expense.CATEGORY}</Typography>
        {note && <Typography variant="body2" component="span" sx={styles.meta}>{note}</Typography>}
      </Box>
      <Box component="span" sx={styles.rowEnd}>
        <Typography component="span" sx={styles.amount}>{spendingAmount(expense)}</Typography>
        <StatusBadge variant="expenses" status={expense.STATUS || 'Unpaid'} />
        {!cancelled && <CorrectedTag revisions={expense._revisions} />}
      </Box>
    </ButtonBase>
    {!expense.stockPurchase && canMarkPaid(expense) && <Button variant="outlined" color="primary" sx={styles.payButton} onClick={() => onPay(expense)}>Mark as paid</Button>}
  </Box>;
}

export function ExpensesPage() {
  // Selectors rather than destructuring the whole store: subscribing to
  // everything re-rendered this page on any unrelated write in the app.
  const cachedExpenses = useSyncStore((s) => s.cachedExpenses);
  const lastSyncTime = useSyncStore((s) => s.lastSyncTime);

  const expenses = useMemo<Expense[]>(() => [...cachedExpenses].reverse(), [cachedExpenses]);
  const [loading, setLoading] = useState(true);
  const [purchases, setPurchases] = useState<StockPurchase[]>([]);
  const [kind, setKind] = useState<SpendingKind>('All spending');
  const [purchaseDetails, setPurchaseDetails] = useState<StockPurchase | null>(null);
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
      const [res, nextPurchases] = await Promise.all([fetch('/api/expenses'), fetchStockPurchases()]);
      if (!res.ok) throw new Error('Failed to fetch');
      const { data } = await res.json();
      if (!Array.isArray(data)) throw new Error('Expenses could not be loaded.');
      setPurchases(nextPurchases);
      // Only real expenses enter the shared cache; purchases belong to this screen.
      useSyncStore.setState({ cachedExpenses: data });
      setLoadFailed(false);
      if (showCancelledRef.current) await loadCancelled();
    } catch {
      setLoadFailed(true);
      toast.error('Could not load all spending.');
    } finally {
      setLoading(false);
    }
  }, [loadCancelled]);

  // State changes happen after network responses; this effect synchronizes the server list.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void fetchExpenses(); }, [fetchExpenses, lastSyncTime]);

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
      useSyncStore.setState(state => ({ cachedExpenses: state.cachedExpenses.map((e: Expense) => e.TIMESTAMP === timestamp
        ? { ...e, STATUS: newStatus, 'PAID BY': newStatus === 'Paid' ? userName : '', 'PAID AT': newStatus === 'Paid' ? new Date().toISOString() : '' }
        : e) }));
      toast.success(`Marked as ${newStatus}`);
    } catch {
      toast.error('Failed to update status. Try again.');
    }
  };

  // The inline "Mark as paid" button shares the sheet's rule, so both routes (Sheets PATCH, or the payment sheet in the new books) behave the same.
  const payFromRow = (expense: Expense) => { void handleStatusToggle(expense, 'Paid'); };

  const today = lagosBusinessDate();
  const shown = useMemo(() => spendingEntries(showCancelled ? [...expenses, ...cancelledRows] : expenses, purchases), [expenses, cancelledRows, showCancelled, purchases]);
  const summary = useMemo(() => spendingSummary(shown, today), [shown, today]);
  const visible = useMemo(() => filterSpending(shown, kind, filter, search), [shown, kind, filter, search]);
  const days = useMemo(() => spendingDays(visible, today), [visible, today]);
  const count = (status: StatusFilter) => filterSpending(shown, kind, status, '').length;
  const searching = search.trim().length > 0;

  return <Box sx={styles.screen}>
    <BackLink href="/bom03" label="Dashboard" />
    <Box sx={styles.heading}>
      <Typography variant="h3" component="h1">Expenses</Typography>
      <Typography color="text.secondary">Expenses and stock purchases. See what is paid and what is still owed.</Typography>
    </Box>

    <Button variant="contained" size="large" startIcon={<Plus size={18} />} onClick={() => setAdding(true)}>New expense</Button>

    <HeldOldExpenses onSaved={() => void fetchExpenses()} />

    {loadFailed && <Alert severity="error" action={<Button color="inherit" onClick={() => { setLoading(true); void fetchExpenses(); }}>Try again</Button>}>
      The complete spending list could not be loaded. Summary totals are hidden until both expenses and stock purchases are available. Check your connection and try again.
    </Alert>}

    {loading ? <LoadingState pieces={[{ k: 'tiles', n: 3, cols: 'wide-first' }]} label="Loading totals" /> : !loadFailed && <Box sx={styles.summary}>
      <StatTile tone="primary" label="Paid for this month’s entries" value={formatKobo(summary.paid)} caption={`${summary.paidCount} paid expenses and stock purchases`} />
      <Box sx={styles.pair}>
        <StatTile label="Stock purchases" value={formatKobo(summary.stock)} caption={`${summary.stockCount} paid purchases this month`} />
        <StatTile label="Other expenses" value={formatKobo(summary.other)} caption="Paid entries dated this month" />
        <StatTile tone={summary.owedCount ? 'error' : 'neutral'} label="Still owed" value={formatKobo(summary.owed)} caption={`${summary.owedCount} unpaid across all dates`} />
      </Box>
      <Typography variant="body2" color="text.secondary">Stock payments are included here. Profit includes material cost as stock is used, so these purchases are not deducted again.</Typography>
    </Box>}

    <Box sx={styles.chips} role="group" aria-label="Spending type">
      {KINDS.map(name => <Button key={name} variant={kind === name ? 'contained' : 'outlined'} sx={styles.chip} aria-pressed={kind === name} onClick={() => setKind(name)}>{name}</Button>)}
    </Box>

    {shown.length > 0 && <>
      <TextField label="Search" placeholder="Material, category, payee, or reference" value={search} onChange={(event) => setSearch(event.target.value)} type="search" slotProps={{ inputLabel: { shrink: true } }} />
      <Box sx={styles.chips} role="group" aria-label="Filter by status">
        {FILTERS.map((name) => <Button key={name} variant={filter === name ? 'contained' : 'outlined'} color="primary" sx={styles.chip} aria-pressed={filter === name} onClick={() => setFilter(name)}>{name} · {count(name)}</Button>)}
        <Button variant={showCancelled ? 'contained' : 'outlined'} color={showCancelled ? 'primary' : 'inherit'} sx={styles.chip} aria-pressed={showCancelled}
          onClick={() => { const next = !showCancelled; showCancelledRef.current = next; setShowCancelled(next); if (next) void loadCancelled(); }}>Show cancelled expenses</Button>
      </Box>
    </>}

    {loading ? <LoadingState pieces={[{ k: 'list', n: 5 }]} label="Loading expenses" /> : shown.length === 0 && !loadFailed ? <Box sx={styles.emptyBox}>
      <Box sx={styles.emptyIcon}><Receipt size={22} /></Box>
      <Typography sx={styles.emptyTitle}>No spending recorded yet</Typography>
      <Typography variant="body2" sx={styles.emptyText}>Record an expense here or add purchased rolls in Inventory.</Typography>
      <Button variant="contained" onClick={() => setAdding(true)}>New expense</Button>
    </Box> : visible.length === 0 && shown.length > 0 ? <Box sx={styles.emptyBox}>
      <Typography sx={styles.emptyTitle}>{searching ? `No entry matches "${search.trim()}"` : filter === 'Unpaid' ? 'Nothing owed in this view' : 'No entries in this view'}</Typography>
      <Typography variant="body2" sx={styles.emptyText}>{searching ? 'Try a shorter word, or clear the search.' : 'Change the type or status filter. New stock purchases appear after you restock in Inventory.'}</Typography>
      {(searching || filter !== 'All') && <Button variant="outlined" color="primary" onClick={() => { setSearch(''); setFilter('All'); }}>{searching ? 'Clear search' : 'Show all'}</Button>}
    </Box> : days.map((day) => <Box key={day.date || 'none'} sx={styles.day}>
      <Box sx={styles.dayHead}>
        <Typography variant="overline" sx={styles.dayLabel}>{day.label}</Typography>
        <Typography variant="body2" sx={styles.dayTotal}>{formatKobo(day.totalKobo)}</Typography>
      </Box>
      <Paper variant="outlined" sx={styles.group}>
        {day.items.map((expense, i) => <ExpenseRow key={expense.stockPurchase?.id ?? expense._expenseId ?? expense._rowIndex ?? `${expense.TIMESTAMP}-${expense.DESCRIPTION}-${i}`} expense={expense} onOpen={(entry) => entry.stockPurchase ? setPurchaseDetails(entry.stockPurchase) : setViewing(entry)} onPay={payFromRow} />)}
      </Paper>
    </Box>)}

    <ResponsiveSheet open={adding} onClose={() => setAdding(false)} title="New expense">
      <ExpenseEntry embedded onSaved={() => { void fetchExpenses(); setAdding(false); }} />
    </ResponsiveSheet>
    <StockPurchaseDetails purchase={purchaseDetails} onClose={() => setPurchaseDetails(null)} />
    <ExpenseDetailsSheet expense={viewing} onClose={() => setViewing(null)} onToggle={handleStatusToggle} onChanged={() => void fetchExpenses()} />
    <ExpensePaymentSheet expense={paying} onClose={() => setPaying(null)} />
  </Box>;
}

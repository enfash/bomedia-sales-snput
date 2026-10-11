"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, ButtonBase, IconButton, Paper, Skeleton, TextField, Typography } from '@mui/material';
import { ArrowDownRight, ArrowUpRight, CalendarRange, ChevronLeft, ChevronRight, Layers, RefreshCw } from 'lucide-react';
import { recordsStyles as styles } from '@/app/theme';
import { HomeBackLink } from '@/components/back-link';
import type { UnifiedRecord } from '@/components/manage-sale-action';
import { BatchDetailsSheet, RecordDetailsSheet } from '@/components/records/record-details-sheet';
import { ReceiptModal } from '@/components/receipt-modal';
import { ResponsiveSheet } from '@/components/responsive-sheet';
import { StatTile } from '@/components/stat-tile';
import { StatusBadge } from '@/components/status-badge';
import { SYSTEM_DEFAULTS } from '@/lib/constants';
import { describeBalance } from '@/lib/balance-display';
import { dayLabel, naira } from '@/lib/expense-list';
import { lagosBusinessDate } from '@/lib/accounting-entry';
import {
  buildRecords, filterByDate, filterRecords, groupStatus, groupUnits, recordDay, sortRecords, summarise, unitDay,
  type DateRange, type DisplayUnit, type RecordsRole, type RecordTab, type Row, type SortBy, type SortOrder,
} from '@/lib/records-view';
import { useSyncStore } from '@/lib/store';

const RANGES: Record<RecordsRole, { id: DateRange; label: string }[]> = {
  owner: [{ id: 'all', label: 'All time' }, { id: '7d', label: '7 days' }, { id: '30d', label: '30 days' }],
  cashier: [{ id: 'today', label: 'Today' }, { id: '7d', label: '7 days' }, { id: '30d', label: '30 days' }],
};
const COPY: Record<RecordsRole, string> = {
  owner: 'Sales, expenses and what customers still owe.',
  cashier: "Today's sales and what customers still owe.",
};
const SORT_LABEL: Record<SortBy, string> = { date: 'date', name: 'name', debt: 'what is owed' };
const orderText = (by: SortBy, order: SortOrder) => by === 'date' ? (order === 'desc' ? 'newest first' : 'oldest first') : by === 'name' ? (order === 'asc' ? 'A to Z' : 'Z to A') : (order === 'desc' ? 'most owed first' : 'least owed first');

const unitRecords = (unit: DisplayUnit) => (unit.type === 'group' ? unit.items : [unit.record]);
const exact = (record: UnifiedRecord) => !!record.raw?._jobId;
/** "Expense · Test shop · Tunde ink": the payee and note, leaving out an unknown payee and a note that only repeats the category. */
const expenseNote = (record: UnifiedRecord) => ['Expense', record.client !== 'N/A' ? record.client : '', record.description !== record.material ? record.description : ''].filter(Boolean).join(' · ');

function RecordRow({ record, onOpen }: { record: UnifiedRecord; onOpen: (record: UnifiedRecord) => void }) {
  const sale = record.type === 'Sale';
  const balance = sale ? describeBalance(record.balance, false, exact(record)) : null;
  return <Box sx={styles.row}>
    <ButtonBase onClick={() => onOpen(record)} sx={styles.rowButton} aria-label={`${sale ? record.client : record.material || record.client}, ${naira(record.amount)}, ${record.status}. Open details`}>
      <Box component="span" sx={[styles.iconTile, !sale && styles.iconTileExpense]}>{sale ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}</Box>
      <Box sx={styles.rowMain}>
        <Typography component="span" sx={styles.category}>{sale ? record.client : record.material || record.client}</Typography>
        <Typography variant="body2" component="span" sx={styles.meta}>
          {sale ? record.description : expenseNote(record)}
          {balance?.tone === 'debt' && <> · <Box component="span" sx={styles.owes}>Owes {naira(record.balance || 0)}</Box></>}
        </Typography>
      </Box>
      <Box component="span" sx={styles.rowEnd}>
        <Typography component="span" sx={sale ? styles.amount : styles.expenseAmount}>{sale ? naira(record.amount) : `−${naira(record.amount)}`}</Typography>
        <StatusBadge status={record.status} />
      </Box>
    </ButtonBase>
  </Box>;
}

function BatchRow({ items, salesId, onOpen }: { items: UnifiedRecord[]; salesId: string; onOpen: (items: UnifiedRecord[], salesId: string) => void }) {
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  const balance = items.reduce((sum, item) => sum + (item.balance || 0), 0);
  const owes = describeBalance(balance, false, exact(items[0])).tone === 'debt';
  return <Box sx={styles.row}>
    <ButtonBase onClick={() => onOpen(items, salesId)} sx={styles.rowButton} aria-label={`${items[0].client}, batch of ${items.length}, ${naira(total)}. Open details`}>
      <Box component="span" sx={styles.iconTile}><Layers size={18} /></Box>
      <Box sx={styles.rowMain}>
        <Typography component="span" sx={styles.category}>{items[0].client}</Typography>
        <Typography variant="body2" component="span" sx={styles.meta}>
          {items.length} {items.length === 1 ? 'item' : 'items'}{owes && <> · <Box component="span" sx={styles.owes}>Owes {naira(balance)}</Box></>}
        </Typography>
      </Box>
      <Box component="span" sx={styles.rowEnd}>
        <Typography component="span" sx={styles.amount}>{naira(total)}</Typography>
        <StatusBadge status={groupStatus(items)} />
      </Box>
    </ButtonBase>
  </Box>;
}

/** The Records screen for both roles. The owner also sees expenses and profit; the cashier sees sales only and starts on today. */
export function RecordsPage({ role }: { role: RecordsRole }) {
  const pendingQueue = useSyncStore((s) => s.pendingQueue);
  const cachedSales = useSyncStore((s) => s.cachedSales);
  const cachedExpenses = useSyncStore((s) => s.cachedExpenses);
  const lastSyncTime = useSyncStore((s) => s.lastSyncTime);

  const owner = role === 'owner';
  const salesData: Row[] = cachedSales;
  const expensesData: Row[] = owner ? cachedExpenses : [];
  const [now, setNow] = useState(() => new Date());
  const [loading, setLoading] = useState(cachedSales.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<RecordTab>('All');
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [range, setRange] = useState<DateRange>(owner ? 'all' : 'today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState(false);
  const [viewing, setViewing] = useState<UnifiedRecord | null>(null);
  const [viewingBatch, setViewingBatch] = useState<{ items: UnifiedRecord[]; salesId: string } | null>(null);
  const [receipt, setReceipt] = useState<{ records: UnifiedRecord[]; salesId: string } | null>(null);
  const itemsPerPage = SYSTEM_DEFAULTS.PAGINATION_ITEMS_PER_PAGE;

  const fetchData = useCallback(async () => {
    // Read the store at call time: this callback must not change identity whenever the cached lists are replaced.
    const store = useSyncStore.getState();
    if (store.cachedSales.length === 0) setLoading(true);
    else setRefreshing(true);
    setError('');
    try {
      const [salesRes, expensesRes] = await Promise.all([fetch('/api/sales'), owner ? fetch('/api/expenses') : Promise.resolve(null)]);
      const salesJson = await salesRes.json();
      const newSales = salesJson.data ?? [];
      let newExpenses = store.cachedExpenses;
      if (expensesRes) {
        const expensesJson = await expensesRes.json();
        newExpenses = expensesJson.data ?? [];
      }
      store.setCachedData(newSales, newExpenses, store.cachedInventory, store.cachedPayments, store.cachedMaterials);
    } catch {
      if (useSyncStore.getState().cachedSales.length > 0) console.warn('Currently offline. Using cached records.');
      else setError('Failed to load records.');
    } finally {
      setNow(new Date());
      setLoading(false);
      setRefreshing(false);
    }
  }, [owner]);

  useEffect(() => {
    void Promise.resolve().then(fetchData);
    const handleOnline = () => { void fetchData(); };
    window.addEventListener('online', handleOnline);
    window.addEventListener('bomedia-data-changed', handleOnline);
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('bomedia-data-changed', handleOnline); };
  }, [fetchData]);

  useEffect(() => { if (lastSyncTime) void Promise.resolve().then(fetchData); }, [lastSyncTime, fetchData]);

  const today = lagosBusinessDate(now);
  const records = useMemo(() => buildRecords(role, { sales: salesData, expenses: expensesData, queue: pendingQueue }), [role, salesData, expensesData, pendingQueue]);
  const dateFiltered = filterByDate(role, records, range, { start: customStart, end: customEnd }, now);
  const sorted = sortRecords(role, filterRecords(role, dateFiltered, { search, tab, sortBy }), sortBy, sortOrder);
  const units = groupUnits(sorted);
  const summary = summarise(dateFiltered);
  // On the cashier's Today view the list also holds unpaid sales from earlier in the week; the Sales tile counts only today's.
  const todayOnly = !owner && range === 'today';
  const salesSummary = todayOnly ? summarise(dateFiltered.filter((r) => recordDay(r) === today)) : summary;
  const waiting = records.filter((r) => r.isPending).length;
  const totalPages = Math.max(1, Math.ceil(units.length / itemsPerPage));
  const currentPage = Math.min(page, totalPages);
  const pageUnits = units.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const count = (name: RecordTab) => filterRecords(role, dateFiltered, { search: '', tab: name, sortBy: 'date' }).length;
  const tabs: RecordTab[] = owner ? ['All', 'Sales', 'Expenses'] : ['All'];
  if (waiting > 0 || tab === 'Pending') tabs.push('Pending');

  // Under a date sort the list reads day by day; under name or debt it is one list.
  const buildSections = () => {
    if (sortBy !== 'date') return [{ key: 'all', label: `SORTED BY ${SORT_LABEL[sortBy].toUpperCase()}`, units: pageUnits }];
    const out: { key: string; label: string; units: DisplayUnit[] }[] = [];
    for (const unit of pageUnits) {
      const day = unitDay(unit);
      const last = out[out.length - 1];
      if (last && last.key === day) last.units.push(unit);
      else out.push({ key: day, label: day ? dayLabel(day, today) : 'NO DATE', units: [unit] });
    }
    return out;
  };
  const sections = buildSections();
  const sectionNote = (sectionUnits: DisplayUnit[]) => {
    const all = sectionUnits.flatMap(unitRecords);
    const sales = all.filter((r) => r.type === 'Sale').length;
    const expenses = all.length - sales;
    return [sales ? `${sales} sale${sales === 1 ? '' : 's'}` : '', expenses ? `${expenses} expense${expenses === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
  };

  const openReceipt = (list: UnifiedRecord[], salesId: string) => setReceipt({ records: list, salesId });
  const searching = search.trim().length > 0;
  const resetAll = () => { setSearch(''); setTab('All'); setSortBy('date'); setSortOrder('desc'); setRange(owner ? 'all' : '30d'); setPage(1); };

  return <Box sx={styles.screen}>
    <HomeBackLink />
    <Box sx={styles.heading}>
      <Typography variant="h3" component="h1">Records</Typography>
      <Typography color="text.secondary">{COPY[role]}</Typography>
    </Box>

    <Button variant="outlined" color="primary" size="large" startIcon={<RefreshCw size={18} />} disabled={loading || refreshing} onClick={() => void fetchData()}>
      {loading ? 'Loading…' : refreshing ? 'Updating…' : 'Refresh'}
    </Button>

    {error && <Alert severity="error" action={<Button color="inherit" onClick={() => void fetchData()}>Try again</Button>}>
      {error} Sales waiting on this phone are safe and will send later.
    </Alert>}

    {loading && records.length === 0 ? <Box sx={styles.pair}>{[0, 1, 2, 3].slice(0, owner ? 4 : 2).map((i) => <Skeleton key={i} variant="rounded" height={84} />)}</Box> : records.length > 0 && <Box sx={styles.pair}>
      <StatTile tone="primary" label={owner ? 'Total sales' : todayOnly ? 'Sales today' : 'Sales'} value={naira(salesSummary.sales)} caption={`${salesSummary.salesCount} sale${salesSummary.salesCount === 1 ? '' : 's'}`} />
      <StatTile tone={summary.owedCount ? 'error' : 'neutral'} label="Still owed" value={naira(summary.owed)} caption={`${summary.owedCount} unpaid job${summary.owedCount === 1 ? '' : 's'}`} />
      {owner && <StatTile label="Expenses" value={naira(summary.expenses)} caption={`${summary.expenseCount} expense${summary.expenseCount === 1 ? '' : 's'}`} />}
      {owner && <StatTile label="Net profit" value={naira(summary.net)} caption="sales less expenses" />}
    </Box>}

    {waiting > 0 && <Alert severity="warning">{waiting} {waiting === 1 ? 'entry is' : 'entries are'} waiting to send. {waiting === 1 ? 'It' : 'They'} will save by themselves when the phone is online.</Alert>}

    <Box sx={styles.chips} role="group" aria-label="Period">
      {RANGES[role].map((r) => <Button key={r.id} variant={range === r.id ? 'contained' : 'outlined'} color="primary" sx={styles.chip} aria-pressed={range === r.id} onClick={() => { setRange(r.id); setPage(1); }}>{r.label}</Button>)}
      <Button variant={range === 'custom' ? 'contained' : 'outlined'} color="primary" sx={styles.chip} aria-pressed={range === 'custom'} startIcon={<CalendarRange size={16} />} onClick={() => { setRange('custom'); setPage(1); }}>Dates</Button>
    </Box>
    {range === 'custom' && <Box sx={styles.dateFields}>
      <TextField label="From" type="date" value={customStart} onChange={(event) => { setCustomStart(event.target.value); setPage(1); }} slotProps={{ inputLabel: { shrink: true } }} />
      <TextField label="To" type="date" value={customEnd} onChange={(event) => { setCustomEnd(event.target.value); setPage(1); }} slotProps={{ inputLabel: { shrink: true } }} />
    </Box>}

    <TextField label="Search" placeholder={owner ? 'Customer, job or date' : 'Customer or job'} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} type="search" slotProps={{ inputLabel: { shrink: true } }} />

    {tabs.length > 1 && <Box sx={styles.chips} role="group" aria-label="Show">
      {tabs.map((name) => <Button key={name} variant={tab === name ? 'contained' : 'outlined'} color="primary" sx={styles.chip} aria-pressed={tab === name} onClick={() => { setTab(name); setPage(1); }}>
        {name === 'Pending' ? 'Waiting' : name} · {count(name)}
      </Button>)}
    </Box>}

    <Box sx={styles.sortRow}>
      <Typography variant="body2" sx={styles.sortNote}>Sorted by <strong>{SORT_LABEL[sortBy]}</strong>, {orderText(sortBy, sortOrder)}</Typography>
      <Button variant="outlined" color="inherit" onClick={() => setSorting(true)}>Sort</Button>
    </Box>

    {loading && records.length === 0 ? <Skeleton variant="rounded" height={220} /> : sorted.length === 0 ? <Box sx={styles.emptyBox}>
      <Typography sx={styles.emptyTitle}>
        {searching ? `No record matches "${search.trim()}"` : sortBy === 'debt' ? 'Nothing is owed' : dateFiltered.length === 0 && range !== (owner ? 'all' : 'today') ? 'No records for these dates' : records.length === 0 ? 'No records yet' : 'No records here'}
      </Typography>
      <Typography variant="body2" sx={styles.emptyText}>
        {searching ? 'Try a shorter word, or clear the search.' : sortBy === 'debt' ? 'Every sale in this period has been paid.' : records.length === 0 ? 'Sales and expenses will show here once they are logged.' : 'Try a longer period, or clear the filters.'}
      </Typography>
      {records.length > 0 && <Button variant="outlined" color="primary" onClick={searching ? () => { setSearch(''); setPage(1); } : resetAll}>{searching ? 'Clear search' : owner ? 'Show all time' : 'Show 30 days'}</Button>}
    </Box> : sections.map((section) => <Box key={`${section.key}-${section.units.length}`} sx={styles.day}>
      <Box sx={styles.dayHead}>
        <Typography variant="overline" sx={styles.dayLabel}>{section.label}</Typography>
        <Typography variant="body2" sx={styles.dayTotal}>{sectionNote(section.units)}</Typography>
      </Box>
      <Paper variant="outlined" sx={styles.group}>
        {section.units.map((unit) => unit.type === 'group'
          ? <BatchRow key={unit.salesId} items={unit.items} salesId={unit.salesId} onOpen={(items, salesId) => setViewingBatch({ items, salesId })} />
          : <RecordRow key={unit.record.id} record={unit.record} onOpen={setViewing} />)}
      </Paper>
    </Box>)}

    {units.length > itemsPerPage && <Box sx={styles.pager}>
      <IconButton aria-label="Previous page" disabled={currentPage === 1} sx={styles.pagerButton} onClick={() => setPage(Math.max(1, currentPage - 1))}><ChevronLeft size={18} /></IconButton>
      <Typography variant="body2" sx={styles.pagerText}>Page {currentPage} of {totalPages} · {units.length} records</Typography>
      <IconButton aria-label="Next page" disabled={currentPage === totalPages} sx={styles.pagerButton} onClick={() => setPage(Math.min(totalPages, currentPage + 1))}><ChevronRight size={18} /></IconButton>
    </Box>}

    <ResponsiveSheet open={sorting} onClose={() => setSorting(false)} title="Sort records">
      <Box sx={styles.sheetBody}>
        <Box sx={styles.choices3} role="group" aria-label="Sort by">
          {(['date', 'name', 'debt'] as SortBy[]).map((by) => <Button key={by} variant={sortBy === by ? 'contained' : 'outlined'} color="primary" sx={styles.choice} aria-pressed={sortBy === by}
            onClick={() => { setSortBy(by); setSortOrder(by === 'name' ? 'asc' : 'desc'); setPage(1); }}>{by === 'debt' ? 'Debt' : by === 'name' ? 'Name' : 'Date'}</Button>)}
        </Box>
        <Box sx={styles.choices2} role="group" aria-label="Order">
          {(['desc', 'asc'] as SortOrder[]).map((order) => <Button key={order} variant={sortOrder === order ? 'contained' : 'outlined'} color="primary" sx={styles.choice} aria-pressed={sortOrder === order} onClick={() => { setSortOrder(order); setPage(1); }}>
            {orderText(sortBy, order).replace(/^./, (c) => c.toUpperCase())}
          </Button>)}
        </Box>
        {sortBy === 'debt' && <Typography variant="body2" sx={styles.sortNote}>Showing only sales that still owe. {owner ? 'Expenses and settled sales are hidden.' : 'Settled sales are hidden.'}</Typography>}
        <Button variant="contained" sx={styles.fullWidth} onClick={() => setSorting(false)}>Done</Button>
      </Box>
    </ResponsiveSheet>

    <RecordDetailsSheet record={viewing} onClose={() => setViewing(null)} onUpdate={() => void fetchData()} onReceipt={openReceipt} />
    <BatchDetailsSheet items={viewingBatch?.items ?? null} salesId={viewingBatch?.salesId ?? ''} onClose={() => setViewingBatch(null)} onUpdate={() => void fetchData()} onReceipt={openReceipt} />
    <ReceiptModal isOpen={!!receipt} onClose={() => setReceipt(null)} records={receipt?.records ?? []} salesId={receipt?.records[0]?.salesId} />
  </Box>;
}

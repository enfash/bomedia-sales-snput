"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Alert, Box, Button, ButtonBase, FormControlLabel, IconButton, Paper, Switch, TextField, Typography } from '@mui/material';
import { LoadingState } from '@/components/loading-state';
import { ArrowDownRight, ArrowUpRight, CalendarRange, ChevronLeft, ChevronRight, Layers, RefreshCw } from 'lucide-react';
import { recordsStyles as styles } from '@/app/theme';
import { HomeBackLink } from '@/components/back-link';
import { DateRangeFields } from '@/components/date-range-fields';
import { HeldSales } from '@/components/records/held-sales';
import { useFloatingNotice } from '@/components/floating-notice';
import type { UnifiedRecord } from '@/components/manage-sale-action';
import { BatchDetailsSheet, RecordDetailsSheet } from '@/components/records/record-details-sheet';
import { ReceiptModal } from '@/components/receipt-modal';
import { ResponsiveSheet } from '@/components/responsive-sheet';
import { StatTile } from '@/components/stat-tile';
import { CorrectedTag } from '@/components/corrected-tag';
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
        {record.status !== 'Cancelled' && <CorrectedTag revisions={record.raw?._revisions} />}
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
        {groupStatus(items) !== 'Cancelled' && <CorrectedTag revisions={items.reduce((n, item) => n + Number(item.raw?._revisions || 0), 0)} />}
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
  // Cancelled sales stay out of every normal list; this page can show them on request, without putting them in the shared store.
  const [showCancelled, setShowCancelled] = useState(false);
  const [cancelledRows, setCancelledRows] = useState<Row[]>([]);
  const showCancelledRef = useRef(false);
  const loadCancelled = useCallback(async () => {
    try {
      const response = await fetch('/api/sales?cancelled=only'), result = await response.json();
      if (response.ok && Array.isArray(result?.data)) setCancelledRows(result.data);
    } catch { /* Offline: keep what was shown. */ }
  }, []);
  const salesData: Row[] = showCancelled ? [...cachedSales, ...cancelledRows] : cachedSales;
  const expensesData: Row[] = owner ? cachedExpenses : [];
  const [now, setNow] = useState(() => new Date());
  const [loading, setLoading] = useState(cachedSales.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  // Arriving from the notification drawer: ?open=<sales reference> shows that sale, ?q=<words> starts with a search.
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const openRef = params.get('open') ?? '';
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [tab, setTab] = useState<RecordTab>('All');
  // ?show=owing (from the home card's collect line) starts on the list of sales that still owe.
  const [sortBy, setSortBy] = useState<SortBy>(params.get('show') === 'owing' ? 'debt' : 'date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [range, setRange] = useState<DateRange>(owner ? 'all' : 'today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState(false);
  const [viewing, setViewing] = useState<UnifiedRecord | null>(null);
  const [closedRef, setClosedRef] = useState('');
  const [viewingBatch, setViewingBatch] = useState<{ items: UnifiedRecord[]; salesId: string } | null>(null);
  const [receipt, setReceipt] = useState<{ records: UnifiedRecord[]; salesId: string } | null>(null);
  const itemsPerPage = SYSTEM_DEFAULTS.PAGINATION_ITEMS_PER_PAGE;
  const closeLinked = () => { if (!openRef) return; setClosedRef(openRef); router.replace(pathname); };

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
      if (showCancelledRef.current) await loadCancelled();
    } catch {
      if (useSyncStore.getState().cachedSales.length > 0) console.warn('Currently offline. Using cached records.');
      else setError('Failed to load records.');
    } finally {
      setNow(new Date());
      setLoading(false);
      setRefreshing(false);
    }
  }, [owner, loadCancelled]);

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
  // The sale named in the link, found among every record so the page's filters cannot hide it. Shown until it is closed once.
  const linked = openRef && openRef !== closedRef ? records.filter((r) => r.type === 'Sale' && r.salesId === openRef) : null;
  const dateFiltered = filterByDate(role, records, range, { start: customStart, end: customEnd }, now);
  const sorted = sortRecords(role, filterRecords(role, dateFiltered, { search, tab, sortBy }), sortBy, sortOrder);
  const units = groupUnits(sorted);
  // A cancelled sale is not a sale any more: it never counts in the totals.
  const live = dateFiltered.filter((r) => r.jobStatus !== 'Cancelled');
  const summary = summarise(live);
  // On the cashier's Today view the list also holds unpaid sales from earlier in the week; the Sales tile counts only today's.
  const todayOnly = !owner && range === 'today';
  const salesSummary = todayOnly ? summarise(live.filter((r) => recordDay(r) === today)) : summary;
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
  useFloatingNotice('records-waiting', waiting > 0 ? { tone: 'warning', text: `${waiting} ${waiting === 1 ? 'entry is' : 'entries are'} waiting to send. ${waiting === 1 ? 'It' : 'They'} will save by themselves when the phone is online.` } : null);
  const searching = search.trim().length > 0;
  const resetAll = () => { setSearch(''); setTab('All'); setSortBy('date'); setSortOrder('desc'); setRange(owner ? 'all' : '30d'); setPage(1); };

  return <Box sx={styles.screen}>
    <HomeBackLink />
    <Box sx={styles.headingRow}>
      <Box sx={styles.heading}>
        <Typography variant="h3" component="h1">Records</Typography>
        <Typography color="text.secondary">{COPY[role]}</Typography>
      </Box>
      <IconButton aria-label={loading ? 'Loading records' : refreshing ? 'Updating records' : 'Refresh records'} aria-busy={loading || refreshing} disabled={loading || refreshing} sx={styles.refreshIcon} onClick={() => void fetchData()}>
        <RefreshCw size={18} />
      </IconButton>
    </Box>

    {error && <Alert severity="error" action={<Button color="inherit" onClick={() => void fetchData()}>Try again</Button>}>
      {error} Sales waiting on this phone are safe and will send later.
    </Alert>}

    {!owner && <HeldSales />}

    {owner && (loading && records.length === 0 ? <LoadingState pieces={[{ k: 'tiles', n: 4, cols: 2 }]} label="Loading totals" /> : records.length > 0 && <Box sx={styles.pair}>
      <StatTile tone="primary" label={owner ? 'Total sales' : todayOnly ? 'Sales today' : 'Sales'} value={naira(salesSummary.sales)} caption={`${salesSummary.salesCount} sale${salesSummary.salesCount === 1 ? '' : 's'}`} />
      <StatTile tone={summary.owedCount ? 'error' : 'neutral'} label="Still owed" value={naira(summary.owed)} caption={`${summary.owedCount} unpaid job${summary.owedCount === 1 ? '' : 's'}`} />
      {owner && <StatTile label="Expenses" value={naira(summary.expenses)} caption={`${summary.expenseCount} expense${summary.expenseCount === 1 ? '' : 's'}`} />}
      {owner && <StatTile label="Net profit" value={naira(summary.net)} caption="sales less expenses" />}
    </Box>)}

    <Box sx={styles.chips} role="group" aria-label="Period">
      {RANGES[role].map((r) => <Button key={r.id} variant={range === r.id ? 'contained' : 'outlined'} color="primary" sx={styles.chip} aria-pressed={range === r.id} onClick={() => { setRange(r.id); setPage(1); }}>{r.label}</Button>)}
      <Button variant={range === 'custom' ? 'contained' : 'outlined'} color="primary" sx={styles.chip} aria-pressed={range === 'custom'} startIcon={<CalendarRange size={16} />} onClick={() => { setRange('custom'); setPage(1); }}>Dates</Button>
    </Box>
    {range === 'custom' && <DateRangeFields start={customStart} end={customEnd} onStartChange={(value) => { setCustomStart(value); setPage(1); }} onEndChange={(value) => { setCustomEnd(value); setPage(1); }} />}

    <TextField label="Search" placeholder={owner ? 'Customer, job or date' : 'Customer or job'} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} type="search" slotProps={{ inputLabel: { shrink: true } }} />

    {tabs.length > 1 && <Box sx={styles.chips} role="group" aria-label="Show">
      {tabs.map((name) => <Button key={name} variant={tab === name ? 'contained' : 'outlined'} color="primary" sx={styles.chip} aria-pressed={tab === name} onClick={() => { setTab(name); setPage(1); }}>
        {name === 'Pending' ? 'Waiting' : name} · {count(name)}
      </Button>)}
    </Box>}

    <Box sx={styles.sortRow}>
      <Typography variant="body2" sx={styles.sortNote}>Sorted by <strong>{SORT_LABEL[sortBy]}</strong>, {orderText(sortBy, sortOrder)}{showCancelled ? ' · cancelled sales shown' : ''}</Typography>
      <Button variant="outlined" color="inherit" onClick={() => setSorting(true)}>Sort &amp; view</Button>
    </Box>

    {loading && records.length === 0 ? <LoadingState pieces={[{ k: 'list', n: 6 }]} label="Loading records" /> : sorted.length === 0 ? <Box sx={styles.emptyBox}>
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

    <ResponsiveSheet open={sorting} onClose={() => setSorting(false)} title="Sort and view">
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
        <FormControlLabel sx={styles.switchRow} labelPlacement="start" label="Show cancelled sales" control={<Switch checked={showCancelled}
          onChange={() => { const next = !showCancelled; showCancelledRef.current = next; setShowCancelled(next); setPage(1); if (next) void loadCancelled(); }} />} />
        <Button variant="contained" sx={styles.fullWidth} onClick={() => setSorting(false)}>Done</Button>
      </Box>
    </ResponsiveSheet>

    <RecordDetailsSheet record={viewing ?? (linked && linked.length === 1 ? linked[0] : null)} onClose={() => { setViewing(null); closeLinked(); }} onUpdate={() => void fetchData()} onReceipt={openReceipt} />
    <BatchDetailsSheet items={viewingBatch?.items ?? (linked && linked.length > 1 ? linked : null)} salesId={viewingBatch?.salesId ?? openRef} onClose={() => { setViewingBatch(null); closeLinked(); }} onUpdate={() => void fetchData()} onReceipt={openReceipt} />
    <ReceiptModal isOpen={!!receipt} onClose={() => setReceipt(null)} records={receipt?.records ?? []} salesId={receipt?.records[0]?.salesId} />
  </Box>;
}

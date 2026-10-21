"use client";

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Alert, Box, Button, IconButton, Paper, TextField, Typography, ButtonBase } from '@mui/material';
import { LoadingState } from '@/components/loading-state';
import { ChevronLeft, ChevronRight, Download, Users } from 'lucide-react';

import { customerStyles, recordsStyles as styles } from '@/app/theme';
import { HomeBackLink } from '@/components/back-link';
import { CustomerProfileSheet } from '@/components/customers/customer-profile-sheet';
import { CustomerTimelineModal } from '@/components/customer-timeline-modal';
import { ResponsiveSheet } from '@/components/responsive-sheet';
import { StatTile } from '@/components/stat-tile';
import { koboNaira } from '@/lib/approvals-view';
import {
  fromApi, fromSales, filterCustomers, initials, orderWord, shortNaira, sortCustomers, summarise, toCsv,
  type CustomerItem, type CustomerSort, type SortOrder,
} from '@/lib/customers-view';
import { SYSTEM_DEFAULTS } from '@/lib/constants';
import { paymentContext } from '@/lib/payment-outbox';
import { useSyncStore } from '@/lib/store';

const SORT_LABEL: Record<CustomerSort, string> = { name: 'name', orders: 'orders', spent: 'value', owed: 'debt' };
const orderText = (by: CustomerSort, order: SortOrder) => by === 'name' ? (order === 'asc' ? 'A to Z' : 'Z to A') : (order === 'desc' ? 'highest first' : 'lowest first');

/** One Customers page for both roles. Customers come from the database (with IDs and profiles); a sheet-backed app falls back to names on the sales rows. */
export function CustomersPage({ role }: { role: 'owner' | 'cashier' }) {
  const owner = role === 'owner';
  const { cachedSales } = useSyncStore();
  const [backend, setBackend] = useState<'postgres' | 'sheets' | null>(null);
  const [rows, setRows] = useState<CustomerItem[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [owingOnly, setOwingOnly] = useState(false);
  const [noPhoneOnly, setNoPhoneOnly] = useState(false);
  const [sortBy, setSortBy] = useState<CustomerSort>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState(false);
  const [openKey, setOpenKey] = useState('');
  // A link from the bell (?open=CUS-0001) opens that customer's profile; closing it lets the page behave normally again.
  const wanted = useSearchParams().get('open') ?? '';
  const [dismissed, setDismissed] = useState('');
  const perPage = SYSTEM_DEFAULTS.PAGINATION_ITEMS_PER_PAGE;

  const load = useCallback(async () => {
    setRefreshing(true); setError('');
    try {
      const context = await paymentContext();
      if (context.backend === 'postgres') {
        const response = await fetch('/api/accounting/customers', { cache: 'no-store' }), result = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(result?.data)) throw new Error(result?.error || 'Customers could not be loaded.');
        setRows(result.data.map(fromApi)); setBackend('postgres');
      } else {
        const response = await fetch('/api/sales'), result = await response.json().catch(() => null);
        if (response.ok && Array.isArray(result?.data)) useSyncStore.setState({ cachedSales: result.data });
        else if (!cachedSales.length) throw new Error(result?.error || 'Customers could not be loaded.');
        setBackend('sheets');
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Customers could not be loaded.'); }
    finally { setRefreshing(false); }
  }, [cachedSales.length]);
  useEffect(() => {
    void Promise.resolve().then(load);
    window.addEventListener('bomedia-data-changed', load);
    return () => window.removeEventListener('bomedia-data-changed', load);
  }, [load]);

  const all = backend === 'postgres' ? rows : backend === 'sheets' ? fromSales(cachedSales as Record<string, string>[]) : null;
  const sorted = all ? sortCustomers(filterCustomers(all, search, owingOnly, noPhoneOnly), sortBy, sortOrder) : [];
  const totalPages = Math.max(1, Math.ceil(sorted.length / perPage));
  const currentPage = Math.min(page, totalPages);
  const shown = sorted.slice((currentPage - 1) * perPage, currentPage * perPage);
  const stats = all ? summarise(all) : null;
  const noPhoneCount = all ? all.filter((c) => !c.contact.trim()).length : 0;
  const key = (c: CustomerItem) => c.id ?? c.name;
  const open = all?.find((c) => key(c) === openKey) ?? (wanted && wanted !== dismissed ? all?.find((c) => c.reference === wanted) ?? null : null);

  const exportCsv = () => {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([toCsv(sorted)], { type: 'text/csv' })), download: `customers-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click(); URL.revokeObjectURL(a.href);
  };

  return <Box sx={styles.screen}>
    <HomeBackLink />
    <Box sx={styles.heading}>
      <Typography variant="h3" component="h1">Customers</Typography>
      <Typography color="text.secondary">Everyone you have sold to, and what they still owe.</Typography>
    </Box>

    {error && <Alert severity="error" action={<Button color="inherit" onClick={() => void load()}>Try again</Button>}>{error}</Alert>}

    {!stats ? <LoadingState pieces={[{ k: 'tiles', n: owner ? 4 : 2, cols: 2 }]} label="Loading totals" /> : <Box sx={styles.pair}>
      <StatTile label="Customers" value={stats.count} />
      <StatTile tone={stats.owedKobo ? 'error' : 'neutral'} label="Still owed" value={koboNaira(stats.owedKobo)} caption={`${stats.owingCount} debtor${stats.owingCount === 1 ? '' : 's'}`} />
      {owner && <StatTile tone="primary" label="Top spender" value={stats.top ? stats.top.name : '—'} caption={stats.top ? `${koboNaira(stats.top.totalKobo)} in ${orderWord(stats.top.orders)}` : 'No sales yet'} />}
      {owner && <StatTile tone={stats.owingCount ? 'warning' : 'neutral'} label="Biggest debtor" value={stats.topDebtor ? stats.topDebtor.name : 'None'} caption={stats.topDebtor ? `Owes ${koboNaira(stats.topDebtor.owedKobo)}` : 'Everyone has paid'} />}
    </Box>}

    <TextField type="search" label="Search" placeholder="Name, phone or customer ID" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
    <Box sx={styles.chips} role="group" aria-label="Show">
      <Button variant={!owingOnly && !noPhoneOnly ? 'contained' : 'outlined'} color={!owingOnly && !noPhoneOnly ? 'primary' : 'inherit'} sx={styles.chip} aria-pressed={!owingOnly && !noPhoneOnly} onClick={() => { setOwingOnly(false); setNoPhoneOnly(false); setPage(1); }}>All · {stats?.count ?? 0}</Button>
      <Button variant={owingOnly ? 'contained' : 'outlined'} color={owingOnly ? 'primary' : 'inherit'} sx={styles.chip} aria-pressed={owingOnly} onClick={() => { setOwingOnly(true); setNoPhoneOnly(false); setPage(1); }}>Debtors only · {stats?.owingCount ?? 0}</Button>
      <Button variant={noPhoneOnly ? 'contained' : 'outlined'} color={noPhoneOnly ? 'primary' : 'inherit'} sx={styles.chip} aria-pressed={noPhoneOnly} onClick={() => { setNoPhoneOnly(true); setOwingOnly(false); setPage(1); }}>No phone · {noPhoneCount}</Button>
    </Box>
    <Box sx={styles.sortRow}>
      <Typography variant="body2" sx={styles.sortNote}>Sorted by <strong>{SORT_LABEL[sortBy]}</strong>, {orderText(sortBy, sortOrder)}</Typography>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button variant="outlined" color="inherit" onClick={() => setSorting(true)}>Sort</Button>
        <Button variant="outlined" color="inherit" startIcon={<Download size={16} />} disabled={!sorted.length} onClick={exportCsv}>Export</Button>
      </Box>
    </Box>

    {!all ? <LoadingState pieces={[{ k: 'list', n: 6 }]} label="Loading customers" /> : !sorted.length ? <Box sx={styles.emptyBox}>
      <Box sx={styles.emptyIcon}><Users size={22} /></Box>
      <Typography sx={styles.emptyTitle}>{search.trim() ? `No customer matches "${search.trim()}"` : owingOnly ? 'No debtors' : noPhoneOnly ? 'Every customer has a phone number' : 'No customers yet'}</Typography>
      <Typography variant="body2" sx={styles.emptyText}>{search.trim() ? 'Try a shorter word, or clear the search.' : owingOnly ? 'Every customer has paid in full.' : noPhoneOnly ? 'Nothing to fix here.' : 'Customers appear here once you record a sale.'}</Typography>
      {(search.trim() || owingOnly || noPhoneOnly) && <Button variant="outlined" onClick={() => { setSearch(''); setOwingOnly(false); setNoPhoneOnly(false); setPage(1); }}>Show everyone</Button>}
    </Box> : <Paper variant="outlined" sx={styles.group}>
      {shown.map((c) => <Box key={key(c)} sx={styles.row}>
        <ButtonBase onClick={() => setOpenKey(key(c))} sx={styles.rowButton} aria-label={`${c.name}${c.reference ? `, ${c.reference}` : ''}. ${c.owedKobo > 0 ? `Owes ${shortNaira(c.owedKobo)}` : 'Paid up'}. Open profile`}>
          <Box component="span" sx={[styles.iconTile, ...(c.owedKobo > 0 ? [styles.iconTileOwed] : [])]}>{initials(c.name)}</Box>
          <Box sx={styles.rowMain}>
            <Typography component="span" sx={styles.category}>{c.name}</Typography>
            <Typography variant="body2" component="span" sx={styles.meta}>
              {c.reference && <Box component="span" sx={customerStyles.ref}>{c.reference} · </Box>}
              {c.contact ? c.contact : <Box component="span" sx={customerStyles.noPhone}>No phone number</Box>} · {orderWord(c.orders)}
            </Typography>
          </Box>
          <Box component="span" sx={styles.rowEnd}>
            <Box component="span" sx={[customerStyles.tag, c.owedKobo > 0 ? customerStyles.tagOwes : customerStyles.tagPaid]}>{c.owedKobo > 0 ? `Owes ${shortNaira(c.owedKobo)}` : 'Paid up'}</Box>
          </Box>
        </ButtonBase>
      </Box>)}
    </Paper>}

    {sorted.length > perPage && <Box sx={styles.pager}>
      <IconButton aria-label="Previous page" disabled={currentPage === 1} sx={styles.pagerButton} onClick={() => setPage(Math.max(1, currentPage - 1))}><ChevronLeft size={18} /></IconButton>
      <Typography variant="body2" sx={styles.pagerText}>Page {currentPage} of {totalPages} · {sorted.length} customers</Typography>
      <IconButton aria-label="Next page" disabled={currentPage === totalPages} sx={styles.pagerButton} onClick={() => setPage(Math.min(totalPages, currentPage + 1))}><ChevronRight size={18} /></IconButton>
    </Box>}
    {refreshing && !!all && <Typography variant="caption" color="text.secondary">Updating…</Typography>}

    <ResponsiveSheet open={sorting} onClose={() => setSorting(false)} title="Sort customers">
      <Box sx={{ ...styles.sheetBody }}>
        <Box sx={styles.choices2} role="group" aria-label="Sort by">
          {(['name', 'orders', 'spent', 'owed'] as CustomerSort[]).map((by) => <Button key={by} variant={sortBy === by ? 'contained' : 'outlined'} color={sortBy === by ? 'primary' : 'inherit'} sx={styles.choice} aria-pressed={sortBy === by}
            onClick={() => { setSortBy(by); setSortOrder(by === 'name' ? 'asc' : 'desc'); setPage(1); }}>{SORT_LABEL[by].replace(/^./, (ch) => ch.toUpperCase())}</Button>)}
        </Box>
        <Box sx={styles.choices2} role="group" aria-label="Order">
          {(['asc', 'desc'] as SortOrder[]).map((order) => <Button key={order} variant={sortOrder === order ? 'contained' : 'outlined'} color={sortOrder === order ? 'primary' : 'inherit'} sx={styles.choice} aria-pressed={sortOrder === order}
            onClick={() => { setSortOrder(order); setPage(1); }}>{orderText(sortBy, order).replace(/^./, (ch) => ch.toUpperCase())}</Button>)}
        </Box>
        <Button variant="contained" onClick={() => setSorting(false)}>Done</Button>
      </Box>
    </ResponsiveSheet>

    {open && open.id && <CustomerProfileSheet key={open.id} customer={{ ...open, id: open.id }} role={role} onClose={() => { setOpenKey(''); setDismissed(wanted); }} onChanged={() => void load()} />}
    {open && !open.id && <CustomerTimelineModal clientName={open.name} isOpen contact={open.contact} onClose={() => { setOpenKey(''); setDismissed(wanted); }} onUpdate={() => void load()} theme={owner ? 'brand' : 'amber'} />}
  </Box>;
}

// What the Records page shows, moved out of the two page files unchanged so the owner and cashier views share one copy.
// Nothing here is new behaviour: each function is the logic that used to sit inline in app/bom03/records/page.tsx or
// app/cashier/records/page.tsx, with the places where the two pages differed made explicit by `role`.
import { format, isSameDay, isWithinInterval, startOfDay, subDays } from 'date-fns';
import { hasOutstandingDebt } from '@/lib/balance-display';
import { dayFromText } from '@/lib/expense-list';
import { parseAmount } from '@/lib/financial-utils';
import type { UnifiedRecord } from '@/components/manage-sale-action';

export type RecordStatus = 'Settled' | 'Part-payment' | 'In Progress' | 'Syncing' | 'Cancelled';
export type RecordsRole = 'owner' | 'cashier';
export type Row = Record<string, string>;
export type DateRange = 'all' | 'today' | '7d' | '30d' | 'custom';
export type RecordTab = 'All' | 'Sales' | 'Expenses' | 'Pending';
export type SortBy = 'date' | 'name' | 'debt';
export type SortOrder = 'asc' | 'desc';
export type QueueEntry = { type: string; data: any; timestamp?: number };
export type GroupUnit = { type: 'group'; salesId: string; items: UnifiedRecord[] };
export type FlatUnit = { type: 'flat'; record: UnifiedRecord };
export type DisplayUnit = GroupUnit | FlatUnit;

export const parseSheetDate = (dateStr: any): string => {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? dateStr : format(d, 'MMM dd, yyyy');
};

export const mapSale = (r: Row, isPending: boolean, timestamp?: number): UnifiedRecord => {
  const amount = parseAmount(r['AMOUNT (₦)'] || r['Amount (₦)']);
  let status: RecordStatus = 'In Progress';
  const rawStatus = r['PAYMENT STATUS'];
  if (rawStatus === 'Paid') status = 'Settled';
  else if (rawStatus === 'Part-payment') status = 'Part-payment';
  else if (rawStatus === 'Unpaid') status = 'In Progress';
  if (isPending) status = 'Syncing';
  // A cancelled sale keeps its record (and its history) but is no longer owed or paid.
  if ((r['JOB STATUS'] || r['Job Status']) === 'Cancelled') status = 'Cancelled';
  return {
    id: `sale-${r.DATE}-${r['CLIENT NAME']}-${Math.random()}`,
    date: parseSheetDate(r.DATE || r.Date),
    type: 'Sale',
    client: r['CLIENT NAME'] || r['Client Name'] || 'N/A',
    contact: r['CONTACT'] || r['Contact'] || '',
    description: r['JOB DESCRIPTION'] || r['Job Description'] || '—',
    amount, status,
    loggedBy: r['Logged By'] || 'Unknown',
    isPending,
    rowIndex: r._rowIndex ? parseInt(r._rowIndex.toString()) : undefined,
    timestamp,
    additionalPayment1: parseAmount(r['ADDITIONAL PAYMENT 1'] || r['Additional Payment 1']),
    additionalPayment2: parseAmount(r['ADDITIONAL PAYMENT 2'] || r['Additional Payment 2']),
    jobStatus: r['JOB STATUS'] || r['Job Status'] || 'Quoted',
    material: r['Material'] || r['MATERIAL'] || r['material'] || '',
    // Read the sheet's own AMOUNT DIFFERENCES column rather than recomputing. It carries the same formula (amount less
    // every payment) but keeps the sign, so overpayments stay negative instead of being clamped to zero. Pending rows
    // supply "0" here, so they don't read as a false credit while their amount formula is still unevaluated.
    balance: parseAmount(r['AMOUNT DIFFERENCES'] || r['Amount Differences']),
    salesId: r['Sales ID'] || r['SALES ID'] || r['Sales Id'] || '',
    raw: r,
  };
};

export const mapExpense = (r: Row, isPending: boolean, timestamp?: number): UnifiedRecord => {
  // parseAmount, not a bare parseFloat: the sheet stores expense amounts currency-formatted ("₦184,000.00"), and
  // stripping only commas leaves the naira sign behind, which parses as NaN and silently becomes zero.
  const amount = parseAmount(r['AMOUNT']);
  return {
    id: `expense-${r.DATE}-${r.DESCRIPTION}-${Math.random()}`,
    date: r.DATE,
    type: 'Expense',
    client: r['PAID TO'] || 'N/A',
    description: r.DESCRIPTION || r.CATEGORY || '—',
    amount,
    // An expense the books hold as Unpaid is still owed, so it reads In Progress. Rows with no status (older sheet rows) stay Settled.
    status: isPending ? 'Syncing' : r.STATUS === 'Unpaid' ? 'In Progress' : 'Settled',
    loggedBy: r['Logged By'] || 'Unknown',
    isPending,
    rowIndex: r._rowIndex ? parseInt(r._rowIndex.toString()) : undefined,
    timestamp,
    material: r.CATEGORY || r.Category || '',
    raw: r,
  };
};

const pendingSalesFrom = (queue: QueueEntry[]) => queue.filter((item) => item.type === 'sale').map((item) => {
  const v = item.data;
  return mapSale({
    'DATE': v[0], 'CLIENT NAME': v[1], 'JOB DESCRIPTION': v[2], 'CONTACT': v[3],
    'Material': v[4], 'QTY': v[12], 'AMOUNT (₦)': '0',
    'INITIAL PAYMENT (₦)': v[14], 'PAYMENT STATUS': v[19],
    'JOB STATUS': v[20] || 'Quoted', 'Logged By': v[21],
    'ADDITIONAL PAYMENT 1': '0', 'ADDITIONAL PAYMENT 2': '0',
    'AMOUNT DIFFERENCES': '0', 'SALES ID': v[22],
  }, true, item.timestamp);
});

const pendingExpensesFrom = (queue: QueueEntry[]) => queue
  .filter((item) => item.type === 'expense')
  .flatMap((item) => {
    if (item.data && item.data.batch === true && Array.isArray(item.data.items)) {
      return item.data.items.map((it: any) => mapExpense(it, true, item.timestamp));
    }
    return [mapExpense(item.data, true, item.timestamp)];
  });

/** Waiting entries first, then what the books hold. The cashier sees sales only. */
export function buildRecords(role: RecordsRole, input: { sales: Row[]; expenses: Row[]; queue: QueueEntry[] }): UnifiedRecord[] {
  const pendingSales = pendingSalesFrom(input.queue);
  const syncedSales = input.sales.map((r) => mapSale(r, false));
  if (role === 'cashier') return [...pendingSales, ...syncedSales];
  const pendingExpenses = pendingExpensesFrom(input.queue);
  const syncedExpenses = input.expenses.map((r) => mapExpense(r, false));
  return [...pendingSales, ...pendingExpenses, ...syncedSales, ...syncedExpenses];
}

export const salesOnly = (records: UnifiedRecord[]) => records.filter((r) => r.type === 'Sale');

export function filterByDate(role: RecordsRole, records: UnifiedRecord[], range: DateRange, custom: { start: string; end: string }, now: Date): UnifiedRecord[] {
  if (role === 'owner') {
    return records.filter((r) => {
      if (range === 'all') return true;
      const d = new Date(r.date);
      if (Number.isNaN(d.getTime())) return true;
      if (range === '7d') return isWithinInterval(d, { start: subDays(now, 7), end: now });
      if (range === '30d') return isWithinInterval(d, { start: subDays(now, 30), end: now });
      if (range === 'custom' && custom.start && custom.end) return isWithinInterval(d, { start: startOfDay(new Date(custom.start)), end: new Date(custom.end + 'T23:59:59') });
      return true;
    });
  }
  const sevenDaysAgo = subDays(now, 7);
  return records.filter((r) => {
    const dateStr = r.raw.DATE || r.raw.Date;
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return false;
    if (range === 'today') {
      if (isSameDay(d, now)) return true;
      if (isWithinInterval(d, { start: sevenDaysAgo, end: now }) && (r.balance || 0) > 0) return true;
      return false;
    }
    if (range === '7d') return isWithinInterval(d, { start: subDays(now, 7), end: now });
    if (range === '30d') return isWithinInterval(d, { start: subDays(now, 30), end: now });
    if (range === 'custom' && custom.start && custom.end) return isWithinInterval(d, { start: startOfDay(new Date(custom.start)), end: new Date(custom.end + 'T23:59:59') });
    return false;
  });
}

export function filterRecords(role: RecordsRole, records: UnifiedRecord[], opts: { search: string; tab: RecordTab; sortBy: SortBy }): UnifiedRecord[] {
  const { search, tab, sortBy } = opts;
  const needle = search.toLowerCase();
  return records.filter((r) => {
    if (role === 'owner') {
      const matchesSearch = r.client.toLowerCase().includes(needle) || r.description.toLowerCase().includes(needle) || r.date.includes(search);
      // Sorting by debt turns the list into a debtors view, so settled and overpaid rows drop out rather than sorting to the
      // bottom. Expenses carry no balance, so they drop out too.
      if (sortBy === 'debt' && !(r.type === 'Sale' && hasOutstandingDebt(r.balance, !!r.raw?._jobId))) return false;
      if (tab === 'Sales') return matchesSearch && r.type === 'Sale';
      if (tab === 'Expenses') return matchesSearch && r.type === 'Expense';
      if (tab === 'Pending') return matchesSearch && r.isPending;
      return matchesSearch;
    }
    const matchesSearch = r.client.toLowerCase().includes(needle) || r.description.toLowerCase().includes(needle);
    if (sortBy === 'debt' && !hasOutstandingDebt(r.balance, !!r.raw?._jobId)) return false;
    if (tab === 'Pending') return matchesSearch && r.isPending;
    return matchesSearch;
  });
}

export function sortRecords(role: RecordsRole, records: UnifiedRecord[], sortBy: SortBy, sortOrder: SortOrder): UnifiedRecord[] {
  return [...records].sort((a, b) => {
    let comparison = 0;
    if (sortBy === 'date') {
      const timeA = new Date(a.date).getTime();
      const timeB = new Date(b.date).getTime();
      comparison = (Number.isNaN(timeA) ? 0 : timeA) - (Number.isNaN(timeB) ? 0 : timeB);
      if (comparison === 0) {
        if (a.isPending && !b.isPending) comparison = 1;
        else if (!a.isPending && b.isPending) comparison = -1;
        else if (a.isPending && b.isPending) comparison = (a.timestamp || 0) - (b.timestamp || 0);
        else comparison = (a.rowIndex || 0) - (b.rowIndex || 0);
      }
    } else if (sortBy === 'name') {
      comparison = a.client.localeCompare(b.client);
    } else if (sortBy === 'debt') {
      const debtA = role === 'owner' ? (a.type === 'Sale' ? (a.balance || 0) : 0) : (a.balance || 0);
      const debtB = role === 'owner' ? (b.type === 'Sale' ? (b.balance || 0) : 0) : (b.balance || 0);
      comparison = debtA - debtB;
    }
    return sortOrder === 'asc' ? comparison : -comparison;
  });
}

export type RecordsSummary = { sales: number; salesCount: number; expenses: number; expenseCount: number; net: number; owed: number; owedCount: number };

/** The totals over the records inside the chosen period. Outstanding debt reads the sheet's own difference column. */
export function summarise(dateFiltered: UnifiedRecord[]): RecordsSummary {
  const sales = dateFiltered.filter((r) => r.type === 'Sale');
  const expenses = dateFiltered.filter((r) => r.type === 'Expense');
  const salesTotal = sales.reduce((sum, r) => sum + r.amount, 0);
  const expensesTotal = expenses.reduce((sum, r) => sum + r.amount, 0);
  let owed = 0;
  let owedCount = 0;
  for (const r of sales) {
    const balance = parseAmount(r.raw['AMOUNT DIFFERENCES'] || r.raw['Amount Differences']);
    if (balance > 0) { owed += balance; owedCount += 1; }
  }
  return { sales: salesTotal, salesCount: sales.length, expenses: expensesTotal, expenseCount: expenses.length, net: salesTotal - expensesTotal, owed, owedCount };
}

/** Sales sharing a Sales ID become one batch row, placed where its first item sorted. */
export function groupUnits(sorted: UnifiedRecord[]): DisplayUnit[] {
  const groups = new Map<string, UnifiedRecord[]>();
  sorted.forEach((r) => {
    if (r.salesId && r.salesId.trim() !== '' && r.type === 'Sale') {
      const existing = groups.get(r.salesId) ?? [];
      existing.push(r);
      groups.set(r.salesId, existing);
    }
  });
  const seen = new Set<string>();
  const units: DisplayUnit[] = [];
  sorted.forEach((r) => {
    if (r.salesId && r.salesId.trim() !== '' && r.type === 'Sale') {
      if (!seen.has(r.salesId)) {
        seen.add(r.salesId);
        units.push({ type: 'group', salesId: r.salesId, items: groups.get(r.salesId)! });
      }
    } else {
      units.push({ type: 'flat', record: r });
    }
  });
  return units;
}

export const groupStatus = (items: UnifiedRecord[]): RecordStatus => {
  if (items.some((r) => r.status === 'Syncing')) return 'Syncing';
  if (items.length && items.every((r) => r.status === 'Cancelled')) return 'Cancelled';
  if (items.every((r) => r.status === 'Settled')) return 'Settled';
  if (items.some((r) => r.status === 'Part-payment')) return 'Part-payment';
  return 'In Progress';
};

/** The calendar day a record belongs to (YYYY-MM-DD, or '' when unreadable): the sheet's own date first, then the shown one. */
export const recordDay = (record: UnifiedRecord): string => dayFromText(record.raw?.DATE || record.raw?.Date || record.date);
export const unitDay = (unit: DisplayUnit): string => recordDay(unit.type === 'group' ? unit.items[0] : unit.record);

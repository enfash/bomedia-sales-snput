"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  RefreshCw, Search, Users, Wallet, ArrowUpDown,
  ShoppingBag, ChevronLeft, ChevronRight,
  TrendingUp, AlertCircle, CheckCircle2, Calendar,
  Activity, Download, Filter, PhoneCall,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useSyncStore } from "@/lib/store";
import { WhatsAppReminder } from "@/components/whatsapp-reminder";
import { formatDistanceToNow } from "date-fns";
import { CustomerTimelineModal } from "@/components/customer-timeline-modal";

// ── Helpers ───────────────────────────────────────────────────────────────────

const parseAmount = (val: any): number =>
  parseFloat(String(val ?? "0").replace(/[₦,\s]/g, "")) || 0;

const formatDate = (dateStr: string): string => {
  if (!dateStr || dateStr === "N/A") return "—";
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? dateStr : formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return dateStr;
  }
};

const getInitials = (name: string) =>
  name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");

const AVATAR_COLORS = [
  "bg-violet-500", "bg-blue-500", "bg-emerald-500",
  "bg-orange-500", "bg-rose-500", "bg-cyan-500", "bg-amber-500",
];
const getAvatarColor = (name: string) =>
  AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];

// ── Types ─────────────────────────────────────────────────────────────────────

interface CustomerMetrics {
  name: string;
  contact: string;
  totalOrders: number;
  totalSpent: number;
  totalDebt: number;
  lastOrderDate: string;
}

type SortKey = "name" | "orders" | "spent" | "debt";

// ── Custom hook ───────────────────────────────────────────────────────────────

function useCustomers() {
  const { cachedSales, setCachedData, cachedExpenses } = useSyncStore();
  const [loading, setLoading]       = useState(cachedSales.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]         = useState("");
  const [sortBy, setSortBy]         = useState<SortKey>("spent");
  const [sortOrder, setSortOrder]   = useState<"asc" | "desc">("desc");
  const [debtorsOnly, setDebtorsOnly] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedClient, setSelectedClient] = useState<{ name: string; contact: string } | null>(null);
  const ITEMS_PER_PAGE = 50;

  const fetchData = useCallback(async () => {
    if (cachedSales.length === 0) setLoading(true); else setRefreshing(true);
    try {
      const [sRes, eRes, pRes] = await Promise.all([
        fetch("/api/sales"),
        fetch("/api/expenses"),
        fetch("/api/payments"),
      ]);
      const [sJson, eJson, pJson] = await Promise.all([sRes.json(), eRes.json(), pRes.json()]);
      setCachedData(sJson.data ?? [], eJson.data ?? [], undefined, pJson.data ?? []);
    } catch (err) {
      console.error("Customers: fetch error", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const customerMap = useMemo<CustomerMetrics[]>(() => {
    const map = new Map<string, CustomerMetrics>();
    cachedSales.forEach((s) => {
      const name    = (s["CLIENT NAME"] || s["Client Name"] || "Walking Customer").trim();
      const contact = (s["CONTACT"]     || s["Contact"]     || "").trim();
      const amount  = parseAmount(s["TOTAL"] || s["Total"] || s["AMOUNT (₦)"] || s["Amount (₦)"] || s["INITIAL PAYMENT (₦)"]);
      const total   = parseAmount(s["AMOUNT (₦)"]          || s["Amount (₦)"]);
      const init    = parseAmount(s["INITIAL PAYMENT (₦)"] || s["Initial Payment (₦)"]);
      const addl1   = parseAmount(s["ADDITIONAL PAYMENT 1"] || s["Additional Payment 1"]);
      const addl2   = parseAmount(s["ADDITIONAL PAYMENT 2"] || s["Additional Payment 2"]);
      const debt    = Math.max(0, total - init - addl1 - addl2);
      const date    = s["DATE"] || s["Date"] || "N/A";

      const existing = map.get(name);
      if (existing) {
        existing.totalOrders += 1;
        existing.totalSpent  += amount;
        existing.totalDebt   += debt;
        if (date !== "N/A" && (existing.lastOrderDate === "N/A" || new Date(date) > new Date(existing.lastOrderDate)))
          existing.lastOrderDate = date;
        if (!existing.contact && contact) existing.contact = contact;
      } else {
        map.set(name, { name, contact, totalOrders: 1, totalSpent: amount, totalDebt: debt, lastOrderDate: date });
      }
    });
    return Array.from(map.values());
  }, [cachedSales]);

  const filtered = useMemo(() =>
    customerMap.filter(c => {
      const q = search.toLowerCase();
      return (!debtorsOnly || c.totalDebt > 0) &&
        (c.name.toLowerCase().includes(q) || c.contact.includes(search));
    }),
    [customerMap, search, debtorsOnly],
  );

  const sorted = useMemo(() =>
    [...filtered].sort((a, b) => {
      const cmp =
        sortBy === "name"   ? a.name.localeCompare(b.name) :
        sortBy === "orders" ? a.totalOrders - b.totalOrders :
        sortBy === "spent"  ? a.totalSpent  - b.totalSpent :
                              a.totalDebt   - b.totalDebt;
      return sortOrder === "asc" ? cmp : -cmp;
    }),
    [filtered, sortBy, sortOrder],
  );

  const totalPages = Math.ceil(sorted.length / ITEMS_PER_PAGE);
  const paginated  = sorted.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  useEffect(() => { setCurrentPage(1); }, [search, sortBy, sortOrder, debtorsOnly]);

  const stats = useMemo(() => ({
    totalClients:    customerMap.length,
    aggregateDebt:   customerMap.reduce((s, c) => s + Math.max(0, c.totalDebt), 0),
    clientsWithDebt: customerMap.filter(c => c.totalDebt > 0).length,
    topSpender:      customerMap.length === 0 ? null :
                     customerMap.reduce((m, c) => c.totalSpent > m.totalSpent ? c : m, customerMap[0]),
  }), [customerMap]);

  const exportCSV = useCallback(() => {
    const rows = [
      ["Name", "Contact", "Orders", "Total Spent (₦)", "Debt (₦)", "Last Order"],
      ...sorted.map(c => [
        c.name, c.contact || "—", c.totalOrders,
        c.totalSpent.toFixed(2), c.totalDebt.toFixed(2),
        c.lastOrderDate === "N/A" ? "—" : c.lastOrderDate,
      ]),
    ].map(r => r.join(",")).join("\n");

    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([rows], { type: "text/csv" })),
      download: `customers-${new Date().toISOString().slice(0, 10)}.csv`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
  }, [sorted]);

  return {
    loading, refreshing, fetchData,
    search, setSearch,
    sortBy, setSortBy,
    sortOrder, setSortOrder,
    debtorsOnly, setDebtorsOnly,
    currentPage, setCurrentPage,
    totalPages, paginated, sorted,
    stats,
    selectedClient, setSelectedClient,
    exportCSV,
    ITEMS_PER_PAGE,
  };
}

// ── Skeleton components ───────────────────────────────────────────────────────

function SkeletonRow() {
  const cell = "h-4 rounded bg-gray-200 dark:bg-zinc-700 animate-pulse";
  return (
    <TableRow className="border-b border-gray-50 dark:border-zinc-800/60">
      <TableCell className="pl-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-zinc-700 animate-pulse shrink-0" />
          <div className={cn(cell, "w-28")} />
        </div>
      </TableCell>
      <TableCell><div className={cn(cell, "w-24")} /></TableCell>
      <TableCell className="text-center"><div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-zinc-700 animate-pulse mx-auto" /></TableCell>
      <TableCell><div className={cn(cell, "w-20 ml-auto")} /></TableCell>
      <TableCell><div className={cn(cell, "w-16 ml-auto")} /></TableCell>
      <TableCell><div className={cn(cell, "w-20 mx-auto")} /></TableCell>
      <TableCell><div className={cn(cell, "w-16 mx-auto")} /></TableCell>
    </TableRow>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-zinc-700 animate-pulse shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="h-4 w-32 rounded bg-gray-200 dark:bg-zinc-700 animate-pulse" />
          <div className="h-3 w-24 rounded bg-gray-200 dark:bg-zinc-700 animate-pulse" />
        </div>
        <div className="h-8 w-8 rounded-lg bg-gray-100 dark:bg-zinc-800 animate-pulse" />
      </div>
      <div className="h-14 rounded-xl bg-gray-100 dark:bg-zinc-800/60 animate-pulse" />
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ContactChip({ contact }: { contact: string }) {
  if (!contact) return <span className="text-gray-300 dark:text-zinc-600 text-xs">—</span>;
  return (
    <a
      href={`tel:${contact}`}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-zinc-400 hover:text-primary dark:hover:text-primary transition-colors group"
      onClick={e => e.stopPropagation()}
    >
      <PhoneCall className="w-3 h-3 text-gray-400 group-hover:text-primary transition-colors" />
      {contact}
    </a>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 py-20 text-gray-400">
      <Users className="w-10 h-10 opacity-20" />
      <p className="text-sm font-medium">
        {filtered ? "No clients match your filters." : "No clients yet."}
      </p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CustomersPage({ isAdmin = true }: { isAdmin?: boolean }) {
  const {
    loading, refreshing, fetchData,
    search, setSearch,
    sortBy, setSortBy,
    sortOrder, setSortOrder,
    debtorsOnly, setDebtorsOnly,
    currentPage, setCurrentPage,
    totalPages, paginated, sorted,
    stats,
    selectedClient, setSelectedClient,
    exportCSV,
    ITEMS_PER_PAGE,
  } = useCustomers();

  const isFiltered = !!search || debtorsOnly;

  return (
    <div className="p-3 md:p-8 bg-slate-50/80 dark:bg-zinc-950 min-h-screen pb-32 transition-colors duration-500">

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-black text-primary flex items-center gap-2">
              <Users className="w-8 h-8" /> Customer Manager
            </h1>
            {refreshing && (
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-primary uppercase tracking-wider bg-primary/5 dark:bg-primary/20 px-2 py-0.5 rounded-full animate-pulse border border-primary/20">
                <RefreshCw className="w-2.5 h-2.5 animate-spin" /> Updating…
              </span>
            )}
          </div>
          <p className="text-gray-500 dark:text-zinc-400 text-xs font-medium mt-1">
            {stats.totalClients} clients · {stats.clientsWithDebt} with outstanding balance
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}
            disabled={loading || sorted.length === 0}
            className="bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800 text-gray-700 dark:text-zinc-300 shadow-sm rounded-xl h-11 px-4 font-bold hover:bg-gray-50 dark:hover:bg-zinc-800">
            <Download className="w-4 h-4 mr-2" /> Export
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData}
            disabled={loading || refreshing}
            className="bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800 text-gray-700 dark:text-zinc-300 shadow-sm rounded-xl h-11 px-5 font-bold hover:bg-gray-50 dark:hover:bg-zinc-800">
            <RefreshCw className={cn("w-4 h-4 mr-2", (loading || refreshing) && "animate-spin")} />
            {loading ? "Loading…" : refreshing ? "Updating…" : "Refresh"}
          </Button>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className={cn("grid grid-cols-2 gap-4 mb-8", isAdmin ? "md:grid-cols-3" : "md:grid-cols-2")}>

        {/* Total Clients */}
        <Card className="bg-white dark:bg-zinc-900 border-0 shadow-sm overflow-hidden relative hover:shadow-md transition-all">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent dark:from-primary/10" />
          <div className="absolute top-0 left-0 w-1 h-full bg-primary rounded-l" />
          <div className="relative p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-black text-gray-500 dark:text-zinc-500 uppercase tracking-widest">Total Clients</span>
              <div className="p-2 rounded-xl bg-primary/10 dark:bg-primary/20 text-primary">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <p className="text-3xl font-black text-gray-900 dark:text-white">{stats.totalClients}</p>
            <p className="text-[10px] text-primary font-bold mt-1 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> All-time unique clients
            </p>
          </div>
        </Card>

        {/* Unpaid Debt */}
        <Card className="bg-white dark:bg-zinc-900 border-0 shadow-sm overflow-hidden relative hover:shadow-md transition-all">
          <div className="absolute inset-0 bg-gradient-to-br from-rose-50 to-transparent dark:from-rose-950/20" />
          <div className="absolute top-0 left-0 w-1 h-full bg-rose-500 rounded-l" />
          <div className="relative p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-black text-gray-500 dark:text-zinc-500 uppercase tracking-widest">Unpaid Debt</span>
              <div className="p-2 rounded-xl bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400">
                <Wallet className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-gray-900 dark:text-white">₦{stats.aggregateDebt.toLocaleString()}</p>
            <p className="text-[10px] text-rose-600 dark:text-rose-400 font-bold mt-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> Across {stats.clientsWithDebt} clients
            </p>
          </div>
        </Card>

        {/* Top Spender (admin only) */}
        {isAdmin && (
          <Card className="col-span-2 md:col-span-1 bg-white dark:bg-zinc-900 border-0 shadow-sm overflow-hidden relative hover:shadow-md transition-all">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 to-transparent dark:from-emerald-950/20" />
            <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500 rounded-l" />
            <div className="relative p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-black text-gray-500 dark:text-zinc-500 uppercase tracking-widest">Top Spender</span>
                <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400">
                  <ShoppingBag className="w-4 h-4" />
                </div>
              </div>
              {stats.topSpender ? (
                <div className="flex items-center gap-3">
                  <div className={cn("w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-black shrink-0", getAvatarColor(stats.topSpender.name))}>
                    {getInitials(stats.topSpender.name)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-black text-gray-900 dark:text-white truncate">{stats.topSpender.name}</p>
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                      ₦{stats.topSpender.totalSpent.toLocaleString()} · {stats.topSpender.totalOrders} orders
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400">No data yet</p>
              )}
            </div>
          </Card>
        )}
      </div>

      {/* ── Search & Filters ── */}
      <div className="flex flex-col lg:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-zinc-500" />
          <Input
            className="pl-10 h-11 bg-white dark:bg-zinc-900 border-gray-100 dark:border-zinc-800 rounded-xl shadow-sm focus:ring-primary dark:text-zinc-100 dark:placeholder:text-zinc-600"
            placeholder="Search by name or contact…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 items-center flex-wrap">

          {/* Debtors-only toggle */}
          <button
            onClick={() => setDebtorsOnly(v => !v)}
            className={cn(
              "flex items-center gap-1.5 px-4 h-11 rounded-xl text-xs font-bold border transition-all",
              debtorsOnly
                ? "bg-rose-600 text-white border-rose-600 shadow"
                : "bg-white dark:bg-zinc-900 border-gray-100 dark:border-zinc-800 text-gray-600 dark:text-zinc-400 shadow-sm hover:border-rose-300 dark:hover:border-rose-700",
            )}
          >
            <Filter className="w-3.5 h-3.5" />
            Debtors only
            {debtorsOnly && (
              <span className="bg-white/25 rounded px-1.5">{sorted.length}</span>
            )}
          </button>

          {/* Sort tabs */}
          <div className="flex bg-white dark:bg-zinc-900 p-1 rounded-xl shadow-sm border border-gray-100 dark:border-zinc-800">
            {(["name", "orders", "spent", "debt"] as const).map(key => (
              <button key={key} onClick={() => setSortBy(key)}
                className={cn(
                  "px-3 py-2 rounded-lg text-xs font-bold transition-all capitalize",
                  sortBy === key
                    ? "bg-primary/10 dark:bg-primary/20 text-primary"
                    : "text-gray-500 dark:text-zinc-500 hover:text-gray-700 dark:hover:text-zinc-300",
                )}>
                {key === "spent" ? "Value" : key === "name" ? "Name" : key === "orders" ? "Orders" : "Debt"}
              </button>
            ))}
          </div>

          <Button variant="outline" size="icon"
            onClick={() => setSortOrder(o => o === "asc" ? "desc" : "asc")}
            className="h-11 w-11 rounded-xl border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm"
            title={sortOrder === "asc" ? "Ascending" : "Descending"}>
            <ArrowUpDown className={cn("w-4 h-4 text-primary transition-transform", sortOrder === "desc" && "rotate-180")} />
          </Button>
        </div>
      </div>

      {/* ── Desktop Table ── */}
      <div className="hidden md:block bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-gray-50 dark:border-zinc-800 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/80 dark:bg-zinc-800/60 hover:bg-gray-50/80 dark:hover:bg-zinc-800/60 border-none">
              <TableHead className="text-[10px] font-black uppercase text-gray-500 dark:text-zinc-500 py-4 pl-6">Client</TableHead>
              <TableHead className="text-[10px] font-black uppercase text-gray-500 dark:text-zinc-500">Contact</TableHead>
              <TableHead className="text-[10px] font-black uppercase text-gray-500 dark:text-zinc-500 text-center">Orders</TableHead>
              {isAdmin && <TableHead className="text-[10px] font-black uppercase text-gray-500 dark:text-zinc-500 text-right">Total Value</TableHead>}
              <TableHead className="text-[10px] font-black uppercase text-gray-500 dark:text-zinc-500 text-right">Debt</TableHead>
              <TableHead className="text-[10px] font-black uppercase text-gray-500 dark:text-zinc-500 text-center">Last Order</TableHead>
              <TableHead className="text-[10px] font-black uppercase text-gray-500 dark:text-zinc-500 text-center">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 7 }).map((_, i) => <SkeletonRow key={i} />)
            ) : paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isAdmin ? 7 : 6}>
                  <EmptyState filtered={isFiltered} />
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((client, idx) => (
                <TableRow
                  key={idx}
                  className="border-b border-gray-50 dark:border-zinc-800/60 hover:bg-gray-50/60 dark:hover:bg-zinc-800/40 transition-colors cursor-pointer"
                  onClick={() => setSelectedClient({ name: client.name, contact: client.contact })}
                >
                  <TableCell className="pl-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-black shrink-0", getAvatarColor(client.name))}>
                        {getInitials(client.name)}
                      </div>
                      <span className="text-sm font-bold text-gray-900 dark:text-white">{client.name}</span>
                    </div>
                  </TableCell>
                  <TableCell onClick={e => e.stopPropagation()}>
                    <ContactChip contact={client.contact} />
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 dark:bg-primary/20 text-primary text-xs font-black">
                      {client.totalOrders}
                    </span>
                  </TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                        ₦{client.totalSpent.toLocaleString()}
                      </span>
                    </TableCell>
                  )}
                  <TableCell className="text-right">
                    {client.totalDebt <= 0 ? (
                      <Badge className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900 font-bold text-[10px] gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Cleared
                      </Badge>
                    ) : (
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-sm font-black text-rose-600 dark:text-rose-400">
                          ₦{client.totalDebt.toLocaleString()}
                        </span>
                        {isAdmin && client.totalSpent > 0 && (
                          <div className="w-16 h-1 rounded-full bg-gray-100 dark:bg-zinc-700 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-rose-400"
                              style={{ width: `${Math.min(100, (client.totalDebt / client.totalSpent) * 100)}%` }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="text-[11px] font-medium text-gray-400 dark:text-zinc-500 flex items-center justify-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(client.lastOrderDate)}
                    </span>
                  </TableCell>
                  <TableCell className="text-center" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1.5">
                      <Button variant="outline" size="icon"
                        className="h-8 w-8 rounded-lg text-primary border-primary/20 hover:bg-primary/5 dark:hover:bg-primary/10"
                        onClick={() => setSelectedClient({ name: client.name, contact: client.contact })}
                        title="View Timeline">
                        <Activity className="w-4 h-4" />
                      </Button>
                      <WhatsAppReminder
                        clientName={client.name}
                        contact={client.contact || ""}
                        balance={client.totalDebt}
                        jobDescription="Outstanding balance reminder"
                        variant="icon"
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Mobile Cards ── */}
      <div className="md:hidden space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : paginated.length === 0 ? (
          <EmptyState filtered={isFiltered} />
        ) : (
          paginated.map((client, idx) => (
            <Card
              key={idx}
              className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden cursor-pointer active:scale-[0.99] transition-transform"
              onClick={() => setSelectedClient({ name: client.name, contact: client.contact })}
            >
              <div className="p-4">
                {/* Header */}
                <div className="flex justify-between items-start gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-black shrink-0", getAvatarColor(client.name))}>
                      {getInitials(client.name)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-black text-gray-900 dark:text-white truncate">{client.name}</h3>
                      {client.contact ? (
                        <a
                          href={`tel:${client.contact}`}
                          className="text-xs text-primary flex items-center gap-1 mt-0.5 w-fit"
                          onClick={e => e.stopPropagation()}
                        >
                          <PhoneCall className="w-3 h-3" /> {client.contact}
                        </a>
                      ) : (
                        <p className="text-[10px] text-gray-300 dark:text-zinc-600 mt-0.5">No contact</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                    <Button variant="outline" size="icon"
                      className="h-8 w-8 rounded-lg text-primary border-primary/20 hover:bg-primary/5"
                      onClick={() => setSelectedClient({ name: client.name, contact: client.contact })}
                      title="View Timeline">
                      <Activity className="w-4 h-4" />
                    </Button>
                    <WhatsAppReminder
                      clientName={client.name}
                      contact={client.contact || ""}
                      balance={client.totalDebt}
                      jobDescription="Outstanding balance reminder"
                      variant="icon"
                    />
                  </div>
                </div>

                {/* Stats strip */}
                <div className="grid grid-cols-3 gap-0 mt-3 bg-gray-50 dark:bg-zinc-800/40 rounded-xl overflow-hidden">
                  <div className="text-center p-3">
                    <span className="text-[9px] uppercase tracking-wider font-black text-gray-400 dark:text-zinc-500">Orders</span>
                    <p className="text-sm font-black text-primary mt-0.5">{client.totalOrders}</p>
                  </div>
                  <div className="text-center p-3 border-l border-r border-gray-200 dark:border-zinc-700">
                    <span className="text-[9px] uppercase tracking-wider font-black text-gray-400 dark:text-zinc-500">
                      {isAdmin ? "Value" : "Jobs"}
                    </span>
                    <p className="text-sm font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                      {isAdmin ? `₦${(client.totalSpent / 1000).toFixed(0)}k` : client.totalOrders}
                    </p>
                  </div>
                  <div className="text-center p-3">
                    <span className="text-[9px] uppercase tracking-wider font-black text-gray-400 dark:text-zinc-500">Debt</span>
                    {client.totalDebt <= 0 ? (
                      <p className="text-[10px] font-black text-emerald-500 mt-0.5 flex items-center justify-center gap-0.5">
                        <CheckCircle2 className="w-3 h-3" /> Clear
                      </p>
                    ) : (
                      <p className="text-sm font-black text-rose-600 dark:text-rose-400 mt-0.5">
                        ₦{(client.totalDebt / 1000).toFixed(0)}k
                      </p>
                    )}
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between mt-2.5">
                  <span className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-zinc-500">
                    <Calendar className="w-3 h-3" />
                    Last order {formatDate(client.lastOrderDate)}
                  </span>
                  {client.totalDebt > 0 && (
                    <Badge className="bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 border-rose-100 dark:border-rose-900 text-[9px] font-black px-2 py-0.5">
                      Owes ₦{(client.totalDebt / 1000).toFixed(0)}k
                    </Badge>
                  )}
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* ── Pagination ── */}
      {sorted.length > ITEMS_PER_PAGE && (
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-zinc-900 p-4 rounded-2xl shadow-sm border border-gray-100/50 dark:border-zinc-800">
          <p className="text-xs font-bold text-gray-600 dark:text-zinc-400 order-2 sm:order-1">
            Showing <span className="text-primary">
              {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(sorted.length, currentPage * ITEMS_PER_PAGE)}
            </span> of {sorted.length} customers
          </p>
          <div className="flex gap-2 order-1 sm:order-2 w-full sm:w-auto">
            <Button variant="outline" size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="flex-1 sm:flex-none rounded-xl h-9 px-4 text-xs font-black border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-gray-50">
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <Button variant="outline" size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="flex-1 sm:flex-none rounded-xl h-9 px-4 text-xs font-black border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-gray-50">
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      <CustomerTimelineModal
        isOpen={!!selectedClient}
        onClose={() => setSelectedClient(null)}
        clientName={selectedClient?.name ?? null}
        contact={selectedClient?.contact}
      />
    </div>
  );
}

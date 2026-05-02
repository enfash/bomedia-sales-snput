"use client";

import { useEffect, useState, useMemo } from "react";
import {
  RefreshCw, Search, Users, Wallet, ArrowUpDown,
  Phone, ShoppingBag, ChevronLeft, ChevronRight,
  TrendingUp, AlertCircle, CheckCircle2, Calendar, Activity
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useSyncStore } from "@/lib/store";
import { WhatsAppReminder } from "@/components/whatsapp-reminder";
import { formatDistanceToNow } from "date-fns";
import { CustomerTimelineModal } from "@/components/customer-timeline-modal";

const parseAmount = (val: any): number => {
  if (val === undefined || val === null) return 0;
  const str = val.toString().replace(/[₦, \s]/g, "");
  return parseFloat(str) || 0;
};

const formatDate = (dateStr: string): string => {
  if (!dateStr || dateStr === "N/A") return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return dateStr;
  }
};

const getInitials = (name: string) =>
  name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() || "").join("");

const avatarColors = [
  "bg-violet-500", "bg-blue-500", "bg-emerald-500",
  "bg-orange-500", "bg-rose-500", "bg-cyan-500", "bg-amber-500",
];
const getAvatarColor = (name: string) =>
  avatarColors[name.charCodeAt(0) % avatarColors.length];

interface CustomerMetrics {
  name: string;
  contact: string;
  totalOrders: number;
  totalSpent: number;
  totalDebt: number;
  lastOrderDate: string;
}

export default function CustomersPage({ isAdmin = true }: { isAdmin?: boolean }) {
  const { cachedSales, setCachedData, cachedExpenses } = useSyncStore();
  const [loading, setLoading] = useState(cachedSales.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;
  const [sortBy, setSortBy] = useState<"name" | "orders" | "spent" | "debt">("spent");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedClient, setSelectedClient] = useState<{ name: string; contact: string } | null>(null);

  const fetchData = async () => {
    if (cachedSales.length === 0) setLoading(true);
    else setRefreshing(true);
    try {
      const [salesRes, expensesRes, paymentsRes] = await Promise.all([
        fetch("/api/sales"),
        fetch("/api/expenses"),
        fetch("/api/payments"),
      ]);
      const salesJson = await salesRes.json();
      const expensesJson = await expensesRes.json();
      const paymentsJson = await paymentsRes.json();
      setCachedData(salesJson.data ?? [], expensesJson.data ?? [], undefined, paymentsJson.data ?? []);
    } catch (err) {
      console.error("Error fetching records", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const customerMap = useMemo(() => {
    const map = new Map<string, CustomerMetrics>();
    cachedSales.forEach((s) => {
      const name = (s["CLIENT NAME"] || s["Client Name"] || "Walking Customer").trim();
      const contact = (s["CONTACT"] || s["Contact"] || "").trim();
      const amount = parseAmount(s["TOTAL"] || s["Total"] || s["AMOUNT (₦)"] || s["Amount (₦)"] || s["INITIAL PAYMENT (₦)"]);
      const debt = parseAmount(s["AMOUNT DIFFERENCES"] || s["Amount Differences"] || s["BALANCE"] || s["Balance"]);
      const orderDate = s["DATE"] || s["Date"] || "N/A";
      const existing = map.get(name);
      if (existing) {
        existing.totalOrders += 1;
        existing.totalSpent += amount;
        existing.totalDebt += debt;
        if (orderDate !== "N/A" && (existing.lastOrderDate === "N/A" || new Date(orderDate) > new Date(existing.lastOrderDate))) {
          existing.lastOrderDate = orderDate;
        }
        if (!existing.contact && contact) existing.contact = contact;
      } else {
        map.set(name, { name, contact, totalOrders: 1, totalSpent: amount, totalDebt: debt, lastOrderDate: orderDate });
      }
    });
    return Array.from(map.values());
  }, [cachedSales]);

  const filteredCustomers = useMemo(() =>
    customerMap.filter(c =>
      c.name.toLowerCase().includes(search.toLowerCase()) || c.contact.includes(search)
    ), [customerMap, search]);

  const sortedCustomers = useMemo(() =>
    [...filteredCustomers].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "name") cmp = a.name.localeCompare(b.name);
      else if (sortBy === "orders") cmp = a.totalOrders - b.totalOrders;
      else if (sortBy === "spent") cmp = a.totalSpent - b.totalSpent;
      else if (sortBy === "debt") cmp = a.totalDebt - b.totalDebt;
      return sortOrder === "asc" ? cmp : -cmp;
    }), [filteredCustomers, sortBy, sortOrder]);

  const totalPages = Math.ceil(sortedCustomers.length / itemsPerPage);
  const paginatedCustomers = sortedCustomers.slice(
    (currentPage - 1) * itemsPerPage, currentPage * itemsPerPage
  );

  useEffect(() => { setCurrentPage(1); }, [search, sortBy, sortOrder]);

  const totalClients = customerMap.length;
  const aggregateDebt = customerMap.reduce((s, c) => s + Math.max(0, c.totalDebt), 0);
  const clientsWithDebt = customerMap.filter(c => c.totalDebt > 0).length;
  const topSpender = useMemo(() =>
    customerMap.length === 0 ? null :
    customerMap.reduce((max, c) => c.totalSpent > max.totalSpent ? c : max, customerMap[0]),
    [customerMap]);

  return (
    <div className="p-3 md:p-8 bg-slate-50/80 dark:bg-zinc-950 min-h-screen pb-32 transition-colors duration-500">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-black text-primary dark:text-brand-300 flex items-center gap-2">
              <Users className="w-8 h-8" /> Customer Manager
            </h1>
            {refreshing && (
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-brand-600 dark:text-brand-300 uppercase tracking-wider bg-brand-50 dark:bg-brand-900/20 px-2 py-0.5 rounded-full animate-pulse border border-brand-100 dark:border-brand-800">
                <RefreshCw className="w-2.5 h-2.5 animate-spin" /> Updating...
              </span>
            )}
          </div>
          <p className="text-gray-500 dark:text-zinc-400 text-xs font-medium mt-1">
            {totalClients} clients · {clientsWithDebt} with outstanding balance
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading || refreshing}
          className="w-full md:w-auto bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800 text-gray-700 dark:text-zinc-300 shadow-sm rounded-xl h-11 px-6 font-bold hover:bg-gray-50 dark:hover:bg-zinc-800">
          <RefreshCw className={`w-4 h-4 mr-2 ${(loading || refreshing) ? "animate-spin" : ""}`} />
          {loading ? "Loading..." : refreshing ? "Updating..." : "Refresh"}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className={cn("grid grid-cols-2 gap-4 mb-8", isAdmin ? "md:grid-cols-3" : "md:grid-cols-2")}>

        {/* Total Clients */}
        <Card className="bg-white dark:bg-zinc-900 border-0 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-transparent dark:from-blue-950/20 dark:to-transparent" />
          <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 rounded-l" />
          <div className="relative p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-black text-gray-500 dark:text-zinc-500 uppercase tracking-widest">Total Clients</span>
              <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <p className="text-3xl font-black text-gray-900 dark:text-white">{totalClients}</p>
            <p className="text-[10px] text-blue-600 dark:text-blue-400 font-bold mt-1 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> All-time unique clients
            </p>
          </div>
        </Card>

        {/* Total Unpaid Debt */}
        <Card className="bg-white dark:bg-zinc-900 border-0 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-br from-rose-50 to-transparent dark:from-rose-950/20 dark:to-transparent" />
          <div className="absolute top-0 left-0 w-1 h-full bg-rose-500 rounded-l" />
          <div className="relative p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-black text-gray-500 dark:text-zinc-500 uppercase tracking-widest">Unpaid Debt</span>
              <div className="p-2 rounded-xl bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400">
                <Wallet className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-gray-900 dark:text-white">₦{aggregateDebt.toLocaleString()}</p>
            <p className="text-[10px] text-rose-600 dark:text-rose-400 font-bold mt-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> Across {clientsWithDebt} clients
            </p>
          </div>
        </Card>

        {/* Top Spender (admin only) */}
        {isAdmin && (
          <Card className="col-span-2 md:col-span-1 bg-white dark:bg-zinc-900 border-0 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 to-transparent dark:from-emerald-950/20 dark:to-transparent" />
            <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500 rounded-l" />
            <div className="relative p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-black text-gray-500 dark:text-zinc-500 uppercase tracking-widest">Top Spender</span>
                <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400">
                  <ShoppingBag className="w-4 h-4" />
                </div>
              </div>
              {topSpender ? (
                <div className="flex items-center gap-3">
                  <div className={cn("w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-black shrink-0", getAvatarColor(topSpender.name))}>
                    {getInitials(topSpender.name)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-black text-gray-900 dark:text-white truncate">{topSpender.name}</p>
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                      ₦{topSpender.totalSpent.toLocaleString()} · {topSpender.totalOrders} orders
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

      {/* Search & Filter Bar */}
      <div className="flex flex-col lg:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-zinc-500" />
          <Input
            className="pl-10 h-11 bg-white dark:bg-zinc-900 border-gray-100 dark:border-zinc-800 rounded-xl shadow-sm focus:ring-brand-500 dark:text-zinc-100 dark:placeholder:text-zinc-600"
            placeholder="Search by name or contact..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 items-center">
          <div className="flex bg-white dark:bg-zinc-900 p-1 rounded-xl shadow-sm border border-gray-100 dark:border-zinc-800">
            {[
              { id: "name", label: "Name" },
              { id: "orders", label: "Orders" },
              { id: "spent", label: "Value" },
              { id: "debt", label: "Debt" },
            ].map((opt) => (
              <button key={opt.id} onClick={() => setSortBy(opt.id as any)}
                className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${sortBy === opt.id
                  ? "bg-primary/10 dark:bg-primary/20 text-primary dark:text-primary-foreground"
                  : "text-gray-500 dark:text-zinc-500 hover:text-gray-700 dark:hover:text-zinc-300"}`}>
                {opt.label}
              </button>
            ))}
          </div>
          <Button variant="outline" size="icon"
            onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
            className="h-11 w-11 rounded-xl border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm"
            title={sortOrder === "asc" ? "Ascending" : "Descending"}>
            <ArrowUpDown className={`w-4 h-4 text-brand-700 dark:text-brand-400 transition-transform ${sortOrder === "desc" ? "rotate-180" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-gray-50 dark:border-zinc-800 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/80 dark:bg-zinc-800/60 hover:bg-gray-50/80 dark:hover:bg-zinc-800/60 border-none">
              <TableHead className="text-[10px] font-black uppercase text-gray-500 dark:text-zinc-500 py-4 pl-6">Client</TableHead>
              <TableHead className="text-[10px] font-black uppercase text-gray-500 dark:text-zinc-500">Contact</TableHead>
              <TableHead className="text-[10px] font-black uppercase text-gray-500 dark:text-zinc-500 text-center">Orders</TableHead>
              {isAdmin && <TableHead className="text-[10px] font-black uppercase text-gray-500 dark:text-zinc-500 text-right">Total Value</TableHead>}
              <TableHead className="text-[10px] font-black uppercase text-gray-500 dark:text-zinc-500 text-right">Debt Status</TableHead>
              <TableHead className="text-[10px] font-black uppercase text-gray-500 dark:text-zinc-500 text-center">Last Order</TableHead>
              <TableHead className="text-[10px] font-black uppercase text-gray-500 dark:text-zinc-500 text-center">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && paginatedCustomers.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-20 text-gray-400 italic">Collating customer data...</TableCell></TableRow>
            ) : paginatedCustomers.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-20 text-gray-400">No clients found.</TableCell></TableRow>
            ) : (
              paginatedCustomers.map((client, idx) => (
                <TableRow 
                  key={idx} 
                  className="border-b border-gray-50 dark:border-zinc-800/60 hover:bg-gray-50/60 dark:hover:bg-zinc-800/40 transition-colors cursor-pointer"
                  onClick={() => setSelectedClient({ name: client.name, contact: client.contact })}
                >
                  {/* Avatar + Name */}
                  <TableCell className="pl-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-black shrink-0", getAvatarColor(client.name))}>
                        {getInitials(client.name)}
                      </div>
                      <span className="text-sm font-bold text-gray-900 dark:text-white">{client.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs font-medium text-gray-500 dark:text-zinc-400">
                    {client.contact ? (
                      <span className="flex items-center gap-1.5">
                        <Phone className="w-3 h-3 text-gray-400" /> {client.contact}
                      </span>
                    ) : <span className="text-gray-300 dark:text-zinc-600">—</span>}
                  </TableCell>
                  {/* Orders badge */}
                  <TableCell className="text-center">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-black">
                      {client.totalOrders}
                    </span>
                  </TableCell>
                  {/* Total Spent */}
                  {isAdmin && (
                    <TableCell className="text-right">
                      <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                        ₦{client.totalSpent.toLocaleString()}
                      </span>
                    </TableCell>
                  )}
                  {/* Debt Status */}
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
                              style={{ width: `${Math.min(100, (client.totalDebt / client.totalSpent) * 100).toFixed(0)}%` }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </TableCell>
                  {/* Last Order */}
                  <TableCell className="text-center">
                    <span className="text-[11px] font-medium text-gray-400 dark:text-zinc-500 flex items-center justify-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(client.lastOrderDate)}
                    </span>
                  </TableCell>
                  <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-2">
                      {isAdmin && (
                        <Button 
                          variant="outline" 
                          size="icon" 
                          className="h-8 w-8 rounded-lg text-brand-600 dark:text-brand-400 border-brand-200 dark:border-brand-900/50 hover:bg-brand-50 dark:hover:bg-brand-900/20"
                          onClick={() => setSelectedClient({ name: client.name, contact: client.contact })}
                          title="View Client Audit Timeline"
                        >
                          <Activity className="w-4 h-4" />
                        </Button>
                      )}
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

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {loading && paginatedCustomers.length === 0 ? (
          <div className="text-center py-20 text-gray-400">Loading...</div>
        ) : paginatedCustomers.length === 0 ? (
          <div className="text-center py-20 text-gray-400">No clients found.</div>
        ) : (
          paginatedCustomers.map((client, idx) => (
            <Card 
              key={idx} 
              className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden cursor-pointer"
              onClick={() => setSelectedClient({ name: client.name, contact: client.contact })}
            >
              <div className="p-4">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-black shrink-0", getAvatarColor(client.name))}>
                      {getInitials(client.name)}
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-gray-900 dark:text-white">{client.name}</h3>
                      {client.contact ? (
                        <p className="text-xs text-gray-500 dark:text-zinc-400 flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3" /> {client.contact}
                        </p>
                      ) : (
                        <p className="text-[10px] text-gray-300 dark:text-zinc-600 mt-0.5">No contact</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    {isAdmin && (
                      <Button 
                        variant="outline" 
                        size="icon" 
                        className="h-8 w-8 rounded-lg text-brand-600 dark:text-brand-400 border-brand-200 dark:border-brand-900/50 hover:bg-brand-50 dark:hover:bg-brand-900/20"
                        onClick={() => setSelectedClient({ name: client.name, contact: client.contact })}
                        title="View Client Audit Timeline"
                      >
                        <Activity className="w-4 h-4" />
                      </Button>
                    )}
                    <WhatsAppReminder
                      clientName={client.name}
                      contact={client.contact || ""}
                      balance={client.totalDebt}
                      jobDescription="Outstanding balance reminder"
                      variant="icon"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-3 bg-gray-50 dark:bg-zinc-800/40 p-3 rounded-xl">
                  <div className="text-center">
                    <span className="text-[9px] uppercase tracking-wider font-black text-gray-400 dark:text-zinc-500">Orders</span>
                    <p className="text-sm font-black text-blue-600 dark:text-blue-400 mt-0.5">{client.totalOrders}</p>
                  </div>
                  {isAdmin ? (
                    <div className="text-center border-l border-r border-gray-200 dark:border-zinc-700">
                      <span className="text-[9px] uppercase tracking-wider font-black text-gray-400 dark:text-zinc-500">Value</span>
                      <p className="text-sm font-black text-emerald-600 dark:text-emerald-400 mt-0.5">₦{(client.totalSpent / 1000).toFixed(0)}k</p>
                    </div>
                  ) : (
                    <div className="text-center border-l border-r border-gray-200 dark:border-zinc-700">
                      <span className="text-[9px] uppercase tracking-wider font-black text-gray-400 dark:text-zinc-500">Activity</span>
                      <p className="text-sm font-black text-brand-600 mt-0.5">{client.totalOrders} Jobs</p>
                    </div>
                  )}
                  <div className="text-center">
                    <span className="text-[9px] uppercase tracking-wider font-black text-gray-400 dark:text-zinc-500">Debt</span>
                    {client.totalDebt <= 0 ? (
                      <p className="text-[10px] font-black text-emerald-500 mt-0.5 flex items-center justify-center gap-0.5">
                        <CheckCircle2 className="w-3 h-3" /> Clear
                      </p>
                    ) : (
                      <p className="text-sm font-black text-rose-600 dark:text-rose-400 mt-0.5">₦{(client.totalDebt / 1000).toFixed(0)}k</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 mt-2 text-[10px] text-gray-400 dark:text-zinc-500">
                  <Calendar className="w-3 h-3" />
                  Last order {formatDate(client.lastOrderDate)}
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Pagination */}
      {sortedCustomers.length > 0 && (
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-zinc-900 p-4 rounded-2xl shadow-sm border border-gray-100/50 dark:border-zinc-800">
          <p className="text-xs font-bold text-gray-600 dark:text-zinc-400 order-2 sm:order-1">
            Showing <span className="text-primary dark:text-brand-300">
              {Math.min(sortedCustomers.length, (currentPage - 1) * itemsPerPage + 1)}–{Math.min(sortedCustomers.length, currentPage * itemsPerPage)}
            </span> of {sortedCustomers.length} customers
          </p>
          {totalPages > 1 && (
            <div className="flex gap-2 order-1 sm:order-2 w-full sm:w-auto">
              <Button variant="outline" size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="flex-1 sm:flex-none rounded-xl h-9 px-4 text-xs font-black border-gray-100 dark:border-zinc-800 text-gray-600 dark:text-zinc-300 bg-white dark:bg-zinc-900 hover:bg-gray-50">
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <Button variant="outline" size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="flex-1 sm:flex-none rounded-xl h-9 px-4 text-xs font-black border-gray-100 dark:border-zinc-800 text-gray-600 dark:text-zinc-300 bg-white dark:bg-zinc-900 hover:bg-gray-50">
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          )}
        </div>
      )}

      <CustomerTimelineModal
        isOpen={!!selectedClient}
        onClose={() => setSelectedClient(null)}
        clientName={selectedClient?.name || null}
        contact={selectedClient?.contact}
      />
    </div>
  );
}

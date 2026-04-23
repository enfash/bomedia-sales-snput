"use client";

import { useEffect, useState } from "react";
import {
  BarChart3,
  RefreshCw,
  Search,
  MoreHorizontal,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  TrendingUp,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ArrowUpDown
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useSyncStore } from "@/lib/store";
import { RecordCard, type RecordStatus } from "@/components/record-card";
import { subDays, isWithinInterval, parseISO } from "date-fns";
import { ManageSaleAction, type UnifiedRecord } from "@/components/manage-sale-action";
import { format } from "date-fns";
import { MaterialBadge } from "@/components/material-badge";
import { WhatsAppReminder } from "@/components/whatsapp-reminder";

const parseAmount = (val: any): number => {
  if (val === undefined || val === null) return 0;
  const str = val.toString().replace(/[₦, \s]/g, "");
  return parseFloat(str) || 0;
};

const parseSheetDate = (dateStr: any): string => {
  if (!dateStr) return "N/A";
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? dateStr : format(d, "MMM dd, yyyy");
};

type Row = Record<string, string>;

function StatusBadge({ status }: { status: RecordStatus }) {
  const map: Record<RecordStatus, string> = {
    Settled: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 border-none",
    "Part-payment": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 border-none",
    "In Progress": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 border-none",
    Syncing: "bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300 animate-pulse hover:bg-brand-100 dark:hover:bg-brand-900/40 border-none",
  };
  return (
    <Badge className={`px-2 py-0 rounded-full font-bold text-[10px] ${map[status] || "bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-400"}`}>
      {status}
    </Badge>
  );
}

export default function RecordsPage() {
  const { pendingQueue, cachedSales, cachedExpenses, setCachedData, syncStatus } = useSyncStore();
  
  const [salesData, setSalesData] = useState<Row[]>(cachedSales || []);
  const [expensesData, setExpensesData] = useState<Row[]>(cachedExpenses || []);
  const [loading, setLoading] = useState(cachedSales.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"All" | "Sales" | "Expenses" | "Pending">("All");

  // --- Pagination & Sorting State ---
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;
  const [sortBy, setSortBy] = useState<"date" | "name" | "debt">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc"); // Newest first by default

  const fetchData = async () => {
    // Only show loader if we have zero cached data
    if (salesData.length === 0) setLoading(true);
    else setRefreshing(true);
    
    setError("");
    
    try {
      const [salesRes, expensesRes] = await Promise.all([
        fetch("/api/sales"),
        fetch("/api/expenses"),
      ]);
      const salesJson = await salesRes.json();
      const expensesJson = await expensesRes.json();
      
      const newSales = salesJson.data ?? [];
      const newExpenses = expensesJson.data ?? [];

      setSalesData(newSales);
      setExpensesData(newExpenses);
      setCachedData(newSales, newExpenses);
    } catch {
      // If we have cached data, don't show a hard error, just a console log
      if (salesData.length > 0) {
        console.warn("Currently offline. Using cached records.");
      } else {
        setError("Failed to load records. Make sure your Google Sheets credentials are set correctly.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { 
    fetchData(); 

    const handleOnline = () => {
      console.log("Back online, refreshing records...");
      fetchData();
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, []);

  // --- Data Mapping ---

  const mapSale = (r: Row, isPending: boolean, timestamp?: number): UnifiedRecord => {
    const amount = parseAmount(r["AMOUNT (₦)"] || r["Amount (₦)"]);

    // Map status from Sheet terminology to Design terminology
    let status: RecordStatus = "In Progress";
    const rawStatus = r["PAYMENT STATUS"];
    if (rawStatus === "Paid") status = "Settled";
    else if (rawStatus === "Part-payment") status = "Part-payment";
    else if (rawStatus === "Unpaid") status = "In Progress"; // Design uses In Progress for active debt?

    if (isPending) status = "Syncing";

    return {
      id: `sale-${r.DATE}-${r["CLIENT NAME"]}-${Math.random()}`,
      date: parseSheetDate(r.DATE || r.Date),
      type: "Sale",
      client: r["CLIENT NAME"] || r["Client Name"] || "N/A",
      contact: r["CONTACT"] || r["Contact"] || "",
      description: r["JOB DESCRIPTION"] || r["Job Description"] || "—",
      amount,
      status,
      loggedBy: r["Logged By"] || "Unknown",
      isPending,
      rowIndex: r._rowIndex ? parseInt(r._rowIndex.toString()) : undefined,
      timestamp,
      additionalPayment1: parseAmount(r["ADDITIONAL PAYMENT 1"] || r["Additional Payment 1"]),
      additionalPayment2: parseAmount(r["ADDITIONAL PAYMENT 2"] || r["Additional Payment 2"]),
      jobStatus: r["JOB STATUS"] || r["Job Status"] || "Quoted",
      material: r["Material"] || r["MATERIAL"] || r["material"] || "",
      balance: parseAmount(r["AMOUNT DIFFERENCES"] || r["Amount Differences"]),
      raw: r
    };
  };

  const mapExpense = (r: Row, isPending: boolean, timestamp?: number): UnifiedRecord => {
    const amountStr = r["AMOUNT"] || "0";
    const amount = parseFloat(amountStr.replace(/,/g, "")) || 0;

    return {
      id: `expense-${r.DATE}-${r.DESCRIPTION}-${Math.random()}`,
      date: r.DATE,
      type: "Expense",
      client: r["PAID TO"] || "N/A",
      description: r.DESCRIPTION || r.CATEGORY || "—",
      amount,
      status: isPending ? "Syncing" : "Settled", // Expenses are generally recorded when settled
      loggedBy: r["Logged By"] || "Unknown",
      isPending,
      rowIndex: r._rowIndex ? parseInt(r._rowIndex.toString()) : undefined,
      timestamp,
      material: r.CATEGORY || r.Category || "",
      raw: r
    };
  };

  const pendingSales = pendingQueue.filter(item => item.type === 'sale').map(item => {
    const v = item.data;
    return mapSale({
      "DATE": v[0],
      "CLIENT NAME": v[1],
      "JOB DESCRIPTION": v[2],
      "CONTACT": v[3],
      "Material": v[4],
      "QTY": v[12],
      "AMOUNT (₦)": "0", // Formula not parsable
      "INITIAL PAYMENT (₦)": v[14],
      "PAYMENT STATUS": v[19],
      "JOB STATUS": v[20] || "Quoted",
      "Logged By": v[21],
      "ADDITIONAL PAYMENT 1": "0",
      "ADDITIONAL PAYMENT 2": "0",
      "AMOUNT DIFFERENCES": "0",
    }, true, item.timestamp);
  });

  const pendingExpenses = pendingQueue.filter(item => item.type === 'expense').map(item => mapExpense(item.data, true, item.timestamp));

  const syncedSales = salesData.map(r => mapSale(r, false));
  const syncedExpenses = expensesData.map(r => mapExpense(r, false));

  const allRecords = [...pendingSales, ...pendingExpenses, ...syncedSales, ...syncedExpenses];

  // --- Filtering ---
  const filtered = allRecords.filter(r => {
    const matchesSearch =
      r.client.toLowerCase().includes(search.toLowerCase()) ||
      r.description.toLowerCase().includes(search.toLowerCase()) ||
      r.date.includes(search);

    if (activeTab === "Sales") return matchesSearch && r.type === "Sale";
    if (activeTab === "Expenses") return matchesSearch && r.type === "Expense";
    if (activeTab === "Pending") return matchesSearch && r.isPending;
    return matchesSearch;
  });

  // --- Sorting ---
  const sorted = [...filtered].sort((a, b) => {
    let comparison = 0;
    if (sortBy === "date") {
      const timeA = new Date(a.date).getTime();
      const timeB = new Date(b.date).getTime();
      comparison = (isNaN(timeA) ? 0 : timeA) - (isNaN(timeB) ? 0 : timeB);
      
      // Tie-breaker: If same date, use logging order
      if (comparison === 0) {
        // Pending items are always "newer" than synced items
        if (a.isPending && !b.isPending) comparison = 1;
        else if (!a.isPending && b.isPending) comparison = -1;
        else if (a.isPending && b.isPending) {
          // If both pending, use actual store timestamp
          comparison = (a.timestamp || 0) - (b.timestamp || 0);
        } else {
          // If both synced, use spreadsheet row index (higher row = newer)
          comparison = (a.rowIndex || 0) - (b.rowIndex || 0);
        }
      }
    } else if (sortBy === "name") {
      comparison = a.client.localeCompare(b.client);
    } else if (sortBy === "debt") {
      const debtA = a.type === "Sale" ? (a.balance || 0) : 0;
      const debtB = b.type === "Sale" ? (b.balance || 0) : 0;
      comparison = debtA - debtB;
    }

    return sortOrder === "asc" ? comparison : -comparison;
  });

  // --- Pagination ---
  const totalPages = Math.ceil(sorted.length / itemsPerPage);
  const paginated = sorted.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Reset page when filtering changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search, activeTab, sortBy, sortOrder]);

  // --- Metrics (Last 30 Days) ---
  const now = new Date();
  const thirtyDaysAgo = subDays(now, 30);

  const inLast30Days = (dateStr: string) => {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    return isWithinInterval(d, { start: thirtyDaysAgo, end: now });
  };

  const currentRecords = allRecords.filter(r => inLast30Days(r.date));
  const last30Sales = currentRecords.filter(r => r.type === "Sale").reduce((sum, r) => sum + r.amount, 0);
  const last30Expenses = currentRecords.filter(r => r.type === "Expense").reduce((sum, r) => sum + r.amount, 0);

  // Total Metric logic
  const totalSales = allRecords.filter(r => r.type === "Sale").reduce((sum, r) => sum + r.amount, 0);
  const totalExpenses = allRecords.filter(r => r.type === "Expense").reduce((sum, r) => sum + r.amount, 0);
  const netProfit = totalSales - totalExpenses;

  // Outstanding Debt logic (Sales Price - Initial Payment)
  // Need to fetch INITIAL PAYMENT from raw data
  const outstandingDebt = allRecords
    .filter(r => r.type === "Sale")
    .reduce((sum, r) => {
      const balance = parseAmount(r.raw["AMOUNT DIFFERENCES"] || r.raw["Amount Differences"]);
      return sum + (balance > 0 ? balance : 0);
    }, 0);

  return (
    <div className="p-3 md:p-8 bg-slate-50/80 dark:bg-zinc-950 min-h-screen pb-32 transition-colors duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-black text-primary dark:text-brand-300">Financial Records</h1>
            {refreshing && (
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-brand-600 dark:text-brand-300 uppercase tracking-wider bg-brand-50 dark:bg-brand-900/20 px-2 py-0.5 rounded-full animate-pulse border border-brand-100 dark:border-brand-800">
                <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                Syncing...
              </span>
            )}
          </div>
          <p className="text-gray-500 dark:text-zinc-400 text-xs font-medium mt-1">Comprehensive view of your sales, expenses, and financial status.</p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={fetchData} 
          disabled={loading || refreshing} 
          className="w-full md:w-auto bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800 text-gray-700 dark:text-zinc-300 shadow-sm rounded-xl h-11 px-6 font-bold hover:bg-gray-50 dark:hover:bg-zinc-800"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${(loading || refreshing) ? "animate-spin" : ""}`} />
          {loading ? "Loading..." : refreshing ? "Updating..." : "Refresh"}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 lg:grid-cols-4 gap-1.5 sm:gap-4 mb-8">
        {[
          { title: "Total Sales", val: totalSales, trend: last30Sales, color: "border-brand-500", icon: ArrowUpRight, iconColor: "text-brand-700 bg-brand-50 dark:text-brand-300 dark:bg-brand-900/30" },
          { title: "Total Expenses", val: totalExpenses, trend: last30Expenses, color: "border-brand-500", icon: Wallet, iconColor: "text-brand-700 bg-brand-50 dark:text-brand-300 dark:bg-brand-900/30" },
          { title: "Net Profit", val: netProfit, color: "border-emerald-500", icon: TrendingUp, iconColor: "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-900/30" },
          { title: "Outstanding Debt", val: outstandingDebt, color: "border-rose-500", icon: ArrowDownRight, iconColor: "text-rose-600 bg-rose-50 dark:text-rose-400 dark:bg-rose-900/30" },
        ].map((card, idx) => (
          <Card 
            key={idx} 
            className={cn(
              "bg-white dark:bg-zinc-900 border-none border-l-4 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between",
              card.color,
              idx === 0 ? "col-span-3 lg:col-span-1" : "col-span-1 lg:col-span-1"
            )}
          >
            <CardHeader className="p-2 sm:p-4 pb-0 flex flex-row items-center justify-between space-y-0 gap-1">
              <CardTitle className="text-[8px] sm:text-[10px] font-black text-muted-foreground dark:text-zinc-500 uppercase tracking-widest line-clamp-1">{card.title}</CardTitle>
              <div className={`p-1 sm:p-1.5 rounded-lg shrink-0 ${card.iconColor}`}>
                <card.icon className="w-3 h-3 sm:w-4 sm:h-4" />
              </div>
            </CardHeader>
            <CardContent className="p-2 sm:p-4 pt-1 sm:pt-2">
              <p className={cn(
                "font-black text-gray-900 dark:text-white truncate",
                idx === 0 ? "text-xl sm:text-2xl" : "text-xs sm:text-2xl"
              )}>
                ₦{card.val.toLocaleString(undefined, { minimumFractionDigits: 0 })}
              </p>
              {card.trend !== undefined && (
                <p className="text-[8px] sm:text-[10px] text-emerald-600 dark:text-emerald-400 font-bold mt-0.5 sm:mt-1 truncate">
                  <span className="hidden sm:inline">Last 30 Days: </span><span className="opacity-70">+₦{card.trend.toLocaleString()}</span>
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter & Sort Bar */}
      <div className="flex flex-col lg:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-zinc-500" />
          <Input
            className="pl-10 h-11 bg-white dark:bg-zinc-900 border-gray-100 dark:border-zinc-800 rounded-xl shadow-sm focus:ring-brand-500 dark:text-zinc-100 dark:placeholder:text-zinc-600"
            placeholder="Search by client, job, or date..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
        {/* Sort Controls */}
        <div className="flex gap-2 items-center">
          <div className="flex bg-white dark:bg-zinc-900 p-1 rounded-xl shadow-sm border border-gray-100 dark:border-zinc-800">
            {[
              { id: 'date', label: 'Date' },
              { id: 'name', label: 'Name' },
              { id: 'debt', label: 'Debt' }
            ].map((option) => (
              <button
                key={option.id}
                onClick={() => setSortBy(option.id as any)}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${sortBy === option.id
                    ? "bg-primary/10 dark:bg-primary/20 text-primary dark:text-primary-foreground"
                    : "text-gray-500 dark:text-zinc-500 hover:text-gray-700 dark:hover:text-zinc-300"
                  }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            className="h-11 w-11 rounded-xl border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm flex items-center justify-center transition-all hover:bg-gray-50 dark:hover:bg-zinc-800"
            title={sortOrder === 'asc' ? "Ascending" : "Descending"}
          >
            <ArrowUpDown className={`w-4 h-4 text-brand-700 dark:text-brand-400 transition-transform ${sortOrder === 'desc' ? 'rotate-180' : ''}`} />
          </Button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 lg:pb-0 scrollbar-hide">
          <div className="flex bg-white dark:bg-zinc-900 p-1 rounded-xl shadow-sm border border-gray-100 dark:border-zinc-800">
            {["All", "Sales", "Expenses", "Pending"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`px-6 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === tab
                    ? "bg-primary/10 dark:bg-primary/20 text-primary dark:text-primary-foreground"
                    : "text-gray-500 dark:text-zinc-500 hover:text-gray-700 dark:hover:text-zinc-300"
                  }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-gray-50 dark:border-zinc-800 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/50 dark:bg-zinc-800/50 hover:bg-gray-50/50 dark:hover:bg-zinc-800/50 border-none">
              <TableHead className="text-[10px] font-black uppercase text-gray-500 dark:text-zinc-500 py-4">Date</TableHead>
              <TableHead className="text-[10px] font-black uppercase text-gray-500 dark:text-zinc-500">Type</TableHead>
              <TableHead className="text-[10px] font-black uppercase text-gray-500 dark:text-zinc-500">Client/Payee</TableHead>
              <TableHead className="text-[10px] font-black uppercase text-gray-500 dark:text-zinc-500">Description</TableHead>
              <TableHead className="text-[10px] font-black uppercase text-gray-500 dark:text-zinc-500 text-right">Amount</TableHead>
              <TableHead className="text-[10px] font-black uppercase text-gray-500 dark:text-zinc-500 text-right">Difference</TableHead>
              <TableHead className="text-[10px] font-black uppercase text-gray-500 dark:text-zinc-500 text-center">Status</TableHead>
              <TableHead className="text-[10px] font-black uppercase text-gray-500 dark:text-zinc-500">Logged By</TableHead>
              <TableHead className="text-[10px] font-black uppercase text-gray-500 dark:text-zinc-500">Material</TableHead>
              <TableHead className="text-[10px] font-black uppercase text-gray-500 dark:text-zinc-500 text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && paginated.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-20 text-gray-400 dark:text-zinc-500 italic">Finding records...</TableCell></TableRow>
            ) : paginated.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-20 text-gray-400 dark:text-zinc-500">No records found matching your search.</TableCell></TableRow>
            ) : (
                paginated.map((r) => (
                <TableRow key={r.id} className="border-b border-gray-50 dark:border-zinc-800 hover:bg-gray-50/50 dark:hover:bg-zinc-800/50 transition-colors">
                  <TableCell className="text-xs font-bold text-gray-600 dark:text-zinc-400">{r.date}</TableCell>
                  <TableCell className="text-xs font-medium text-gray-500 dark:text-zinc-500">{r.type}</TableCell>
                  <TableCell className="text-sm font-bold text-gray-800 dark:text-zinc-100">{r.client}</TableCell>
                  <TableCell className="text-xs text-gray-500 dark:text-zinc-400 max-w-[200px] truncate">{r.description}</TableCell>
                  <TableCell className="text-sm font-black text-gray-900 dark:text-white text-right">₦{r.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell className="text-sm font-bold text-rose-600 dark:text-rose-400 text-right">
                    {r.type === "Sale" ? `₦${(r.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "—"}
                  </TableCell>
                  <TableCell className="text-center"><StatusBadge status={r.status} /></TableCell>
                  <TableCell className="text-xs font-medium text-gray-500 dark:text-zinc-400">{r.loggedBy}</TableCell>
                  <TableCell className="text-center">
                    {r.type === "Sale" && r.material && (
                      <MaterialBadge material={r.material} />
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      {r.type === "Sale" && (
                        <WhatsAppReminder
                          clientName={r.client}
                          contact={r.contact || ""}
                          balance={r.balance || 0}
                          jobDescription={r.description}
                          variant="icon"
                        />
                      )}
                      <ManageSaleAction record={r} onUpdate={fetchData} />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

      </div>

      <div className="md:hidden space-y-1">
        {loading && paginated.length === 0 ? (
          <div className="text-center py-20 text-gray-400">Loading records...</div>
        ) : paginated.length === 0 ? (
          <div className="text-center py-20 text-gray-400">No records found.</div>
        ) : (
          paginated.map((r) => (
            <RecordCard
              key={r.id}
              date={r.date}
              type={r.type}
              client={r.client}
              description={r.description}
              amount={`₦${r.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
              status={r.status}
              isPending={r.isPending}
              record={r}
              onUpdate={fetchData}
            />
          ))
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-between bg-white dark:bg-zinc-900 p-4 rounded-2xl shadow-sm border border-gray-100/50 dark:border-zinc-800">
          <p className="text-xs font-bold text-gray-600 dark:text-zinc-400">
            Page <span className="text-primary dark:text-brand-300">{currentPage}</span> of {totalPages} 
            <span className="ml-2 opacity-60">({sorted.length} records)</span>
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="rounded-xl h-9 px-4 text-xs font-black border-gray-100 dark:border-zinc-800 font-black text-gray-600 dark:text-zinc-300 bg-white dark:bg-zinc-900 hover:bg-gray-50 dark:hover:bg-zinc-800"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-2" />
              Back
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="rounded-xl h-9 px-4 text-xs font-black border-gray-100 dark:border-zinc-800 font-black text-gray-600 dark:text-zinc-300 bg-white dark:bg-zinc-900 hover:bg-gray-50 dark:hover:bg-zinc-800"
            >
              Next
              <ArrowRight className="w-3.5 h-3.5 ml-2" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

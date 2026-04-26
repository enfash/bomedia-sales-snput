"use client";

import { useEffect, useState, useRef, Fragment, useMemo } from "react";
import {
  RefreshCw,
  Search,
  ArrowUpDown,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Printer,
  Loader2,
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
import { Badge } from "@/components/ui/badge";
import { useSyncStore } from "@/lib/store";
import { RecordCard, type RecordStatus } from "@/components/record-card";
import { isSameDay, format, subDays, isWithinInterval } from "date-fns";
import { ManageSaleAction, type UnifiedRecord } from "@/components/manage-sale-action";
import { ManageBatchAction } from "@/components/manage-batch-action";
import { WhatsAppReminder } from "@/components/whatsapp-reminder";
import { ReceiptModal } from "@/components/receipt-modal";
import { BatchCard } from "@/components/batch-card";

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
    "Part-payment": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/40 border-none",
    "In Progress": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 border-none",
    Syncing: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 animate-pulse hover:bg-orange-100 dark:hover:bg-orange-900/40 border-none",
  };
  return (
    <Badge className={`px-2 py-0 rounded-full font-bold text-[10px] ${map[status] || "bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-400"}`}>
      {status}
    </Badge>
  );
}

export default function CashierRecordsPage() {
  const { pendingQueue, cachedSales, cachedExpenses, setCachedData } = useSyncStore();
  
  const [salesData, setSalesData] = useState<Row[]>(cachedSales || []);
  const [loading, setLoading] = useState(cachedSales.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"All" | "Pending">("All");

  // --- Pagination & Sorting State ---
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;
  const [sortBy, setSortBy] = useState<"date" | "name" | "debt">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [groupReceiptRecords, setGroupReceiptRecords] = useState<UnifiedRecord[]>([]);

  const fetchData = async () => {
    if (salesData.length === 0) setLoading(true);
    else setRefreshing(true);
    
    setError("");
    
    try {
      const salesRes = await fetch("/api/sales");
      const salesJson = await salesRes.json();
      const newSales = salesJson.data ?? [];

      setSalesData(newSales);
      setCachedData(newSales, cachedExpenses);
    } catch {
      if (salesData.length > 0) {
        console.warn("Currently offline. Using cached records.");
      } else {
        setError("Failed to load records.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { 
    fetchData(); 

    const handleOnline = () => {
      fetchData();
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Data Mapping ---

  const mapSale = (r: Row, isPending: boolean, timestamp?: number): UnifiedRecord => {
    const amount = parseAmount(r["AMOUNT (₦)"] || r["Amount (₦)"]);

    let status: RecordStatus = "In Progress";
    const rawStatus = r["PAYMENT STATUS"];
    if (rawStatus === "Paid") status = "Settled";
    else if (rawStatus === "Part-payment") status = "Part-payment";
    else if (rawStatus === "Unpaid") status = "In Progress";

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
      balance: parseAmount(r["AMOUNT DIFFERENCES"] || r["Amount Differences"]),
      salesId: r["SALES ID"] || r["Sales Id"] || "",
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
      "AMOUNT (₦)": "0", 
      "INITIAL PAYMENT (₦)": v[14],
      "PAYMENT STATUS": v[19],
      "JOB STATUS": v[20] || "Quoted",
      "Logged By": v[21],
      "ADDITIONAL PAYMENT 1": "0",
      "ADDITIONAL PAYMENT 2": "0",
      "AMOUNT DIFFERENCES": "0",
      "SALES ID": v[22],
    }, true, item.timestamp);
  });

  const syncedSales = salesData.map(r => mapSale(r, false));
  const allSales = [...pendingSales, ...syncedSales];

  // --- Filtering (Current Day + Past 7 Days Debtors) ---
  const now = new Date();
  const sevenDaysAgo = subDays(now, 7);
  
  const visibleRecords = allSales.filter(r => {
    const dateStr = r.raw.DATE || r.raw.Date;
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    
    // Always show today's records
    if (isSameDay(d, now)) return true;
    
    // Show records from the past 7 days ONLY if they have an outstanding balance (debtors)
    if (isWithinInterval(d, { start: sevenDaysAgo, end: now }) && (r.balance || 0) > 0) {
      return true;
    }

    return false;
  });

  const filtered = visibleRecords.filter(r => {
    const matchesSearch =
      r.client.toLowerCase().includes(search.toLowerCase()) ||
      r.description.toLowerCase().includes(search.toLowerCase());

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
      
      if (comparison === 0) {
        if (a.isPending && !b.isPending) comparison = 1;
        else if (!a.isPending && b.isPending) comparison = -1;
        else if (a.isPending && b.isPending) {
          comparison = (a.timestamp || 0) - (b.timestamp || 0);
        } else {
          comparison = (a.rowIndex || 0) - (b.rowIndex || 0);
        }
      }
    } else if (sortBy === "name") {
      comparison = a.client.localeCompare(b.client);
    } else if (sortBy === "debt") {
      comparison = (a.balance || 0) - (b.balance || 0);
    }

    return sortOrder === "asc" ? comparison : -comparison;
  });

  // Build an ordered list of "display units": grouped orders + flat records
  type GroupUnit = { type: "group"; salesId: string; items: UnifiedRecord[] };
  type FlatUnit = { type: "flat"; record: UnifiedRecord };
  type DisplayUnit = GroupUnit | FlatUnit;

  const displayUnits: DisplayUnit[] = useMemo(() => {
    const groups = new Map<string, UnifiedRecord[]>();
    sorted.forEach((r) => {
      if (r.salesId && r.salesId.trim() !== "" && r.type === "Sale") {
        const existing = groups.get(r.salesId) ?? [];
        existing.push(r);
        groups.set(r.salesId, existing);
      }
    });

    const seen = new Set<string>();
    const units: DisplayUnit[] = [];
    sorted.forEach((r) => {
      if (r.salesId && r.salesId.trim() !== "" && r.type === "Sale") {
        if (!seen.has(r.salesId)) {
          seen.add(r.salesId);
          units.push({ type: "group", salesId: r.salesId, items: groups.get(r.salesId)! });
        }
      } else {
        units.push({ type: "flat", record: r });
      }
    });
    return units;
  }, [sorted]);

  const totalPages = Math.ceil(displayUnits.length / itemsPerPage);
  const paginatedUnits = displayUnits.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const groupStatus = (items: UnifiedRecord[]): RecordStatus => {
    if (items.some(r => r.status === "Syncing")) return "Syncing";
    if (items.every(r => r.status === "Settled")) return "Settled";
    if (items.some(r => r.status === "Part-payment")) return "Part-payment";
    return "In Progress";
  };

  const handleGroupReceipt = (items: UnifiedRecord[], salesId: string) => {
    setGroupReceiptRecords(items);
    setIsReceiptModalOpen(true);
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [search, activeTab, sortBy, sortOrder]);

  return (
    <div className="p-3 md:p-8 bg-orange-50/20 dark:bg-zinc-950 min-h-screen pb-32 transition-colors duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-primary dark:text-orange-400">Daily Sales Records</h1>
            {refreshing && (
              <span className="flex items-center gap-1.5 text-[10px] font-black text-orange-500 dark:text-orange-400 uppercase tracking-wider bg-orange-50 dark:bg-orange-900/20 px-2 py-0.5 rounded-full animate-pulse border border-orange-100 dark:border-orange-800">
                <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                Syncing...
              </span>
            )}
          </div>
          <p className="text-gray-500 dark:text-zinc-400 text-sm mt-1">Review all sales logged today.</p>
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

      {/* Filter & Sort Bar */}
      <div className="flex flex-col lg:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-zinc-500" />
          <Input
            className="pl-10 h-11 bg-white dark:bg-zinc-900 border-gray-100 dark:border-zinc-800 rounded-xl shadow-sm focus:ring-orange-500 dark:text-zinc-100 dark:placeholder:text-zinc-600"
            placeholder="Search by client or job description..."
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
                className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${sortBy === option.id
                    ? "bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400"
                    : "text-gray-400 dark:text-zinc-500 hover:text-gray-700 dark:hover:text-zinc-300"
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
            <ArrowUpDown className={`w-4 h-4 text-orange-600 dark:text-orange-400 transition-transform ${sortOrder === 'desc' ? 'rotate-180' : ''}`} />
          </Button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 lg:pb-0 scrollbar-hide">
          <div className="flex bg-white dark:bg-zinc-900 p-1 rounded-xl shadow-sm border border-gray-100 dark:border-zinc-800">
            {["All", "Pending"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`px-6 py-2 rounded-lg text-xs font-black transition-all ${activeTab === tab
                    ? "bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400"
                    : "text-gray-400 dark:text-zinc-500 hover:text-gray-700 dark:hover:text-zinc-300"
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
              <TableHead className="text-[10px] font-black uppercase text-gray-400 dark:text-zinc-500 py-4">Client</TableHead>
              <TableHead className="text-[10px] font-black uppercase text-gray-400 dark:text-zinc-500">Description</TableHead>
              <TableHead className="text-[10px] font-black uppercase text-gray-400 dark:text-zinc-500 text-right">Amount</TableHead>
              <TableHead className="text-[10px] font-black uppercase text-gray-400 dark:text-zinc-500 text-right">Debt</TableHead>
              <TableHead className="text-[10px] font-black uppercase text-gray-400 dark:text-zinc-500 text-center">Status</TableHead>
              <TableHead className="text-[10px] font-black uppercase text-gray-400 dark:text-zinc-500">Logged By</TableHead>
              <TableHead className="text-[10px] font-black uppercase text-gray-400 dark:text-zinc-500 text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && paginatedUnits.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-20 text-gray-400 dark:text-zinc-600 italic font-medium">Finding records...</TableCell></TableRow>
            ) : paginatedUnits.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-20 text-gray-400 dark:text-zinc-600 font-medium">No records found matching your search.</TableCell></TableRow>
            ) : (
              paginatedUnits.map((unit, unitIdx) => {
                if (unit.type === "flat") {
                  const r = unit.record;
                  return (
                    <TableRow key={r.id} className="border-b border-gray-50 dark:border-zinc-800 hover:bg-gray-50/50 dark:hover:bg-zinc-800/50 transition-colors">
                      <TableCell className="text-sm font-bold text-gray-800 dark:text-zinc-100">{r.client}</TableCell>
                      <TableCell className="text-xs text-gray-500 dark:text-zinc-400 max-w-[200px] truncate">{r.description}</TableCell>
                      <TableCell className="text-sm font-black text-gray-900 dark:text-white text-right">₦{r.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-sm font-bold text-rose-600 dark:text-rose-400 text-right">
                        ₦{(r.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-center"><StatusBadge status={r.status} /></TableCell>
                      <TableCell className="text-xs font-medium text-gray-500 dark:text-zinc-400">{r.loggedBy}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <WhatsAppReminder
                            clientName={r.client}
                            contact={r.contact || ""}
                            balance={r.balance || 0}
                            jobDescription={r.description}
                            variant="icon"
                          />
                          <ManageSaleAction record={r} onUpdate={fetchData} />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                }

                const isExpanded = expandedGroups.has(unit.salesId);
                const totalAmt = unit.items.reduce((s, i) => s + i.amount, 0);
                const totalBal = unit.items.reduce((s, i) => s + (i.balance || 0), 0);
                const firstItem = unit.items[0];

                return (
                  <Fragment key={unit.salesId}>
                    <TableRow 
                      className={cn(
                        "border-b border-gray-100 dark:border-zinc-800 cursor-pointer transition-colors",
                        isExpanded ? "bg-primary/5 dark:bg-primary/10" : "bg-white dark:bg-zinc-900 hover:bg-gray-50/50 dark:hover:bg-zinc-800/50"
                      )}
                      onClick={() => {
                        const next = new Set(expandedGroups);
                        if (next.has(unit.salesId)) next.delete(unit.salesId);
                        else next.add(unit.salesId);
                        setExpandedGroups(next);
                      }}
                    >
                      <TableCell className="text-sm font-black text-gray-900 dark:text-white flex items-center gap-2 py-4">
                        {isExpanded ? <ChevronDown className="w-4 h-4 text-primary" /> : <ChevronRight className="w-4 h-4 text-primary" />}
                        {firstItem.client}
                        <div className="text-[10px] text-gray-500 font-medium ml-2">{unit.salesId}</div>
                      </TableCell>
                      <TableCell className="text-xs font-bold text-primary">{unit.items.length} Batched Items</TableCell>
                      <TableCell className="text-sm font-black text-gray-900 dark:text-white text-right">₦{totalAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-sm font-black text-rose-600 dark:text-rose-400 text-right">₦{totalBal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-center"><StatusBadge status={groupStatus(unit.items)} /></TableCell>
                      <TableCell className="text-xs font-medium text-gray-500 dark:text-zinc-400">Multiple</TableCell>
                      <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                             className="h-8 w-8 text-primary hover:bg-primary/10"
                            onClick={() => handleGroupReceipt(unit.items, unit.salesId)}
                          >
                              <Printer className="w-4 h-4" />
                          </Button>
                          <ManageBatchAction records={unit.items} salesId={unit.salesId} onUpdate={fetchData} />
                        </div>
                      </TableCell>
                    </TableRow>
                    {isExpanded && unit.items.map((item) => (
                      <TableRow key={item.id} className="bg-gray-50/30 dark:bg-zinc-800/20 border-b border-gray-100 dark:border-zinc-800 animate-in fade-in slide-in-from-top-1 duration-200">
                        <TableCell className="pl-10 text-xs font-bold text-gray-500 dark:text-zinc-400">{item.description || "No description"}</TableCell>
                        <TableCell className="text-[10px] text-gray-400 dark:text-zinc-500 italic">Item Row {item.rowIndex}</TableCell>
                        <TableCell className="text-xs font-bold text-gray-700 dark:text-zinc-300 text-right">₦{item.amount.toLocaleString()}</TableCell>
                        <TableCell className="text-xs font-bold text-rose-500/70 dark:text-rose-400/70 text-right">₦{(item.balance || 0).toLocaleString()}</TableCell>
                        <TableCell className="text-center"><StatusBadge status={item.status} /></TableCell>
                        <TableCell className="text-[10px] text-gray-400 dark:text-zinc-500">{item.loggedBy}</TableCell>
                        <TableCell className="text-center">
                          <ManageSaleAction record={item} onUpdate={fetchData} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>

      </div>

      <div className="md:hidden space-y-1">
        {loading && paginatedUnits.length === 0 ? (
          <div className="text-center py-20 text-gray-400">Loading records...</div>
        ) : paginatedUnits.length === 0 ? (
          <div className="text-center py-20 text-gray-400">No records found.</div>
        ) : (
          paginatedUnits.map((unit, idx) => {
            if (unit.type === "group") {
              return (
                <BatchCard
                  key={unit.salesId}
                  salesId={unit.salesId}
                  records={unit.items}
                  onUpdate={fetchData}
                />
              );
            }
            const r = unit.record;
            return (
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
            );
          })
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-between bg-white dark:bg-zinc-900 p-4 rounded-2xl shadow-sm border border-gray-100/50 dark:border-zinc-800">
          <p className="text-xs font-bold text-gray-500 dark:text-zinc-400">
            Page <span className="text-orange-600 dark:text-orange-400">{currentPage}</span> of {totalPages} 
            <span className="ml-2 opacity-50">({displayUnits.length} units)</span>
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
      <ReceiptModal 
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        records={groupReceiptRecords}
      />
    </div>
  );
}

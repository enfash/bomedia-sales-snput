"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Zap, RefreshCw, Receipt, BarChart3, Package, Volume2, VolumeX, CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSyncStore } from "@/lib/store";
import { DashboardMetrics } from "@/components/dashboard-metrics";
import { SalesExpenseChart, ExpenseCategorizationChart, OutstandingDebtChart } from "@/components/dashboard-charts";
import { DebtorPaymentModal } from "@/components/debtor-payment-modal";
import { processDebtData } from "@/lib/financial-utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TodayBanner } from "@/components/today-banner";

import {
  format,
  subDays,
  startOfDay,
  eachDayOfInterval,
  isSameDay,
  isWithinInterval,
} from "date-fns";
import { toast } from "sonner";

const parseAmount = (val: any): number => {
  if (val === undefined || val === null) return 0;
  const str = val.toString().replace(/[₦,\s]/g, "");
  return parseFloat(str) || 0;
};

const parseSheetDate = (dateStr: any): Date | null => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
};

type Row = Record<string, string>;

export default function DashboardPage() {
  const { pendingQueue, cachedSales, cachedExpenses, setCachedData } = useSyncStore();
  
  const [salesData, setSalesData] = useState<Row[]>(cachedSales || []);
  const [expensesData, setExpensesData] = useState<Row[]>(cachedExpenses || []);
  const [loading, setLoading] = useState(cachedSales.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [timeRange, setTimeRange] = useState<"all" | "today" | "7d" | "30d" | "custom">("today");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [selectedDebtor, setSelectedDebtor] = useState<string | null>(null);
  
  // Notification refs to track 'new' entries
  const lastSalesIndex = useRef<number>(0);
  const lastExpensesIndex = useRef<number>(0);
  const isInitialLoad = useRef<boolean>(true);

  const fetchData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else if (salesData.length === 0) setLoading(true);

    // Get current mute status from localStorage
    const mutedPreference = localStorage.getItem("bomedia-muted") === "true";
    setIsMuted(mutedPreference);

    try {
      const [salesRes, expensesRes] = await Promise.all([
        fetch("/api/sales"),
        fetch("/api/expenses"),
      ]);

      // If routes are still compiling in dev mode, they might return 404/500 temporarily.
      // We check for .ok and valid JSON to prevent "Unexpected token < in JSON" errors.
      if (!salesRes.ok || !expensesRes.ok) {
        throw new Error(`Fetch failed: Sales ${salesRes.status}, Expenses ${expensesRes.status}`);
      }

      const salesContentType = salesRes.headers.get("content-type");
      const expensesContentType = expensesRes.headers.get("content-type");

      if (!salesContentType?.includes("application/json") || !expensesContentType?.includes("application/json")) {
        throw new Error("API returned non-JSON response (likely a 404/500 HTML page during compilation)");
      }

      const salesJson = await salesRes.json();
      const expensesJson = await expensesRes.json();
      
      const newSales = salesJson.data ?? [];
      const newExpenses = expensesJson.data ?? [];

      setSalesData(newSales);
      setExpensesData(newExpenses);
      setCachedData(newSales, newExpenses);

      // Handle notifications
      if (isInitialLoad.current) {
        // Set initial baseline
        lastSalesIndex.current = Math.max(0, ...newSales.map((r: any) => r._rowIndex || 0));
        lastExpensesIndex.current = Math.max(0, ...newExpenses.map((r: any) => r._rowIndex || 0));
        isInitialLoad.current = false;
      } else {
        let hasNewActivity = false;

        // Check for new sales
        const freshSales = newSales.filter((r: any) => (r._rowIndex || 0) > lastSalesIndex.current);
        if (freshSales.length > 0) hasNewActivity = true;
        freshSales.forEach((sale: any) => {
          const amount = parseAmount(sale["AMOUNT (₦)"] || sale["Amount (₦)"]);
          const client = sale["CLIENT NAME"] || sale["Client Name"] || "New Client";
          const cashier = sale["LOGGED BY"] || sale["Logged By"] || "Cashier";
          toast.success(`New Sale: ₦${amount.toLocaleString()} - ${client}`, {
            description: `Logged by ${cashier}`,
            duration: 5000,
          });
        });

        // Check for new expenses
        const freshExpenses = newExpenses.filter((r: any) => (r._rowIndex || 0) > lastExpensesIndex.current);
        if (freshExpenses.length > 0) hasNewActivity = true;
        freshExpenses.forEach((expense: any) => {
          const amount = parseAmount(expense["Amount (₦)"] || expense.AMOUNT || expense.Amount);
          const category = expense.CATEGORY || expense.Category || "Other";
          const cashier = expense["LOGGED BY"] || expense["Logged By"] || "Cashier";
          toast.info(`New Expense: ₦${amount.toLocaleString()} (${category})`, {
            description: `Logged by ${cashier}`,
            duration: 5000,
          });
        });

        // Play sound if new activity and not muted
        if (hasNewActivity) {
          // Double check preference
          const currentMute = localStorage.getItem("bomedia-muted") === "true";
          
          if (!currentMute) {
            const audio = new Audio("/notification.mp3");
            audio.play().catch(e => console.error("Sound play blocked:", e));
          }

          // Dispatch system notification event
          window.dispatchEvent(new CustomEvent("bomedia-notify", {
            detail: {
              title: "New BOMedia Activity",
              body: `${freshSales.length > 0 ? freshSales.length + " new sale(s). " : ""}${freshExpenses.length > 0 ? freshExpenses.length + " new expense(s)." : ""}`
            }
          }));
        }

        // Update indices
        if (newSales.length > 0) {
          lastSalesIndex.current = Math.max(lastSalesIndex.current, ...newSales.map((r: any) => r._rowIndex || 0));
        }
        if (newExpenses.length > 0) {
          lastExpensesIndex.current = Math.max(lastExpensesIndex.current, ...newExpenses.map((r: any) => r._rowIndex || 0));
        }
      }
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Auto-refresh when coming back online
    const handleOnline = () => {
      console.log("Back online, refreshing dashboard...");
      fetchData(true);
    };

    window.addEventListener("online", handleOnline);
    
    // Polling Interval (30 seconds)
    const pollInterval = setInterval(() => {
      fetchData(true);
    }, 30000);

    return () => {
      window.removeEventListener("online", handleOnline);
      clearInterval(pollInterval);
    };
  }, []);

  // ── Data assembly ──────────────────────────────────────────────────────────
  const pendingSales: Row[] = pendingQueue
    .filter((item) => item.type === "sale")
    .map((item) => {
      const v = item.data;
      return {
        DATE: v[0],
        "AMOUNT (₦)": "0",
        "INITIAL PAYMENT (₦)": v[14] || "0",
        "AMOUNT DIFFERENCES": "0",
        "PAYMENT STATUS": v[19] || "Unpaid",
        "CLIENT NAME": v[1],
        __isPending: "true",
      };
    });

  const pendingExpenses: Row[] = pendingQueue
    .filter((item) => item.type === "expense")
    .map((item) => ({ ...item.data, __isPending: "true" }));

  const allSales = [...pendingSales, ...salesData];
  const allExpenses = [...pendingExpenses, ...expensesData];

  const now = new Date();

  // ── Dynamic Time Windows ───────────────────────────────────────────────────
  let startDate: Date;
  let prevStartDate: Date;

  if (timeRange === "today") {
    startDate = startOfDay(now);
    prevStartDate = startOfDay(subDays(now, 1));
  } else if (timeRange === "7d") {
    startDate = subDays(now, 7);
    prevStartDate = subDays(now, 14);
  } else if (timeRange === "30d") {
    startDate = subDays(now, 30);
    prevStartDate = subDays(now, 60);
  } else if (timeRange === "custom" && customStart && customEnd) {
    startDate = startOfDay(new Date(customStart));
    const endDate = new Date(customEnd);
    const rangeDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000));
    prevStartDate = subDays(startDate, rangeDays);
  } else {
    // "all" or custom with incomplete dates — use a very old start date
    startDate = new Date("2020-01-01");
    prevStartDate = new Date("2019-01-01");
  }

  // For "custom" use the explicit end date; otherwise use now
  const effectiveEnd =
    timeRange === "custom" && customEnd ? new Date(customEnd + "T23:59:59") : now;

  const filterByInterval = (data: Row[], start: Date, end: Date) =>
    data.filter((row) => {
      const d = parseSheetDate(row.DATE || row.Date);
      return d ? isWithinInterval(d, { start, end }) : false;
    });

  const currentSales = filterByInterval(allSales, startDate, effectiveEnd);
  const prevSales = filterByInterval(allSales, prevStartDate, startDate);
  const currentExpenses = filterByInterval(allExpenses, startDate, effectiveEnd);
  const prevExpenses = filterByInterval(allExpenses, prevStartDate, startDate);

  const sumKey = (data: Row[], keys: string[]) =>
    data.reduce((acc, r) => {
      const key = keys.find((k) => r[k] !== undefined);
      return acc + (key ? parseAmount(r[key]) : 0);
    }, 0);

  // ── Metric values ──────────────────────────────────────────────────────────
  const totalSalesVal = sumKey(currentSales, ["AMOUNT (₦)", "Amount (₦)"]);
  const prevSalesVal = sumKey(prevSales, ["AMOUNT (₦)", "Amount (₦)"]);
  const totalExpensesVal = sumKey(currentExpenses, ["Amount (₦)", "AMOUNT", "Amount"]);
  const prevExpensesVal = sumKey(prevExpenses, ["Amount (₦)", "AMOUNT", "Amount"]);
  const netProfitVal = totalSalesVal - totalExpensesVal;
  const prevProfitVal = prevSalesVal - prevExpensesVal;

  // ── Outstanding debt ───────────────────────────────────────────────────────
  const { chartData: outstandingDebtChart, totalDebt: outstandingDebtTotal, count: unpaidCount } = processDebtData(allSales);

  // ── Today at a glance (Static window for banner) ───────────────────────────
  const startOfToday = startOfDay(now);
  const todaySalesItems = allSales.filter(r => {
    const d = parseSheetDate(r.DATE || r.Date);
    return d ? isSameDay(d, startOfToday) : false;
  });
  const todayJobCount = todaySalesItems.length;
  const todayRevenue = sumKey(todaySalesItems, ["AMOUNT (₦)", "Amount (₦)"]);


  // ── Chart data ─────────────────────────────────────────────────────────────
  // For "all" / incomplete custom: derive chart start from earliest actual data
  // instead of using startDate (which could be 2020 → 2000+ days of intervals).
  const chartStartDate = (() => {
    if (timeRange !== "all" && !(timeRange === "custom" && !customStart)) {
      return startDate;
    }
    const allDates = [...allSales, ...allExpenses]
      .map((r) => parseSheetDate(r.DATE || r.Date))
      .filter(Boolean) as Date[];
    if (allDates.length === 0) return startOfDay(now);
    const earliest = new Date(Math.min(...allDates.map((d) => d.getTime())));
    // Cap at 365 days back to keep chart readable
    return earliest < subDays(now, 365) ? subDays(now, 365) : earliest;
  })();
  const rangeInterval = eachDayOfInterval({ start: chartStartDate, end: effectiveEnd });
  const chartData = rangeInterval.map((day) => {
    const daySales = allSales.filter((r) => {
      const d = parseSheetDate(r.DATE || r.Date);
      return d ? isSameDay(d, day) : false;
    });
    const dayExpenses = allExpenses.filter((r) => {
      const d = parseSheetDate(r.DATE || r.Date);
      return d ? isSameDay(d, day) : false;
    });
    return {
      date: format(day, timeRange === "today" ? "HH:00" : "MMM dd"),
      // note: custom/all ranges use "MMM dd" label (same as 7d/30d)
      sales: sumKey(daySales, ["AMOUNT (₦)", "Amount (₦)"]),
      expenses: sumKey(dayExpenses, ["Amount (₦)", "AMOUNT", "Amount"]),
    };
  });

  // ── Expense categories ─────────────────────────────────────────────────────
  const categories: Record<string, number> = {};
  allExpenses.forEach((r) => {
    const cat = r.CATEGORY || r.Category || "Other";
    const amount = parseAmount(r["Amount (₦)"] || r.AMOUNT || r.Amount);
    categories[cat] = (categories[cat] || 0) + amount;
  });
  const categoryData = Object.entries(categories)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, value]) => ({ name, value, color: "" }));

  const calculateChange = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? "100%" : "0%";
    return `${Math.abs(Math.round(((current - previous) / previous) * 100))}%`;
  };

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-brand-700 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 font-medium">Loading Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6 bg-slate-50/80 dark:bg-zinc-950 min-h-screen pb-24 transition-colors duration-500">
      <TodayBanner jobCount={todayJobCount} revenue={todayRevenue} salesCount={todayJobCount} />

      {/* Mobile Time Range Selector */}
      <div className="md:hidden space-y-2">
        <Tabs
          value={timeRange}
          onValueChange={(val: any) => setTimeRange(val)}
          className="w-full bg-gray-100 dark:bg-zinc-900/80 p-0.5 rounded-xl border border-gray-200 dark:border-zinc-800"
        >
          <TabsList className="bg-transparent border-none p-0 h-10 w-full">
            {([
              { val: "all",    label: "All" },
              { val: "today",  label: "Today" },
              { val: "7d",     label: "7D" },
              { val: "30d",    label: "30D" },
              { val: "custom", label: <CalendarRange className="w-3.5 h-3.5" /> },
            ] as { val: string; label: React.ReactNode }[]).map(({ val, label }) => (
              <TabsTrigger
                key={val}
                value={val}
                className="flex-1 text-[10px] font-bold uppercase rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-primary data-[state=active]:text-brand-700 dark:data-[state=active]:text-primary-foreground h-9 flex items-center justify-center gap-1"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {/* Custom date pickers — mobile */}
        {timeRange === "custom" && (
          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <p className="text-[9px] font-bold uppercase text-gray-400 tracking-wider">From</p>
              <input
                type="date"
                value={customStart}
                max={customEnd || undefined}
                onChange={(e) => setCustomStart(e.target.value)}
                className="w-full h-10 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-semibold text-gray-700 dark:text-zinc-200 px-3 focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>
            <div className="flex-1 space-y-1">
              <p className="text-[9px] font-bold uppercase text-gray-400 tracking-wider">To</p>
              <input
                type="date"
                value={customEnd}
                min={customStart || undefined}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="w-full h-10 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-semibold text-gray-700 dark:text-zinc-200 px-3 focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>
          </div>
        )}
      </div>

      {/* Desktop Time Range + Controls */}
      <div className="hidden md:flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Tabs
            value={timeRange}
            onValueChange={(val: any) => setTimeRange(val)}
            className="bg-muted p-0.5 rounded-lg border"
          >
            <TabsList className="bg-transparent border-none p-0 h-auto">
              {([
                ["all",    "All"],
                ["today",  "Today"],
                ["7d",     "7D"],
                ["30d",    "30D"],
                ["custom", "Custom"],
              ] as const).map(([val, label]) => (
                <TabsTrigger
                  key={val}
                  value={val}
                  className="text-[10px] font-bold uppercase px-3 py-1 rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-primary data-[state=active]:text-brand-700 dark:data-[state=active]:text-primary-foreground"
                >
                  {val === "custom" ? (
                    <span className="flex items-center gap-1">
                      <CalendarRange className="w-3 h-3" />
                      {label}
                    </span>
                  ) : label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {/* Custom date inputs — desktop inline */}
          {timeRange === "custom" && (
            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-200">
              <div className="space-y-0.5">
                <p className="text-[9px] font-bold uppercase text-gray-400 tracking-wider">From</p>
                <input
                  type="date"
                  value={customStart}
                  max={customEnd || undefined}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="h-8 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-semibold text-gray-700 dark:text-zinc-200 px-2.5 focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>
              <span className="text-gray-300 dark:text-zinc-600 mt-4">→</span>
              <div className="space-y-0.5">
                <p className="text-[9px] font-bold uppercase text-gray-400 tracking-wider">To</p>
                <input
                  type="date"
                  value={customEnd}
                  min={customStart || undefined}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="h-8 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-semibold text-gray-700 dark:text-zinc-200 px-2.5 focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsMuted(!isMuted)}
            className="h-8 px-2 border-border text-muted-foreground hover:text-foreground bg-card"
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5 mr-1" /> : <Volume2 className="w-3.5 h-3.5 mr-1" />}
            <span className="text-[10px] font-bold uppercase tracking-tight">{isMuted ? "Muted" : "Sound On"}</span>
          </Button>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="bg-card border-border text-foreground shadow-sm rounded-xl h-9 px-4 text-xs font-bold"
        >
          <RefreshCw className={cn("w-3.5 h-3.5 mr-2", refreshing && "animate-spin")} />
          {refreshing ? "Updating..." : "Refresh"}
        </Button>
      </div>

      {/* Metrics Row — 4 cards */}
      <DashboardMetrics
        totalSales={totalSalesVal}
        totalExpenses={totalExpensesVal}
        netProfit={netProfitVal}
        outstandingDebt={outstandingDebtTotal}
        unpaidCount={unpaidCount}
        salesChange={calculateChange(totalSalesVal, prevSalesVal)}
        expensesChange={calculateChange(totalExpensesVal, prevExpensesVal)}
        profitChange={calculateChange(netProfitVal, prevProfitVal)}
        isSalesUp={totalSalesVal >= prevSalesVal}
        isExpensesDown={totalExpensesVal <= prevExpensesVal}
        isProfitUp={netProfitVal >= prevProfitVal}
        sparkData={chartData.slice(-7).map(d => d.sales)}
      />

      {/* Inventory Alerts & Shortcuts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/bom03/inventory" className="md:col-span-1">
          <div className="bg-amber-500/5 dark:bg-amber-900/10 border border-amber-200/50 dark:border-amber-800/30 rounded-2xl p-4 flex items-center gap-4 cursor-pointer hover:bg-amber-500/10 dark:hover:bg-amber-900/20 transition-all active:scale-[0.98] shadow-sm">
            <div className="bg-amber-100 dark:bg-amber-900/40 p-2.5 rounded-xl shadow-inner">
              <Package className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400/80 mb-0.5">Inventory Status</p>
              <h3 className="text-base font-bold text-foreground">Check Stock Levels</h3>
              <p className="text-xs text-muted-foreground">Manage items & categories</p>
            </div>
          </div>
        </Link>
        <div className="md:col-span-2 bg-brand-50 dark:bg-brand-950/30 rounded-2xl p-4 flex items-center justify-between border border-brand-100 dark:border-brand-900/20">
          <div className="flex gap-4">
            <div className="text-center">
              <p className="text-[10px] font-bold uppercase text-gray-400 mb-1">Total Sales</p>
              <p className="text-sm font-black text-brand-700 dark:text-brand-300">₦{totalSalesVal.toLocaleString()}</p>
            </div>
            <div className="w-px h-8 bg-brand-100 dark:bg-brand-900/40 self-center" />
            <div className="text-center">
              <p className="text-[10px] font-bold uppercase text-gray-400 mb-1">Exp. Ratio</p>
              <p className="text-sm font-black text-brand-700 dark:text-brand-300">
                {totalSalesVal > 0 ? ((totalExpensesVal / totalSalesVal) * 100).toFixed(1) : "0"}%
              </p>
            </div>
          </div>
          <p className="text-[11px] text-gray-400 font-medium max-w-[200px] text-right">
            Profit margin is currently <span className="text-emerald-600 font-bold">
              {totalSalesVal > 0 ? ((netProfitVal / totalSalesVal) * 100).toFixed(1) : "0"}%
            </span>
          </p>
        </div>
      </div>

      {/* AI Banner */}
      {/* Quick Actions / AI Banner */}
      <div
        className="rounded-2xl p-5 text-white flex flex-col md:flex-row items-center justify-between gap-6 shadow-lg bg-brand-700 bg-gradient-to-br from-brand-600 to-brand-800"
        style={{ boxShadow: "0 8px 24px rgba(46, 56, 141, 0.4)" }}
      >
        <div className="flex items-center gap-4">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
          >
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-bold text-base leading-tight">Quick Actions</h2>
            <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.8)" }}>
              Say: <em className="not-italic font-semibold">"Logged ₦12k sale..."</em> — Fast mobile entry.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <Link href="/new-entry" className="flex-1 md:flex-none">
            <Button
              className="w-full text-xs font-bold rounded-xl h-10 px-4 transition-all hover:scale-105 bg-white dark:bg-primary text-brand dark:text-primary-foreground border-none"
            >
              <Zap className="w-3 h-3 mr-2" />
              AI Entry
            </Button>
          </Link>
          <Link href="/bom03/expenses" className="flex-1 md:flex-none">
            <Button
              variant="outline"
              className="w-full text-xs font-bold rounded-xl h-10 px-4 border-white/30 text-white bg-white/10 hover:bg-white/20 transition-all hover:scale-105"
            >
              <Receipt className="w-3 h-3 mr-2" />
              Log Expense
            </Button>
          </Link>
          <Link href="/bom03/records" className="flex-1 md:flex-none">
            <Button
              variant="outline"
              className="w-full text-xs font-bold rounded-xl h-10 px-4 border-white/30 text-white bg-white/10 hover:bg-white/20 transition-all hover:scale-105"
            >
              <BarChart3 className="w-3 h-3 mr-2" />
              Records
            </Button>
          </Link>
        </div>
      </div>

      {/* Charts — Row 1: Sales vs Expenses + Expense Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <SalesExpenseChart data={chartData} />
        </div>
        <div className="lg:col-span-1">
          <ExpenseCategorizationChart data={categoryData} total={totalExpensesVal} />
        </div>
      </div>

      {/* Charts — Row 2: Outstanding Debt (full width) */}
      <OutstandingDebtChart data={outstandingDebtChart} onClientClick={setSelectedDebtor} />

      <DebtorPaymentModal 
        clientName={selectedDebtor} 
        isOpen={!!selectedDebtor} 
        onClose={() => setSelectedDebtor(null)} 
        onUpdate={() => fetchData(true)}
        theme="brand"
      />
    </div>
  );
}

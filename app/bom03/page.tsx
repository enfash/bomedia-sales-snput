"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Zap, RefreshCw, Receipt, BarChart3, Package, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSyncStore } from "@/lib/store";
import { DashboardMetrics } from "@/components/dashboard-metrics";
import { SalesExpenseChart, ExpenseCategorizationChart, OutstandingDebtChart } from "@/components/dashboard-charts";
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
  const [timeRange, setTimeRange] = useState<"today" | "7d" | "30d">("30d");
  
  // Notification refs to track 'new' entries
  const lastSalesIndex = useRef<number>(0);
  const lastExpensesIndex = useRef<number>(0);
  const isInitialLoad = useRef<boolean>(true);

  const fetchData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else if (salesData.length === 0) setLoading(true);

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
        if (hasNewActivity && !isMuted) {
          const audio = new Audio("/notification.mp3");
          audio.play().catch(e => console.error("Sound play blocked:", e));
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
  } else {
    startDate = subDays(now, 30);
    prevStartDate = subDays(now, 60);
  }

  const filterByInterval = (data: Row[], start: Date, end: Date) =>
    data.filter((row) => {
      const d = parseSheetDate(row.DATE || row.Date);
      return d ? isWithinInterval(d, { start, end }) : false;
    });

  const currentSales = filterByInterval(allSales, startDate, now);
  const prevSales = filterByInterval(allSales, prevStartDate, startDate);
  const currentExpenses = filterByInterval(allExpenses, startDate, now);
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
  const debtRows = allSales.filter((r) => {
    const balance = parseAmount(r["AMOUNT DIFFERENCES"] || r["Amount Differences"]);
    return balance > 0;
  });

  const outstandingDebtTotal = debtRows.reduce(
    (sum, r) => sum + parseAmount(r["AMOUNT DIFFERENCES"] || r["Amount Differences"]),
    0
  );

  const unpaidCount = debtRows.length;

  // Group by client name, sum balances, take top 7
  const debtByClient: Record<string, number> = {};
  debtRows.forEach((r) => {
    const client = (r["CLIENT NAME"] || r["Client Name"] || "Unknown").trim();
    const balance = parseAmount(r["AMOUNT DIFFERENCES"] || r["Amount Differences"]);
    debtByClient[client] = (debtByClient[client] || 0) + balance;
  });

  const outstandingDebtChart = Object.entries(debtByClient)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([name, balance]) => ({
      name: name.length > 14 ? name.slice(0, 13) + "…" : name,
      balance,
    }));

  // ── Today at a glance (Static window for banner) ───────────────────────────
  const startOfToday = startOfDay(now);
  const todaySalesItems = allSales.filter(r => {
    const d = parseSheetDate(r.DATE || r.Date);
    return d ? isSameDay(d, startOfToday) : false;
  });
  const todayJobCount = todaySalesItems.length;
  const todayRevenue = sumKey(todaySalesItems, ["AMOUNT (₦)", "Amount (₦)"]);


  // ── Chart data ─────────────────────────────────────────────────────────────
  const rangeInterval = eachDayOfInterval({ start: startDate, end: now });
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
      <div className="md:hidden flex justify-center">
        <Tabs 
          value={timeRange} 
          onValueChange={(val: any) => setTimeRange(val)}
          className="w-full bg-gray-100 dark:bg-zinc-900/80 p-0.5 rounded-xl border border-gray-200 dark:border-zinc-800"
        >
          <TabsList className="bg-transparent border-none p-0 h-10 w-full">
            <TabsTrigger value="today" className="flex-1 text-[10px] font-bold uppercase rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-brand-700 data-[state=active]:text-brand-700 dark:data-[state=active]:text-white h-9">Today</TabsTrigger>
            <TabsTrigger value="7d" className="flex-1 text-[10px] font-bold uppercase rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-brand-700 data-[state=active]:text-brand-700 dark:data-[state=active]:text-white h-9">7D</TabsTrigger>
            <TabsTrigger value="30d" className="flex-1 text-[10px] font-bold uppercase rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-brand-700 data-[state=active]:text-brand-700 dark:data-[state=active]:text-white h-9">30D</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Desktop Time Range + Controls */}
      <div className="hidden md:flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Tabs 
            value={timeRange} 
            onValueChange={(val: any) => setTimeRange(val)}
            className="bg-muted p-0.5 rounded-lg border"
          >
            <TabsList className="bg-transparent border-none p-0 h-auto">
              <TabsTrigger value="today" className="text-[10px] font-bold uppercase px-3 py-1 rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-brand-700 data-[state=active]:text-brand-700 dark:data-[state=active]:text-white">Today</TabsTrigger>
              <TabsTrigger value="7d" className="text-[10px] font-bold uppercase px-3 py-1 rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-brand-700 data-[state=active]:text-brand-700 dark:data-[state=active]:text-white">7D</TabsTrigger>
              <TabsTrigger value="30d" className="text-[10px] font-bold uppercase px-3 py-1 rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-brand-700 data-[state=active]:text-brand-700 dark:data-[state=active]:text-white">30D</TabsTrigger>
            </TabsList>
          </Tabs>
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
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-5 border border-amber-100 dark:border-amber-900/30 shadow-sm hover:shadow-md transition-all flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
              <Package className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 mb-0.5">Inventory Status</p>
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Check Stock Levels</h3>
              <p className="text-[10px] text-gray-400 font-bold">Manage items & categories</p>
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
              className="w-full text-xs font-bold rounded-xl h-10 px-4 transition-all hover:scale-105"
              style={{ backgroundColor: "white", color: "#2e388d" }}
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
      <OutstandingDebtChart data={outstandingDebtChart} />
    </div>
  );
}

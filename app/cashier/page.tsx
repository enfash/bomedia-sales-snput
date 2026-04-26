"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Zap,
  ShieldAlert,
  AlertCircle,
  ShoppingBag,
  RefreshCw,
  Sparkles,
  Receipt,
  BarChart3
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSyncStore } from "@/lib/store";
import { MetricCard } from "@/components/dashboard-metrics";
import { MaterialSalesChart, OutstandingDebtChart } from "@/components/dashboard-charts";
import { DebtorPaymentModal } from "@/components/debtor-payment-modal";
import { processDebtData } from "@/lib/financial-utils";
import { isSameDay, subDays, isWithinInterval } from "date-fns";
import { TodayBanner } from "@/components/today-banner";
import { FloatingSaleActionButton } from "@/components/floating-sale-fab";

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

export default function CashierDashboardPage() {
  const { pendingQueue, cachedSales, setCachedData, cachedExpenses } = useSyncStore();

  const [salesData, setSalesData] = useState<Row[]>(cachedSales || []);
  const [loading, setLoading] = useState(cachedSales.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDebtor, setSelectedDebtor] = useState<string | null>(null);

  const fetchData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else if (salesData.length === 0) setLoading(true);

    try {
      const res = await fetch("/api/sales");
      const salesJson = await res.json();
      const newSales = salesJson.data ?? [];

      setSalesData(newSales);
      setCachedData(newSales, cachedExpenses); // keeps expenses untouched
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();

    const handleOnline = () => {
      fetchData(true);
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Data assembly ──────────────────────────────────────────────────────────
  const pendingSales: Row[] = pendingQueue
    .filter((item) => item.type === "sale")
    .map((item) => {
      const v = item.data;
      return {
        DATE: v[0],
        "CLIENT NAME": v[1],
        "JOB DESCRIPTION": v[2],
        "Material": v[4],
        "AMOUNT (₦)": "0",
        "INITIAL PAYMENT (₦)": v[14] || "0",
        "AMOUNT DIFFERENCES": "0",
        "PAYMENT STATUS": v[19] || "Unpaid",
        __isPending: "true",
      };
    });

  const allSales = [...pendingSales, ...salesData];

  // ── Time windows ───────────────────────────────────────────────────────────
  const now = new Date();
  const sevenDaysAgo = subDays(now, 7);

  const todaySales = allSales.filter((r) => {
    const d = parseSheetDate(r.DATE || r.Date);
    return d ? isSameDay(d, now) : false;
  });

  const weekSales = allSales.filter((r) => {
    const d = parseSheetDate(r.DATE || r.Date);
    return d ? isWithinInterval(d, { start: sevenDaysAgo, end: now }) : false;
  });

  // ── Metric values ──────────────────────────────────────────────────────────
  const sumKey = (data: Row[], keys: string[]) =>
    data.reduce((acc, r) => {
      const key = keys.find((k) => r[k] !== undefined);
      return acc + (key ? parseAmount(r[key]) : 0);
    }, 0);

  const dailyTotalSalesVal = sumKey(todaySales, ["AMOUNT (₦)", "Amount (₦)"]);

  // ── Outstanding debt ───────────────────────────────────────────────────────
  const { totalDebt: dailyOutstandingDebt } = processDebtData(todaySales);
  const { totalDebt: weeklyOutstandingDebt, chartData: outstandingDebtChart } = processDebtData(weekSales, 10);

  // ── Material categories ─────────────────────────────────────────────────────
  const materials: Record<string, number> = {};
  let totalJobs = 0;
  let totalRevenue = 0;
  todaySales.forEach((r) => {
    const mat = r["Material"] || r["MATERIAL"] || r["JOB DESCRIPTION"] || r["Job Description"] || "Other";
    let group = "Other";
    if (mat.toLowerCase().includes("flex")) group = "Flex";
    else if (mat.toLowerCase().includes("sav")) group = "SAV";
    else if (mat.toLowerCase().includes("clear sticker") || mat.toLowerCase().includes("clear")) group = "Clear Stickers";
    else if (mat.toLowerCase().includes("banner")) group = "Banner";
    else group = "Other";

    materials[group] = (materials[group] || 0) + 1;
    totalJobs++;

    // Calculate revenue — use the same column keys as all other metrics
    const price = parseAmount(r["AMOUNT (₦)"] || r["Amount (₦)"] || "0");
    totalRevenue += price;
  });

  const materialData = Object.entries(materials)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value], i) => ({ name, value, color: ["#6366f1", "#a855f7", "#10b981", "#f59e0b", "#64748b"][i % 5] }));

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 font-medium">Loading Cashier View...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6 bg-orange-50/20 dark:bg-zinc-950 min-h-screen pb-24 transition-colors duration-500">
      <TodayBanner jobCount={totalJobs} revenue={totalRevenue} salesCount={todaySales.length} />
      <FloatingSaleActionButton />

      <div
        className="rounded-[2rem] p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl bg-orange-600 dark:bg-orange-600 bg-gradient-to-br from-orange-500 to-orange-600 text-white transition-all duration-500"
        style={{ boxShadow: "0 20px 50px hsla(24, 100%, 50%, 0.30)" }}
      >
        <div className="flex items-center gap-5">
          <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center shrink-0 shadow-inner">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="font-black text-xl md:text-2xl text-white leading-tight tracking-tight">Quick Actions</h2>
            <p className="text-sm md:text-base mt-1 text-white/90 font-medium">
              Say: <em className="not-italic font-bold text-white">"Logged ₦12k sale..."</em> — Fast mobile entry.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:flex items-center gap-3 w-full md:w-auto">
          <Link href="/new-entry" className="col-span-1">
            <Button
              className="w-full text-[11px] font-black rounded-2xl h-12 px-5 transition-all hover:scale-[1.02] active:scale-95 bg-white text-orange-600 hover:bg-white/90 shadow-lg shadow-white/10 border-none"
            >
              <Sparkles className="w-3.5 h-3.5 mr-2" />
              AI ENTRY
            </Button>
          </Link>
          <Link href="/new-entry" className="col-span-1">
            <Button
              variant="outline"
              className="w-full text-[11px] font-bold rounded-2xl h-12 px-5 border-white/30 text-white bg-white/10 hover:bg-white/20 transition-all hover:scale-[1.02] active:scale-95"
            >
              <ShoppingBag className="w-3.5 h-3.5 mr-2" />
              NEW SALE
            </Button>
          </Link>
          <Link href="/cashier/expenses" className="col-span-1">
            <Button
              className="w-full text-[11px] font-black rounded-2xl h-12 px-5 transition-all hover:scale-[1.02] active:scale-95 bg-white/10 text-white hover:bg-white/20 shadow-lg border-white/20"
            >
              <Receipt className="w-3.5 h-3.5 mr-2" />
              EXPENSE
            </Button>
          </Link>
          <Link href="/cashier/records" className="col-span-1">
            <Button
              className="w-full text-[11px] font-black rounded-2xl h-12 px-5 transition-all hover:scale-[1.02] active:scale-95 bg-white/10 text-white hover:bg-white/20 shadow-lg border-white/20"
            >
              <BarChart3 className="w-3.5 h-3.5 mr-2" />
              RECORDS
            </Button>
          </Link>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="col-span-2 md:col-span-1">
          <MetricCard
            title="Today's Sales"
            value={dailyTotalSalesVal}
            icon={ShoppingBag}
            variant="hero"
            subLabel={`${todaySales.length} total logged today`}
          />
        </div>
        <MetricCard
          title="Daily Debt"
          value={dailyOutstandingDebt}
          icon={AlertCircle}
          subLabel={`From today's jobs`}
        />
        <MetricCard
          title="Weekly Debt"
          value={weeklyOutstandingDebt}
          icon={ShieldAlert}
          variant="alert"
          subLabel={`Over the last 7 days`}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-1">
          <MaterialSalesChart data={materialData} total={totalJobs} />
        </div>
        <div className="lg:col-span-2">
          <OutstandingDebtChart data={outstandingDebtChart} onClientClick={setSelectedDebtor} />
        </div>
      </div>

      <DebtorPaymentModal 
        clientName={selectedDebtor} 
        isOpen={!!selectedDebtor} 
        onClose={() => setSelectedDebtor(null)} 
        onUpdate={() => fetchData(true)}
        theme="amber"
      />
    </div>
  );
}

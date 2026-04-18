"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Zap, Store, ShieldAlert, BadgeInfo, AlertCircle, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSyncStore } from "@/lib/store";
import { MetricCard } from "@/components/dashboard-metrics";
import { MaterialSalesChart, OutstandingDebtChart } from "@/components/dashboard-charts";
import { RefreshCw } from "lucide-react";
import { isSameDay, subDays, isWithinInterval } from "date-fns";

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
  const dailyDebtRows = todaySales.filter((r) => parseAmount(r["AMOUNT DIFFERENCES"] || r["Amount Differences"]) > 0);
  const dailyOutstandingDebt = dailyDebtRows.reduce(
    (sum, r) => sum + parseAmount(r["AMOUNT DIFFERENCES"] || r["Amount Differences"]),
    0
  );

  const weeklyDebtRows = weekSales.filter((r) => parseAmount(r["AMOUNT DIFFERENCES"] || r["Amount Differences"]) > 0);
  const weeklyOutstandingDebt = weeklyDebtRows.reduce(
    (sum, r) => sum + parseAmount(r["AMOUNT DIFFERENCES"] || r["Amount Differences"]),
    0
  );

  // Group by client name, sum balances, take top 10 for the week
  const debtByClient: Record<string, number> = {};
  weeklyDebtRows.forEach((r) => {
    const client = (r["CLIENT NAME"] || r["Client Name"] || "Unknown").trim();
    const balance = parseAmount(r["AMOUNT DIFFERENCES"] || r["Amount Differences"]);
    debtByClient[client] = (debtByClient[client] || 0) + balance;
  });

  const outstandingDebtChart = Object.entries(debtByClient)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, balance]) => ({
      name: name.length > 14 ? name.slice(0, 13) + "…" : name,
      balance,
    }));

  // ── Material categories ─────────────────────────────────────────────────────
  const materials: Record<string, number> = {};
  let totalJobs = 0;
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
  });

  const materialData = Object.entries(materials)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value], i) => ({ name, value, color: ["#6366f1", "#a855f7", "#10b981", "#f59e0b", "#64748b"][i % 5] }));

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 font-medium">Loading Cashier View...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6 bg-[#f8fafc] dark:bg-zinc-950 min-h-screen pb-24 transition-colors duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Store className="w-5 h-5 text-indigo-600" />
            <h1 className="text-xl md:text-2xl font-black text-gray-900 dark:text-white tracking-tight">
              Cashier Dashboard
            </h1>
            {refreshing && (
              <span className="flex items-center gap-1.5 text-[9px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-wider bg-indigo-50 dark:bg-indigo-900/20 px-2 py-0.5 rounded-full animate-pulse border border-indigo-100 dark:border-indigo-800 ml-2">
                <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                Updating...
              </span>
            )}
          </div>
          <p className="text-gray-400 text-xs font-medium">
            Daily activity and operations overview.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="w-full md:w-auto bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800 text-gray-700 dark:text-zinc-300 shadow-sm rounded-xl h-10 px-5 text-xs font-bold"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-2 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Updating..." : "Refresh"}
        </Button>
      </div>

      {/* Quick Actions / AI Banner */}
      <div
        className="rounded-2xl p-5 text-white flex flex-col md:flex-row items-center justify-between gap-6 shadow-lg"
        style={{
          background: "linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)",
          boxShadow: "0 8px 24px rgba(79,70,229,0.3)",
        }}
      >
        <div className="flex items-center gap-4">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
          >
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-black text-base leading-tight">Quick Actions</h2>
            <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.8)" }}>
              Say: <em className="not-italic font-semibold">"Logged ₦12k sale..."</em> — Fast mobile entry.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <Link href="/new-entry" className="flex-1 md:flex-none">
            <Button
              className="w-full text-xs font-black rounded-xl h-10 px-4 transition-all hover:scale-105 shadow-md shadow-white/10"
              style={{ backgroundColor: "white", color: "#4f46e5" }}
            >
              <Zap className="w-3 h-3 mr-2" />
              AI Entry
            </Button>
          </Link>
          <Link href="/new-entry" className="flex-1 md:flex-none">
            <Button
              variant="outline"
              className="w-full text-xs font-black rounded-xl h-10 px-4 border-white/30 text-white bg-white/10 hover:bg-white/20 transition-all hover:scale-105"
            >
              <ShoppingBag className="w-3 h-3 mr-2" />
              Log Sale
            </Button>
          </Link>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          title="Today's Sales"
          value={dailyTotalSalesVal}
          icon={ShoppingBag}
          accent="#4f46e5"
          accentLight="#eef2ff"
          subLabel={`${todaySales.length} total logged today`}
        />
        <MetricCard
          title="Daily Outstanding Debt"
          value={dailyOutstandingDebt}
          icon={AlertCircle}
          accent="#f59e0b"
          accentLight="#fef3c7"
          subLabel={`From today's jobs`}
        />
        <MetricCard
          title="Weekly Outstanding Debt"
          value={weeklyOutstandingDebt}
          icon={ShieldAlert}
          accent="#f43f5e"
          accentLight="#fff1f2"
          subLabel={`Over the last 7 days`}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-1">
          <MaterialSalesChart data={materialData} total={totalJobs} />
        </div>
        <div className="lg:col-span-2">
          <OutstandingDebtChart data={outstandingDebtChart} />
        </div>
      </div>
    </div>
  );
}

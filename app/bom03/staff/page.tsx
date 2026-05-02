"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Users,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  BarChart3,
  Wallet,
  Clock,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { subDays, isWithinInterval, isSameDay } from "date-fns";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StaffStats {
  name: string;
  totalJobs: number;
  totalRevenue: number;
  totalCollected: number;
  totalDebt: number;
  collectionRate: number;
  jobsToday: number;
  revenueToday: number;
  topMaterial: string;
  recentJobs: any[];
  isOnline: boolean;
  lastLogin: string;
}

const parseAmt = (v: any) =>
  parseFloat(String(v ?? "0").replace(/[₦,\s]/g, "")) || 0;

const fmtMoney = (n: number) =>
  `₦${n.toLocaleString(undefined, { minimumFractionDigits: 0 })}`;

// ─── Staff Card ───────────────────────────────────────────────────────────────

function StaffCard({ stats }: { stats: StaffStats }) {
  const [expanded, setExpanded] = useState(false);

  const collectionColor =
    stats.collectionRate >= 80
      ? "text-emerald-600 dark:text-emerald-400"
      : stats.collectionRate >= 50
      ? "text-amber-600 dark:text-amber-400"
      : "text-rose-600 dark:text-rose-400";

  const initials = stats.name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");

  const colors = [
    "bg-brand-600", "bg-emerald-600", "bg-violet-600",
    "bg-rose-600", "bg-amber-600", "bg-cyan-600",
  ];
  const avatarColor = colors[stats.name.charCodeAt(0) % colors.length];

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full p-5 flex items-center gap-4 text-left hover:bg-gray-50/50 dark:hover:bg-zinc-800/30 transition-colors"
      >
        <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center text-white text-sm font-black shrink-0", avatarColor)}>
          {initials}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-black text-gray-900 dark:text-white">
              {stats.name}
            </p>
            {stats.isOnline && (
              <span className="flex items-center gap-1 text-[9px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-1.5 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Online
              </span>
            )}
          </div>
          <p className="text-[10px] text-gray-400 dark:text-zinc-500 font-medium mt-0.5">
            {stats.totalJobs} total jobs · {stats.jobsToday} today
          </p>
        </div>

        <div className="text-right shrink-0">
          <p className="text-sm font-black text-gray-900 dark:text-white">
            {fmtMoney(stats.totalRevenue)}
          </p>
          <p className="text-[10px] text-gray-400 dark:text-zinc-500">
            all time revenue
          </p>
        </div>

        {expanded ? (
          <ChevronUp className="w-4 h-4 text-gray-300 shrink-0 ml-1" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-300 shrink-0 ml-1" />
        )}
      </button>

      {/* Stats strip */}
      <div className="grid grid-cols-4 border-t border-gray-50 dark:border-zinc-800">
        {[
          {
            label: "Collected",
            val: fmtMoney(stats.totalCollected),
            icon: Wallet,
            color: "text-emerald-600 dark:text-emerald-400",
          },
          {
            label: "Debt Left",
            val: fmtMoney(stats.totalDebt),
            icon: AlertTriangle,
            color: stats.totalDebt > 0 ? "text-rose-500 dark:text-rose-400" : "text-gray-300 dark:text-zinc-700",
          },
          {
            label: "Collection %",
            val: `${stats.collectionRate.toFixed(0)}%`,
            icon: TrendingUp,
            color: collectionColor,
          },
          {
            label: "Top Material",
            val: stats.topMaterial || "—",
            icon: BarChart3,
            color: "text-brand-600 dark:text-brand-400",
          },
        ].map(({ label, val, icon: Icon, color }) => (
          <div
            key={label}
            className="p-3 text-center border-r border-gray-50 dark:border-zinc-800 last:border-0"
          >
            <Icon className={cn("w-3.5 h-3.5 mx-auto mb-1", color)} />
            <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-zinc-600 mb-0.5">
              {label}
            </p>
            <p className={cn("text-xs font-black truncate", color)}>{val}</p>
          </div>
        ))}
      </div>

      {/* Expanded recent jobs */}
      {expanded && (
        <div className="border-t border-gray-50 dark:border-zinc-800 p-4 bg-gray-50/50 dark:bg-zinc-800/20">
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="p-3 bg-white dark:bg-zinc-900 rounded-xl border border-gray-100 dark:border-zinc-800 text-center">
              <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-zinc-500 mb-1">
                Today's Jobs
              </p>
              <p className="text-lg font-black text-gray-900 dark:text-white">
                {stats.jobsToday}
              </p>
            </div>
            <div className="p-3 bg-white dark:bg-zinc-900 rounded-xl border border-gray-100 dark:border-zinc-800 text-center">
              <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-zinc-500 mb-1">
                Today's Revenue
              </p>
              <p className="text-lg font-black text-gray-900 dark:text-white">
                {fmtMoney(stats.revenueToday)}
              </p>
            </div>
          </div>

          {stats.recentJobs.length > 0 && (
            <>
              <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-zinc-500 mb-2">
                Recent Jobs (last 5)
              </p>
              <div className="space-y-1.5">
                {stats.recentJobs.slice(0, 5).map((job: any, i: number) => {
                  const client = job["CLIENT NAME"] || job["Client Name"] || "—";
                  const desc = job["JOB DESCRIPTION"] || job["Job Description"] || "—";
                  const amt = parseAmt(job["AMOUNT (₦)"] || job["Amount (₦)"]);
                  const status = job["PAYMENT STATUS"] || "Unpaid";

                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between p-2.5 bg-white dark:bg-zinc-900 rounded-xl border border-gray-100 dark:border-zinc-800"
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <p className="text-xs font-bold text-gray-800 dark:text-zinc-200 truncate">
                          {client}
                        </p>
                        <p className="text-[10px] text-gray-400 dark:text-zinc-500 truncate">
                          {desc}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={cn(
                            "text-[9px] font-black px-1.5 py-0.5 rounded",
                            status === "Paid"
                              ? "bg-emerald-100 text-emerald-700"
                              : status === "Part-payment"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-rose-100 text-rose-700"
                          )}
                        >
                          {status}
                        </span>
                        <p className="text-xs font-black text-gray-900 dark:text-white">
                          {fmtMoney(amt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {stats.lastLogin && (
            <p className="text-[9px] text-gray-300 dark:text-zinc-700 mt-3 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Last login: {stats.lastLogin}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StaffPerformancePage() {
  const [sales, setSales] = useState<any[]>([]);
  const [cashiers, setCashiers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dateRange, setDateRange] = useState<"all" | "7d" | "30d">("30d");

  const fetchData = async () => {
    setRefreshing(true);
    try {
      const [sRes, cRes] = await Promise.all([
        fetch("/api/sales"),
        fetch("/api/cashiers"),
      ]);
      const sJson = await sRes.json();
      const cJson = await cRes.json();
      setSales(sJson.data || []);
      setCashiers(cJson.data || []);
    } catch {
      // silently handle
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const now = new Date();

  const staffStats: StaffStats[] = useMemo(() => {
    const startDate =
      dateRange === "7d"
        ? subDays(now, 7)
        : dateRange === "30d"
        ? subDays(now, 30)
        : new Date("2020-01-01");

    const namesFromSales = new Set<string>(
      sales
        .map((s) => (s["LOGGED BY"] || s["Logged By"] || "").trim())
        .filter(Boolean)
    );
    cashiers.forEach((c) => {
      if (c.Name) namesFromSales.add(c.Name.trim());
    });

    return Array.from(namesFromSales)
      .filter((n) => n && n !== "Unknown")
      .map((name) => {
        const cashierSales = sales.filter((s) => {
          const n = (s["LOGGED BY"] || s["Logged By"] || "").trim();
          if (n !== name) return false;
          const d = new Date(s.DATE || s.Date || "");
          if (isNaN(d.getTime())) return true;
          return isWithinInterval(d, { start: startDate, end: now });
        });

        const todaySales = cashierSales.filter((s) => {
          const d = new Date(s.DATE || s.Date || "");
          return !isNaN(d.getTime()) && isSameDay(d, now);
        });

        const totalRevenue = cashierSales.reduce(
          (s, r) => s + parseAmt(r["AMOUNT (₦)"] || r["Amount (₦)"]),
          0
        );
        const totalCollected = cashierSales.reduce(
          (s, r) =>
            s + parseAmt(r["INITIAL PAYMENT (₦)"] || r["INITIAL PAYMENT"] || r["Initial Payment"]),
          0
        );
        const totalDebt = cashierSales.reduce(
          (s, r) => s + Math.max(0, parseAmt(r["AMOUNT DIFFERENCES"] || r["Amount Differences"])),
          0
        );
        const collectionRate = totalRevenue > 0 ? (totalCollected / totalRevenue) * 100 : 0;

        const matMap: Record<string, number> = {};
        cashierSales.forEach((s) => {
          const mat = s.MATERIAL || s.Material || "Other";
          matMap[mat] = (matMap[mat] || 0) + 1;
        });
        const topMaterial =
          Object.entries(matMap).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";

        const cashierRecord = cashiers.find((c) => c.Name?.trim() === name);

        return {
          name,
          totalJobs: cashierSales.length,
          totalRevenue,
          totalCollected,
          totalDebt,
          collectionRate,
          jobsToday: todaySales.length,
          revenueToday: todaySales.reduce(
            (s, r) => s + parseAmt(r["AMOUNT (₦)"] || r["Amount (₦)"]),
            0
          ),
          topMaterial,
          recentJobs: [...cashierSales]
            .sort(
              (a, b) =>
                new Date(b.DATE || b.Date || "").getTime() -
                new Date(a.DATE || a.Date || "").getTime()
            )
            .slice(0, 5),
          isOnline: cashierRecord?.Status === "Online",
          lastLogin: cashierRecord?.["Last Login"] || "",
        };
      })
      .sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [sales, cashiers, dateRange]);

  const totals = useMemo(() => {
    const rev = staffStats.reduce((s, c) => s + c.totalRevenue, 0);
    const col = staffStats.reduce((s, c) => s + c.totalCollected, 0);
    const dbt = staffStats.reduce((s, c) => s + c.totalDebt, 0);
    return { rev, col, dbt, avgCollection: rev > 0 ? (col / rev) * 100 : 0 };
  }, [staffStats]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50/80 dark:bg-zinc-950">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-brand-700 dark:text-brand-400 animate-spin mx-auto mb-4" />
          <p className="text-xs font-black uppercase tracking-widest text-gray-400 dark:text-zinc-500">
            Loading staff data…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 bg-slate-50/80 dark:bg-zinc-950 min-h-screen pb-24 transition-colors duration-500">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <Link href="/bom03">
            <Button variant="outline" size="icon" className="rounded-xl h-9 w-9 bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">
              Staff Performance
            </h1>
            <p className="text-gray-500 dark:text-zinc-400 text-xs mt-0.5">
              Revenue, collection rates & activity per cashier
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchData}
          disabled={refreshing}
          className="h-9 px-4 rounded-xl bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800 text-xs font-black"
        >
          <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", refreshing && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Time range */}
      <div className="flex gap-2 mb-6">
        {(["7d", "30d", "all"] as const).map((r) => (
          <button
            key={r}
            onClick={() => setDateRange(r)}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-black uppercase transition-all",
              dateRange === r
                ? "bg-brand-700 text-white shadow-lg shadow-brand-700/20"
                : "bg-white dark:bg-zinc-900 text-gray-500 dark:text-zinc-400 border border-gray-200 dark:border-zinc-800"
            )}
          >
            {r === "all" ? "All Time" : r}
          </button>
        ))}
      </div>

      {/* Team summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          {
            label: "Active Staff",
            val: String(staffStats.length),
            sub: `${cashiers.filter((c) => c.Status === "Online").length} online now`,
            icon: Users,
            color: "text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20",
          },
          {
            label: "Team Revenue",
            val: totals.rev >= 1000 ? `₦${(totals.rev / 1000).toFixed(0)}k` : fmtMoney(totals.rev),
            sub: fmtMoney(totals.rev),
            icon: TrendingUp,
            color: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20",
          },
          {
            label: "Cash Collected",
            val: totals.col >= 1000 ? `₦${(totals.col / 1000).toFixed(0)}k` : fmtMoney(totals.col),
            sub: `${totals.avgCollection.toFixed(0)}% collection rate`,
            icon: Wallet,
            color: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20",
          },
          {
            label: "Team Debt",
            val: totals.dbt >= 1000 ? `₦${(totals.dbt / 1000).toFixed(0)}k` : fmtMoney(totals.dbt),
            sub: "outstanding across all",
            icon: AlertTriangle,
            color: totals.dbt > 0
              ? "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20"
              : "text-gray-400 bg-gray-50 dark:bg-zinc-800",
          },
        ].map(({ label, val, sub, icon: Icon, color }) => (
          <div
            key={label}
            className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm p-4"
          >
            <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center mb-3", color)}>
              <Icon className="w-4 h-4" />
            </div>
            <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-zinc-500 mb-0.5">
              {label}
            </p>
            <p className="text-xl font-black text-gray-900 dark:text-white">{val}</p>
            <p className="text-[10px] text-gray-400 dark:text-zinc-500 font-medium mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* Staff cards */}
      {staffStats.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800">
          <Users className="w-10 h-10 text-gray-200 dark:text-zinc-700 mx-auto mb-3" />
          <p className="text-sm font-bold text-gray-400 dark:text-zinc-600">
            No staff activity found for this period
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {staffStats.map((stats) => (
            <StaffCard key={stats.name} stats={stats} />
          ))}
        </div>
      )}
    </div>
  );
}

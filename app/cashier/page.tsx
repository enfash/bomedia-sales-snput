"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  Plus,
  Receipt,
  BarChart3,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  Zap,
  ChevronRight,
  Ruler,
  TrendingUp,
  Wallet,
  ArrowUpRight,
  MessageCircle,
  ShoppingBag,
  Users,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useSyncStore } from "@/lib/store";
import { OutstandingDebtChart } from "@/components/dashboard-charts";
import { DebtorPaymentModal } from "@/components/debtor-payment-modal";
import { processDebtData } from "@/lib/financial-utils";
import {
  isSameDay,
  subDays,
  isWithinInterval,
  format,
} from "date-fns";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const parseAmount = (val: any): number => {
  if (!val) return 0;
  return parseFloat(String(val).replace(/[₦,\s]/g, "")) || 0;
};

const fmtMoney = (n: number) =>
  n >= 1_000_000
    ? `₦${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
    ? `₦${(n / 1_000).toFixed(0)}k`
    : `₦${n.toLocaleString()}`;

const fmtMoneyFull = (n: number) =>
  `₦${n.toLocaleString(undefined, { minimumFractionDigits: 0 })}`;

// ─── Greeting ─────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// ─── Shift Hero (mobile) ──────────────────────────────────────────────────────

function ShiftHero({
  cashierName,
  jobsToday,
  revenueToday,
  collectedToday,
  pendingCount,
  inProgressCount,
}: {
  cashierName: string;
  jobsToday: number;
  revenueToday: number;
  collectedToday: number;
  pendingCount: number;
  inProgressCount: number;
}) {
  const progressPct =
    revenueToday > 0
      ? Math.min(100, (collectedToday / revenueToday) * 100)
      : 0;

  return (
    <div className="relative overflow-hidden rounded-[2rem] bg-orange-500 text-white shadow-2xl shadow-orange-500/30">
      {/* Decorative circles */}
      <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-white/10 pointer-events-none" />
      <div className="absolute -bottom-12 -left-6 w-36 h-36 rounded-full bg-orange-600/50 pointer-events-none" />

      <div className="relative p-6">
        {/* Top row */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-orange-200 text-xs font-bold mb-0.5">
              {getGreeting()},
            </p>
            <h2 className="text-xl font-black tracking-tight leading-none">
              {cashierName || "Cashier"} 👋
            </h2>
            <p className="text-orange-200 text-[10px] font-medium mt-1">
              {format(new Date(), "EEEE, MMMM d")}
            </p>
          </div>

          {pendingCount > 0 && (
            <div className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm rounded-full px-3 py-1.5 border border-white/20">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-300 animate-pulse" />
              <span className="text-[10px] font-black text-white">
                {pendingCount} syncing
              </span>
            </div>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-2 mb-5">
          {[
            { label: "Jobs", val: String(jobsToday) },
            { label: "Revenue", val: fmtMoney(revenueToday) },
            { label: "Collected", val: fmtMoney(collectedToday) },
            { label: "In Progress", val: String(inProgressCount), highlight: inProgressCount > 0 },
          ].map(({ label, val, highlight }) => (
            <div
              key={label}
              className={cn("backdrop-blur-sm rounded-2xl p-2.5 border text-center", highlight ? "bg-yellow-300/20 border-yellow-300/30" : "bg-white/15 border-white/10")}
            >
              <p className="text-orange-200 text-[8px] font-black uppercase tracking-widest mb-1">
                {label}
              </p>
              <p className={cn("text-sm font-black leading-none", highlight ? "text-yellow-300" : "text-white")}>
                {val}
              </p>
            </div>
          ))}
        </div>

        {/* Collection progress */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-orange-200 text-[9px] font-black uppercase tracking-widest">
              Collection Rate
            </p>
            <p className="text-white text-[10px] font-black">
              {progressPct.toFixed(0)}%
            </p>
          </div>
          <div className="w-full h-2 rounded-full bg-white/20 overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full [transition:width_700ms_ease-out]",
                progressPct >= 80
                  ? "bg-emerald-400"
                  : progressPct >= 50
                  ? "bg-yellow-300"
                  : "bg-white/60"
              )}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-orange-200 text-[9px] font-medium mt-1">
            {fmtMoneyFull(revenueToday - collectedToday)} still outstanding
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Action Grid (mobile primary actions) ─────────────────────────────────────

function ActionGrid() {
  const actions = [
    {
      label: "New Sale",
      sub: "Log a job",
      href: "/cashier/new-entry",
      icon: Plus,
      bg: "bg-orange-500 hover:bg-orange-600",
      text: "text-white",
      shadow: "shadow-orange-500/30",
      primary: true,
    },
    {
      label: "Quick Check",
      sub: "Test a roll",
      href: "/quick-check",
      icon: Ruler,
      bg: "bg-white dark:bg-zinc-900 hover:bg-orange-50 dark:hover:bg-zinc-800",
      text: "text-gray-800 dark:text-zinc-100",
      border: "border border-gray-100 dark:border-zinc-800",
    },
    {
      label: "Records",
      sub: "Today's jobs",
      href: "/cashier/records",
      icon: BarChart3,
      bg: "bg-white dark:bg-zinc-900 hover:bg-orange-50 dark:hover:bg-zinc-800",
      text: "text-gray-800 dark:text-zinc-100",
      border: "border border-gray-100 dark:border-zinc-800",
    },
    {
      label: "Log Expense",
      sub: "Record payout",
      href: "/cashier/expenses",
      icon: Receipt,
      bg: "bg-white dark:bg-zinc-900 hover:bg-orange-50 dark:hover:bg-zinc-800",
      text: "text-gray-800 dark:text-zinc-100",
      border: "border border-gray-100 dark:border-zinc-800",
    },
    {
      label: "Estimator",
      sub: "Price a job",
      href: "/cashier/estimator",
      icon: Zap,
      bg: "bg-white dark:bg-zinc-900 hover:bg-orange-50 dark:hover:bg-zinc-800",
      text: "text-gray-800 dark:text-zinc-100",
      border: "border border-gray-100 dark:border-zinc-800",
    },
    {
      label: "Customers",
      sub: "View profiles",
      href: "/cashier/customers",
      icon: Users,
      bg: "bg-white dark:bg-zinc-900 hover:bg-orange-50 dark:hover:bg-zinc-800",
      text: "text-gray-800 dark:text-zinc-100",
      border: "border border-gray-100 dark:border-zinc-800",
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-2.5">
      {actions.map(({ label, sub, href, icon: Icon, bg, text, shadow, border, primary }) => (
        <Link key={href} href={href}>
          <div
            className={cn(
              "rounded-2xl p-3.5 flex flex-col gap-2 transition-[background-color,transform] active:scale-[0.97] shadow-sm",
              bg,
              border,
              shadow,
              primary && "shadow-lg col-span-1"
            )}
          >
            <div
              className={cn(
                "w-8 h-8 rounded-xl flex items-center justify-center",
                primary
                  ? "bg-white/25"
                  : "bg-orange-50 dark:bg-orange-900/20"
              )}
            >
              <Icon
                className={cn(
                  "w-4 h-4",
                  primary
                    ? "text-white"
                    : "text-orange-500 dark:text-orange-400"
                )}
              />
            </div>
            <div>
              <p
                className={cn(
                  "text-[11px] font-black leading-none",
                  text
                )}
              >
                {label}
              </p>
              <p
                className={cn(
                  "text-[9px] font-medium mt-0.5",
                  primary
                    ? "text-orange-100"
                    : "text-gray-400 dark:text-zinc-500"
                )}
              >
                {sub}
              </p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

// ─── Pending Debts Row ────────────────────────────────────────────────────────

function DebtRow({
  client,
  amount,
  description,
  contact,
  onClick,
}: {
  client: string;
  amount: number;
  description: string;
  contact?: string;
  onClick: () => void;
}) {
  const initials = client
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");

  const handleWhatsApp = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!contact) return;
    const phone = contact.replace(/\D/g, "").replace(/^0/, "234");
    const msg = `Hello *${client}*, this is a reminder from *BOMedia*. You have an outstanding balance of *${fmtMoneyFull(amount)}* on your order: ${description}. Kindly settle at your earliest convenience. Thank you!`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  return (
    <div
      className="flex items-center gap-3 py-3 border-b border-gray-50 dark:border-zinc-800/60 last:border-0 cursor-pointer hover:bg-orange-50/30 dark:hover:bg-zinc-800/20 -mx-4 px-4 transition-colors rounded-xl"
      onClick={onClick}
    >
      {/* Avatar */}
      <div className="w-9 h-9 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-[10px] font-black text-orange-600 dark:text-orange-400 shrink-0">
        {initials}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-black text-gray-900 dark:text-zinc-100 truncate">
          {client}
        </p>
        <p className="text-[10px] text-gray-400 dark:text-zinc-500 font-medium truncate">
          {description}
        </p>
      </div>

      {/* Amount + action */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="text-right">
          <p className="text-sm font-black text-rose-600 dark:text-rose-400">
            {fmtMoneyFull(amount)}
          </p>
          <p className="text-[9px] text-gray-400 dark:text-zinc-600 font-medium">
            due
          </p>
        </div>
        {contact && (
          <button
            onClick={handleWhatsApp}
            className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center border border-emerald-100 dark:border-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
            title="Send WhatsApp reminder"
          >
            <MessageCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Today's Job Feed ─────────────────────────────────────────────────────────

function JobFeed({ jobs }: { jobs: any[] }) {
  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-gray-300 dark:text-zinc-700">
        <ShoppingBag className="w-8 h-8 mb-2" />
        <p className="text-xs font-bold">No jobs logged today yet</p>
        <Link href="/cashier/new-entry">
          <Button
            size="sm"
            className="mt-3 h-8 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-black text-xs"
          >
            Log First Job
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {jobs.slice(0, 8).map((job, i) => {
        const client = job["CLIENT NAME"] || job["Client Name"] || "—";
        const desc = job["JOB DESCRIPTION"] || job["Job Description"] || "—";
        const amt = parseAmount(job["AMOUNT (₦)"] || job["Amount (₦)"]);
        const paid = parseAmount(
          job["INITIAL PAYMENT (₦)"] || job["INITIAL PAYMENT"] || "0"
        );
        const status = job["PAYMENT STATUS"] || "Unpaid";
        const material = job["MATERIAL"] || job["Material"] || "";
        const jobStatus = job["JOB STATUS"] || job["Job Status"] || "Quoted";
        const loggedBy = job["LOGGED BY"] || job["Logged By"] || "—";

        const statusColors: Record<string, string> = {
          Paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
          "Part-payment": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
          Unpaid: "bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400",
        };

        const jobStatusColors: Record<string, string> = {
          Quoted: "bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-zinc-400",
          Printing: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
          Finishing: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
          Ready: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
          Delivered: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
        };

        return (
          <div
            key={i}
            className="flex items-start gap-3 p-3.5 bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 [@media(hover:hover)]:hover:border-orange-200 dark:[@media(hover:hover)]:hover:border-orange-900/40 transition-[border-color]"
          >
            {/* Index */}
            <div className="w-6 h-6 rounded-lg bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center text-[9px] font-black text-orange-500 dark:text-orange-400 shrink-0 mt-0.5">
              {i + 1}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-black text-gray-900 dark:text-zinc-100 truncate">
                    {client}
                  </p>
                  <p className="text-[10px] text-gray-400 dark:text-zinc-500 font-medium truncate mt-0.5">
                    {desc}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-black text-gray-900 dark:text-white">
                    {fmtMoneyFull(amt)}
                  </p>
                  {paid > 0 && (
                    <p className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold">
                      +{fmtMoneyFull(paid)} paid
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                {material && (
                  <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded-md bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400">
                    {material}
                  </span>
                )}
                <span
                  className={cn(
                    "text-[8px] font-black uppercase px-1.5 py-0.5 rounded-md",
                    jobStatusColors[jobStatus] || jobStatusColors["Quoted"]
                  )}
                >
                  {jobStatus}
                </span>
                <span
                  className={cn(
                    "text-[8px] font-black uppercase px-1.5 py-0.5 rounded-md",
                    statusColors[status] || statusColors["Unpaid"]
                  )}
                >
                  {status}
                </span>
                <span className="text-[8px] text-gray-300 dark:text-zinc-700 font-medium ml-auto">
                  via {loggedBy}
                </span>
              </div>
            </div>
          </div>
        );
      })}

      {jobs.length > 8 && (
        <Link href="/cashier/records">
          <div className="flex items-center justify-center gap-2 p-3 rounded-2xl border border-dashed border-orange-200 dark:border-orange-900/30 text-orange-500 dark:text-orange-400 hover:bg-orange-50/50 dark:hover:bg-orange-900/10 transition-colors">
            <p className="text-xs font-black">
              +{jobs.length - 8} more jobs today
            </p>
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </Link>
      )}
    </div>
  );
}

// ─── Desktop Sidebar Panel ────────────────────────────────────────────────────

function DesktopSidePanel({
  debtors,
  onDebtorClick,
  inventory,
}: {
  debtors: { name: string; balance: number }[];
  onDebtorClick: (name: string) => void;
  inventory: any[];
}) {
  const lowStockRolls = inventory.filter((item) => {
    const rem = parseFloat(
      item["Remaining Length (ft)"] || item.Stock || "0"
    );
    return rem <= 50;
  });

  return (
    <div className="space-y-4">
      {/* Outstanding debts */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-50 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center">
              <AlertCircle className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400" />
            </div>
            <p className="text-xs font-black uppercase tracking-widest text-gray-600 dark:text-zinc-400">
              Outstanding
            </p>
          </div>
          <Badge className="bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400 border-none text-[9px] font-black">
            {debtors.length}
          </Badge>
        </div>
        <div className="p-4">
          {debtors.length === 0 ? (
            <div className="flex flex-col items-center py-6 text-gray-200 dark:text-zinc-700">
              <CheckCircle2 className="w-6 h-6 mb-1.5" />
              <p className="text-xs font-bold text-gray-400 dark:text-zinc-600">
                All cleared!
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {debtors.slice(0, 6).map((d, i) => (
                <button
                  key={i}
                  onClick={() => onDebtorClick(d.name)}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-rose-50/50 dark:hover:bg-rose-900/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] text-left"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center text-[9px] font-black text-rose-500 dark:text-rose-400 shrink-0">
                      {d.name[0]?.toUpperCase()}
                    </div>
                    <p className="text-xs font-bold text-gray-800 dark:text-zinc-200 truncate">
                      {d.name}
                    </p>
                  </div>
                  <p className="text-xs font-black text-rose-600 dark:text-rose-400 shrink-0 ml-2">
                    {fmtMoney(d.balance)}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Inventory alerts */}
      {lowStockRolls.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-amber-200/60 dark:border-amber-900/30 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-amber-100/60 dark:border-amber-900/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
                <Package className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
              </div>
              <p className="text-xs font-black uppercase tracking-widest text-gray-600 dark:text-zinc-400">
                Low Stock
              </p>
            </div>
            <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-none text-[9px] font-black">
              {lowStockRolls.length}
            </Badge>
          </div>
          <div className="p-3 space-y-1.5">
            {lowStockRolls.slice(0, 4).map((roll, i) => {
              const rem = parseFloat(
                roll["Remaining Length (ft)"] || roll.Stock || "0"
              );
              return (
                <div
                  key={i}
                  className="flex items-center justify-between p-2 rounded-xl bg-amber-50/50 dark:bg-amber-900/10"
                >
                  <p className="text-[11px] font-black text-gray-700 dark:text-zinc-300 truncate">
                    {roll["Roll ID"] || roll["Item Name"]}
                  </p>
                  <span
                    className={cn(
                      "text-[9px] font-black px-1.5 py-0.5 rounded",
                      rem <= 0
                        ? "bg-rose-100 text-rose-600"
                        : "bg-amber-100 text-amber-700"
                    )}
                  >
                    {rem.toFixed(0)}ft
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick links */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm p-3 space-y-1">
        {[
          { label: "Job Board", href: "/cashier/board", icon: BarChart3 },
          { label: "Customers", href: "/cashier/customers", icon: Users },
          { label: "Price Estimator", href: "/cashier/estimator", icon: Zap },
          { label: "Material Quick-Check", href: "/quick-check", icon: Ruler },
        ].map(({ label, href, icon: Icon }) => (
          <Link key={href} href={href}>
            <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-orange-50/50 dark:hover:bg-zinc-800/50 transition-colors group">
              <div className="w-7 h-7 rounded-lg bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center">
                <Icon className="w-3.5 h-3.5 text-orange-500 dark:text-orange-400" />
              </div>
              <p className="text-sm font-bold text-gray-700 dark:text-zinc-300 flex-1">
                {label}
              </p>
              <ChevronRight className="w-3.5 h-3.5 text-gray-300 dark:text-zinc-700 group-hover:text-orange-400 transition-colors" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CashierDashboardPage() {
  const { pendingQueue, cachedSales, setCachedData, cachedExpenses, cachedInventory, cachedPayments, cachedMaterials } =
    useSyncStore();

  const [loading, setLoading] = useState(cachedSales.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDebtor, setSelectedDebtor] = useState<string | null>(null);
  const [cashierName, setCashierName] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setCashierName(localStorage.getItem("userName") || "");
    }
  }, []);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else if (cachedSales.length === 0) setLoading(true);
    try {
      const [sRes, iRes] = await Promise.all([
        fetch("/api/sales"),
        fetch("/api/inventory"),
      ]);
      const sJson = await sRes.json();
      const iJson = await iRes.json();
      
      // Use existing cached data if the response is empty/error
      const sales = sJson.data || cachedSales;
      const inventory = iJson.data || cachedInventory;
      
      setCachedData(sales, cachedExpenses, inventory, cachedPayments, cachedMaterials);
    } catch (error) {
      console.error("Fetch dashboard data error:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [cachedSales, cachedInventory, cachedExpenses, cachedPayments, cachedMaterials, setCachedData]);

  useEffect(() => {
    if (cachedSales.length === 0) {
      fetchData();
    }
  }, []); // Only on mount

  useEffect(() => {
    const handler = () => fetchData(true);
    window.addEventListener("online", handler);
    return () => window.removeEventListener("online", handler);
  }, [fetchData]);

  // ── Merge pending into allSales ──────────────────────────────────────────
  const allSales = useMemo(() => {
    const pending = pendingQueue
      .filter((i) => i.type === "sale")
      .map((i) => ({
        DATE: i.data[0],
        "CLIENT NAME": i.data[1],
        "JOB DESCRIPTION": i.data[2],
        "CONTACT": i.data[3],
        "MATERIAL": i.data[4],
        "AMOUNT (₦)": "0",
        "INITIAL PAYMENT (₦)": i.data[14] || "0",
        "AMOUNT DIFFERENCES": "0",
        "PAYMENT STATUS": "Unpaid",
        "JOB STATUS": i.data[20] || "Quoted",
        "LOGGED BY": i.data[21] || cashierName,
        __isPending: "true",
      }));
    return [...pending, ...cachedSales];
  }, [pendingQueue, cachedSales, cashierName]);

  // ── Time windows ─────────────────────────────────────────────────────────
  const now = new Date();
  const sevenDaysAgo = subDays(now, 7);

  const todaySales = useMemo(
    () =>
      allSales.filter((r) => {
        const d = new Date(r.DATE || r.Date || "");
        return !isNaN(d.getTime()) && isSameDay(d, now);
      }),
    [allSales]
  );

  const weekSales = useMemo(
    () =>
      allSales.filter((r) => {
        const d = new Date(r.DATE || r.Date || "");
        return (
          !isNaN(d.getTime()) &&
          isWithinInterval(d, { start: sevenDaysAgo, end: now })
        );
      }),
    [allSales]
  );

  // ── In-progress jobs ─────────────────────────────────────────────────────
  const inProgressJobs = todaySales.filter((r) => {
    const s = (r["JOB STATUS"] || r["Job Status"] || "").toString().trim();
    return ["Printing", "Finishing", "Ready"].includes(s);
  });

  // ── Today metrics ────────────────────────────────────────────────────────
  const todayRevenue = todaySales.reduce(
    (s, r) => s + parseAmount(r["AMOUNT (₦)"] || r["Amount (₦)"]),
    0
  );
  const todayCollected = todaySales.reduce(
    (s, r) =>
      s +
      parseAmount(
        r["INITIAL PAYMENT (₦)"] || r["INITIAL PAYMENT"] || r["Initial Payment"]
      ),
    0
  );

  // ── Debt data ────────────────────────────────────────────────────────────
  const { totalDebt: dailyDebt } = processDebtData(todaySales);
  const { totalDebt: weeklyDebt, chartData: debtChart } =
    processDebtData(weekSales, 8);

  const debtorList = useMemo(() => {
    const map: Record<string, number> = {};
    weekSales.forEach((r) => {
      const balance = parseAmount(
        r["AMOUNT DIFFERENCES"] || r["Amount Differences"]
      );
      const client = (r["CLIENT NAME"] || r["Client Name"] || "").trim();
      if (client && balance > 0) {
        map[client] = (map[client] || 0) + balance;
      }
    });
    return Object.entries(map)
      .map(([name, balance]) => ({ name, balance }))
      .sort((a, b) => b.balance - a.balance);
  }, [weekSales]);

  // ── Today's debtors with contact info ────────────────────────────────────
  const todayDebtors = useMemo(() => {
    return todaySales
      .filter((r) => {
        const bal = parseAmount(
          r["AMOUNT DIFFERENCES"] || r["Amount Differences"]
        );
        return bal > 0;
      })
      .map((r) => ({
        client: (r["CLIENT NAME"] || r["Client Name"] || "—").trim(),
        amount: parseAmount(r["AMOUNT DIFFERENCES"] || r["Amount Differences"]),
        description: (r["JOB DESCRIPTION"] || r["Job Description"] || "—").trim(),
        contact: (r["CONTACT"] || r["Contact"] || "").trim(),
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [todaySales]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-orange-50/20 dark:bg-zinc-950">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-zinc-500">
            Loading your shift…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-orange-50/30 dark:bg-zinc-950 min-h-screen pb-28 transition-colors duration-500">

      {/* ── Mobile Layout ───────────────────────────────────────────────── */}
      <div className="md:hidden p-4 space-y-4">

        {/* Shift hero */}
        <ShiftHero
          cashierName={cashierName}
          jobsToday={todaySales.length}
          revenueToday={todayRevenue}
          collectedToday={todayCollected}
          pendingCount={pendingQueue.length}
          inProgressCount={inProgressJobs.length}
        />

        {/* Action grid */}
        <ActionGrid />

        {/* Today's debtors — only if there are any */}
        {todayDebtors.length > 0 && (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-500" />
                <p className="text-xs font-black uppercase tracking-widest text-gray-600 dark:text-zinc-400">
                  Collect Today
                </p>
              </div>
              <Badge className="bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400 border-none text-[9px] font-black">
                {todayDebtors.length} client{todayDebtors.length !== 1 ? "s" : ""}
              </Badge>
            </div>
            <div className="px-4 py-1">
              {todayDebtors.map((d, i) => (
                <DebtRow
                  key={i}
                  client={d.client}
                  amount={d.amount}
                  description={d.description}
                  contact={d.contact}
                  onClick={() => setSelectedDebtor(d.client)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Today's job feed */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-orange-500" />
              <p className="text-xs font-black uppercase tracking-widest text-gray-600 dark:text-zinc-400">
                Today's Jobs
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchData(true)}
                className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-zinc-800 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97]"
              >
                <RefreshCw
                  className={cn(
                    "w-3.5 h-3.5 text-gray-400",
                    refreshing && "animate-spin"
                  )}
                />
              </button>
              <Link href="/cashier/records">
                <ChevronRight className="w-4 h-4 text-gray-300" />
              </Link>
            </div>
          </div>
          <div className="p-3">
            <JobFeed jobs={todaySales} />
          </div>
        </div>

        {/* Weekly debt summary */}
        {weeklyDebt > 0 && (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-black uppercase tracking-widest text-gray-400 dark:text-zinc-500">
                7-Day Debt Summary
              </p>
              <p className="text-sm font-black text-rose-600 dark:text-rose-400">
                {fmtMoneyFull(weeklyDebt)}
              </p>
            </div>
            <p className="text-[10px] text-gray-400 dark:text-zinc-600 mb-3">
              Tap a bar to log a payment
            </p>
            <OutstandingDebtChart
              data={debtChart}
              onClientClick={setSelectedDebtor}
            />
          </div>
        )}
      </div>

      {/* ── Desktop Layout ───────────────────────────────────────────────── */}
      <div className="hidden md:block p-6 lg:p-8 max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-zinc-500">
              {format(now, "EEEE, MMMM d")}
            </p>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight mt-0.5">
              {getGreeting()}, {cashierName || "Cashier"} 👋
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {pendingQueue.length > 0 && (
              <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/30 rounded-full px-3 py-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-[10px] font-black text-amber-700 dark:text-amber-400">
                  {pendingQueue.length} syncing
                </span>
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className="h-9 px-4 rounded-xl bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800 text-xs font-black"
            >
              <RefreshCw
                className={cn(
                  "w-3.5 h-3.5 mr-1.5",
                  refreshing && "animate-spin"
                )}
              />
              {refreshing ? "Updating…" : "Refresh"}
            </Button>
          </div>
        </div>

        {/* Desktop metric strip */}
        <div className="grid grid-cols-5 gap-4 mb-6">
          {[
            {
              label: "Today's Jobs",
              val: String(todaySales.length),
              sub: "logged this shift",
              icon: ShoppingBag,
              accent: "orange",
            },
            {
              label: "In Progress",
              val: String(inProgressJobs.length),
              sub: inProgressJobs.length > 0 ? "Printing / Finishing / Ready" : "No active jobs",
              icon: Clock,
              accent: inProgressJobs.length > 0 ? "amber" : "green",
            },
            {
              label: "Today's Revenue",
              val: fmtMoneyFull(todayRevenue),
              sub: `${fmtMoneyFull(todayCollected)} collected`,
              icon: TrendingUp,
              accent: "green",
            },
            {
              label: "Daily Debt",
              val: fmtMoneyFull(dailyDebt),
              sub: `${todayDebtors.length} client${todayDebtors.length !== 1 ? "s" : ""} owe today`,
              icon: AlertCircle,
              accent: dailyDebt > 0 ? "red" : "green",
            },
            {
              label: "Weekly Debt",
              val: fmtMoneyFull(weeklyDebt),
              sub: "last 7 days total",
              icon: Wallet,
              accent: weeklyDebt > 0 ? "amber" : "green",
            },
          ].map(({ label, val, sub, icon: Icon, accent }) => {
            const bgMap: Record<string, string> = {
              orange: "bg-orange-500",
              green: "bg-emerald-500",
              red: "bg-rose-500",
              amber: "bg-amber-500",
            };
            const lightMap: Record<string, string> = {
              orange: "bg-orange-50 dark:bg-orange-900/20 border-orange-100 dark:border-orange-900/30",
              green: "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-900/30",
              red: "bg-rose-50 dark:bg-rose-900/20 border-rose-100 dark:border-rose-900/30",
              amber: "bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-900/30",
            };
            const textMap: Record<string, string> = {
              orange: "text-orange-600 dark:text-orange-400",
              green: "text-emerald-600 dark:text-emerald-400",
              red: "text-rose-600 dark:text-rose-400",
              amber: "text-amber-600 dark:text-amber-400",
            };

            return (
              <div
                key={label}
                className={cn(
                  "relative rounded-2xl border p-5 shadow-sm overflow-hidden",
                  lightMap[accent]
                )}
              >
                <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full opacity-10" style={{ background: bgMap[accent] }} />
                <div
                  className={cn(
                    "w-8 h-8 rounded-xl flex items-center justify-center mb-3",
                    `${bgMap[accent]}/10 dark:${bgMap[accent]}/20`
                  )}
                  style={{ background: `${bgMap[accent]}20` }}
                >
                  <Icon className={cn("w-4 h-4", textMap[accent])} />
                </div>
                <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-zinc-500 mb-1">
                  {label}
                </p>
                <p className="text-xl font-black text-gray-900 dark:text-white leading-tight">
                  {val}
                </p>
                <p className="text-[10px] text-gray-400 dark:text-zinc-500 font-medium mt-0.5">
                  {sub}
                </p>
              </div>
            );
          })}
        </div>

        {/* Desktop two-column layout */}
        <div className="grid grid-cols-3 gap-5">
          {/* Left: Main content (2/3) */}
          <div className="col-span-2 space-y-5">
            {/* Action row */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Log New Sale", href: "/cashier/new-entry", icon: Plus, primary: true },
                { label: "Price Estimator", href: "/cashier/estimator", icon: Zap },
                { label: "Quick Check", href: "/quick-check", icon: Ruler },
              ].map(({ label, href, icon: Icon, primary }) => (
                <Link key={href} href={href}>
                  <div
                    className={cn(
                      "flex items-center gap-3 p-4 rounded-2xl transition-[box-shadow,background-color,transform] [@media(hover:hover)]:hover:shadow-md active:scale-[0.97] cursor-pointer",
                      primary
                        ? "bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/20"
                        : "bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 hover:border-orange-200 dark:hover:border-orange-900/40 shadow-sm"
                    )}
                  >
                    <div
                      className={cn(
                        "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                        primary ? "bg-white/20" : "bg-orange-50 dark:bg-orange-900/20"
                      )}
                    >
                      <Icon
                        className={cn(
                          "w-4 h-4",
                          primary ? "text-white" : "text-orange-500 dark:text-orange-400"
                        )}
                      />
                    </div>
                    <p
                      className={cn(
                        "text-sm font-black",
                        primary ? "text-white" : "text-gray-800 dark:text-zinc-200"
                      )}
                    >
                      {label}
                    </p>
                  </div>
                </Link>
              ))}
            </div>

            {/* Today's job feed */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-orange-500" />
                  <p className="text-sm font-black text-gray-700 dark:text-zinc-300">
                    Today's Jobs
                  </p>
                  <Badge className="bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 border-none text-[9px] font-black ml-1">
                    {todaySales.length}
                  </Badge>
                </div>
                <Link
                  href="/cashier/records"
                  className="text-[10px] font-black text-orange-500 dark:text-orange-400 hover:underline flex items-center gap-0.5"
                >
                  All records <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="p-4">
                <JobFeed jobs={todaySales} />
              </div>
            </div>

            {/* Today debtors */}
            {todayDebtors.length > 0 && (
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50 dark:border-zinc-800">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-500" />
                    <p className="text-sm font-black text-gray-700 dark:text-zinc-300">
                      Collect Today
                    </p>
                  </div>
                  <Badge className="bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400 border-none text-[9px] font-black">
                    {todayDebtors.length}
                  </Badge>
                </div>
                <div className="px-5 py-1">
                  {todayDebtors.map((d, i) => (
                    <DebtRow
                      key={i}
                      client={d.client}
                      amount={d.amount}
                      description={d.description}
                      contact={d.contact}
                      onClick={() => setSelectedDebtor(d.client)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Side panel (1/3) */}
          <div className="col-span-1">
            <DesktopSidePanel
              debtors={debtorList}
              onDebtorClick={setSelectedDebtor}
              inventory={cachedInventory}
            />
          </div>
        </div>
      </div>

      {/* ── Debtor payment modal ──────────────────────────────────────────── */}
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

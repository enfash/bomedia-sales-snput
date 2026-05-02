"use client";

import { useState, useMemo, useRef } from "react";
import { useEffect } from "react";
import {
  FileText,
  Share2,
  Download,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Receipt,
  Users,
  Package,
  Printer,
  X,
  Calendar,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { format, isSameDay } from "date-fns";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShiftReportProps {
  isOpen: boolean;
  onClose: () => void;
}

const parseAmt = (v: any) =>
  parseFloat(String(v ?? "0").replace(/[₦,\s]/g, "")) || 0;

const fmtMoney = (n: number) =>
  `₦${n.toLocaleString(undefined, { minimumFractionDigits: 0 })}`;

// ─── Status pill ──────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    Paid: "bg-emerald-100 text-emerald-700",
    "Part-payment": "bg-amber-100 text-amber-700",
    Unpaid: "bg-rose-100 text-rose-700",
  };
  return (
    <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded uppercase", map[status] || "bg-gray-100 text-gray-500")}>
      {status}
    </span>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, label, count }: { icon: any; label: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-6 h-6 rounded-lg bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center">
        <Icon className="w-3.5 h-3.5 text-brand-700 dark:text-brand-400" />
      </div>
      <p className="text-xs font-black uppercase tracking-widest text-gray-700 dark:text-zinc-300">
        {label}
      </p>
      {count !== undefined && (
        <Badge className="bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300 border-none text-[9px] font-black ml-auto">
          {count}
        </Badge>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ShiftReportModal({ isOpen, onClose }: ShiftReportProps) {
  const [loading, setLoading] = useState(true);
  const [reportDate, setReportDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [sales, setSales] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [cashierFilter, setCashierFilter] = useState("All");
  const reportRef = useRef<HTMLDivElement>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [sRes, eRes, pRes] = await Promise.all([
        fetch("/api/sales"),
        fetch("/api/expenses"),
        fetch("/api/payments"),
      ]);
      const [sJson, eJson, pJson] = await Promise.all([
        sRes.json(),
        eRes.json(),
        pRes.json(),
      ]);
      setSales(sJson.data || []);
      setExpenses(eJson.data || []);
      setPayments(pJson.data || []);
    } catch {
      toast.error("Failed to load report data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) fetchData();
  }, [isOpen]);

  const selectedDate = new Date(reportDate + "T12:00:00");

  // ── Filter by date ───────────────────────────────────────────────────────
  const daySales = useMemo(
    () =>
      sales.filter((s) => {
        const d = new Date(s.DATE || s.Date || "");
        return !isNaN(d.getTime()) && isSameDay(d, selectedDate);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sales, reportDate]
  );

  const dayExpenses = useMemo(
    () =>
      expenses.filter((e) => {
        const d = new Date(e.DATE || e.Date || "");
        return !isNaN(d.getTime()) && isSameDay(d, selectedDate);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [expenses, reportDate]
  );

  const dayPayments = useMemo(
    () =>
      payments.filter((p) => {
        const d = new Date(p.DATE || "");
        return !isNaN(d.getTime()) && isSameDay(d, selectedDate);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [payments, reportDate]
  );

  // ── Cashier list ─────────────────────────────────────────────────────────
  const cashiers = useMemo(() => {
    const names = new Set<string>(
      daySales
        .map((s) => s["LOGGED BY"] || s["Logged By"] || "Unknown")
        .filter(Boolean)
    );
    return ["All", ...Array.from(names)];
  }, [daySales]);

  const filteredSales = useMemo(
    () =>
      cashierFilter === "All"
        ? daySales
        : daySales.filter(
            (s) =>
              (s["LOGGED BY"] || s["Logged By"]) === cashierFilter
          ),
    [daySales, cashierFilter]
  );

  // ── Aggregates ───────────────────────────────────────────────────────────
  const totalRevenue = filteredSales.reduce(
    (s, r) => s + parseAmt(r["AMOUNT (₦)"] || r["Amount (₦)"]),
    0
  );
  const totalCollected = filteredSales.reduce(
    (s, r) =>
      s +
      parseAmt(r["INITIAL PAYMENT (₦)"] || r["INITIAL PAYMENT"] || r["Initial Payment"]),
    0
  );
  const totalDebt = filteredSales.reduce(
    (s, r) =>
      s + Math.max(0, parseAmt(r["AMOUNT DIFFERENCES"] || r["Amount Differences"])),
    0
  );
  const totalExpenses = dayExpenses.reduce(
    (s, e) => s + parseAmt(e.AMOUNT || e.Amount),
    0
  );
  const totalPaymentsIn = dayPayments.reduce(
    (s, p) => s + parseAmt(p.AMOUNT),
    0
  );
  const netCash = totalCollected + totalPaymentsIn - totalExpenses;

  // ── Material breakdown ───────────────────────────────────────────────────
  const materialBreakdown = useMemo(() => {
    const map: Record<string, { count: number; revenue: number }> = {};
    filteredSales.forEach((s) => {
      const mat = s.MATERIAL || s.Material || "Other";
      if (!map[mat]) map[mat] = { count: 0, revenue: 0 };
      map[mat].count++;
      map[mat].revenue += parseAmt(s["AMOUNT (₦)"] || s["Amount (₦)"]);
    });
    return Object.entries(map).sort((a, b) => b[1].revenue - a[1].revenue);
  }, [filteredSales]);

  // ── WhatsApp share ───────────────────────────────────────────────────────
  const handleWhatsAppShare = () => {
    const dateLabel = format(selectedDate, "EEEE, MMM d yyyy");
    const cashierLabel =
      cashierFilter === "All" ? "All Staff" : cashierFilter;

    const lines = [
      `📊 *BOMedia Shift Report — ${dateLabel}*`,
      `👤 ${cashierLabel}`,
      ``,
      `━━━━━━━━━━━━━━━`,
      `📦 *Jobs Logged:* ${filteredSales.length}`,
      `💰 *Total Revenue:* ${fmtMoney(totalRevenue)}`,
      `✅ *Cash Collected:* ${fmtMoney(totalCollected + totalPaymentsIn)}`,
      `🔴 *Outstanding Debt:* ${fmtMoney(totalDebt)}`,
      `📉 *Expenses:* ${fmtMoney(totalExpenses)}`,
      `━━━━━━━━━━━━━━━`,
      `💵 *Net Cash Handled:* ${fmtMoney(netCash)}`,
      ``,
    ];

    if (materialBreakdown.length > 0) {
      lines.push(`🎨 *Material Breakdown:*`);
      materialBreakdown.forEach(([mat, { count, revenue }]) => {
        lines.push(`  • ${mat}: ${count} job${count !== 1 ? "s" : ""} — ${fmtMoney(revenue)}`);
      });
      lines.push(``);
    }

    if (filteredSales.length > 0) {
      lines.push(`📋 *Jobs:*`);
      filteredSales.slice(0, 10).forEach((s, i) => {
        const client = s["CLIENT NAME"] || s["Client Name"] || "—";
        const amt = fmtMoney(parseAmt(s["AMOUNT (₦)"] || s["Amount (₦)"]));
        const status = s["PAYMENT STATUS"] || "Unpaid";
        lines.push(`  ${i + 1}. ${client} — ${amt} [${status}]`);
      });
      if (filteredSales.length > 10) {
        lines.push(`  … and ${filteredSales.length - 10} more`);
      }
    }

    lines.push(``, `_Generated by BOMedia Sales System_`);

    const msg = lines.join("\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full md:max-w-2xl bg-white dark:bg-zinc-950 rounded-t-[2.5rem] md:rounded-3xl shadow-2xl border-t md:border dark:border-zinc-800 flex flex-col max-h-[92vh] md:max-h-[85vh] z-[201]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-zinc-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-brand-700 flex items-center justify-center">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-base font-black text-gray-900 dark:text-white">
                Shift Report
              </p>
              <p className="text-[10px] text-gray-400 dark:text-zinc-500 font-medium">
                Daily summary
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Controls */}
        <div className="p-4 border-b border-gray-50 dark:border-zinc-800 shrink-0 flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2 flex-1 min-w-[180px]">
            <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
            <input
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              className="h-9 flex-1 rounded-xl border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900 text-xs font-bold px-3 focus:outline-none focus:ring-2 focus:ring-brand-600 dark:text-zinc-200"
            />
          </div>

          {cashiers.length > 2 && (
            <div className="relative">
              <select
                value={cashierFilter}
                onChange={(e) => setCashierFilter(e.target.value)}
                className="h-9 pl-3 pr-8 rounded-xl border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900 text-xs font-bold appearance-none focus:outline-none focus:ring-2 focus:ring-brand-600 dark:text-zinc-200"
              >
                {cashiers.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-2.5 pointer-events-none" />
            </div>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={fetchData}
            disabled={loading}
            className="h-9 px-3 text-xs font-black text-gray-500 dark:text-zinc-400"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          </Button>
        </div>

        {/* Report body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-5" ref={reportRef}>
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <RefreshCw className="w-6 h-6 text-brand-400 animate-spin" />
            </div>
          ) : (
            <>
              {/* Summary tiles */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  {
                    label: "Jobs Logged",
                    val: String(filteredSales.length),
                    icon: Package,
                    color: "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400",
                  },
                  {
                    label: "Total Revenue",
                    val: fmtMoney(totalRevenue),
                    icon: TrendingUp,
                    color: "bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400",
                  },
                  {
                    label: "Cash Collected",
                    val: fmtMoney(totalCollected + totalPaymentsIn),
                    icon: CheckCircle2,
                    color: "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400",
                  },
                  {
                    label: "Outstanding",
                    val: fmtMoney(totalDebt),
                    icon: AlertTriangle,
                    color: totalDebt > 0
                      ? "bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400"
                      : "bg-gray-50 dark:bg-zinc-800 text-gray-400 dark:text-zinc-500",
                  },
                  {
                    label: "Expenses",
                    val: fmtMoney(totalExpenses),
                    icon: Receipt,
                    color: "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400",
                  },
                  {
                    label: "Net Cash",
                    val: fmtMoney(netCash),
                    icon: TrendingUp,
                    color: netCash >= 0
                      ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400"
                      : "bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400",
                    highlight: true,
                  },
                ].map(({ label, val, icon: Icon, color, highlight }) => (
                  <div
                    key={label}
                    className={cn(
                      "p-3 rounded-2xl border",
                      highlight
                        ? "border-brand-200 dark:border-brand-800/40 bg-brand-50 dark:bg-brand-900/20"
                        : "border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900"
                    )}
                  >
                    <div className={cn("w-6 h-6 rounded-lg flex items-center justify-center mb-2", color)}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-zinc-500 mb-0.5">
                      {label}
                    </p>
                    <p className={cn("text-base font-black", highlight ? "text-brand-700 dark:text-brand-300" : "text-gray-900 dark:text-white")}>
                      {val}
                    </p>
                  </div>
                ))}
              </div>

              {/* Material breakdown */}
              {materialBreakdown.length > 0 && (
                <div>
                  <SectionHeader icon={Package} label="Material Breakdown" />
                  <div className="space-y-2">
                    {materialBreakdown.map(([mat, { count, revenue }]) => (
                      <div
                        key={mat}
                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-zinc-900 rounded-xl"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-brand-600 dark:bg-brand-400" />
                          <p className="text-sm font-bold text-gray-800 dark:text-zinc-200">
                            {mat}
                          </p>
                          <span className="text-[10px] text-gray-400 dark:text-zinc-500">
                            {count} job{count !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <p className="text-sm font-black text-gray-900 dark:text-white">
                          {fmtMoney(revenue)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Jobs list */}
              {filteredSales.length > 0 && (
                <div>
                  <SectionHeader
                    icon={FileText}
                    label="Jobs"
                    count={filteredSales.length}
                  />
                  <div className="space-y-1.5">
                    {filteredSales.map((s, i) => {
                      const client = s["CLIENT NAME"] || s["Client Name"] || "—";
                      const desc = s["JOB DESCRIPTION"] || s["Job Description"] || "—";
                      const amt = parseAmt(s["AMOUNT (₦)"] || s["Amount (₦)"]);
                      const paid = parseAmt(
                        s["INITIAL PAYMENT (₦)"] ||
                          s["INITIAL PAYMENT"] ||
                          s["Initial Payment"]
                      );
                      const status = s["PAYMENT STATUS"] || "Unpaid";
                      const loggedBy = s["LOGGED BY"] || s["Logged By"] || "—";

                      return (
                        <div
                          key={i}
                          className="flex items-start justify-between p-3 bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-xl gap-3"
                        >
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-[10px] font-black text-brand-700 dark:text-brand-400 shrink-0 mt-0.5">
                              {i + 1}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-black text-gray-900 dark:text-white truncate">
                                {client}
                              </p>
                              <p className="text-[10px] text-gray-400 dark:text-zinc-500 font-medium truncate">
                                {desc}
                              </p>
                              <p className="text-[9px] text-gray-300 dark:text-zinc-600 mt-0.5">
                                via {loggedBy}
                              </p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-black text-gray-900 dark:text-white">
                              {fmtMoney(amt)}
                            </p>
                            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                              +{fmtMoney(paid)}
                            </p>
                            <StatusPill status={status} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Expenses */}
              {dayExpenses.length > 0 && (
                <div>
                  <SectionHeader
                    icon={Receipt}
                    label="Expenses"
                    count={dayExpenses.length}
                  />
                  <div className="space-y-1.5">
                    {dayExpenses.map((e, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-3 bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-xl"
                      >
                        <div>
                          <p className="text-sm font-bold text-gray-800 dark:text-zinc-200">
                            {e.CATEGORY || e.Category || "General"}
                          </p>
                          <p className="text-[10px] text-gray-400 dark:text-zinc-500">
                            {e.DESCRIPTION || e.Description || "—"}
                          </p>
                        </div>
                        <p className="text-sm font-black text-rose-600 dark:text-rose-400">
                          −{fmtMoney(parseAmt(e.AMOUNT || e.Amount))}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {filteredSales.length === 0 && dayExpenses.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-gray-300 dark:text-zinc-700">
                  <FileText className="w-10 h-10 mb-3" />
                  <p className="text-sm font-bold">No activity on this date</p>
                  <p className="text-xs mt-1">Try selecting a different date</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 dark:border-zinc-800 flex gap-3 shrink-0 bg-white dark:bg-zinc-950">
          <Button
            onClick={handleWhatsAppShare}
            disabled={filteredSales.length === 0 && dayExpenses.length === 0}
            className="flex-1 h-12 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-black shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
          >
            <Share2 className="w-4 h-4" />
            Share via WhatsApp
          </Button>
          <Button
            onClick={() => window.print()}
            variant="outline"
            className="h-12 px-4 rounded-2xl font-black dark:bg-zinc-900 dark:border-zinc-700"
          >
            <Printer className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

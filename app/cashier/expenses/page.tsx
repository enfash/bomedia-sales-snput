"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ExpenseEntry } from "@/components/expense-entry";
import {
  Receipt,
  ArrowLeft,
  Plus,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Expense = {
  DATE: string;
  AMOUNT: string;
  CATEGORY: string;
  DESCRIPTION: string;
  "PAID TO": string;
  "PAYMENT METHOD": string;
  "RECEIPT URL": string;
  "Logged By": string;
  STATUS: string;
  "PAID BY": string;
  "PAID AT": string;
  TIMESTAMP: string;
};

function formatDate(d: string) {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTime(d: string) {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  return date.toLocaleString("en-NG", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: string }) {
  const isPaid = status === "Paid";
  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black",
      isPaid
        ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400"
        : "bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400"
    )}>
      {isPaid
        ? <CheckCircle2 className="w-3 h-3" />
        : <Clock className="w-3 h-3" />
      }
      {isPaid ? "Paid" : "Unpaid"}
    </span>
  );
}

function ExpenseRow({ expense, onStatusToggle }: {
  expense: Expense;
  onStatusToggle: (timestamp: string, newStatus: "Paid" | "Unpaid") => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [toggling, setToggling] = useState(false);

  const isPaid = expense.STATUS === "Paid";

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setToggling(true);
    await onStatusToggle(expense.TIMESTAMP, isPaid ? "Unpaid" : "Paid");
    setToggling(false);
  };

  return (
    <li className="border-b border-gray-100 dark:border-zinc-800 last:border-0">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-zinc-800/40 active:bg-gray-100 dark:active:bg-zinc-800"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-black text-gray-900 dark:text-white truncate">
              {expense.CATEGORY}
            </p>
            {expense["PAID TO"] && (
              <span className="text-[11px] text-gray-400 dark:text-zinc-500 font-medium truncate">
                · {expense["PAID TO"]}
              </span>
            )}
          </div>
          <p className="text-[11px] text-gray-400 dark:text-zinc-500 truncate mt-0.5">
            {formatDate(expense.DATE)}{expense.DESCRIPTION ? ` · ${expense.DESCRIPTION}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-black text-rose-600 dark:text-rose-400">
            ₦{Number(expense.AMOUNT || 0).toLocaleString()}
          </span>
          <StatusBadge status={expense.STATUS || "Unpaid"} />
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400 dark:text-zinc-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400 dark:text-zinc-500" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 bg-gray-50/60 dark:bg-zinc-800/20 space-y-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <p className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider mb-0.5">Method</p>
              <p className="font-bold text-gray-900 dark:text-zinc-100">{expense["PAYMENT METHOD"] || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider mb-0.5">Logged By</p>
              <p className="font-bold text-gray-900 dark:text-zinc-100">{expense["Logged By"] || "—"}</p>
            </div>
            {expense.DESCRIPTION && (
              <div className="col-span-2">
                <p className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider mb-0.5">Description</p>
                <p className="font-medium text-gray-700 dark:text-zinc-300">{expense.DESCRIPTION}</p>
              </div>
            )}
            {expense["RECEIPT URL"] && (
              <div className="col-span-2">
                <p className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider mb-1">Receipt</p>
                <a
                  href={expense["RECEIPT URL"]}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="inline-flex items-center gap-1.5 text-xs font-black text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <ExternalLink className="w-3 h-3" />
                  View Receipt
                </a>
              </div>
            )}
          </div>

          {/* Audit trail */}
          <div className="border-t border-gray-200 dark:border-zinc-700 pt-3">
            <p className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider mb-2">Payment Status</p>
            {isPaid && expense["PAID BY"] ? (
              <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium mb-2">
                Marked paid by <span className="font-black">{expense["PAID BY"]}</span> on {formatDateTime(expense["PAID AT"])}
              </p>
            ) : null}
            <Button
              size="sm"
              disabled={toggling}
              onClick={handleToggle}
              className={cn(
                "h-8 px-4 rounded-xl text-[11px] font-black uppercase tracking-wider transition-colors",
                isPaid
                  ? "bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 hover:bg-rose-200 dark:hover:bg-rose-950/60 border border-rose-200 dark:border-rose-900/50 shadow-none"
                  : "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900/50 shadow-none"
              )}
            >
              {toggling ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : isPaid ? "Mark as Unpaid" : "Mark as Paid"}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

export default function ExpensesPage() {
  const router = useRouter();
  const formRef = useRef<HTMLDivElement>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"All" | "Paid" | "Unpaid">("All");

  const fetchExpenses = useCallback(async () => {
    try {
      const res = await fetch("/api/expenses");
      if (!res.ok) throw new Error("Failed to fetch");
      const { data } = await res.json();
      // Most recent first
      setExpenses((data as Expense[]).reverse());
    } catch {
      toast.error("Could not load expenses.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  const handleStatusToggle = async (timestamp: string, newStatus: "Paid" | "Unpaid") => {
    const userName = localStorage.getItem("userName") || "Unknown";
    try {
      const res = await fetch("/api/expenses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timestamp, status: newStatus, paidBy: userName }),
      });
      if (!res.ok) throw new Error("Failed to update");
      setExpenses(prev => prev.map(e =>
        e.TIMESTAMP === timestamp
          ? {
              ...e,
              STATUS: newStatus,
              "PAID BY": newStatus === "Paid" ? userName : "",
              "PAID AT": newStatus === "Paid" ? new Date().toISOString() : "",
            }
          : e
      ));
      toast.success(`Marked as ${newStatus}`);
    } catch {
      toast.error("Failed to update status. Try again.");
    }
  };

  const filtered = expenses.filter(e => {
    if (filter === "All") return true;
    return (e.STATUS || "Unpaid") === filter;
  });

  const totalUnpaid = expenses
    .filter(e => (e.STATUS || "Unpaid") === "Unpaid")
    .reduce((sum, e) => sum + (Number(e.AMOUNT) || 0), 0);

  return (
    <div className="p-4 md:p-8 max-w-3xl min-h-screen bg-transparent">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center justify-between gap-3 mb-1">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.back()}
              className="md:hidden rounded-xl h-9 w-9 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 transition-[transform] duration-150 ease-out active:scale-[0.97]">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-red-500 dark:text-rose-500" />
              <h1 className="text-2xl font-black text-gray-900 dark:text-white">Expenses</h1>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="h-9 px-4 rounded-xl bg-primary text-primary-foreground font-black text-[12px] flex items-center gap-1.5 shadow-md shadow-primary/20 dark:shadow-none"
          >
            <Plus className="w-3.5 h-3.5" />
            New
          </Button>
        </div>
        <p className="text-gray-500 dark:text-zinc-400 text-sm font-medium pl-0 md:pl-0">
          Track and manage business expenses.
        </p>
      </div>

      {/* Unpaid summary pill */}
      {totalUnpaid > 0 && (
        <div className="mb-4 flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30">
          <Clock className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0" />
          <p className="text-sm font-black text-rose-700 dark:text-rose-400">
            ₦{totalUnpaid.toLocaleString()} unpaid
          </p>
          <span className="text-[11px] text-rose-500/70 dark:text-rose-500 font-medium">
            across {expenses.filter(e => (e.STATUS || "Unpaid") === "Unpaid").length} expense{expenses.filter(e => (e.STATUS || "Unpaid") === "Unpaid").length !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {(["All", "Unpaid", "Paid"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-4 py-1.5 rounded-xl text-[12px] font-black border transition-colors",
              filter === f
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800 text-gray-500 dark:text-zinc-400 hover:border-gray-300 dark:hover:border-zinc-700"
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Expenses list */}
      <div className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm mb-6">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-gray-400 dark:text-zinc-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm font-medium">Loading expenses...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <Receipt className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-zinc-600" />
            <p className="text-sm font-black text-gray-400 dark:text-zinc-500">
              {filter === "All" ? "No expenses logged yet" : `No ${filter.toLowerCase()} expenses`}
            </p>
          </div>
        ) : (
          <ul>
            {filtered.map((expense, i) => (
              <ExpenseRow
                key={expense.TIMESTAMP || i}
                expense={expense}
                onStatusToggle={handleStatusToggle}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Log form */}
      <div ref={formRef} className="scroll-mt-4">
        <div className="flex items-center gap-2 mb-3 px-1">
          <Plus className="w-4 h-4 text-gray-400 dark:text-zinc-500" />
          <h2 className="text-[11px] uppercase font-black tracking-widest text-gray-400 dark:text-zinc-500">
            Log New Expense
          </h2>
        </div>
        <ExpenseEntry onSaved={fetchExpenses} />
      </div>
    </div>
  );
}

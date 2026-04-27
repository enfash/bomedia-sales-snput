"use client";

import { useSyncStore } from "@/lib/store";
import { Bell, Package, Receipt, Clock } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

export function ActivityFeed() {
  const { cachedSales, cachedExpenses } = useSyncStore();

  const activityItems = useMemo(() => {
    const combined = [
      ...cachedSales.map((s) => ({
        type: "sale" as const,
        id: s["SALES ID"] || `s-${s._rowIndex}`,
        timestamp: s["TIMESTAMP"],
        user: s["LOGGED BY"] || "Unknown",
        client: s["CLIENT NAME"] || "Walking Customer",
        description: s["JOB DESCRIPTION"] || "General Printing",
        amount: s["TOTAL"] || 0,
        status: s["PAYMENT STATUS"],
      })),
      ...cachedExpenses.map((e, idx) => ({
        type: "expense" as const,
        id: `e-${idx}`,
        timestamp: e["TIMESTAMP"],
        user: e["Logged By"] || "Unknown",
        category: e["CATEGORY"] || "General",
        description: e["DESCRIPTION"] || "Miscellaneous expense",
        amount: e["AMOUNT"] || 0,
      })),
    ];

    return combined
      .filter((item) => item.timestamp)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 20);
  }, [cachedSales, cachedExpenses]);

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).format(date);
    } catch (e) {
      return "";
    }
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-10 w-10 rounded-full text-gray-500 hover:text-primary hover:bg-primary/10 transition-all active:scale-95"
        >
          <Bell className="h-5 w-5" />
          {activityItems.length > 0 && (
            <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-500 border-2 border-white dark:border-zinc-950" />
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md p-0 flex flex-col border-l dark:border-zinc-800">
        <SheetHeader className="p-6 border-b dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-900/50">
          <SheetTitle className="text-xl font-black tracking-tight flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            Activity Feed
          </SheetTitle>
          <SheetDescription className="text-xs font-medium">
            Real-time log of recent sales and expenses
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {activityItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8">
              <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-zinc-900 flex items-center justify-center mb-3">
                <Bell className="w-6 h-6 text-gray-400" />
              </div>
              <p className="text-sm font-bold text-gray-900 dark:text-zinc-100">No recent activity</p>
              <p className="text-xs text-gray-500 mt-1">New transactions will appear here in real-time.</p>
            </div>
          ) : (
            activityItems.map((item) => (
              <div
                key={item.id}
                className="group p-3 rounded-2xl border border-border dark:border-zinc-800 bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="flex gap-3">
                  <div className={cn(
                    "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
                    item.type === "sale" 
                      ? "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20" 
                      : "bg-amber-500/10 text-amber-600 dark:bg-amber-500/20"
                  )}>
                    {item.type === "sale" ? <Package className="w-5 h-5" /> : <Receipt className="w-5 h-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-gray-900 dark:text-zinc-100 leading-snug">
                      <span className="text-primary">{item.user}</span> 
                      {item.type === "sale" 
                        ? ` logged a sale for ${item.client}` 
                        : ` recorded an expense: ${item.category}`}
                    </p>
                    <p className="text-[11px] text-gray-500 dark:text-zinc-400 mt-0.5 truncate">
                      {item.description}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                       <span className={cn(
                         "text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md",
                         item.type === "sale" 
                           ? item.status === "Part-payment" 
                             ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                             : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                           : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                       )}>
                         ₦{Number(item.amount).toLocaleString()}
                       </span>
                       <span className="text-[10px] text-gray-400 dark:text-zinc-500 font-medium flex items-center gap-1">
                         • {formatTime(item.timestamp)}
                       </span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

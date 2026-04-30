"use client";

import { useSyncStore } from "@/lib/store";
import { Bell, Package, Receipt, Clock, AlertTriangle, User, TrendingUp, TrendingDown } from "lucide-react";
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
import { useMemo, useState } from "react";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { toast } from "sonner";

type ActivityType = "sale" | "expense" | "inventory";

interface ActivityItem {
  type: ActivityType;
  id: string;
  timestamp: string;
  user?: string;
  client?: string;
  description: string;
  material?: string;
  category?: string;
  amount: number;
  paid?: number;
  balance?: number;
  status?: string;
  stock?: number;
  itemName?: string;
  rowIndex?: number;
}

export function ActivityFeed() {
  const { cachedSales, cachedExpenses, cachedInventory } = useSyncStore();
  const [isRestocking, setIsRestocking] = useState<number | null>(null);

  const activityItems = useMemo(() => {
    const parseVal = (val: any) => {
      if (val === undefined || val === null) return 0;
      const str = val.toString().replace(/[₦,\s]/g, "");
      return parseFloat(str) || 0;
    };

    const sales = cachedSales.map((s) => ({
      type: "sale" as const,
      id: s["SALES ID"] || `s-${s._rowIndex}`,
      timestamp: s["TIMESTAMP"] || s["Timestamp"] || s["DATE"] || s["Date"],
      user: s["LOGGED BY"] || s["Logged By"] || "Staff",
      client: s["CLIENT NAME"] || s["Client Name"] || "Walking Customer",
      description: s["JOB DESCRIPTION"] || s["Job Description"] || "General Printing",
      material: s["MATERIAL"] || s["Material"] || "General",
      amount: parseVal(s["TOTAL"] || s["Total"]),
      paid: parseVal(s["INITIAL PAYMENT (₦)"] || s["INITIAL PAYMENT"] || s["Initial Payment"]),
      balance: parseVal(s["AMOUNT DIFFERENCES"] || s["Amount Differences"] || s["BALANCE"] || s["Balance"]),
      status: s["PAYMENT STATUS"] || s["Payment Status"],
    }));

    const expenses = cachedExpenses.map((e, idx) => ({
      type: "expense" as const,
      id: `e-${idx}`,
      timestamp: e["TIMESTAMP"] || e["Timestamp"] || e["DATE"] || e["Date"],
      user: e["Logged By"] || e["LOGGED BY"] || "Staff",
      category: e["CATEGORY"] || e["Category"] || "General",
      description: e["DESCRIPTION"] || e["Description"] || "Miscellaneous expense",
      amount: parseVal(e["AMOUNT"] || e["Amount"]),
    }));

    const inventoryAlerts = cachedInventory
      .filter((item) => {
        const stock = parseVal(item.Stock);
        return stock <= 200; // Low or Critical
      })
      .map((item) => ({
        type: "inventory" as const,
        id: `i-${item._rowIndex}`,
        timestamp: new Date().toISOString(), // Inventory alerts are "current"
        description: `Stock level for ${item["Item Name"]} is ${(parseVal(item.Stock) <= 50 ? "CRITICAL" : "LOW")}`,
        itemName: item["Item Name"],
        stock: parseVal(item.Stock),
        amount: 0,
        rowIndex: item._rowIndex,
      }));

    const combined = [...sales, ...expenses, ...inventoryAlerts];

    return combined
      .filter((item) => item.timestamp)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 30);
  }, [cachedSales, cachedExpenses, cachedInventory]);

  // Grouping by Date
  const groupedActivities = useMemo(() => {
    const groups: Record<string, ActivityItem[]> = {};
    
    activityItems.forEach((item) => {
      let dateKey = "";
      try {
        const date = new Date(item.timestamp);
        if (isToday(date)) dateKey = "Today";
        else if (isYesterday(date)) dateKey = "Yesterday";
        else dateKey = format(date, "MMMM dd, yyyy");
      } catch (e) {
        dateKey = "Unknown Date";
      }

      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(item);
    });

    return groups;
  }, [activityItems]);

  const handleRestock = async (rowIndex: number, itemName: string) => {
    setIsRestocking(rowIndex);
    try {
      const res = await fetch("/api/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowIndex, stockChange: 150 })
      });
      if (res.ok) {
        toast.success(`Restocked 150 sqft of ${itemName}!`);
      } else {
        toast.error("Restock failed");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setIsRestocking(null);
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return format(date, "h:mm a");
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
            <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-500 border-2 border-white dark:border-zinc-950 animate-pulse" />
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md p-0 flex flex-col border-l dark:border-zinc-800">
        <SheetHeader className="p-6 border-b dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-900/50">
          <SheetTitle className="text-xl font-black tracking-tight flex items-center gap-2 text-gray-900 dark:text-white">
            <Clock className="w-5 h-5 text-primary" />
            Activity Log
          </SheetTitle>
          <SheetDescription className="text-xs font-bold uppercase tracking-widest text-gray-500">
            Recent updates & alerts
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-slate-50/30 dark:bg-zinc-950/30">
          {Object.keys(groupedActivities).length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8">
              <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-zinc-900 flex items-center justify-center mb-4">
                <Bell className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-base font-black text-gray-900 dark:text-zinc-100 uppercase tracking-tight">Quiet on the front</p>
              <p className="text-xs text-gray-500 mt-2 font-medium">New transactions and stock alerts will appear here.</p>
            </div>
          ) : (
            Object.entries(groupedActivities).map(([date, items]) => (
              <div key={date} className="space-y-3">
                <div className="sticky top-0 z-10 flex items-center gap-2 bg-slate-50/80 dark:bg-zinc-950/80 backdrop-blur-sm py-1">
                  <div className="h-[1px] flex-1 bg-gray-200 dark:border-zinc-800" />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 dark:text-zinc-500 whitespace-nowrap">
                    {date}
                  </span>
                  <div className="h-[1px] flex-1 bg-gray-200 dark:border-zinc-800" />
                </div>

                <div className="space-y-3">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className={cn(
                        "group p-4 rounded-2xl border border-gray-100 dark:border-zinc-800/50 bg-white dark:bg-zinc-900 hover:shadow-md transition-all duration-200",
                        item.type === "inventory" && item.stock! <= 50 ? "border-rose-200 dark:border-rose-900/30 bg-rose-50/30 dark:bg-rose-900/10" : ""
                      )}
                    >
                      <div className="flex gap-4">
                        <div className={cn(
                          "h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm",
                          item.type === "sale" 
                            ? "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20" 
                            : item.type === "expense"
                              ? "bg-amber-500/10 text-amber-600 dark:bg-amber-500/20"
                              : "bg-rose-500/10 text-rose-600 dark:bg-rose-500/20"
                        )}>
                          {item.type === "sale" ? <TrendingUp className="w-6 h-6" /> : 
                           item.type === "expense" ? <TrendingDown className="w-6 h-6" /> : 
                           <AlertTriangle className="w-6 h-6" />}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] text-gray-400 dark:text-zinc-500 font-bold uppercase tracking-wider">
                              {item.type} • {formatTime(item.timestamp)}
                            </span>
                            {item.user && (
                              <div className="flex items-center gap-1 text-[10px] font-bold text-primary px-2 py-0.5 rounded-full bg-primary/5">
                                <User className="w-3 h-3" />
                                {item.user}
                              </div>
                            )}
                          </div>

                          <p className="text-sm font-black text-gray-900 dark:text-zinc-100 mt-1 leading-tight tracking-tight">
                            {item.type === "sale" 
                              ? `New Sale for ${item.client}` 
                              : item.type === "expense"
                                ? `Expense: ${item.category}`
                                : `Low Stock Alert`}
                          </p>
                          
                          <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1 font-medium italic">
                            {item.description}
                          </p>

                          {item.type === "sale" && (
                            <div className="flex items-center gap-2 mt-3">
                              <div className="px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-black uppercase">
                                Paid: ₦{item.paid?.toLocaleString()}
                              </div>
                              <div className={cn(
                                "px-2 py-1 rounded-lg text-[10px] font-black uppercase",
                                item.balance! > 0 
                                  ? "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400" 
                                  : "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400"
                              )}>
                                Bal: ₦{item.balance?.toLocaleString()}
                              </div>
                            </div>
                          )}

                          {item.type === "expense" && (
                            <div className="mt-3 px-2 py-1 w-fit rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 text-[10px] font-black uppercase">
                              Amount: ₦{item.amount.toLocaleString()}
                            </div>
                          )}

                          {item.type === "inventory" && (
                            <div className="mt-3 flex items-center justify-between gap-3">
                              <div className="px-2 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 text-[10px] font-black uppercase">
                                Remaining: {item.stock?.toFixed(1)} sqft
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isRestocking === item.rowIndex}
                                onClick={() => handleRestock(item.rowIndex!, item.itemName!)}
                                className="h-7 px-3 rounded-lg text-[10px] font-black uppercase tracking-tighter border-rose-200 hover:bg-rose-500 hover:text-white dark:border-rose-900/50"
                              >
                                {isRestocking === item.rowIndex ? "Restocking..." : "Restock Now"}
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

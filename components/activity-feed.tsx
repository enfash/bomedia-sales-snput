"use client";

import { useSyncStore } from "@/lib/store";
import { Bell, Package, Receipt, Clock, AlertTriangle, User, TrendingUp, TrendingDown, CheckCircle2, WifiOff, AlertCircle } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  const { cachedSales, cachedExpenses, cachedInventory, cachedMaterials, pendingQueue } = useSyncStore();
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

    const combined = [...sales, ...expenses];

    return combined
      .filter((item) => item.timestamp)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 30);
  }, [cachedSales, cachedExpenses]);

  const alerts = useMemo(() => {
    const parseVal = (val: any) => {
      if (val === undefined || val === null) return 0;
      const str = val.toString().replace(/[₦,\s]/g, "");
      return parseFloat(str) || 0;
    };

    // 1. Inventory Warnings (calculated at the Material aggregate level)
    const inventory = (cachedMaterials || [])
      .filter((mat) => {
        const remaining = parseVal(mat["Total Remaining (ft)"]);
        const threshold = parseVal(mat["Low Stock Threshold (ft)"] || 20);
        return remaining <= threshold;
      })
      .map((mat) => {
        const remaining = parseVal(mat["Total Remaining (ft)"]);
        // Find the active roll in cachedInventory to get its rowIndex for restocking
        const activeRollId = mat["Active Roll ID"];
        const activeRoll = cachedInventory.find(r => r["Roll ID"] === activeRollId);
        
        return {
          type: "inventory" as const,
          id: `m-${mat["Material ID"]}`,
          description: `Aggregate stock level for ${mat["Material Name"]} is ${(remaining <= 0.1 ? "CRITICAL" : "LOW")}`,
          itemName: mat["Material Name"],
          stock: remaining,
          rowIndex: activeRoll ? activeRoll._rowIndex : mat._rowIndex,
          critical: remaining <= 0.1,
        };
      });

    // 2. Pending Sync Items
    const pending = pendingQueue.map((item) => ({
      type: "pending" as const,
      id: item.id,
      description: `Pending sync: ${item.type.toUpperCase()}`,
      actionType: item.type,
      timestamp: item.timestamp,
    }));

    return {
      inventory,
      pending,
      totalCount: inventory.length + pending.length,
      criticalCount: inventory.filter(i => i.critical).length
    };
  }, [cachedInventory, cachedMaterials, pendingQueue]);

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
        body: JSON.stringify({ rowIndex, adjustment: 164 })
      });
      if (res.ok) {
        toast.success(`Restocked 164ft of ${itemName}!`);
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
          className="relative h-10 w-10 rounded-full text-gray-500 hover:text-primary hover:bg-primary/10 transition-[background-color,color,transform] active:scale-[0.97]"
        >
          <Bell className="h-5 w-5" />
          {alerts.totalCount > 0 && (
            <span className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-rose-500 border-2 border-white dark:border-zinc-950 animate-bounce" />
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md p-0 flex flex-col border-l dark:border-zinc-800 bg-white dark:bg-zinc-950">
        <SheetHeader className="p-6 border-b dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-900/50 shrink-0">
          <SheetTitle className="text-xl font-black tracking-tight flex items-center gap-2 text-gray-900 dark:text-white">
            <Clock className="w-5 h-5 text-primary" />
            Activity & System Alerts
          </SheetTitle>
          <SheetDescription className="text-xs font-bold uppercase tracking-widest text-gray-500">
            Recent updates & warnings
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="activities" className="flex-1 flex flex-col min-h-0">
          <div className="px-4 pt-4 shrink-0">
            <TabsList className="bg-gray-100 dark:bg-zinc-900 p-1 rounded-xl border border-gray-200 dark:border-zinc-800 gap-1 flex">
              <TabsTrigger
                value="activities"
                className="flex-1 rounded-lg text-xs font-black uppercase py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 data-[state=active]:shadow-sm data-[state=active]:text-gray-900 dark:data-[state=active]:text-white transition-all"
              >
                <Clock className="w-3.5 h-3.5 mr-1.5" />
                Updates ({activityItems.length})
              </TabsTrigger>
              <TabsTrigger
                value="alerts"
                className="flex-1 rounded-lg text-xs font-black uppercase py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 data-[state=active]:shadow-sm data-[state=active]:text-gray-900 dark:data-[state=active]:text-white transition-all relative"
              >
                <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />
                Alerts
                {alerts.totalCount > 0 && (
                  <span className={cn(
                    "ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-black text-white leading-none flex items-center justify-center min-w-[16px] h-4",
                    alerts.criticalCount > 0 ? "bg-rose-500 animate-pulse" : "bg-amber-500"
                  )}>
                    {alerts.totalCount}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="activities" className="flex-1 overflow-y-auto p-4 space-y-6 min-h-0 outline-none">
            {Object.keys(groupedActivities).length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 mt-12">
                <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-zinc-900 flex items-center justify-center mb-4">
                  <Bell className="w-8 h-8 text-gray-400" />
                </div>
                <p className="text-base font-black text-gray-900 dark:text-zinc-100 uppercase tracking-tight">Quiet on the front</p>
                <p className="text-xs text-gray-500 mt-2 font-medium">New transactions will appear here.</p>
              </div>
            ) : (
              Object.entries(groupedActivities).map(([date, items]) => (
                <div key={date} className="space-y-3">
                  <div className="sticky top-0 z-10 flex items-center gap-2 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-sm py-1">
                    <div className="h-[1px] flex-1 bg-gray-100 dark:bg-zinc-800" />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 dark:text-zinc-500 whitespace-nowrap">
                      {date}
                    </span>
                    <div className="h-[1px] flex-1 bg-gray-100 dark:bg-zinc-800" />
                  </div>

                  <div className="space-y-3">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className="group p-4 rounded-2xl border border-gray-100 dark:border-zinc-800/50 bg-white dark:bg-zinc-900 [@media(hover:hover)]:hover:shadow-md transition-[box-shadow] duration-200"
                      >
                        <div className="flex gap-4">
                          <div className={cn(
                            "h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm",
                            item.type === "sale" 
                              ? "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20" 
                              : "bg-amber-500/10 text-amber-600 dark:bg-amber-500/20"
                          )}>
                            {item.type === "sale" ? <TrendingUp className="w-6 h-6" /> : <TrendingDown className="w-6 h-6" />}
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
                                : `Expense: ${item.category}`}
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
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </TabsContent>

          <TabsContent value="alerts" className="flex-1 overflow-y-auto p-4 space-y-6 min-h-0 outline-none">
            {alerts.totalCount === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 mt-12">
                <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-950/20 flex items-center justify-center mb-4">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                </div>
                <p className="text-base font-black text-gray-900 dark:text-zinc-100 uppercase tracking-tight">All systems operational</p>
                <p className="text-xs text-gray-500 mt-2 font-medium">No low stock warnings or pending offline actions.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Offline Sync alerts */}
                {alerts.pending.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                        <WifiOff className="w-3.5 h-3.5" />
                        Offline Sync Queue ({alerts.pending.length})
                      </span>
                    </div>
                    <div className="space-y-2">
                      {alerts.pending.map((p) => (
                        <div key={p.id} className="p-3.5 rounded-2xl border border-amber-200 dark:border-amber-900/30 bg-amber-50/20 dark:bg-amber-900/5 flex items-center justify-between">
                          <div>
                            <p className="text-xs font-bold text-gray-800 dark:text-zinc-200">
                              {p.description}
                            </p>
                            <p className="text-[9px] text-gray-400 dark:text-zinc-500 font-mono mt-0.5">
                              Queued: {format(new Date(p.timestamp), "h:mm a")}
                            </p>
                          </div>
                          <span className="text-[9px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest bg-amber-100 dark:bg-amber-950 px-2 py-0.5 rounded-full animate-pulse">
                            Pending Sync
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Stock alerts */}
                {alerts.inventory.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5" />
                        Material Stock Alerts ({alerts.inventory.length})
                      </span>
                    </div>
                    <div className="space-y-3">
                      {alerts.inventory.map((item) => (
                        <div
                          key={item.id}
                          className={cn(
                            "p-4 rounded-2xl border bg-white dark:bg-zinc-900 shadow-sm transition-[box-shadow] duration-200",
                            item.critical 
                              ? "border-rose-200 dark:border-rose-900/40 bg-rose-50/10 dark:bg-rose-900/5" 
                              : "border-amber-200 dark:border-amber-900/40 bg-amber-50/10 dark:bg-amber-900/5"
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className={cn(
                                  "w-2 h-2 rounded-full",
                                  item.critical ? "bg-rose-500 animate-ping" : "bg-amber-500"
                                )} />
                                <p className="text-xs font-black text-gray-900 dark:text-zinc-100">
                                  {item.itemName}
                                </p>
                              </div>
                              <p className="text-[11px] text-gray-500 dark:text-zinc-400 font-medium mt-1 leading-relaxed">
                                {item.description}
                              </p>
                              <div className="mt-3 flex items-center gap-2">
                                <span className={cn(
                                  "px-2 py-0.5 rounded-lg text-[9px] font-black uppercase",
                                  item.critical
                                    ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400"
                                    : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                                )}>
                                  Stock: {item.stock.toFixed(1)} ft remaining
                                </span>
                              </div>
                            </div>

                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isRestocking === item.rowIndex}
                              onClick={() => handleRestock(item.rowIndex!, item.itemName!)}
                              className={cn(
                                "h-8 px-3 rounded-lg text-[10px] font-black uppercase tracking-tighter border shadow-sm shrink-0",
                                item.critical
                                  ? "border-rose-200 text-rose-600 hover:bg-rose-600 hover:text-white dark:border-rose-900/50"
                                  : "border-amber-200 text-amber-600 hover:bg-amber-600 hover:text-white dark:border-amber-900/50"
                              )}
                            >
                              {isRestocking === item.rowIndex ? "Restocking..." : "Restock Roll"}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

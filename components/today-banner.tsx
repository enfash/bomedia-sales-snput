"use client";

import { useSyncStore } from "@/lib/store";
import { RefreshCw, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface TodayBannerProps {
  jobCount: number;
  revenue: number;
  salesCount?: number;
  className?: string;
}

export function TodayBanner({ jobCount, revenue, salesCount, className }: TodayBannerProps) {
  const { pendingQueue, syncStatus } = useSyncStore();

  const isSyncing = syncStatus === "syncing";
  const hasPending = pendingQueue.length > 0;

  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "short",
  });

  const revenueDisplay =
    revenue >= 1000000
      ? `₦${(revenue / 1000000).toFixed(1)}M`
      : revenue >= 1000
      ? `₦${(revenue / 1000).toFixed(1)}k`
      : `₦${revenue.toLocaleString()}`;

  return (
    <div className={cn("mb-6", className)}>
      {/* Heading Row */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-0.5">
            {dateLabel}
          </p>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground leading-none">
            Today at a glance
          </h2>
        </div>

        {/* LIVE / Sync badge */}
        <div className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider border transition-colors",
          isSyncing
            ? "bg-blue-500/10 text-blue-600 border-blue-200 dark:border-blue-800"
            : hasPending
            ? "bg-amber-500/10 text-amber-600 border-amber-200 dark:border-amber-800"
            : "bg-primary/10 text-primary border-primary/20"
        )}>
          {isSyncing ? (
            <RefreshCw className="w-3 h-3 animate-spin" />
          ) : (
            <span className={cn(
              "h-1.5 w-1.5 rounded-full",
              hasPending ? "bg-amber-500 animate-pulse" : "bg-primary"
            )} />
          )}
          {isSyncing ? "Syncing" : hasPending ? `${pendingQueue.length} pending` : "Live"}
        </div>
      </div>

      {/* Stat Tiles */}
      <div className="grid grid-cols-3 gap-3">
        {/* Sales */}
        <div className="relative bg-white dark:bg-zinc-900 border border-blue-100 dark:border-blue-900/30 rounded-2xl p-4 flex flex-col gap-1 shadow-sm overflow-hidden group hover:shadow-md transition-all">
          <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 rounded-l" />
          <div className="absolute -top-4 -right-4 w-14 h-14 rounded-full bg-blue-500/5 group-hover:bg-blue-500/10 transition-colors" />
          <p className="text-[10px] font-black uppercase tracking-widest text-blue-500 dark:text-blue-400 relative z-10">Sales</p>
          <p className="text-2xl sm:text-3xl font-black text-foreground leading-none relative z-10">
            {salesCount ?? jobCount}
          </p>
          <p className="text-[9px] text-muted-foreground font-semibold">transactions</p>
        </div>

        {/* Jobs */}
        <div className="relative bg-white dark:bg-zinc-900 border border-violet-100 dark:border-violet-900/30 rounded-2xl p-4 flex flex-col gap-1 shadow-sm overflow-hidden group hover:shadow-md transition-all">
          <div className="absolute top-0 left-0 w-1 h-full bg-violet-500 rounded-l" />
          <div className="absolute -top-4 -right-4 w-14 h-14 rounded-full bg-violet-500/5 group-hover:bg-violet-500/10 transition-colors" />
          <p className="text-[10px] font-black uppercase tracking-widest text-violet-500 dark:text-violet-400 relative z-10">Jobs</p>
          <p className="text-2xl sm:text-3xl font-black text-foreground leading-none relative z-10">
            {String(jobCount).padStart(2, "0")}
          </p>
          <p className="text-[9px] text-muted-foreground font-semibold">logged today</p>
        </div>

        {/* Revenue */}
        <div className="relative bg-white dark:bg-zinc-900 border border-emerald-100 dark:border-emerald-900/30 rounded-2xl p-4 flex flex-col gap-1 shadow-sm overflow-hidden group hover:shadow-md transition-all">
          <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500 rounded-l" />
          <div className="absolute -top-4 -right-4 w-14 h-14 rounded-full bg-emerald-500/5 group-hover:bg-emerald-500/10 transition-colors" />
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 relative z-10">Revenue</p>
          <p className="text-lg sm:text-xl font-black text-foreground leading-none truncate relative z-10">
            {revenueDisplay}
          </p>
          <div className="flex items-center gap-0.5 text-[9px] text-emerald-600 dark:text-emerald-400 font-bold">
            <TrendingUp className="w-3 h-3" /> today
          </div>
        </div>
      </div>
    </div>
  );
}

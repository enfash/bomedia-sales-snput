"use client";

import { useSyncStore } from "@/lib/store";
import { RefreshCw } from "lucide-react";
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
        <div
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider border transition-colors",
            isSyncing
              ? "bg-blue-500/10 text-blue-600 border-blue-200 dark:border-blue-800"
              : hasPending
              ? "bg-amber-500/10 text-amber-600 border-amber-200 dark:border-amber-800"
              : "bg-primary/10 text-primary border-primary/20"
          )}
        >
          {isSyncing ? (
            <RefreshCw className="w-3 h-3 animate-spin" />
          ) : (
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                hasPending ? "bg-amber-500 animate-pulse" : "bg-primary"
              )}
            />
          )}
          {isSyncing
            ? "Syncing"
            : hasPending
            ? `${pendingQueue.length} pending`
            : "Live"}
        </div>
      </div>

      {/* Stat Tiles */}
      <div className="grid grid-cols-3 gap-3">
        {/* Sales */}
        <div className="bg-card dark:bg-zinc-900/50 border border-border dark:border-zinc-800 rounded-2xl p-4 flex flex-col gap-1 shadow-sm transition-all hover:shadow-md group">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground group-hover:text-primary transition-colors">
            Sales
          </p>
          <p className="text-2xl sm:text-3xl font-black text-foreground leading-none">
            {salesCount ?? jobCount}
          </p>
        </div>

        {/* Jobs */}
        <div className="bg-card dark:bg-zinc-900/50 border border-border dark:border-zinc-800 rounded-2xl p-4 flex flex-col gap-1 shadow-sm transition-all hover:shadow-md group">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground group-hover:text-primary transition-colors">
            Jobs
          </p>
          <p className="text-2xl sm:text-3xl font-black text-foreground leading-none">
            {String(jobCount).padStart(2, "0")}
          </p>
        </div>

        {/* Revenue */}
        <div className="bg-card dark:bg-zinc-900/50 border border-border dark:border-zinc-800 rounded-2xl p-4 flex flex-col gap-1 shadow-sm transition-all hover:shadow-md group overflow-hidden relative">
          <div className="absolute top-0 right-0 w-16 h-16 bg-primary/5 rounded-full -mr-8 -mt-8" />
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground group-hover:text-primary transition-colors relative z-10">
            Revenue
          </p>
          <p className="text-lg sm:text-xl font-black text-foreground leading-none truncate relative z-10">
            ₦{revenue >= 1000000 ? `${(revenue / 1000000).toFixed(1)}M` : revenue >= 1000 ? `${(revenue / 1000).toFixed(1)}k` : revenue.toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}

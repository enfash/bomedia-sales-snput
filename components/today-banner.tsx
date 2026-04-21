"use client";

import { useSyncStore } from "@/lib/store";
import { Package, Banknote, RefreshCw, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface TodayBannerProps {
  jobCount: number;
  revenue: number;
  className?: string;
}

export function TodayBanner({ jobCount, revenue, className }: TodayBannerProps) {
  const { pendingQueue, syncStatus } = useSyncStore();

  return (
    <div className={cn(
      "glass sticky top-0 z-30 flex items-center justify-between px-6 py-3 mb-6 -mx-4 md:-mx-8 border-b shadow-sm overflow-x-auto whitespace-nowrap",
      className
    )}>
      <div className="flex items-center gap-8">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Clock className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider opacity-70">Today at a glance</p>
            <p className="text-sm font-bold">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}</p>
          </div>
        </div>

        <div className="h-8 w-px bg-border flex-shrink-0" />

        <div className="flex items-center gap-3">
          <Package className="w-4 h-4 text-muted-foreground" />
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Jobs</p>
            <p className="text-sm font-bold">{jobCount}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Banknote className="w-4 h-4 text-muted-foreground" />
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Revenue</p>
            <p className="text-sm font-bold">₦{revenue.toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 bg-muted/50 px-3 py-1.5 rounded-full border">
        {syncStatus === 'syncing' ? (
          <RefreshCw className="w-3.5 h-3.5 text-primary animate-spin" />
        ) : pendingQueue.length > 0 ? (
          <div className="h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
        ) : (
          <div className="h-2 w-2 rounded-full bg-green-500" />
        )}
        <span className="text-[11px] font-semibold">
          {pendingQueue.length > 0 ? `${pendingQueue.length} items pending` : 'System Synchronized'}
        </span>
      </div>
    </div>
  );
}

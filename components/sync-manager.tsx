"use client";

import { useEffect, useRef, useState } from "react";
import { useSyncStore } from "@/lib/store";
import { toast } from "sonner";
import { CloudOff, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Items exceeding this many retries are considered "exhausted" and trigger the banner. */
const MAX_RETRIES = 3;

export function SyncManager() {
  const {
    pendingQueue,
    syncStatus,
    setSyncStatus,
    removeEntry,
    setLastSyncTime,
    updateEntryRetry,
  } = useSyncStore();
  const isSyncingRef = useRef(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Items that have exceeded max retries — these won't be retried automatically
  const exhaustedItems = pendingQueue.filter(
    (item) => (item.retryCount ?? 0) >= MAX_RETRIES
  );

  // Reset banner dismissed state whenever the exhausted count changes
  useEffect(() => {
    if (exhaustedItems.length > 0) {
      setBannerDismissed(false);
    }
  }, [exhaustedItems.length]);

  const handleForceRetry = () => {
    // Reset retry counters on all exhausted items so they re-enter the sync cycle
    exhaustedItems.forEach((item) => updateEntryRetry(item.id, 0, 0));
    setBannerDismissed(true);
    // Trigger an immediate sync
    window.dispatchEvent(new Event("online"));
    toast.info("Retrying failed entries...");
  };

  useEffect(() => {
    const handleSync = async () => {
      // Don't start another sync if one is already in progress or queue is empty
      if (isSyncingRef.current || pendingQueue.length === 0 || !navigator.onLine) {
        return;
      }

      isSyncingRef.current = true;
      setSyncStatus("syncing");

      const now = Date.now();
      // Only sync items that are not currently backing off AND have not exhausted retries
      const itemsToSync = pendingQueue.filter((item) => {
        if ((item.retryCount ?? 0) >= MAX_RETRIES) return false; // Skip exhausted
        if (!item.retryCount || !item.lastRetryAt) return true;
        // Exponential backoff: 5s, 10s, 20s, 40s...
        const backoffDelay = Math.pow(2, item.retryCount - 1) * 5000;
        return now - item.lastRetryAt >= backoffDelay;
      });

      if (itemsToSync.length === 0) {
        isSyncingRef.current = false;
        // If all remaining items are exhausted, leave status as-is (banner handles UX)
        if (pendingQueue.every((i) => (i.retryCount ?? 0) >= MAX_RETRIES)) {
          setSyncStatus("error", "Sync failed after maximum retries.");
        } else {
          setSyncStatus("error", "Sync pending (waiting for retry backoff)");
        }
        return;
      }

      console.log(`Starting sync for ${itemsToSync.length} items...`);

      let successCount = 0;
      let errorCount = 0;

      for (const item of itemsToSync) {
        try {
          const endpoint = item.type === "sale" ? "/api/sales" : "/api/expenses";
          // For batch sales, the payload is already correctly structured ({ batch: true, items: [...] }).
          // Injecting type:"array" would override the batch flag and send it to the wrong server branch.
          const payload =
            item.type === "sale"
              ? item.data.batch === true
                ? item.data
                : { ...item.data, type: "array" }
              : item.data;

          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          if (res.ok) {
            removeEntry(item.id);
            successCount++;
          } else {
            const errData = await res.json();
            throw new Error(errData.error || "Server error");
          }
        } catch (err) {
          console.error(`Failed to sync item ${item.id}:`, err);
          errorCount++;
          const newRetryCount = (item.retryCount || 0) + 1;
          updateEntryRetry(item.id, newRetryCount, Date.now());
        }
      }

      if (successCount > 0) {
        setLastSyncTime(Date.now());
      }

      if (errorCount > 0) {
        setSyncStatus("error", `${errorCount} items failed to sync.`);
      } else {
        setSyncStatus("idle");
        if (successCount > 0) {
          toast.success(`Successfully synced ${successCount} background logs.`);
        }
      }

      isSyncingRef.current = false;
    };

    // Trigger sync on mount and when queue changes
    handleSync();

    // Also trigger on connectivity change
    window.addEventListener("online", handleSync);
    return () => window.removeEventListener("online", handleSync);
  }, [pendingQueue.length, removeEntry, setSyncStatus, setLastSyncTime, updateEntryRetry]);

  // Render the persistent failure banner when entries are exhausted and not dismissed
  if (exhaustedItems.length > 0 && !bannerDismissed) {
    return (
      <div
        role="alert"
        className="fixed bottom-[72px] left-0 right-0 z-50 flex items-start gap-3 p-4 mx-3 mb-2 rounded-2xl bg-rose-600 text-white shadow-2xl shadow-rose-600/30 animate-in slide-in-from-bottom-4 duration-300 md:bottom-4 md:left-auto md:right-4 md:w-[380px]"
      >
        <CloudOff className="w-5 h-5 mt-0.5 shrink-0 opacity-90" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black leading-snug">
            {exhaustedItems.length} entr{exhaustedItems.length === 1 ? "y" : "ies"} failed to sync
          </p>
          <p className="text-[11px] text-white/80 font-medium mt-0.5">
            These records are saved locally. Tap Retry when you have a stable connection.
          </p>
          <Button
            size="sm"
            onClick={handleForceRetry}
            className="mt-2 h-8 px-4 rounded-xl bg-white text-rose-600 hover:bg-white/90 font-black text-[11px] uppercase tracking-wider flex items-center gap-1.5 shadow-sm"
          >
            <RefreshCw className="w-3 h-3" />
            Tap to Retry
          </Button>
        </div>
        <button
          onClick={() => setBannerDismissed(true)}
          className="p-1 rounded-lg hover:bg-white/20 transition-colors shrink-0"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return null;
}

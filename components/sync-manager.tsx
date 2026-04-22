"use client";

import { useEffect, useRef } from "react";
import { useSyncStore } from "@/lib/store";
import { toast } from "sonner";

export function SyncManager() {
  const { pendingQueue, syncStatus, setSyncStatus, removeEntry, setLastSyncTime, updateEntryRetry } = useSyncStore();
  const isSyncingRef = useRef(false);

  useEffect(() => {
    const handleSync = async () => {
      // Don't start another sync if one is already in progress or queue is empty
      if (isSyncingRef.current || pendingQueue.length === 0 || !navigator.onLine) {
        return;
      }

      isSyncingRef.current = true;
      setSyncStatus('syncing');

      const now = Date.now();
      // Only sync items that are not currently backing off
      const itemsToSync = pendingQueue.filter(item => {
        if (!item.retryCount || !item.lastRetryAt) return true;
        // Exponential backoff: 5s, 10s, 20s, 40s...
        const backoffDelay = Math.pow(2, item.retryCount - 1) * 5000;
        return now - item.lastRetryAt >= backoffDelay;
      });

      if (itemsToSync.length === 0) {
        // All items are currently backing off
        isSyncingRef.current = false;
        setSyncStatus('error', 'Sync pending (waiting for retry backoff)');
        return;
      }

      console.log(`Starting sync for ${itemsToSync.length} items...`);

      let successCount = 0;
      let errorCount = 0;

      for (const item of itemsToSync) {
        try {
          const endpoint = item.type === 'sale' ? '/api/sales' : '/api/expenses';
          const payload = item.type === 'sale' 
            ? { ...item.data, type: "array" } 
            : item.data;

          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
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
        setSyncStatus('error', `${errorCount} items failed to sync.`);
      } else {
        setSyncStatus('idle');
        if (successCount > 0) {
          toast.success(`Successfully synced ${successCount} background logs.`);
        }
      }

      isSyncingRef.current = false;
    };

    // Trigger sync on mount and when queue changes
    handleSync();

    // Also trigger on connectivity change
    window.addEventListener('online', handleSync);
    return () => window.removeEventListener('online', handleSync);
  }, [pendingQueue.length, removeEntry, setSyncStatus, setLastSyncTime]);

  return null; // Silent component
}

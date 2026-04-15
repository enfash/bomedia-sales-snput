"use client";

import { useEffect, useRef } from "react";
import { useSyncStore } from "@/lib/store";
import { toast } from "sonner";

export function SyncManager() {
  const { pendingQueue, syncStatus, setSyncStatus, removeEntry, setLastSyncTime } = useSyncStore();
  const isSyncingRef = useRef(false);

  useEffect(() => {
    const handleSync = async () => {
      // Don't start another sync if one is already in progress or queue is empty
      if (isSyncingRef.current || pendingQueue.length === 0 || !navigator.onLine) {
        return;
      }

      isSyncingRef.current = true;
      setSyncStatus('syncing');

      console.log(`Starting sync for ${pendingQueue.length} items...`);

      // Copy the queue to avoid issues if items are added during sync
      const itemsToSync = [...pendingQueue];
      let successCount = 0;
      let errorCount = 0;

      for (const item of itemsToSync) {
        try {
          const endpoint = item.type === 'sale' ? '/api/sales' : '/api/expenses';
          const payload = item.type === 'sale' 
            ? { values: item.data, type: "array" } 
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
          // We don't stop the whole loop, just continue to next item
          // But we mark the overall status as error if any failed
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

"use client";

import { useEffect, useRef, useState } from "react";
import { useSyncStore } from "@/lib/store";
import { toast } from "sonner";
import { CloudOff, RefreshCw, X } from "lucide-react";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

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

  useEffect(() => {
    useSyncStore.persist.rehydrate();
  }, []);

  const exhaustedItems = pendingQueue.filter(
    (item) => (item.retryCount ?? 0) >= MAX_RETRIES
  );

  useEffect(() => {
    if (exhaustedItems.length > 0) {
      setBannerDismissed(false);
    }
  }, [exhaustedItems.length]);

  const handleForceRetry = () => {
    exhaustedItems.forEach((item) => updateEntryRetry(item.id, 0, 0));
    setBannerDismissed(true);
    window.dispatchEvent(new Event("online"));
    toast.info("Retrying failed entries...");
  };

  useEffect(() => {
    const handleSync = async () => {
      if (isSyncingRef.current || pendingQueue.length === 0 || !navigator.onLine) {
        return;
      }

      isSyncingRef.current = true;
      setSyncStatus("syncing");

      const now = Date.now();
      const itemsToSync = pendingQueue.filter((item) => {
        if ((item.retryCount ?? 0) >= MAX_RETRIES) return false;
        if (!item.retryCount || !item.lastRetryAt) return true;
        const backoffDelay = Math.pow(2, item.retryCount - 1) * 5000;
        return now - item.lastRetryAt >= backoffDelay;
      });

      if (itemsToSync.length === 0) {
        isSyncingRef.current = false;
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
          if (item.type === "payment") {
            const salesRes = await fetch("/api/sales", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(item.data.salesUpdate),
            });
            if (!salesRes.ok) {
              const errData = await salesRes.json();
              throw new Error(errData.error || "Sales PATCH failed during sync");
            }

            const paymentsRes = await fetch("/api/payments", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(item.data.paymentLog),
            });
            if (!paymentsRes.ok) {
              const errData = await paymentsRes.json();
              throw new Error(errData.error || "Payments POST failed during sync");
            }

            removeEntry(item.id);
            successCount++;
          } else if (item.type === "sale_status") {
            const res = await fetch("/api/sales", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(item.data),
            });
            if (!res.ok) {
              const errData = await res.json();
              throw new Error(errData.error || "Sales Status PATCH failed during sync");
            }
            removeEntry(item.id);
            successCount++;
          } else {
            const endpoint = item.type === "sale" ? "/api/sales" : "/api/expenses";
            const payload =
              item.type === "sale"
                ? item.data.batch === true
                  ? { ...item.data, transactionId: item.id }
                  : { ...item.data, type: "array", transactionId: item.id }
                : { ...item.data, transactionId: item.id };

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
          }
        } catch (err: any) {
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

    handleSync();

    window.addEventListener("online", handleSync);
    return () => window.removeEventListener("online", handleSync);
  }, [pendingQueue.length, removeEntry, setSyncStatus, setLastSyncTime, updateEntryRetry]);

  if (exhaustedItems.length > 0 && !bannerDismissed) {
    return (
      <Box
        role="alert"
        sx={{
          position: "fixed",
          bottom: { xs: 72 + 8, md: 16 },
          left: { xs: 12, md: "auto" },
          right: { xs: 12, md: 16 },
          width: { md: 380 },
          zIndex: 1400,
          borderRadius: 4,
          bgcolor: "#dc2626",
          color: "#fff",
          p: 2,
          boxShadow: "0 20px 40px rgba(220,38,38,0.3)",
        }}
      >
        <Stack direction="row" sx={{ alignItems: "flex-start", gap: 1.5 }}>
          <Box sx={{ mt: 0.25, flexShrink: 0, opacity: 0.9 }}>
            <CloudOff size={20} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 900, lineHeight: 1.3, color: "inherit" }}>
              {exhaustedItems.length} entr{exhaustedItems.length === 1 ? "y" : "ies"} failed to sync
            </Typography>
            <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.8)", display: "block", mt: 0.5 }}>
              These records are saved locally. Tap Retry when you have a stable connection.
            </Typography>
            <Button
              size="small"
              onClick={handleForceRetry}
              startIcon={<RefreshCw size={12} />}
              sx={{
                mt: 1,
                height: 32,
                px: 2,
                borderRadius: 3,
                bgcolor: "#fff",
                color: "#dc2626",
                fontWeight: 900,
                fontSize: "0.6875rem",
                textTransform: "uppercase",
                letterSpacing: 1,
                "&:hover": { bgcolor: "rgba(255,255,255,0.9)" },
              }}
            >
              Tap to Retry
            </Button>
          </Box>
          <IconButton
            onClick={() => setBannerDismissed(true)}
            aria-label="Dismiss"
            size="small"
            sx={{ color: "#fff", flexShrink: 0, "&:hover": { bgcolor: "rgba(255,255,255,0.2)" } }}
          >
            <X size={16} />
          </IconButton>
        </Stack>
      </Box>
    );
  }

  return null;
}

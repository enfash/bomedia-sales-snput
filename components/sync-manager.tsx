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

/**
 * Statuses no amount of retrying can fix — they need a person to act
 * (restock a material, fix a value, repair credentials).
 *
 * Everything else (429 rate limits, 5xx, network failures) stays retryable.
 */
const FATAL_STATUSES = [400, 403, 404, 409];

/**
 * NOTE: classification keys off the HTTP status only — never the message text.
 * Server messages embed figures like "Needed ≈400.0ft, available 409.0ft", and
 * the old substring match on "400"/"409" turned those into permanent failures.
 */
function isFatalError(status: number | undefined): boolean {
  return typeof status === "number" && FATAL_STATUSES.includes(status);
}

function translateApiError(status: number | undefined, rawMessage: string): string {
  const msg = (rawMessage || "").trim();

  switch (status) {
    case 400:
      return msg || "Invalid entry — please check the values and re-enter.";
    case 403:
      return "Permission Denied: Please check the billing or service account status.";
    case 404:
      return "Record not found on the server. It may have been deleted.";
    case 409:
      // The server sends an actionable reason here — usually a stock shortage
      // naming the material and the shortfall. Show it verbatim; the old generic
      // "clear pending entries" text sent staff down a destructive dead end.
      return msg || "This entry conflicts with the current sheet data.";
    case 429:
      return "Google Sheets is rate-limiting us — retrying automatically.";
    case 503:
      return "Server Offline: The system is down. Please wait a moment.";
  }

  if (status && status >= 500) {
    return "Server error — retrying automatically.";
  }

  return msg || "An unexpected error occurred during sync. Please try again.";
}

export function SyncManager() {
  const {
    pendingQueue,
    syncStatus,
    setSyncStatus,
    removeEntry,
    setLastSyncTime,
    updateEntryRetry,
    updateEntryError,
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

      const performSync = async () => {
        // Read the latest state of pendingQueue to avoid race conditions and stale closures
        const currentQueue = useSyncStore.getState().pendingQueue;
        if (currentQueue.length === 0 || !navigator.onLine) {
          return;
        }

        const now = Date.now();
        const itemsToSync = currentQueue.filter((item) => {
          if ((item.retryCount ?? 0) >= MAX_RETRIES) return false;
          if (!item.retryCount || !item.lastRetryAt) return true;
          const backoffDelay = Math.pow(2, item.retryCount - 1) * 5000;
          return now - item.lastRetryAt >= backoffDelay;
        });

        if (itemsToSync.length === 0) {
          if (currentQueue.every((i) => (i.retryCount ?? 0) >= MAX_RETRIES)) {
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
          // Double check if the item hasn't been processed already
          if (!useSyncStore.getState().pendingQueue.some(q => q.id === item.id)) {
            continue;
          }
          try {
            if (item.type === "payment") {
              const salesRes = await fetch("/api/sales", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(item.data.salesUpdate),
              });
              if (!salesRes.ok) {
                const errData = await salesRes.json().catch(() => ({}));
                const error = new Error(errData.error || "Sales PATCH failed during sync");
                (error as any).status = salesRes.status;
                throw error;
              }

              const paymentsRes = await fetch("/api/payments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...item.data.paymentLog, transactionId: item.id }),
              });
              if (!paymentsRes.ok) {
                const errData = await paymentsRes.json().catch(() => ({}));
                const error = new Error(errData.error || "Payments POST failed during sync");
                (error as any).status = paymentsRes.status;
                throw error;
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
                const errData = await res.json().catch(() => ({}));
                const error = new Error(errData.error || "Sales Status PATCH failed during sync");
                (error as any).status = res.status;
                throw error;
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
                // The sale is written even when stock could not be adjusted —
                // surface that so someone reconciles the sheet by hand.
                const okData = await res.json().catch(() => ({}));
                if (okData?.inventoryWarnings?.length) {
                  toast.warning(okData.message || "Sale recorded, but stock was not updated.", {
                    duration: 10000,
                  });
                }
                removeEntry(item.id);
                successCount++;
              } else {
                const errData = await res.json().catch(() => ({}));
                const error = new Error(errData.error || `Server error (${res.status})`);
                (error as any).status = res.status;
                throw error;
              }
            }
          } catch (err: any) {
            console.error(`Failed to sync item ${item.id}:`, err);
            errorCount++;
            
            const msg = err.message || "";
            const isFatal = isFatalError(err.status);

            const newRetryCount = isFatal ? MAX_RETRIES : (item.retryCount || 0) + 1;
            updateEntryRetry(item.id, newRetryCount, Date.now());
            
            const translatedMsg = translateApiError(err.status, msg);
            useSyncStore.getState().updateEntryError(item.id, translatedMsg);
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
      };

      if (typeof window !== "undefined" && navigator.locks) {
        try {
          await navigator.locks.request("bomedia_sync_lock", async () => {
            await performSync();
          });
        } catch (e) {
          console.error("Lock error:", e);
        } finally {
          isSyncingRef.current = false;
        }
      } else {
        try {
          await performSync();
        } finally {
          isSyncingRef.current = false;
        }
      }
    };

    handleSync();

    let intervalId: any = null;
    if (pendingQueue.length > 0) {
      intervalId = setInterval(() => {
        handleSync();
      }, 15000);
    }

    window.addEventListener("online", handleSync);
    return () => {
      if (intervalId) clearInterval(intervalId);
      window.removeEventListener("online", handleSync);
    };
  }, [pendingQueue.length, removeEntry, setSyncStatus, setLastSyncTime, updateEntryRetry, updateEntryError]);

  if (exhaustedItems.length > 0 && !bannerDismissed) {
    return (
      <Box
        role="alert"
        sx={{
          position: "fixed",
          bottom: { xs: 72 + 24 + 8, md: 16 },
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
            
            <Box sx={{ mt: 1, maxHeight: '80px', overflowY: 'auto' }}>
              {exhaustedItems.map((item, idx) => (
                <Typography key={item.id} variant="caption" sx={{ color: "rgba(255,255,255,0.9)", display: "block", mb: 0.5, lineHeight: 1.2 }}>
                  <strong style={{ opacity: 0.8 }}>Item {idx + 1}:</strong> {item.lastError || "Network error or unavailable"}
                </Typography>
              ))}
            </Box>

            <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.7)", display: "block", mt: 1, fontStyle: 'italic' }}>
              These records are saved locally.
            </Typography>
            <Button
              size="small"
              onClick={handleForceRetry}
              startIcon={<RefreshCw size={12} />}
              sx={{
                mt: 1.5,
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

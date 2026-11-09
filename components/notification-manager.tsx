"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useSyncStore } from "@/lib/store";
import { toast } from "sonner";
import { Package } from "lucide-react";
import { createNotificationPoller, type NotificationFeeds } from "@/lib/notification-polling";
import { shellVisible } from "@/lib/session-view";

const parseAmount = (val: any): number => {
  if (val === undefined || val === null) return 0;
  const str = val.toString().replace(/[₦,\s]/g, "");
  return parseFloat(str) || 0;
};

export function NotificationManager() {
  const pathname = usePathname();
  const enabled = shellVisible(pathname) && !pathname.includes('/login');
  const area = pathname.startsWith('/bom03') ? 'owner' : 'cashier';

  useEffect(() => {
    if (!enabled) return;
    let lastSalesIndex = 0;
    let lastExpensesIndex = 0;
    let isInitialLoad = true;
    const alertedInventoryRows = new Set<string>();
    const apply = ([newSales, newExpenses, newInventory, newMaterials]: NotificationFeeds) => {
      // Update baseline on initial load
      if (isInitialLoad) {
        lastSalesIndex = Math.max(0, ...newSales.map((r: any) => r._rowIndex || 0));
        lastExpensesIndex = Math.max(0, ...newExpenses.map((r: any) => r._rowIndex || 0));
        isInitialLoad = false;
        
        // Baseline: mark already-low materials so we don't alert on first load
        newMaterials.forEach((mat: any) => {
          const remaining = parseFloat(mat["Total Remaining (ft)"]?.toString() || "0") || 0;
          const threshold = parseFloat(mat["Low Stock Threshold (ft)"]?.toString() || "20") || 20;
          if (remaining <= threshold) alertedInventoryRows.add(mat["Material ID"]);
        });

        useSyncStore.getState().setCachedData(newSales, newExpenses, newInventory, undefined, newMaterials);
        return;
      }

      let hasNewActivity = false;

      // 1. Check for new sales
      const freshSales = newSales.filter((r: any) => (r._rowIndex || 0) > lastSalesIndex);
      if (freshSales.length > 0) {
        hasNewActivity = true;
        freshSales.forEach((sale: any) => {
          const total = parseAmount(sale["AMOUNT (₦)"] ?? sale["Amount (₦)"] ?? sale["TOTAL"] ?? sale["Total"]);
          const paid = parseAmount(sale["INITIAL PAYMENT (₦)"] || sale["INITIAL PAYMENT"] || sale["Initial Payment"]);
          const client = sale["CLIENT NAME"] || sale["Client Name"] || "New Client";
          const cashier = sale["LOGGED BY"] || sale["Logged By"] || "Staff";
          
          toast.success(`New Sale: ₦${total.toLocaleString()} - ${client}`, {
            description: `Paid: ₦${paid.toLocaleString()} | Logged by ${cashier}`,
            duration: 5000,
          });
        });
        lastSalesIndex = Math.max(lastSalesIndex, ...newSales.map((r: any) => r._rowIndex || 0));
      }

      // 2. Check for new expenses
      const freshExpenses = newExpenses.filter((r: any) => (r._rowIndex || 0) > lastExpensesIndex);
      if (freshExpenses.length > 0) {
        hasNewActivity = true;
        freshExpenses.forEach((expense: any) => {
          const amount = parseAmount(expense["Amount (₦)"] || expense.AMOUNT || expense.Amount);
          const category = expense.CATEGORY || expense.Category || "Other";
          const cashier = expense["LOGGED BY"] || expense["Logged By"] || "Staff";
          toast.info(`New Expense: ₦${amount.toLocaleString()} (${category})`, {
            description: `Logged by ${cashier}`,
            duration: 5000,
          });
        });
        lastExpensesIndex = Math.max(lastExpensesIndex, ...newExpenses.map((r: any) => r._rowIndex || 0));
      }

      // 3. Check for Low Stock at the material level (aggregate across all rolls)
      newMaterials.forEach((mat: any) => {
        const matId = mat["Material ID"];
        const remaining = parseFloat(mat["Total Remaining (ft)"]?.toString() || "0") || 0;
        const threshold = parseFloat(mat["Low Stock Threshold (ft)"]?.toString() || "20") || 20;

        if (remaining <= threshold && !alertedInventoryRows.has(matId)) {
          toast.error(`Low Stock: ${mat["Material Name"]}`, {
            description: `Only ${remaining.toFixed(1)} ft remaining across all rolls.`,
            icon: <Package size={16} />,
            duration: 8000,
          });
          alertedInventoryRows.add(matId);
          hasNewActivity = true;
        } else if (remaining > threshold) {
          alertedInventoryRows.delete(matId);
        }
      });

      // Update Store Cache
      useSyncStore.getState().setCachedData(newSales, newExpenses, newInventory, undefined, newMaterials);

      // Sound Notification
      if (hasNewActivity) {
        const isMuted = localStorage.getItem("bomedia-muted") === "true";
        if (!isMuted) {
          const audio = new Audio("/notification.mp3");
          audio.play().catch(() => {});
        }

        // Custom Event for PWAManager
        window.dispatchEvent(new CustomEvent("bomedia-notify", {
          detail: {
            title: "New BOMedia Activity",
            body: `${freshSales.length > 0 ? freshSales.length + " new sale(s). " : ""}${freshExpenses.length > 0 ? freshExpenses.length + " new expense(s)." : ""}`
          }
        }));
      }

    };
    let storage: Storage | undefined;
    try { storage = window.localStorage; } catch { /* Poll independently if storage is unavailable. */ }
    const poller = createNotificationPoller({
      send: (...args) => window.fetch(...args),
      storage,
      locks: navigator.locks,
      scope: () => {
        try { return JSON.stringify([area, storage?.getItem('userName'), storage?.getItem('bomedia-payment-context-v1')]); }
        catch { return area; }
      },
      enabled: () => document.visibilityState === 'visible' && navigator.onLine,
      cacheVersion: () => useSyncStore.getState(),
      apply,
    });
    poller.start();
    window.addEventListener('online', poller.wake);
    window.addEventListener('focus', poller.wake);
    document.addEventListener('visibilitychange', poller.wake);
    window.addEventListener('pointerdown', poller.activity, { passive: true });
    window.addEventListener('keydown', poller.activity);
    window.addEventListener('bomedia-data-changed', poller.changed);
    return () => {
      poller.stop();
      window.removeEventListener('online', poller.wake);
      window.removeEventListener('focus', poller.wake);
      document.removeEventListener('visibilitychange', poller.wake);
      window.removeEventListener('pointerdown', poller.activity);
      window.removeEventListener('keydown', poller.activity);
      window.removeEventListener('bomedia-data-changed', poller.changed);
    };
  }, [enabled, area]);

  return null;
}

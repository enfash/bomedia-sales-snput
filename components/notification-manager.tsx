"use client";

import { useEffect, useRef, useState } from "react";
import { useSyncStore } from "@/lib/store";
import { toast } from "sonner";
import { Volume2, VolumeX, Package } from "lucide-react";

const parseAmount = (val: any): number => {
  if (val === undefined || val === null) return 0;
  const str = val.toString().replace(/[₦,\s]/g, "");
  return parseFloat(str) || 0;
};

export function NotificationManager() {
  const { cachedSales, cachedExpenses, cachedPayments, cachedMaterials, setCachedData } = useSyncStore();
  
  const lastSalesIndex = useRef<number>(0);
  const lastExpensesIndex = useRef<number>(0);
  const isInitialLoad = useRef<boolean>(true);
  const [inventoryData, setInventoryData] = useState<any[]>([]);
  const alertedInventoryRows = useRef<Set<string>>(new Set());

  const isFetching = useRef(false);

  const fetchData = async () => {
    if (isFetching.current) return;
    isFetching.current = true;
    try {
      const [salesRes, expensesRes, inventoryRes, materialsRes] = await Promise.all([
        fetch("/api/sales"),
        fetch("/api/expenses"),
        fetch("/api/inventory"),
        fetch("/api/materials"),
      ]);

      if (!salesRes.ok || !expensesRes.ok || !inventoryRes.ok || !materialsRes.ok) {
        if (salesRes.status === 429 || expensesRes.status === 429 || inventoryRes.status === 429 || materialsRes.status === 429) {
          console.warn("NotificationManager: Rate limit hit, skipping poll.");
        }
        return;
      }

      const salesJson = await salesRes.json();
      const expensesJson = await expensesRes.json();
      const inventoryJson = await inventoryRes.json();
      const materialsJson = await materialsRes.json();

      const newSales = salesJson.data ?? [];
      const newExpenses = expensesJson.data ?? [];
      const newInventory = inventoryJson.data ?? [];
      const newMaterials = materialsJson.data ?? [];

      // Update baseline on initial load
      if (isInitialLoad.current && newSales.length > 0) {
        lastSalesIndex.current = Math.max(0, ...newSales.map((r: any) => r._rowIndex || 0));
        lastExpensesIndex.current = Math.max(0, ...newExpenses.map((r: any) => r._rowIndex || 0));
        isInitialLoad.current = false;
        
        // Baseline: mark already-low materials so we don't alert on first load
        newMaterials.forEach((mat: any) => {
          const remaining = parseFloat(mat["Total Remaining (ft)"]?.toString() || "0") || 0;
          const threshold = parseFloat(mat["Low Stock Threshold (ft)"]?.toString() || "20") || 20;
          if (remaining <= threshold) alertedInventoryRows.current.add(mat["Material ID"]);
        });

        setCachedData(newSales, newExpenses, newInventory, cachedPayments, newMaterials);
        return;
      }

      let hasNewActivity = false;

      // 1. Check for new sales
      const freshSales = newSales.filter((r: any) => (r._rowIndex || 0) > lastSalesIndex.current);
      if (freshSales.length > 0) {
        hasNewActivity = true;
        freshSales.forEach((sale: any) => {
          const total = parseAmount(sale["TOTAL"] || sale["Total"]);
          const paid = parseAmount(sale["INITIAL PAYMENT (₦)"] || sale["INITIAL PAYMENT"] || sale["Initial Payment"]);
          const client = sale["CLIENT NAME"] || sale["Client Name"] || "New Client";
          const cashier = sale["LOGGED BY"] || sale["Logged By"] || "Staff";
          
          toast.success(`New Sale: ₦${total.toLocaleString()} - ${client}`, {
            description: `Paid: ₦${paid.toLocaleString()} | Logged by ${cashier}`,
            duration: 5000,
          });
        });
        lastSalesIndex.current = Math.max(lastSalesIndex.current, ...newSales.map((r: any) => r._rowIndex || 0));
      }

      // 2. Check for new expenses
      const freshExpenses = newExpenses.filter((r: any) => (r._rowIndex || 0) > lastExpensesIndex.current);
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
        lastExpensesIndex.current = Math.max(lastExpensesIndex.current, ...newExpenses.map((r: any) => r._rowIndex || 0));
      }

      // 3. Check for Low Stock at the material level (aggregate across all rolls)
      newMaterials.forEach((mat: any) => {
        const matId = mat["Material ID"];
        const remaining = parseFloat(mat["Total Remaining (ft)"]?.toString() || "0") || 0;
        const threshold = parseFloat(mat["Low Stock Threshold (ft)"]?.toString() || "20") || 20;

        if (remaining <= threshold && !alertedInventoryRows.current.has(matId)) {
          toast.error(`Low Stock: ${mat["Material Name"]}`, {
            description: `Only ${remaining.toFixed(1)} ft remaining across all rolls.`,
            icon: <Package className="w-4 h-4" />,
            duration: 8000,
          });
          alertedInventoryRows.current.add(matId);
          hasNewActivity = true;
        } else if (remaining > threshold) {
          alertedInventoryRows.current.delete(matId);
        }
      });

      // Update Store Cache
      setCachedData(newSales, newExpenses, newInventory, cachedPayments, newMaterials);

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

    } catch (error) {
      console.error("NotificationManager Sync Error:", error);
    } finally {
      isFetching.current = false;
    }
  };

  useEffect(() => {
    // Delay the first poll so it doesn't race with the page's own initial fetch.
    // The dashboard populates the store on mount; NotificationManager only needs
    // to watch for *new* activity after that settles.
    let interval: ReturnType<typeof setInterval> | null = null;

    const timer = setTimeout(() => {
      fetchData();
      interval = setInterval(fetchData, 30000);
      window.addEventListener("online", fetchData);
    }, 25000);

    return () => {
      clearTimeout(timer);
      if (interval) clearInterval(interval);
      window.removeEventListener("online", fetchData);
    };
  }, []);

  return null;
}

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
  const { cachedSales, cachedExpenses, setCachedData } = useSyncStore();
  
  const lastSalesIndex = useRef<number>(0);
  const lastExpensesIndex = useRef<number>(0);
  const isInitialLoad = useRef<boolean>(true);
  const [inventoryData, setInventoryData] = useState<any[]>([]);
  const alertedInventoryRows = useRef<Set<number>>(new Set());

  const fetchData = async () => {
    try {
      const [salesRes, expensesRes, inventoryRes] = await Promise.all([
        fetch("/api/sales"),
        fetch("/api/expenses"),
        fetch("/api/inventory"),
      ]);

      if (!salesRes.ok || !expensesRes.ok || !inventoryRes.ok) return;

      const salesJson = await salesRes.json();
      const expensesJson = await expensesRes.json();
      const inventoryJson = await inventoryRes.json();
      
      const newSales = salesJson.data ?? [];
      const newExpenses = expensesJson.data ?? [];
      const newInventory = inventoryJson.data ?? [];

      // Update baseline on initial load
      if (isInitialLoad.current && newSales.length > 0) {
        lastSalesIndex.current = Math.max(0, ...newSales.map((r: any) => r._rowIndex || 0));
        lastExpensesIndex.current = Math.max(0, ...newExpenses.map((r: any) => r._rowIndex || 0));
        isInitialLoad.current = false;
        
        // Initial inventory alert baseline (don't alert on existing low stock)
        newInventory.forEach((item: any) => {
          const stock = parseFloat(item.Stock?.toString() || "0") || 0;
          if (stock <= 50) alertedInventoryRows.current.add(item._rowIndex);
        });
        
        setCachedData(newSales, newExpenses, newInventory);
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

      // 3. Check for Critical Inventory Alerts
      newInventory.forEach((item: any) => {
        const stock = parseFloat(item.Stock?.toString() || "0") || 0;
        if (stock <= 50 && !alertedInventoryRows.current.has(item._rowIndex)) {
          toast.error(`Critical Stock: ${item["Item Name"]}`, {
            description: `Only ${stock.toFixed(1)} sqft remaining!`,
            icon: <Package className="w-4 h-4" />,
            duration: 8000,
          });
          alertedInventoryRows.current.add(item._rowIndex);
          hasNewActivity = true;
        } else if (stock > 50) {
          alertedInventoryRows.current.delete(item._rowIndex);
        }
      });

      // Update Store Cache
      setCachedData(newSales, newExpenses, newInventory);

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
    }
  };

  useEffect(() => {
    // Initial fetch
    fetchData();

    // Set up polling
    const interval = setInterval(fetchData, 30000);
    
    // Listen for manual refreshes
    window.addEventListener("online", fetchData);

    return () => {
      clearInterval(interval);
      window.removeEventListener("online", fetchData);
    };
  }, []);

  return null;
}

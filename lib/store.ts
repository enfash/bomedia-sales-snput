/* eslint-disable @typescript-eslint/no-explicit-any */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type QueueItem = {
  id: string;
  type: 'sale' | 'expense' | 'payment' | 'sale_status';
  data: any; // The payload as an array (for sales) or object (for expenses/payments/sale_status)
  timestamp: number;
  retryCount?: number;
  lastRetryAt?: number;
};

interface SyncState {
  pendingQueue: QueueItem[];
  lastSyncTime: number | null;
  syncStatus: 'idle' | 'syncing' | 'error';
  errorMessage: string | null;
  
  // Actions
  addPendingEntry: (type: 'sale' | 'expense' | 'payment', data: any) => void;
  removeEntry: (id: string) => void;
  setSyncStatus: (status: 'idle' | 'syncing' | 'error', error?: string) => void;
  setLastSyncTime: (time: number) => void;
  clearQueue: () => void;
  
  // Cache Actions
  cachedSales: any[];
  cachedExpenses: any[];
  cachedInventory: any[];
  cachedMaterials: any[];
  cachedPayments: any[];
  setCachedData: (sales: any[], expenses: any[], inventory?: any[], payments?: any[], materials?: any[]) => void;
  updateEntryRetry: (id: string, retryCount: number, lastRetryAt: number) => void;
  updateSaleStatus: (saleId: string, rowIndex: number | undefined, newStatus: string) => void;
}

const parseAmountLocal = (val: any): number => {
  if (val === undefined || val === null) return 0;
  const str = val.toString().replace(/[₦, \s]/g, "");
  return parseFloat(str) || 0;
};

export const useSyncStore = create<SyncState>()(
  persist(
    (set) => ({
      pendingQueue: [],
      lastSyncTime: null,
      syncStatus: 'idle',
      errorMessage: null,
      cachedSales: [],
      cachedExpenses: [],
      cachedInventory: [],
      cachedMaterials: [],
      cachedPayments: [],

      addPendingEntry: (type, data) => set((state) => {
        let updatedMaterials = [...state.cachedMaterials];
        let updatedSales = [...state.cachedSales];
        let updatedPayments = [...state.cachedPayments];

        // 1. Optimistic Offline Inventory updates for sales
        if (type === 'sale' && data.batch === true && Array.isArray(data.items)) {
          data.items.forEach((item: any) => {
            const matId = item.canonicalItemName;
            const consumedLength = parseFloat(item.jobLengthFt) || 0;
            if (matId && consumedLength > 0) {
              updatedMaterials = updatedMaterials.map((m) => {
                if (m["Material ID"] === matId) {
                  const currentRemaining = parseFloat(m["Total Remaining (ft)"] || "0") || 0;
                  const newRemaining = Math.max(0, currentRemaining - consumedLength);
                  
                  let newStatus = 'Active';
                  const threshold = parseFloat(m["Low Stock Threshold (ft)"] || "20") || 20;
                  if (newRemaining <= 0.1) newStatus = 'Out of Stock';
                  else if (newRemaining <= threshold) newStatus = 'Low Stock';

                  return {
                    ...m,
                    "Total Remaining (ft)": newRemaining.toFixed(2),
                    "Status": newStatus,
                  };
                }
                return m;
              });
            }
          });
        } 
        
        // 2. Optimistic Offline payments/balance updates
        else if (type === 'payment') {
          const { salesUpdate, paymentLog } = data;
          const { rowIndex, additionalPayment1, additionalPayment2 } = salesUpdate;

          // Update the balance inside the cachedSales matching record
          updatedSales = updatedSales.map((s: any) => {
            if (s._rowIndex === rowIndex || s.rowNumber === rowIndex) {
              const updatedRow = { ...s };
              if (additionalPayment1 !== undefined) {
                updatedRow["ADDITIONAL PAYMENT 1"] = additionalPayment1;
              }
              if (additionalPayment2 !== undefined) {
                updatedRow["ADDITIONAL PAYMENT 2"] = additionalPayment2;
              }

              // Recalculate financial balance and payment status (mimics Google Sheets formulas locally)
              const amount = parseAmountLocal(updatedRow["AMOUNT (₦)"] || updatedRow["Amount (₦)"]);
              const initialPay = parseAmountLocal(updatedRow["INITIAL PAYMENT (₦)"] || updatedRow["Initial Payment (₦)"]);
              const addl1 = parseAmountLocal(updatedRow["ADDITIONAL PAYMENT 1"] || updatedRow["Additional Payment 1"]);
              const addl2 = parseAmountLocal(updatedRow["ADDITIONAL PAYMENT 2"] || updatedRow["Additional Payment 2"]);
              const balance = Math.max(0, amount - initialPay - addl1 - addl2);

              updatedRow["AMOUNT DIFFERENCES"] = balance;
              updatedRow["PAYMENT STATUS"] = amount === 0 
                ? "Unpaid" 
                : balance <= 0 
                  ? "Paid" 
                  : balance < amount 
                    ? "Part-payment" 
                    : "Unpaid";
              
              return updatedRow;
            }
            return s;
          });

          // Prepend optimistic payment to cachedPayments feed
          updatedPayments = [
            {
              "PAYMENT ID": `PAY-PENDING-${Date.now()}`,
              "SALES ID": paymentLog.salesId || '',
              "CLIENT NAME": paymentLog.clientName || '',
              "DATE": paymentLog.date || new Date().toISOString().split('T')[0],
              "AMOUNT": paymentLog.amount || 0,
              "PAYMENT TYPE": paymentLog.paymentType || 'Additional Payment',
              "BALANCE BEFORE": paymentLog.balanceBefore || 0,
              "BALANCE AFTER": paymentLog.balanceAfter || 0,
              "COLLECTED BY": paymentLog.collectedBy || 'System',
              "NOTES": (paymentLog.notes || '') + " (Offline Pending)",
              "TIMESTAMP": new Date().toISOString(),
            },
            ...updatedPayments,
          ];
        }

        return {
          pendingQueue: [
            ...state.pendingQueue,
            {
              id: crypto.randomUUID(),
              type,
              data,
              timestamp: Date.now(),
            }
          ],
          cachedMaterials: updatedMaterials,
          cachedSales: updatedSales,
          cachedPayments: updatedPayments,
        };
      }),

      updateSaleStatus: (saleId, rowIndex, newStatus) => set((state) => {
        const updatedSales = state.cachedSales.map(sale => {
          if (
            (saleId && (sale["Sales ID"] === saleId || sale["SALES ID"] === saleId)) || 
            (rowIndex && (sale._rowIndex === rowIndex || sale.rowNumber === rowIndex))
          ) {
            return { ...sale, "JOB STATUS": newStatus, "Job Status": newStatus };
          }
          return sale;
        });

        return {
          cachedSales: updatedSales,
          pendingQueue: [
            ...state.pendingQueue,
            {
              id: crypto.randomUUID(),
              type: 'sale_status',
              data: { saleId, rowIndex, jobStatus: newStatus },
              timestamp: Date.now(),
            }
          ]
        };
      }),

      removeEntry: (id) => set((state) => ({
        pendingQueue: state.pendingQueue.filter(item => item.id !== id)
      })),

      setSyncStatus: (status, error) => set({ 
        syncStatus: status, 
        errorMessage: error || null 
      }),

      setLastSyncTime: (time) => set({ lastSyncTime: time }),
      
      clearQueue: () => set({ pendingQueue: [] }),

      updateEntryRetry: (id, retryCount, lastRetryAt) => set((state) => ({
        pendingQueue: state.pendingQueue.map(item => 
          item.id === id ? { ...item, retryCount, lastRetryAt } : item
        )
      })),

      setCachedData: (sales, expenses, inventory, payments, materials) => {
        if (process.env.NODE_ENV !== 'production') {
          if (!Array.isArray(sales))
            console.warn('[setCachedData] arg 1 (sales) must be an array, got:', typeof sales);
          if (!Array.isArray(expenses))
            console.warn('[setCachedData] arg 2 (expenses) must be an array, got:', typeof expenses);
        }
        return set((state) => ({
          cachedSales: sales,
          cachedExpenses: expenses,
          // ?? so only undefined/null falls back — an explicit [] correctly empties the slice
          cachedInventory: inventory ?? state.cachedInventory,
          cachedPayments: payments?.length ? payments : state.cachedPayments,
          cachedMaterials: materials ?? state.cachedMaterials,
        }));
      },
    }),
    {
      name: 'bomedia-sync-storage',
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
    }
  )
);

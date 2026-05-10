/* eslint-disable @typescript-eslint/no-explicit-any */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type QueueItem = {
  id: string;
  type: 'sale' | 'expense';
  data: any; // The payload as an array (for sales) or object (for expenses)
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
  addPendingEntry: (type: 'sale' | 'expense', data: any) => void;
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
}

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

      addPendingEntry: (type, data) => set((state) => ({
        pendingQueue: [
          ...state.pendingQueue,
          {
            id: crypto.randomUUID(),
            type,
            data,
            timestamp: Date.now(),
          }
        ]
      })),

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
          cachedPayments: payments ?? state.cachedPayments,
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

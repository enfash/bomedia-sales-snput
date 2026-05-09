"use client";

import { JobBoard } from "@/components/job-board";
import { useState, useEffect } from "react";
import { useSyncStore } from "@/lib/store";
import { OutstandingDebtChart } from "@/components/dashboard-charts";
import { DebtorPaymentModal } from "@/components/debtor-payment-modal";
import { processDebtData } from "@/lib/financial-utils";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { AlertCircle, Wallet, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CashierBoardPage() {
  const [selectedDebtor, setSelectedDebtor] = useState<string | null>(null);
  const { cachedSales, setCachedData, cachedExpenses, cachedInventory, cachedPayments, cachedMaterials } = useSyncStore();
  const [loading, setLoading] = useState(cachedSales.length === 0);

  const fetchData = async () => {
    try {
      const res = await fetch("/api/sales");
      const json = await res.json();
      setCachedData(json.data ?? cachedSales, cachedExpenses, cachedInventory, cachedPayments, cachedMaterials);
    } catch (e) {
      console.error("Failed to fetch sales for board metrics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const { chartData } = processDebtData(cachedSales || [], 5);
  const { chartData: allDebtors, totalDebt } = processDebtData(cachedSales || [], 50);

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-gray-900 dark:text-white tracking-tight">Job Board</h1>
          <p className="text-gray-500 dark:text-zinc-400 mt-1 font-medium">Track sales jobs through production.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <JobBoard isAdmin={false} filterClient={selectedDebtor} />
        </div>

        <div className="lg:col-span-1 space-y-6">
          {/* Chart — click a bar to open modal */}
          <Card className="border-none shadow-xl shadow-orange-500/5 bg-white dark:bg-zinc-900 overflow-hidden">
            <CardHeader className="bg-amber-600 text-white p-4">
              <CardTitle className="text-sm font-black flex items-center gap-2 uppercase tracking-widest">
                <AlertCircle className="w-4 h-4" />
                Outstanding Debts
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <OutstandingDebtChart data={chartData} onClientClick={setSelectedDebtor} />
            </CardContent>
          </Card>

          {/* Debtors list with Collect Payment button */}
          {allDebtors.length > 0 && (
            <Card className="border-none shadow-xl shadow-orange-500/5 bg-white dark:bg-zinc-900 overflow-hidden">
              <CardHeader className="p-4 border-b border-gray-100 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-black flex items-center gap-2 text-gray-800 dark:text-white uppercase tracking-widest">
                    <Wallet className="w-4 h-4 text-amber-600" />
                    Collect Payments
                  </CardTitle>
                  <span className="text-[10px] font-black text-rose-500 uppercase tracking-wider">
                    ₦{totalDebt.toLocaleString()} total
                  </span>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-gray-50 dark:divide-zinc-800 max-h-[360px] overflow-y-auto">
                  {allDebtors.map((debtor) => (
                    <div
                      key={debtor.name}
                      className="flex items-center justify-between px-4 py-3 hover:bg-amber-50/50 dark:hover:bg-zinc-800/50 transition-colors group"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-black text-gray-900 dark:text-white truncate">
                          {debtor.name}
                        </p>
                        <p className="text-xs font-bold text-rose-500 dark:text-rose-400 mt-0.5">
                          ₦{debtor.balance.toLocaleString()}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => setSelectedDebtor(debtor.name)}
                        className="ml-3 h-8 px-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shrink-0 shadow-sm"
                      >
                        Collect
                        <ChevronRight className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <DebtorPaymentModal
        clientName={selectedDebtor}
        isOpen={!!selectedDebtor}
        onClose={() => setSelectedDebtor(null)}
        onUpdate={() => fetchData()}
        theme="amber"
      />
    </div>
  );
}

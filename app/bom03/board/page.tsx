"use client";

import { JobBoard } from "@/components/job-board";
import { useState, useEffect } from "react";
import { useSyncStore } from "@/lib/store";
import { OutstandingDebtChart } from "@/components/dashboard-charts";
import { DebtorPaymentModal } from "@/components/debtor-payment-modal";
import { processDebtData } from "@/lib/financial-utils";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

export default function AdminBoardPage() {
  const [selectedDebtor, setSelectedDebtor] = useState<string | null>(null);
  const { cachedSales, setCachedData, cachedExpenses } = useSyncStore();
  const [loading, setLoading] = useState(cachedSales.length === 0);

  const fetchData = async () => {
    try {
      const res = await fetch("/api/sales");
      const json = await res.json();
      setCachedData(json.data || [], cachedExpenses);
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

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-gray-900 dark:text-white tracking-tight">Production Board</h1>
          <p className="text-gray-500 dark:text-zinc-400 mt-1 font-medium">Track and manage jobs across production stages.</p>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <JobBoard isAdmin={true} filterClient={selectedDebtor || undefined} />
        </div>
        <div className="lg:col-span-1 space-y-6">
          <Card className="border-none shadow-xl shadow-brand-500/5 bg-white dark:bg-zinc-900 overflow-hidden">
            <CardHeader className="bg-brand-700 text-white p-4">
              <CardTitle className="text-sm font-black flex items-center gap-2 uppercase tracking-widest">
                <BarChart3 className="w-4 h-4" />
                Top Debts
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
               <OutstandingDebtChart data={chartData} onClientClick={setSelectedDebtor} />
            </CardContent>
          </Card>
        </div>
      </div>

      <DebtorPaymentModal 
        clientName={selectedDebtor} 
        isOpen={!!selectedDebtor} 
        onClose={() => setSelectedDebtor(null)} 
        onUpdate={() => fetchData()}
        theme="brand"
      />
    </div>
  );
}

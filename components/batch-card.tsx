"use client";

import { type UnifiedRecord } from "@/components/manage-sale-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Printer, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRef, useState } from "react";
import { ReceiptModal } from "./receipt-modal";
import { ManageBatchAction } from "./manage-batch-action";
import { RecordCard, RecordStatus } from "./record-card";
import { toast } from "sonner";

interface BatchCardProps {
  salesId: string;
  records: UnifiedRecord[];
  onUpdate: () => void;
}

export function BatchCard({ salesId, records, onUpdate }: BatchCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);

  const firstItem = records[0];
  const totalAmt = records.reduce((s, i) => s + i.amount, 0);
  const totalBal = records.reduce((s, i) => s + (i.balance || 0), 0);

  const groupStatus = (items: UnifiedRecord[]): RecordStatus => {
    if (items.some(i => i.status === "Syncing")) return "Syncing";
    if (items.every(i => i.status === "Settled")) return "Settled";
    if (items.some(i => i.status === "Part-payment" || i.status === "Settled")) return "Part-payment";
    return "In Progress";
  };

  const status = groupStatus(records);

  const statusColors: Record<RecordStatus, string> = {
    Settled: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    "Part-payment": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    "In Progress": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    Syncing: "bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-foreground animate-pulse",
  };

  const handleGenerateReceipt = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsReceiptModalOpen(true);
  };

  return (
    <div className={cn(
      "bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-xl shadow-sm mb-2.5 overflow-hidden transition-all duration-300",
      isExpanded ? "ring-1 ring-primary/20" : ""
    )}>
      {/* Header / Summary Section */}
      <div 
        className="p-5 cursor-pointer hover:bg-gray-50/50 dark:hover:bg-zinc-800/30"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center gap-2">
            <div className={cn(
              "p-1 rounded-md bg-gray-100 dark:bg-zinc-800 text-gray-500 transition-transform duration-200",
              isExpanded ? "rotate-90" : ""
            )}>
              <ChevronRight className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-black text-primary uppercase tracking-wider">{firstItem.date}</span>
              <h3 className="text-sm font-black text-gray-900 dark:text-white leading-tight">{firstItem.client}</h3>
              <p className="text-[10px] text-gray-500 font-medium">{salesId}</p>
            </div>
          </div>
          <Badge className={cn("text-[9px] px-2 py-0.5 rounded-full font-black border-none", statusColors[status])}>
            {status}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-3 border-t border-gray-50 dark:border-zinc-800/50">
          <div>
            <p className="text-[9px] font-bold uppercase text-gray-400 tracking-wider mb-0.5">Total Amount</p>
            <p className="text-sm font-black text-gray-900 dark:text-white">₦{totalAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-bold uppercase text-rose-400 tracking-wider mb-0.5">Total Balance</p>
            <p className="text-sm font-black text-rose-600 dark:text-rose-400">₦{totalBal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between">
            <Badge variant="outline" className="bg-primary/5 dark:bg-primary/10 text-primary border-primary/20 text-[9px] font-black">
                {records.length} ITEMS IN BATCH
            </Badge>
            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 text-primary border-primary/20"
                    onClick={handleGenerateReceipt}
                >
                    <Printer className="w-4 h-4" />
                </Button>
                <ManageBatchAction records={records} salesId={salesId} onUpdate={onUpdate} />
            </div>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="bg-gray-50/50 dark:bg-zinc-950/30 p-3 space-y-2 border-t border-gray-50 dark:border-zinc-800/50">
          {records.map((r, idx) => (
            <RecordCard
              key={r.id || idx}
              date={r.date}
              type={r.type}
              client={r.client}
              description={r.description}
              amount={`₦${r.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
              status={r.status}
              isPending={r.isPending}
              record={r}
              onUpdate={onUpdate}
              allSalesContext={records}
            />
          ))}
        </div>
      )}

      <ReceiptModal 
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        records={records}
        salesId={salesId}
      />
    </div>
  );
}

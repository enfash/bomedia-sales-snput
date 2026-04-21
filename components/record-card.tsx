"use client";

import { ManageSaleAction, type UnifiedRecord } from "@/components/manage-sale-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { MaterialBadge } from "./material-badge";

export type RecordStatus = "Settled" | "Part-payment" | "In Progress" | "Syncing";

interface RecordCardProps {
  date: string;
  type: string;
  client: string;
  description: string;
  amount: string;
  status: RecordStatus;
  isPending?: boolean;
  record?: UnifiedRecord;
  onUpdate?: () => void;
}

export function RecordCard({ date, type, client, description, amount, status, isPending, record, onUpdate }: RecordCardProps) {
  const statusColors: Record<RecordStatus, string> = {
    Settled: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40",
    "Part-payment": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40",
    "In Progress": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40",
    Syncing: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 animate-pulse hover:bg-indigo-100 dark:hover:bg-indigo-900/40",
  };

  // Left accent border by record type
  const isExpense = type === "Expense";
  const accentBorder = isPending
    ? "border-l-[3px] border-l-indigo-400"
    : isExpense
    ? "border-l-[3px] border-l-amber-400"
    : "border-l-[3px] border-l-primary/50";

  return (
    <div className={cn(
      "p-5 bg-white dark:bg-zinc-900 border rounded-xl shadow-sm mb-2.5 transition-colors duration-300",
      accentBorder,
      isPending
        ? "border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/10 dark:bg-indigo-900/10"
        : "border-gray-100 dark:border-zinc-800"
    )}>
      <div className="flex justify-between items-start mb-3 pb-3 border-b border-gray-50 dark:border-zinc-800/80">
        <div>
          <span className="text-xs font-semibold text-gray-500 dark:text-zinc-500 block leading-none mb-1">{date}</span>
          <span className="text-[9px] font-bold uppercase text-primary/80 dark:text-primary/60 tracking-wider">Amount: {amount}</span>
        </div>
        <div className="text-right">
          <span className="text-[9px] font-bold uppercase text-rose-400 dark:text-rose-500 block leading-none mb-1 tracking-wider">Difference</span>
          <span className="text-sm font-black text-rose-600 dark:text-rose-400 leading-none">{record?.type === "Sale" ? `₦${(record.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "—"}</span>
        </div>
      </div>
      
      <div className="flex justify-between items-end">
        <div className="space-y-1">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-tight leading-none mb-0.5">Client/Payee</p>
            <p className="text-sm font-bold text-gray-800 dark:text-zinc-100">{client}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-zinc-400">
              <span className="font-semibold text-gray-600 dark:text-zinc-300">Description:</span> {description}
            </p>
          </div>
        </div>
        
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2">
            {record?.type === "Sale" && record?.material && (
              <MaterialBadge material={record.material} />
            )}
            <Badge className={`text-[10px] px-2 py-0 rounded-full font-semibold border-none ${statusColors[status] || "bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-400"}`}>
              {status}
            </Badge>
          </div>
          {record && onUpdate ? (
            <ManageSaleAction record={record} onUpdate={onUpdate} variant="button" />
          ) : (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 dark:text-zinc-600">
               <MoreHorizontal className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

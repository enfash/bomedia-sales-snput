"use client";

import { ManageSaleAction, type UnifiedRecord } from "@/components/manage-sale-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MoreHorizontal } from "lucide-react";

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

export function RecordCard({ date, client, description, amount, status, isPending, record, onUpdate }: RecordCardProps) {
  const statusColors: Record<RecordStatus, string> = {
    Settled: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
    "Part-payment": "bg-amber-100 text-amber-700 hover:bg-amber-100",
    "In Progress": "bg-blue-100 text-blue-700 hover:bg-blue-100",
    Syncing: "bg-indigo-100 text-indigo-700 animate-pulse hover:bg-indigo-100",
  };

  return (
    <div className={`p-4 bg-white border rounded-xl shadow-sm mb-3 ${isPending ? "border-indigo-200 bg-indigo-50/10" : "border-gray-100"}`}>
      <div className="flex justify-between items-start mb-3 pb-3 border-b border-gray-50">
        <div>
          <span className="text-xs font-bold text-gray-500 block leading-none mb-1">{date}</span>
          <span className="text-[9px] font-black uppercase text-indigo-400 tracking-wider">Amount: {amount}</span>
        </div>
        <div className="text-right">
          <span className="text-[9px] font-black uppercase text-rose-400 block leading-none mb-1 tracking-wider">Difference</span>
          <span className="text-sm font-black text-rose-600 leading-none">{record?.type === "Sale" ? `₦${record.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "—"}</span>
        </div>
      </div>
      
      <div className="flex justify-between items-end">
        <div className="space-y-1">
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tight leading-none mb-0.5">Client/Payee</p>
            <p className="text-sm font-bold text-gray-800">{client}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">
              <span className="font-medium">Description:</span> {description}
            </p>
          </div>
        </div>
        
        <div className="flex flex-col items-end gap-2">
          <Badge className={`text-[10px] px-2 py-0 rounded-full font-bold ${statusColors[status] || "bg-gray-100 text-gray-600"}`}>
            {status}
          </Badge>
          {record && onUpdate ? (
            <ManageSaleAction record={record} onUpdate={onUpdate} variant="button" />
          ) : (
            <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-400">
               <MoreHorizontal className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

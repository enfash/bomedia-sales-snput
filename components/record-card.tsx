"use client";

import { ManageSaleAction, type UnifiedRecord } from "@/components/manage-sale-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Printer, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MaterialBadge } from "./material-badge";
import { useRef, useState } from "react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { ReceiptTemplate } from "./receipt-template";
import { WhatsAppReminder } from "./whatsapp-reminder";

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
  const [isGeneratingReceipt, setIsGeneratingReceipt] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);

  const statusColors: Record<RecordStatus, string> = {
    Settled: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40",
    "Part-payment": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/40",
    "In Progress": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40",
    Syncing: "bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300 animate-pulse hover:bg-brand-100 dark:hover:bg-brand-900/40",
  };

  const handleGenerateReceipt = async () => {
    if (!record || record.type !== "Sale") return;
    
    setIsGeneratingReceipt(true);
    
    // Wait for state update and DOM render
    setTimeout(async () => {
      try {
        if (!receiptRef.current) return;
        
        const canvas = await html2canvas(receiptRef.current, {
          scale: 2, // Better resolution
          useCORS: true,
          logging: false
        });
        
        const imgData = canvas.toDataURL('image/png');
        
        // Use A5 format or match canvas ratio
        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'px',
          format: [canvas.width / 2, canvas.height / 2] // Scale down for PDF size
        });
        
        pdf.addImage(imgData, 'PNG', 0, 0, canvas.width / 2, canvas.height / 2);
        pdf.save(`BOMedia_Receipt_${record.customerName?.replace(/\s+/g, '_') || 'Customer'}.pdf`);
      } catch (error) {
        console.error("Failed to generate receipt", error);
      } finally {
        setIsGeneratingReceipt(false);
      }
    }, 100);
  };

  // Left accent border by record type
  const isExpense = type === "Expense";
  const accentBorder = isPending
    ? "border-l-[3px] border-l-brand-400"
    : isExpense
    ? "border-l-[3px] border-l-orange-400"
    : "border-l-[3px] border-l-primary/50";

  return (
    <div className={cn(
      "p-5 bg-white dark:bg-zinc-900 border rounded-xl shadow-sm mb-2.5 transition-colors duration-300",
      accentBorder,
      isPending
        ? "border-brand-200 dark:border-brand-900/60 bg-brand-50/10 dark:bg-brand-900/10"
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
          <div className="flex flex-wrap justify-end gap-2">
            {record?.type === "Sale" && record?.material && (
              <MaterialBadge material={record.material} />
            )}
            {record?.type === "Sale" && record?.jobStatus && (
              <Badge className={cn(
                "text-[10px] px-2 py-0 rounded-full font-semibold border-none",
                record.jobStatus === "Quoted" || record.jobStatus === "Pending" ? "bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-400" :
                record.jobStatus === "Printing" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                record.jobStatus === "Finishing" || record.jobStatus === "In Progress" ? "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400" :
                record.jobStatus === "Ready" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                record.jobStatus === "Delivered" || record.jobStatus === "Completed" ? "bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300" :
                "bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-400"
              )}>
                {record.jobStatus}
              </Badge>
            )}
            <Badge className={`text-[10px] px-2 py-0 rounded-full font-semibold border-none ${statusColors[status] || "bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-400"}`}>
              {status}
            </Badge>
          </div>
          
          <div className="flex items-center gap-1">
            {record?.type === "Sale" && (
              <WhatsAppReminder
                clientName={record.client || client}
                contact={record.contact || ""}
                balance={record.balance || 0}
                jobDescription={record.description || description}
                variant="full"
              />
            )}
            {record?.type === "Sale" && (
              <Button 
                variant="outline" 
                size="icon" 
                className="h-8 w-8 text-gray-500 hover:text-primary dark:text-zinc-400"
                onClick={handleGenerateReceipt}
                disabled={isGeneratingReceipt}
                title="Download PDF Receipt"
              >
                {isGeneratingReceipt ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
              </Button>
            )}
            
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
      
      {/* Hidden receipt template for PDF generation */}
      {isGeneratingReceipt && record?.type === "Sale" && (
        <div className="overflow-hidden h-0 w-0 absolute">
          <ReceiptTemplate ref={receiptRef} record={record} />
        </div>
      )}
    </div>
  );
}

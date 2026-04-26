"use client";

import { useState, useMemo } from "react";
import { useSyncStore } from "@/lib/store";
import { parseAmount, computeWaterfall } from "@/lib/financial-utils";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { Wallet, ChevronRight, CheckCircle2, AlertCircle, User, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Drawer } from "vaul";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { type UnifiedRecord } from "@/components/manage-sale-action";

interface DebtorPaymentModalProps {
  clientName: string | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
  theme?: "brand" | "amber"; // brand = admin (blue/purple), amber = cashier (orange)
}

const mapSale = (r: any): UnifiedRecord => {
  const amount = parseAmount(r["AMOUNT (₦)"] || r["Amount (₦)"]);
  const balance = parseAmount(r["AMOUNT DIFFERENCES"] || r["Amount Differences"]);
  return {
    id: `sale-${r.DATE}-${r["CLIENT NAME"]}-${r._rowIndex}`,
    date: r.DATE || r.Date || "N/A",
    type: "Sale",
    client: r["CLIENT NAME"] || r["Client Name"] || "N/A",
    description: r["JOB DESCRIPTION"] || r["Job Description"] || "—",
    amount,
    status: balance <= 0 ? "Settled" : "Part-payment",
    loggedBy: r["Logged By"] || "Unknown",
    isPending: false,
    rowIndex: r._rowIndex ? parseInt(r._rowIndex.toString()) : undefined,
    jobStatus: r["JOB STATUS"] || r["Job Status"] || "Quoted",
    material: r["Material"] || r["MATERIAL"] || r["material"] || "",
    balance,
    additionalPayment1: parseAmount(r["ADDITIONAL PAYMENT 1"]),
    additionalPayment2: parseAmount(r["ADDITIONAL PAYMENT 2"]),
    raw: r
  };
};

export function DebtorPaymentModal({ clientName, isOpen, onClose, onUpdate, theme = "brand" }: DebtorPaymentModalProps) {
  const { cachedSales, pendingQueue } = useSyncStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentInput, setPaymentInput] = useState("");
  const isMobile = useMediaQuery("(max-width: 768px)");

  const primaryColor = theme === "brand" ? "bg-brand-700" : "bg-amber-600";
  const textColor = theme === "brand" ? "text-brand-700" : "text-amber-600";
  const hoverColor = theme === "brand" ? "hover:bg-brand-800" : "hover:bg-amber-700";

  // Filter for all unpaid records for this client
  const clientRecords = useMemo(() => {
    if (!clientName) return [];
    
    const sales = (cachedSales || []).map(mapSale);
    // Include pending sales from queue too
    const pending = pendingQueue
      .filter(item => item.type === "sale" && (item.data[1] || "").trim() === clientName.trim())
      .map(item => ({
        id: `pending-${Math.random()}`,
        client: item.data[1],
        description: item.data[2],
        balance: parseAmount(item.data[11]),
        isPending: true,
      } as unknown as UnifiedRecord));

    return [...sales, ...pending].filter(r => 
      r.client.trim() === clientName.trim() && 
      (r.balance || 0) > 0 &&
      !r.isPending // We can only apply payments to synced records for now
    );
  }, [clientName, cachedSales, pendingQueue]);

  const totalBalance = clientRecords.reduce((s, r) => s + (r.balance || 0), 0);
  const lumpSum = parseFloat(paymentInput) || 0;

  const preview = useMemo(
    () => (lumpSum > 0 ? computeWaterfall(clientRecords, lumpSum) : []),
    [clientRecords, lumpSum]
  );

  const handleSubmit = async () => {
    if (lumpSum <= 0) {
      toast.error("Please enter a valid payment amount.");
      return;
    }
    const steps = computeWaterfall(clientRecords, lumpSum);
    if (steps.length === 0) {
      toast.error("No eligible unpaid items found for this client.");
      return;
    }

    setIsSubmitting(true);
    let allOk = true;

    for (const step of steps) {
      const payload: Record<string, any> = {
        rowIndex: step.record.rowIndex,
      };
      if (step.slot === 1) payload.additionalPayment1 = step.toApply;
      else if (step.slot === 2) payload.additionalPayment2 = step.toApply;

      try {
        const res = await fetch("/api/sales", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          allOk = false;
          break;
        }
      } catch {
        allOk = false;
        break;
      }
    }

    setIsSubmitting(false);
    if (allOk) {
      toast.success(`₦${lumpSum.toLocaleString()} applied to ${clientName}'s account.`);
      setPaymentInput("");
      onUpdate();
      onClose();
    } else {
      toast.error("Failed to apply some payments. Please check your connection.");
    }
  };

  const body = (
    <div className="p-6 space-y-5">
      {/* Client Info */}
      <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800">
        <div className={`w-10 h-10 rounded-xl ${primaryColor} flex items-center justify-center`}>
          <User className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Selected Client</p>
          <p className="text-sm font-black text-gray-900 dark:text-white truncate max-w-[200px]">{clientName}</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-[10px] font-black uppercase tracking-widest text-rose-500">Total Debt</p>
          <p className="text-sm font-black text-rose-600">₦{totalBalance.toLocaleString()}</p>
        </div>
      </div>

      {totalBalance <= 0 ? (
        <div className="flex items-center justify-center gap-2 p-6 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl border border-emerald-100 dark:border-emerald-900/30">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          <p className="text-sm font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
            Clear Balance
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase font-black text-gray-500 dark:text-zinc-500 tracking-wider">
              Apply Payment (₦)
            </Label>
            <Input
              type="number"
              placeholder="Enter amount to pay off"
              value={paymentInput}
              onChange={(e) => setPaymentInput(e.target.value)}
              className="h-12 rounded-xl border-gray-200 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 font-bold focus:ring-primary text-lg"
            />
          </div>

          {/* Distribution Preview */}
          {preview.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider">
                  Auto-Distribution Preview
                </p>
                <span className="text-[10px] font-bold text-gray-400">{preview.length} item{preview.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="max-h-[200px] overflow-y-auto border border-gray-100 dark:border-zinc-800 rounded-xl divide-y divide-gray-50 dark:divide-zinc-800">
                {preview.map((step, idx) => (
                  <div key={step.record.id} className="flex items-center justify-between px-4 py-3 bg-white dark:bg-zinc-900/50">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-5 h-5 rounded-full ${primaryColor}/10 flex items-center justify-center flex-shrink-0`}>
                        <span className={`text-[9px] font-black ${textColor}`}>{idx + 1}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-gray-800 dark:text-zinc-100 leading-none truncate">{step.record.description}</p>
                        <p className="text-[9px] text-gray-400 mt-1 uppercase font-bold">{step.record.date?.split(',')[0]}</p>
                      </div>
                    </div>
                    <div className="text-right ml-2 shrink-0">
                      <p className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                        +₦{step.toApply.toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              {lumpSum > totalBalance && (
                 <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1 mt-2">
                   <AlertCircle className="w-3 h-3" />
                   Overpayment of ₦{(lumpSum - totalBalance).toLocaleString()} will be ignored.
                 </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );

  const footer = (drawer?: boolean) => (
    <div className={drawer ? "flex flex-col gap-3 mt-4 px-6 pb-8" : "p-6 bg-gray-50 dark:bg-zinc-900/50 flex gap-3 border-t dark:border-zinc-800"}>
      <Button
        variant="outline"
        onClick={onClose}
        className="flex-1 h-12 rounded-xl font-bold dark:bg-zinc-950 dark:border-zinc-800"
      >
        Close
      </Button>
      {totalBalance > 0 && (
        <Button
          disabled={isSubmitting || lumpSum <= 0 || preview.length === 0}
          onClick={handleSubmit}
          className={`flex-1 h-12 rounded-xl ${primaryColor} ${hoverColor} text-white font-black shadow-lg transition-all active:scale-[0.98]`}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : "Apply Payment"}
        </Button>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Drawer.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm" />
          <Drawer.Content className="bg-white dark:bg-zinc-950 flex flex-col rounded-t-[2.5rem] fixed bottom-0 left-0 right-0 z-50 outline-none shadow-2xl border-t dark:border-zinc-800 max-h-[90vh]">
            <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-gray-200 dark:bg-zinc-800 mt-4 mb-2" />
            <div className="overflow-y-auto">
              <div className="px-6 py-2">
                <Drawer.Title className="text-xl font-black text-gray-900 dark:text-white tracking-tight">Client Payment</Drawer.Title>
                <Drawer.Description className="sr-only">
                  Apply a lump-sum payment to {clientName}'s outstanding debt.
                </Drawer.Description>
              </div>
              {body}
            </div>
            {footer(true)}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md bg-white dark:bg-zinc-950 rounded-3xl p-0 border-none shadow-2xl overflow-hidden">
        <DialogHeader className={`p-6 pb-6 ${primaryColor} text-white rounded-t-3xl`}>
          <DialogTitle className="text-xl font-black text-white tracking-tight">Client Account Overlook</DialogTitle>
          <DialogDescription className="text-white/80 text-xs font-bold mt-1 uppercase tracking-wider">
            Lump-sum Debt Recovery for {clientName}
          </DialogDescription>
        </DialogHeader>
        {body}
        <DialogFooter className="p-0">
          {footer()}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

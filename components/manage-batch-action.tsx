"use client";

import { useState, useMemo } from "react";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { Wallet, ChevronRight, CheckCircle2, AlertCircle } from "lucide-react";
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
  DialogFooter,
} from "@/components/ui/dialog";
import { type UnifiedRecord } from "@/components/manage-sale-action";
import { computeWaterfall } from "@/lib/financial-utils";

interface ManageBatchActionProps {
  records: UnifiedRecord[];
  salesId: string;
  onUpdate: () => void;
}


export function ManageBatchAction({ records, salesId, onUpdate }: ManageBatchActionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentInput, setPaymentInput] = useState("");
  const isMobile = useMediaQuery("(max-width: 768px)");

  const grandTotal = records.reduce((s, r) => s + (r.amount ?? 0), 0);
  const totalBalance = records.reduce((s, r) => s + (r.balance ?? 0), 0);
  const totalPaid = grandTotal - totalBalance;

  const lumpSum = parseFloat(paymentInput) || 0;

  const preview = useMemo(
    () => (lumpSum > 0 ? computeWaterfall(records, lumpSum) : []),
    [records, lumpSum]
  );

  const handleSubmit = async () => {
    if (lumpSum <= 0) {
      toast.error("Please enter a valid payment amount.");
      return;
    }
    const steps = computeWaterfall(records, lumpSum);
    if (steps.length === 0) {
      toast.error("No eligible unpaid items to apply payment to.");
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
          const err = await res.json();
          toast.error(`Failed for ${step.record.client}: ${err.error || "Unknown error"}`);
          allOk = false;
          break;
        }
      } catch {
        toast.error("Network error — some payments may not have been saved.");
        allOk = false;
        break;
      }
    }

    setIsSubmitting(false);
    if (allOk) {
      toast.success(`Payment of ₦${lumpSum.toLocaleString()} distributed successfully!`);
      setPaymentInput("");
      setIsOpen(false);
      onUpdate();
    }
  };

  const trigger = (
    <Button
      variant="outline"
      size="sm"
      className="h-7 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider border-primary/30 text-primary hover:bg-primary/5"
    >
      <Wallet className="w-3 h-3 mr-1.5" />
      Pay Batch
    </Button>
  );

  const body = (
    <div className="p-6 space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Grand Total", value: grandTotal, color: "text-gray-900 dark:text-white" },
          { label: "Paid", value: totalPaid, color: "text-emerald-600 dark:text-emerald-400" },
          { label: "Remaining", value: totalBalance, color: "text-rose-600 dark:text-rose-400" },
        ].map((m) => (
          <div key={m.label} className="bg-gray-50 dark:bg-zinc-800 rounded-xl p-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-zinc-500 mb-1">{m.label}</p>
            <p className={`text-sm font-black ${m.color}`}>
              ₦{m.value.toLocaleString(undefined, { minimumFractionDigits: 0 })}
            </p>
          </div>
        ))}
      </div>

      {totalBalance <= 0 ? (
        <div className="flex items-center justify-center gap-2 p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-900/30">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <p className="text-sm font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
            All items fully paid
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase font-black text-gray-500 dark:text-zinc-500 tracking-wider">
              Lump-Sum Payment (₦)
            </Label>
            <Input
              type="number"
              placeholder="Enter total payment amount"
              value={paymentInput}
              onChange={(e) => setPaymentInput(e.target.value)}
              className="h-12 rounded-xl border-border dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 font-bold focus:ring-primary"
            />
            {lumpSum > totalBalance && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Amount exceeds remaining balance — overpayment will be ignored.
              </p>
            )}
          </div>

          {/* Waterfall Preview */}
          {preview.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider">
                Distribution Preview
              </p>
              <div className="border border-gray-100 dark:border-zinc-800 rounded-xl overflow-hidden divide-y divide-gray-50 dark:divide-zinc-800">
                {preview.map((step, idx) => (
                  <div key={step.record.id} className="flex items-center justify-between px-4 py-3 bg-white dark:bg-zinc-900">
                    <div className="flex items-center gap-2.5">
                      <div className="w-5 h-5 rounded-full bg-primary/10 dark:bg-primary/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-[9px] font-black text-primary">{idx + 1}</span>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-800 dark:text-zinc-100 leading-none">{step.record.description}</p>
                        <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-0.5">Slot {step.slot}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                        +₦{step.toApply.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  const footer = (drawer?: boolean) => (
    <div className={drawer ? "flex flex-col gap-3 mt-4 px-6 pb-6" : "p-6 bg-gray-50 dark:bg-zinc-900/50 flex gap-3 border-t dark:border-zinc-800"}>
      <Button
        variant="outline"
        onClick={() => setIsOpen(false)}
        className="flex-1 h-12 rounded-xl font-bold dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-400"
      >
        Cancel
      </Button>
      {totalBalance > 0 && (
        <Button
          disabled={isSubmitting || lumpSum <= 0 || preview.length === 0}
          onClick={handleSubmit}
          className="flex-1 h-12 rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground font-black shadow-lg shadow-primary/20 dark:shadow-none transition-all active:scale-[0.98]"
        >
          {isSubmitting ? "Processing..." : "Apply Payment"}
        </Button>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Drawer.Root open={isOpen} onOpenChange={setIsOpen}>
        <Drawer.Trigger asChild>{trigger}</Drawer.Trigger>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/60 z-50 animate-in fade-in" />
          <Drawer.Content className="bg-white dark:bg-zinc-950 flex flex-col rounded-t-[2.5rem] mt-24 fixed bottom-0 left-0 right-0 z-50 outline-none shadow-2xl border-t dark:border-zinc-800">
            <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-gray-200 dark:bg-zinc-800 mt-4 mb-2" />
            <div className="px-0 pb-0 overflow-y-auto max-h-[80vh]">
              <div className="px-6 pb-2">
                <p className="text-lg font-black text-gray-900 dark:text-white">Batch Payment</p>
                <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">{salesId}</p>
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
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <button onClick={() => setIsOpen(true)}>{trigger}</button>
      <DialogContent className="max-w-md bg-white dark:bg-zinc-950 rounded-3xl p-0 border-none shadow-2xl dark:shadow-none">
        <DialogHeader className="p-6 pb-0 bg-primary text-primary-foreground rounded-t-3xl">
          <DialogTitle className="text-xl font-black text-white">Batch Payment</DialogTitle>
          <p className="text-white/70 text-xs font-medium mt-0.5 pb-4">{salesId} · {records.length} item{records.length !== 1 ? "s" : ""}</p>
        </DialogHeader>
        {body}
        <DialogFooter className="p-0">
          {footer()}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

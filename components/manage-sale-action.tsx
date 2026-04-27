"use client";

import { useState, useMemo } from "react";
import { usePathname } from "next/navigation";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { MoreHorizontal, MessageCircle, Lock } from "lucide-react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RecordStatus } from "@/components/record-card";

export interface UnifiedRecord {
  id: string;
  date: string;
  type: "Sale" | "Expense";
  client: string;
  contact?: string;
  description: string;
  amount: number;
  status: RecordStatus;
  loggedBy: string;
  isPending: boolean;
  rowIndex?: number;
  timestamp?: number;
  additionalPayment1?: number;
  additionalPayment2?: number;
  jobStatus?: string;
  material?: string;
  balance?: number;
  salesId?: string;
  raw: Record<string, string>;
}

interface ManageSaleActionProps {
  record: UnifiedRecord;
  onUpdate: () => void;
  variant?: "icon" | "button";
}

export function ManageSaleAction({
  record,
  onUpdate,
  variant = "icon",
}: ManageSaleActionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [addl1, setAddl1] = useState(record?.additionalPayment1 ? String(record.additionalPayment1) : "");
  const [addl2, setAddl2] = useState(record?.additionalPayment2 ? String(record.additionalPayment2) : "");
  const [status, setStatus] = useState(record?.jobStatus ?? "Quoted");
  const isMobile = useMediaQuery("(max-width: 768px)");
  const pathname = usePathname();

  const isLocked = useMemo(() => {
    if (!pathname?.includes('/cashier')) return false;
    // Use the raw sheet date (r.DATE, e.g. "2026-04-26" or an ISO string) for
    // accurate millisecond comparison. record.date is a display-formatted string
    // like "Apr 26, 2026" which new Date() can misparse to midnight UTC and cause
    // premature locking. record.timestamp is set for pending-queue entries.
    const rawDateStr = record.raw?.DATE || record.raw?.Date;
    const tsMs = record.timestamp ?? (rawDateStr ? new Date(rawDateStr).getTime() : NaN);
    if (isNaN(tsMs)) return false; // Can't determine age — allow editing
    return (Date.now() - tsMs) > 24 * 60 * 60 * 1000;
  }, [pathname, record.raw, record.timestamp]);

  if (!record || record.type === "Expense" || record.isPending || isLocked) {
    return variant === "icon" ? (
      <Button
        variant="ghost"
        size="icon"
        disabled
        className="h-8 w-8 text-gray-200"
        title={isLocked ? "Cannot edit records older than 24 hours" : ""}
      >
        {isLocked ? <Lock className="w-3 h-3" /> : <MoreHorizontal className="w-4 h-4" />}
      </Button>
    ) : null;
  }

  const handleUpdate = async () => {
    setIsSubmitting(true);
    try {
      const payload: Record<string, any> = {
        rowIndex: record.rowIndex,
        jobStatus: status,
      };

      const hasAddl1 = (record.additionalPayment1 ?? 0) > 0;
      const hasAddl2 = (record.additionalPayment2 ?? 0) > 0;

      if (!hasAddl1 && addl1 !== "") {
        payload.additionalPayment1 = parseFloat(addl1) || 0;
      }
      if (!hasAddl2 && addl2 !== "") {
        payload.additionalPayment2 = parseFloat(addl2) || 0;
      }

      const res = await fetch("/api/sales", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success("Record updated successfully!");
        setIsOpen(false);
        onUpdate();
      } else {
        const error = await res.json();
        toast.error(error.error || "Failed to update record");
      }
    } catch (err) {
      toast.error("Network error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const triggerButton =
    variant === "icon" ? (
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-primary hover:text-primary/80 hover:bg-primary/10"
      >
        <MoreHorizontal className="w-4 h-4" />
      </Button>
    ) : (
      <Button
        variant="outline"
        size="sm"
        className="h-8 rounded-lg text-[10px] font-black uppercase tracking-wider border-border dark:border-primary/30 text-primary dark:text-primary/90 hover:bg-primary/5 dark:hover:bg-primary/10"
      >
        Manage
      </Button>
    );

  const contentProps = {
    record,
    addl1,
    setAddl1,
    addl2,
    setAddl2,
    status,
    setStatus,
    isSubmitting,
    handleUpdate,
    setIsOpen,
  };

  if (isMobile) {
    return (
      <Drawer.Root open={isOpen} onOpenChange={setIsOpen}>
        <Drawer.Trigger asChild>{triggerButton}</Drawer.Trigger>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/60 z-50 animate-in fade-in" />
          <Drawer.Content className="bg-white dark:bg-zinc-950 flex flex-col rounded-t-[2.5rem] mt-24 fixed bottom-0 left-0 right-0 z-50 p-6 outline-none shadow-2xl border-t dark:border-zinc-800">
            <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-gray-200 dark:bg-zinc-800 mb-6" />
            <Drawer.Title className="sr-only">Manage Sale Record</Drawer.Title>
            <Drawer.Description className="sr-only">Update payments and job progress</Drawer.Description>
            <ContentBody {...contentProps} />
            <ContentFooter {...contentProps} drawer />
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{triggerButton}</DialogTrigger>
      <DialogContent className="max-w-md bg-white dark:bg-zinc-950 rounded-3xl p-0 border-none shadow-2xl dark:shadow-none">
        <DialogHeader className="sr-only">
          <DialogTitle>Manage Sale Record</DialogTitle>
          <DialogDescription>Update payments and job progress</DialogDescription>
        </DialogHeader>
        <HeaderContent {...contentProps} />
        <ContentBody {...contentProps} />
        <ContentFooter {...contentProps} />
      </DialogContent>
    </Dialog>
  );
}

function HeaderContent({ record }: any) {
  return (
    <DialogHeader className="p-6 bg-primary text-primary-foreground">
      <DialogTitle className="text-xl font-black">
        Manage Sale Record
      </DialogTitle>
      <div className="flex justify-between items-end mt-1">
        <p className="text-white font-medium">
          Update payments and job progress for {record.client}
        </p>
        <div className="text-right flex flex-col items-end">
          <p className="text-[10px] uppercase font-black text-white/90 leading-none mb-0.5">
            Current Balance
          </p>
          <p className="text-sm font-black text-white leading-none">
            ₦{(record.balance || 0).toLocaleString()}
          </p>

          {(record.balance || 0) > 0 && record.contact && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                if (!record.contact) return;
                const balance = (record.balance || 0).toLocaleString();
                const message = `Hello *${record.client}*, this is a payment reminder from *BOMedia*.\n\nRegarding your order: *${record.description}*\nOutstanding Balance: *₦${balance}*\n\nKindly make payment to our designated bank account.\n\nThank you for your business!`;
                const encoded = encodeURIComponent(message);
                const phone = record.contact.replace(/\D/g, "");
                const formattedPhone = phone.startsWith("0")
                  ? "234" + phone.substring(1)
                  : phone;
                window.open(
                  `https://wa.me/${formattedPhone}?text=${encoded}`,
                  "_blank",
                );
              }}
              className="mt-2 h-7 px-2 rounded-lg bg-white/20 hover:bg-white/30 border-none text-[10px] font-black uppercase text-white tracking-wider flex items-center gap-1.5"
            >
              <MessageCircle className="w-3 h-3" />
              WhatsApp Reminder
            </Button>
          )}
        </div>
      </div>
    </DialogHeader>
  );
}

function ContentBody({
  record,
  addl1,
  setAddl1,
  addl2,
  setAddl2,
  status,
  setStatus,
}: any) {
  const hasAddl1 = (record.additionalPayment1 ?? 0) > 0;
  const hasAddl2 = (record.additionalPayment2 ?? 0) > 0;
  const isFullyPaid = (record.balance ?? 0) <= 0 || record.status === "Paid";
  const maxSlotsReached = hasAddl1 && hasAddl2 && (record.balance ?? 0) > 0;

  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-2 gap-4 pb-4 border-b border-gray-100 dark:border-zinc-800">
        <div>
          <Label className="text-[10px] uppercase font-black text-gray-700 dark:text-zinc-400 tracking-wider mb-2 block">
            Total Amount
          </Label>
          <p className="text-lg font-black text-gray-900 dark:text-white">
            ₦{record.amount.toLocaleString()}
          </p>
        </div>
        <div>
          <Label className="text-[10px] uppercase font-black text-gray-700 dark:text-zinc-400 tracking-wider mb-2 block">
            Current Status
          </Label>
          <p className="text-xs font-bold text-primary">
            {record.status}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {isFullyPaid && (
          <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl border border-emerald-100 dark:border-emerald-900/30 flex items-center justify-center">
            <p className="text-sm font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
              Paid Completed
            </p>
          </div>
        )}

        {maxSlotsReached && !isFullyPaid && (
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-100 dark:border-amber-900/30">
            <p className="text-xs font-bold text-amber-700 dark:text-amber-400">
              Maximum payment slots reached. Contact Admin to add more payments.
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase font-black text-gray-700 dark:text-zinc-400 tracking-wider">
            Additional Payment 1 (₦)
          </Label>
          <Input
            type="number"
            placeholder="Enter amount"
            value={addl1}
            onChange={(e) => setAddl1(e.target.value)}
            disabled={hasAddl1 || isFullyPaid || maxSlotsReached}
            className="h-12 rounded-xl border-border dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 focus:ring-primary font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase font-black text-gray-700 dark:text-zinc-400 tracking-wider">
            Additional Payment 2 (₦)
          </Label>
          <Input
            type="number"
            placeholder="Enter amount"
            value={addl2}
            onChange={(e) => setAddl2(e.target.value)}
            disabled={!hasAddl1 || hasAddl2 || isFullyPaid || maxSlotsReached}
            className="h-12 rounded-xl border-border dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 focus:ring-primary font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase font-black text-gray-700 dark:text-zinc-400 tracking-wider">
            Job Status
          </Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-12 rounded-xl border-border dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 font-bold shadow-sm">
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent
              className="rounded-xl border-gray-100 dark:border-zinc-800 dark:bg-zinc-900 shadow-xl z-[9999]"
              position="popper"
              sideOffset={5}
            >
              <SelectItem
                value="Quoted"
                className="font-bold dark:text-zinc-300 dark:focus:bg-zinc-800"
              >
                Quoted
              </SelectItem>
              <SelectItem
                value="Printing"
                className="font-bold dark:text-zinc-300 dark:focus:bg-zinc-800"
              >
                Printing
              </SelectItem>
              <SelectItem
                value="Finishing"
                className="font-bold dark:text-zinc-300 dark:focus:bg-zinc-800"
              >
                Finishing
              </SelectItem>
              <SelectItem
                value="Ready"
                className="font-bold dark:text-zinc-300 dark:focus:bg-zinc-800"
              >
                Ready
              </SelectItem>
              <SelectItem
                value="Delivered"
                className="font-bold dark:text-zinc-300 dark:focus:bg-zinc-800"
              >
                Delivered
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

function ContentFooter({ isSubmitting, handleUpdate, setIsOpen, drawer }: any) {
  if (drawer) {
    return (
      <div className="flex flex-col gap-3 mt-8">
        <Button
          disabled={isSubmitting}
          onClick={handleUpdate}
          className="w-full h-12 rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground font-black shadow-lg shadow-primary/20 dark:shadow-none transition-all active:scale-[0.98]"
        >
          {isSubmitting ? "Updating..." : "Save Changes"}
        </Button>
        <Button
          variant="outline"
          onClick={() => setIsOpen(false)}
          className="w-full h-12 rounded-xl font-bold dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400"
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <DialogFooter className="p-6 bg-gray-50 dark:bg-zinc-900/50 flex gap-3 border-t dark:border-zinc-800">
      <Button
        variant="outline"
        onClick={() => setIsOpen(false)}
        className="flex-1 h-12 rounded-xl font-bold dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-400"
      >
        Cancel
      </Button>
      <Button
        disabled={isSubmitting}
        onClick={handleUpdate}
        className="flex-1 h-12 rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground font-black shadow-lg shadow-primary/20 dark:shadow-none transition-all active:scale-[0.98]"
      >
        {isSubmitting ? "Updating..." : "Save Changes"}
      </Button>
    </DialogFooter>
  );
}

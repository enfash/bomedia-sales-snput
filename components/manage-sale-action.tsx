"use client";

import { useState } from "react";
import { MoreHorizontal, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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

type Row = Record<string, string>;

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
  balance?: number;
  raw: Row;
}

interface ManageSaleActionProps {
  record: UnifiedRecord;
  onUpdate: () => void;
  variant?: "icon" | "button";
}

export function ManageSaleAction({ record, onUpdate, variant = "icon" }: ManageSaleActionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [addl1, setAddl1] = useState("");
  const [addl2, setAddl2] = useState("");
  const [status, setStatus] = useState(record?.jobStatus ?? "Pending");

  if (!record || record.type === "Expense" || record.isPending) {
    return variant === "icon" ? (
      <Button variant="ghost" size="icon" disabled className="h-8 w-8 text-gray-200">
        <MoreHorizontal className="w-4 h-4" />
      </Button>
    ) : null;
  }

  const handleUpdate = async () => {
    setIsSubmitting(true);
    try {
      // Only send the payment field that was actually filled in
      const payload: Record<string, any> = {
        rowIndex: record.rowIndex,
        jobStatus: status,
      };

      if (showAddl1 && addl1 !== "") {
        payload.additionalPayment1 = parseFloat(addl1) || 0;
      }
      if (showAddl2 && addl2 !== "") {
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

  // Show Col Q slot if no additional payment 1 has been recorded yet
  const showAddl1 = !record.additionalPayment1 || record.additionalPayment1 === 0;
  // Show Col R slot only if payment 1 is filled but payment 2 is not
  const showAddl2 = (record.additionalPayment1 ?? 0) > 0 && (!record.additionalPayment2 || record.additionalPayment2 === 0);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {variant === "icon" ? (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20">
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="h-8 rounded-lg text-[10px] font-black uppercase tracking-wider border-indigo-100 dark:border-indigo-900 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20">
            Manage
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md bg-white dark:bg-zinc-950 rounded-3xl p-0 overflow-hidden border-none shadow-2xl dark:shadow-none">
        <DialogHeader className="p-6 bg-indigo-600 text-white">
          <DialogTitle className="text-xl font-black">Manage Sale Record</DialogTitle>
          <div className="flex justify-between items-end mt-1">
            <p className="text-indigo-100 text-xs font-medium opacity-80">Update payments and job progress for {record.client}</p>
            <div className="text-right flex flex-col items-end">
              <p className="text-[10px] uppercase font-black text-indigo-200 leading-none mb-0.5">Current Balance</p>
              <p className="text-sm font-black text-white leading-none">₦{(record.balance || 0).toLocaleString()}</p>
              
              {(record.balance || 0) > 0 && record.contact && (
                <Button 
                  size="sm" 
                  variant="secondary"
                  onClick={() => {
                    if (!record.contact) return;
                    const balance = (record.balance || 0).toLocaleString();
                    const message = `Hello *${record.client}*, this is a payment reminder from *BOMedia*.\n\nRegarding your order: *${record.description}*\nOutstanding Balance: *₦${balance}*\n\nKindly make payment to our designated bank account.\n\nThank you for your business!`;
                    const encoded = encodeURIComponent(message);
                    const phone = record.contact.replace(/\D/g, '');
                    // Ensure Nigerian prefix if it looks like a local number
                    const formattedPhone = phone.startsWith('0') ? '234' + phone.substring(1) : phone;
                    window.open(`https://wa.me/${formattedPhone}?text=${encoded}`, '_blank');
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
        
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4 pb-4 border-b border-gray-100 dark:border-zinc-800">
             <div>
                <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider mb-2 block">Total Amount</Label>
                <p className="text-lg font-black text-gray-900 dark:text-white">₦{record.amount.toLocaleString()}</p>
             </div>
             <div>
                <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider mb-2 block">Current Status</Label>
                <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400">{record.status}</p>
             </div>
          </div>

          <div className="space-y-4">
             {showAddl1 && (
               <div className="space-y-1.5">
                 <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider">Additional Payment 1 (₦)</Label>
                 <Input 
                   type="number" 
                   placeholder="Enter amount" 
                   value={addl1} 
                   onChange={e => setAddl1(e.target.value)}
                   className="h-12 rounded-xl border-gray-200 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 focus:ring-indigo-500 font-bold"
                 />
               </div>
             )}

             {showAddl2 && (
               <div className="space-y-1.5">
                 <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider">Additional Payment 2 (₦)</Label>
                 <Input 
                   type="number" 
                   placeholder="Enter amount" 
                   value={addl2} 
                   onChange={e => setAddl2(e.target.value)}
                   className="h-12 rounded-xl border-gray-200 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 focus:ring-indigo-500 font-bold"
                 />
               </div>
             )}

             {(!showAddl1 && !showAddl2) && (
                <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl border border-emerald-100 dark:border-emerald-900/30">
                   <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">Both additional payment slots have been filled for this record.</p>
                </div>
             )}

             <div className="space-y-1.5">
               <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider">Job Status</Label>
               <Select value={status} onValueChange={setStatus}>
                 <SelectTrigger className="h-12 rounded-xl border-gray-200 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 font-bold shadow-sm">
                   <SelectValue placeholder="Select status" />
                 </SelectTrigger>
                 <SelectContent className="rounded-xl border-gray-100 dark:border-zinc-800 dark:bg-zinc-900 shadow-xl z-[100]" position="popper" sideOffset={5}>
                   <SelectItem value="Pending" className="font-bold dark:text-zinc-300 dark:focus:bg-zinc-800">Pending</SelectItem>
                   <SelectItem value="In Progress" className="font-bold dark:text-zinc-300 dark:focus:bg-zinc-800">In Progress</SelectItem>
                   <SelectItem value="Completed" className="font-bold dark:text-zinc-300 dark:focus:bg-zinc-800">Completed</SelectItem>
                 </SelectContent>
               </Select>
             </div>
          </div>
        </div>

        <DialogFooter className="p-6 bg-gray-50 dark:bg-zinc-900/50 flex gap-3 border-t dark:border-zinc-800">
          <Button variant="outline" onClick={() => setIsOpen(false)} className="flex-1 h-12 rounded-xl font-bold dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-400">Cancel</Button>
          <Button 
            disabled={isSubmitting} 
            onClick={handleUpdate}
            className="flex-1 h-12 rounded-xl bg-indigo-600 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white font-black shadow-lg shadow-indigo-100 dark:shadow-none"
          >
            {isSubmitting ? "Updating..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

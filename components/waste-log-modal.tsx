"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Drawer } from "vaul";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { AlertTriangle, Scissors, FileText, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/lib/useMediaQuery";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InventoryRollForWaste {
  "Roll ID": string;
  "Item Name": string;
  "Width (ft)": string | number;
  "Remaining Length (ft)": string | number;
  "Waste Logged (ft)": string | number;
  _rowIndex: number;
}

interface WasteLogModalProps {
  roll: InventoryRollForWaste;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

// ─── Waste reasons ────────────────────────────────────────────────────────────

const WASTE_REASONS = [
  "Print head calibration run",
  "Colour alignment test strip",
  "Media edge trim / setup",
  "Misprinted job — reprint needed",
  "Customer proof",
  "Roll leader / tail damage",
  "Machine jam — damaged section",
  "Other (see description)",
];

// ─── Shared form body ─────────────────────────────────────────────────────────

function ModalBody({
  roll,
  wasteLength,
  setWasteLength,
  reason,
  setReason,
  description,
  setDescription,
  jobRef,
  setJobRef,
  date,
  setDate,
}: {
  roll: InventoryRollForWaste;
  wasteLength: string;
  setWasteLength: (v: string) => void;
  reason: string;
  setReason: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  jobRef: string;
  setJobRef: (v: string) => void;
  date: string;
  setDate: (v: string) => void;
}) {
  const remaining = parseFloat(String(roll["Remaining Length (ft)"] || "0")) || 0;
  const wasteNum = parseFloat(wasteLength) || 0;
  const afterWaste = Math.max(0, remaining - wasteNum);
  const overrun = wasteNum > remaining;

  return (
    <div className="p-6 space-y-5">
      {/* Roll info banner */}
      <div className="flex items-center gap-3 p-4 bg-rose-50 dark:bg-rose-900/20 rounded-2xl border border-rose-100 dark:border-rose-900/30">
        <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center shrink-0">
          <Scissors className="w-5 h-5 text-rose-600 dark:text-rose-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-rose-500 dark:text-rose-400">
            Logging waste against
          </p>
          <p className="text-sm font-black text-gray-900 dark:text-white truncate">
            {roll["Roll ID"]}
          </p>
          <p className="text-[10px] text-gray-400 dark:text-zinc-500 font-medium">
            {parseFloat(String(roll["Width (ft)"] || "0"))}ft wide · {remaining.toFixed(1)}ft remaining
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-zinc-500">
            Prev. waste
          </p>
          <p className="text-sm font-black text-rose-600 dark:text-rose-400">
            {(parseFloat(String(roll["Waste Logged (ft)"] || "0")) || 0).toFixed(1)}ft
          </p>
        </div>
      </div>

      {/* Date */}
      <div className="space-y-1.5">
        <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider flex items-center gap-1.5">
          <CalendarDays className="w-3 h-3" /> Date of Waste
        </Label>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-xl h-12 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
        />
      </div>

      {/* Waste length */}
      <div className="space-y-1.5">
        <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider">
          Waste Length (ft) *
        </Label>
        <Input
          type="number"
          placeholder="e.g. 2.5"
          value={wasteLength}
          onChange={(e) => setWasteLength(e.target.value)}
          className={cn(
            "rounded-xl h-12 font-bold text-lg dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100",
            overrun && "border-rose-500 focus-visible:ring-rose-500"
          )}
        />
        {wasteNum > 0 && (
          <div className={cn(
            "flex items-center justify-between p-3 rounded-xl text-xs font-bold",
            overrun
              ? "bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400"
              : "bg-gray-50 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400"
          )}>
            {overrun ? (
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                Waste ({wasteNum.toFixed(1)}ft) exceeds remaining stock!
              </span>
            ) : (
              <>
                <span>After this log:</span>
                <span className="text-gray-900 dark:text-white font-black">{afterWaste.toFixed(1)}ft remaining</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Reason */}
      <div className="space-y-1.5">
        <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider">
          Waste Reason *
        </Label>
        <Select value={reason} onValueChange={setReason}>
          <SelectTrigger className="h-12 rounded-xl border-gray-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 font-bold">
            <SelectValue placeholder="Select reason…" />
          </SelectTrigger>
          <SelectContent className="rounded-xl dark:bg-zinc-900 dark:border-zinc-800">
            {WASTE_REASONS.map((r) => (
              <SelectItem key={r} value={r} className="font-bold dark:text-zinc-300 dark:focus:bg-zinc-800">
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Job ref */}
      <div className="space-y-1.5">
        <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider flex items-center gap-1.5">
          <FileText className="w-3 h-3" /> Job / Sales Reference (optional)
        </Label>
        <Input
          placeholder="e.g. BOM-20260430-0042 or Client Name"
          value={jobRef}
          onChange={(e) => setJobRef(e.target.value)}
          className="rounded-xl h-12 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
        />
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider">
          Description / Notes
        </Label>
        <textarea
          rows={3}
          placeholder="Explain what happened — e.g. 'Ink streaking on first 2ft, re-ran head clean then continued job'"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-zinc-100 placeholder:text-gray-400 dark:placeholder:text-zinc-600 p-3 focus:outline-none focus:ring-2 focus:ring-brand-500 min-h-[80px] font-medium resize-none"
        />
      </div>
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function WasteLogModal({ roll, isOpen, onClose, onSaved }: WasteLogModalProps) {
  const isMobile = useMediaQuery("(max-width: 768px)");

  const [wasteLength, setWasteLength] = useState("");
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [jobRef, setJobRef] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setWasteLength("");
    setReason("");
    setDescription("");
    setJobRef("");
    setDate(new Date().toISOString().split("T")[0]);
  };

  const handleClose = () => { resetForm(); onClose(); };

  const handleSave = async () => {
    if (!wasteLength || !reason) {
      toast.error("Waste length and reason are required.");
      return;
    }
    const waste = parseFloat(wasteLength);
    if (isNaN(waste) || waste <= 0) {
      toast.error("Enter a valid waste length greater than 0.");
      return;
    }
    const remaining = parseFloat(String(roll["Remaining Length (ft)"] || "0")) || 0;
    if (waste > remaining) {
      toast.error(`Waste (${waste.toFixed(1)}ft) exceeds remaining stock (${remaining.toFixed(1)}ft).`);
      return;
    }

    setSaving(true);
    try {
      // 1. Deduct from inventory
      const invRes = await fetch("/api/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowIndex: roll._rowIndex, wasteLength: waste }),
      });
      if (!invRes.ok) {
        const j = await invRes.json();
        throw new Error(j.error || "Failed to update inventory");
      }

      // 2. Write audit entry to Expenses sheet
      const loggedBy =
        typeof window !== "undefined" ? localStorage.getItem("userName") || "Unknown" : "Unknown";

      await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          DATE: date,
          AMOUNT: "0",
          CATEGORY: "Material Waste",
          DESCRIPTION: `[WASTE] ${roll["Roll ID"]} · ${waste.toFixed(1)}ft · ${reason}${description ? ` — ${description}` : ""}`,
          "PAID TO": "—",
          "PAYMENT METHOD": "N/A",
          "RECEIPT URL": "",
          "Logged By": loggedBy,
          "JOB REF": jobRef || "—",
          "ROLL ID": roll["Roll ID"],
          "WASTE FT": waste.toFixed(2),
        }),
      });

      toast.success(`Waste logged: ${waste.toFixed(1)}ft deducted from ${roll["Roll ID"]}`);
      resetForm();
      onSaved();
    } catch (err: any) {
      toast.error(err.message || "Failed to log waste");
    } finally {
      setSaving(false);
    }
  };

  const bodyProps = { roll, wasteLength, setWasteLength, reason, setReason, description, setDescription, jobRef, setJobRef, date, setDate };

  const FooterButtons = ({ drawer = false }: { drawer?: boolean }) => (
    <div className={drawer
      ? "flex flex-col gap-3 mt-2 px-6 pb-8"
      : "p-6 bg-gray-50 dark:bg-zinc-900/50 flex gap-3 border-t dark:border-zinc-800"
    }>
      <Button variant="outline" onClick={handleClose}
        className="flex-1 h-12 rounded-xl font-bold dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-300">
        Cancel
      </Button>
      <Button
        disabled={saving || !wasteLength || !reason}
        onClick={handleSave}
        className="flex-1 h-12 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black shadow-lg shadow-rose-600/20 active:scale-[0.98]">
        {saving ? "Logging..." : "Log Waste & Deduct"}
      </Button>
    </div>
  );

  // Mobile — Vaul drawer
  if (isMobile) {
    return (
      <Drawer.Root open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm" />
          <Drawer.Content className="bg-white dark:bg-zinc-950 flex flex-col rounded-t-[2.5rem] fixed bottom-0 left-0 right-0 z-50 outline-none shadow-2xl border-t dark:border-zinc-800 max-h-[92vh]">
            <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-gray-200 dark:bg-zinc-800 mt-4 mb-2" />
            <div className="overflow-y-auto flex-1">
              <div className="px-6 pb-1 pt-2">
                <Drawer.Title className="text-xl font-black text-gray-900 dark:text-white">
                  Log Waste Material
                </Drawer.Title>
                <Drawer.Description className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">
                  Deducts wasted length from the roll's live balance.
                </Drawer.Description>
              </div>
              <ModalBody {...bodyProps} />
            </div>
            <FooterButtons drawer />
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  // Desktop — dialog
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-md bg-white dark:bg-zinc-950 rounded-3xl p-0 border-none shadow-2xl overflow-hidden">
        <DialogHeader className="p-6 bg-rose-600 text-white">
          <DialogTitle className="text-xl font-black text-white tracking-tight">
            Log Waste Material
          </DialogTitle>
          <DialogDescription className="text-white/80 text-xs font-bold mt-1 uppercase tracking-wider">
            Deducts wasted length from the roll's live balance.
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto max-h-[65vh]">
          <ModalBody {...bodyProps} />
        </div>
        <DialogFooter className="p-0">
          <FooterButtons />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

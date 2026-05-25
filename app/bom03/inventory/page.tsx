"use client";

import { useEffect, useState, useMemo, Fragment } from "react";
import { useRouter } from "next/navigation";
import { Package, Plus, Search, RefreshCw, AlertTriangle, CheckCircle2, XCircle, Ruler, ChevronDown, ChevronUp, Info, Zap, ArrowLeft, CircleDollarSign, TrendingUp, Coins, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { WasteLogModal, type InventoryRollForWaste } from "@/components/waste-log-modal";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Roll = Record<string, any> & { _rowIndex: number; "Material ID"?: string };
type Material = Record<string, any> & { "Material ID": string };

const parseNum = (v: any) => parseFloat(String(v ?? "0").replace(/[^\d.-]/g, "")) || 0;
const METERS_TO_FEET = 3.28084;

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    Active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    "Low Stock": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    "Out of Stock": "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
    Depleted: "bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-zinc-500",
  };
  return (
    <Badge className={cn("text-[9px] font-black border-none px-2 py-0.5", map[status] ?? map["Active"])}>
      {status}
    </Badge>
  );
}

// ─── Add Roll Dialog ──────────────────────────────────────────────────────────

function AddRollDialog({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    itemName: "",
    category: "General",
    widthFt: "",
    rawLength: "",
    lengthUnit: "m" as "m" | "ft",
    price: "",
    cost: "",
    lowStockThreshold: "20",
    quantity: "1",
    supplier: "",
    purchaseDate: new Date().toISOString().split("T")[0],
    poReference: "",
  });

  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));

  const rawLengthFt = useMemo(() => {
    const raw = parseFloat(form.rawLength) || 0;
    return form.lengthUnit === "m" ? raw * METERS_TO_FEET : raw;
  }, [form.rawLength, form.lengthUnit]);

  const usableLength = Math.max(0, rawLengthFt - 10);
  const totalAreaSqft = (parseFloat(form.widthFt) || 0) * usableLength;
  const qty = Math.max(1, parseInt(form.quantity, 10) || 1);
  const costPerRoll = qty > 0 ? (parseFloat(form.cost) || 0) / qty : 0;
  const costPerSqft = totalAreaSqft > 0 ? costPerRoll / totalAreaSqft : 0;

  const handleSave = async () => {
    if (!form.itemName || !form.widthFt || !form.rawLength) {
      toast.error("Material name, width, and length are required.");
      return;
    }
    if (rawLengthFt <= 10) {
      toast.error("Roll length must exceed 10ft (the reserved waste factor). Usable stock would be zero or negative.");
      return;
    }
    setSaving(true);
    try {
      const loggedBy = typeof window !== "undefined" ? localStorage.getItem("userName") || "Unknown" : "Unknown";
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemName: form.itemName.trim(),
          category: form.category.trim(),
          widthFt: parseFloat(form.widthFt),
          rawLengthFt: rawLengthFt.toFixed(2),
          unit: form.lengthUnit,
          price: form.price,
          cost: form.cost,
          lowStockThreshold: form.lowStockThreshold,
          quantity: qty,
          supplier: form.supplier.trim() || undefined,
          purchaseDate: form.purchaseDate,
          poReference: form.poReference.trim() || undefined,
          loggedBy,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to add roll");
      const ids = json.rollIds ? json.rollIds.join(", ") : json.rollId;
      toast.success(`Roll(s) added — IDs: ${ids}`);
      setOpen(false);
      setForm({
        itemName: "",
        category: "General",
        widthFt: "",
        rawLength: "",
        lengthUnit: "m",
        price: "",
        cost: "",
        lowStockThreshold: "20",
        quantity: "1",
        supplier: "",
        purchaseDate: new Date().toISOString().split("T")[0],
        poReference: "",
      });
      onAdded();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-brand-700 hover:bg-brand-800 text-white font-black rounded-xl h-12 px-6 shadow-lg shadow-brand-700/20 flex items-center gap-2">
          <Plus className="w-5 h-5" /> Add New Roll
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg bg-white dark:bg-zinc-900 rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
        <DialogHeader className="p-6 bg-brand-700 text-white">
          <DialogTitle className="text-xl font-black">Add Inventory Roll</DialogTitle>
          <p className="text-white/75 text-xs mt-1">10ft reserved as upfront expected waste automatically.</p>
        </DialogHeader>
        <div className="p-6 space-y-5 overflow-y-auto max-h-[70vh]">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5 col-span-3">
              <Label className="text-[10px] uppercase font-black text-gray-400 tracking-wider">Material Name *</Label>
              <Input placeholder="e.g. Flex, SAV, Clear Sticker" value={form.itemName} onChange={e => set("itemName", e.target.value)} className="rounded-xl dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-black text-gray-400 tracking-wider">Category</Label>
              <Input value={form.category} onChange={e => set("category", e.target.value)} className="rounded-xl dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-black text-gray-400 tracking-wider">Quantity</Label>
              <Input type="number" min="1" value={form.quantity} onChange={e => set("quantity", e.target.value)} className="rounded-xl dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-black text-gray-400 tracking-wider">Low Stock Alert (ft)</Label>
              <Input type="number" value={form.lowStockThreshold} onChange={e => set("lowStockThreshold", e.target.value)} className="rounded-xl dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100" />
            </div>
          </div>

          <div className="p-4 bg-brand-50/50 dark:bg-brand-900/20 rounded-2xl space-y-3 border border-brand-100 dark:border-brand-800/50">
            <p className="text-[10px] font-black text-brand-600 uppercase tracking-widest border-b border-brand-100 dark:border-brand-700/50 pb-2">Roll Dimensions</p>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-bold text-brand-700 dark:text-brand-400">Roll Width (feet) *</Label>
              <div className="flex gap-2">
                {["3","4","5","6","8","10"].map(w => (
                  <button key={w} type="button" onClick={() => set("widthFt", w)}
                    className={cn("flex-1 h-10 rounded-xl text-xs font-black border-2 transition-[border-color,background-color,color,transform] duration-150 ease-out active:scale-[0.97]", form.widthFt === w ? "border-brand-600 bg-brand-600 text-white" : "border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-zinc-400 hover:border-brand-300")}>
                    {w}ft
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-bold text-brand-700 dark:text-brand-400">Roll Length *</Label>
              <div className="flex gap-2">
                <Input type="number" placeholder={form.lengthUnit === "m" ? "e.g. 50" : "e.g. 164"} value={form.rawLength} onChange={e => set("rawLength", e.target.value)} className="rounded-xl flex-1 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100" />
                <Button variant="ghost" size="sm" onClick={() => set("lengthUnit", form.lengthUnit === "m" ? "ft" : "m")} className="px-4 font-black text-xs h-10 border border-brand-100 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 dark:text-zinc-300 uppercase">{form.lengthUnit}</Button>
              </div>
            </div>
            {rawLengthFt > 0 && (
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { label: "Full Length", value: `${rawLengthFt.toFixed(1)}ft`, highlight: false, accent: false },
                  { label: "−10ft Waste", value: "−10ft", highlight: false, accent: true },
                  { label: "Usable Stock", value: `${usableLength.toFixed(1)}ft`, highlight: true, accent: false },
                ].map(({ label, value, highlight, accent }) => (
                  <div key={label} className={cn("p-2 rounded-xl", highlight ? "bg-brand-600 text-white" : accent ? "bg-rose-50 dark:bg-rose-900/20 text-rose-600" : "bg-white dark:bg-zinc-800 text-gray-700 dark:text-zinc-300")}>
                    <p className={cn("text-[9px] font-bold uppercase", highlight ? "text-white/70" : "text-gray-400 dark:text-zinc-500")}>{label}</p>
                    <p className="text-sm font-black leading-tight">{value}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-black text-gray-400 tracking-wider">Selling Price (₦/sqft)</Label>
              <Input type="number" placeholder="e.g. 200" value={form.price} onChange={e => set("price", e.target.value)} className="rounded-xl dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-black text-gray-400 tracking-wider">Total Buy Cost (₦)</Label>
              <Input type="number" placeholder="e.g. 60000" value={form.cost} onChange={e => set("cost", e.target.value)} className="rounded-xl dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100" />
            </div>
          </div>

          {/* Auditing & Purchase Details */}
          <div className="p-4 bg-gray-50/50 dark:bg-zinc-800/30 rounded-2xl space-y-3 border border-gray-100 dark:border-zinc-800">
            <p className="text-[10px] font-black text-gray-500 dark:text-zinc-500 uppercase tracking-widest border-b border-gray-100 dark:border-zinc-800 pb-2">Auditing & Purchase Details</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider">Supplier / Vendor</Label>
                <Input placeholder="e.g. Star Graphics, Avery Supplier" value={form.supplier} onChange={e => set("supplier", e.target.value)} className="rounded-xl dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider">PO / Invoice Reference</Label>
                <Input placeholder="e.g. PO-2026-001" value={form.poReference} onChange={e => set("poReference", e.target.value)} className="rounded-xl dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider">Purchase Date</Label>
                <Input type="date" value={form.purchaseDate} onChange={e => set("purchaseDate", e.target.value)} className="rounded-xl dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100" />
              </div>
            </div>
          </div>

          {costPerSqft > 0 && (
            <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-zinc-800/50 rounded-xl">
              <Info className="w-4 h-4 text-gray-400 shrink-0" />
              <p className="text-xs text-gray-500 dark:text-zinc-400">
                Cost per sqft: <span className="font-black text-gray-800 dark:text-zinc-100">₦{costPerSqft.toFixed(2)}</span> based on {totalAreaSqft.toFixed(0)} usable sqft per roll (unit cost: ₦{costPerRoll.toFixed(2)})
              </p>
            </div>
          )}
        </div>
        <DialogFooter className="p-6 bg-gray-50 dark:bg-zinc-800/50 flex gap-3 border-t dark:border-zinc-800">
          <Button variant="outline" onClick={() => setOpen(false)} className="flex-1 h-12 rounded-xl font-bold dark:bg-zinc-900 dark:border-zinc-700 dark:text-zinc-400">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1 h-12 rounded-xl bg-brand-700 hover:bg-brand-800 text-white font-black">{saving ? "Adding Roll..." : "Add Roll & Reserve Waste"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Adjust Dialog ────────────────────────────────────────────────────────────

function AdjustDialog({ roll, onClose, onDone }: { roll: Roll | null; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  if (!roll) return null;

  const adj = parseFloat(amount);
  const current = parseNum(roll["Remaining Length (ft)"]);
  const preview = isNaN(adj) ? null : Math.max(0, current + adj);
  const canSave = !isNaN(adj) && adj !== 0 && note.trim().length > 0;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const res = await fetch("/api/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowIndex: roll._rowIndex, adjustment: adj }),
      });
      if (!res.ok) { const j = await res.json(); toast.error(j.error || "Failed"); return; }

      // Write audit log to Expenses sheet
      const loggedBy = typeof window !== "undefined" ? localStorage.getItem("userName") || "Unknown" : "Unknown";
      await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          DATE: new Date().toISOString().split("T")[0],
          AMOUNT: "0",
          CATEGORY: "Inventory Adjustment",
          DESCRIPTION: `[ADJUST] ${roll["Roll ID"]} · ${adj > 0 ? "+" : ""}${adj.toFixed(1)}ft · ${note.trim()}`,
          "PAID TO": "—",
          "PAYMENT METHOD": "N/A",
          "RECEIPT URL": "",
          "Logged By": loggedBy,
          "JOB REF": "—",
          "ROLL ID": roll["Roll ID"],
          "ADJUST FT": adj.toFixed(2),
        }),
      });

      toast.success(`Stock adjusted — ${adj > 0 ? "+" : ""}${adj.toFixed(1)}ft on ${roll["Roll ID"]}`);
      setAmount(""); setNote(""); onDone();
    } catch { toast.error("Network error"); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={!!roll} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm bg-white dark:bg-zinc-900 rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
        <DialogHeader className="p-6 bg-brand-700 text-white">
          <DialogTitle className="text-lg font-black">Manual Adjustment</DialogTitle>
          <p className="text-white/75 text-xs mt-0.5">{roll["Roll ID"]} — Current: <span className="font-black">{current.toFixed(1)}ft</span></p>
        </DialogHeader>
        <div className="p-6 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase font-black text-gray-400 tracking-wider">Adjustment (ft)</Label>
            <Input type="number" placeholder="e.g. −5 for damage, +10 for correction" value={amount} onChange={e => setAmount(e.target.value)} className="rounded-xl h-12 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100" />
            {preview !== null && (
              <p className="text-[10px] text-gray-500 dark:text-zinc-400 font-medium">
                After adjustment: <span className="font-black text-gray-800 dark:text-zinc-200">{preview.toFixed(1)}ft remaining</span>
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase font-black text-gray-400 tracking-wider">Reason (required for audit log) *</Label>
            <Input placeholder="e.g. Measurement correction, damaged section removed" value={note} onChange={e => setNote(e.target.value)} className="rounded-xl h-12 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100" />
          </div>
          <p className="text-[9px] text-gray-400 dark:text-zinc-500 italic">This adjustment will be logged to the Expenses sheet for audit purposes.</p>
        </div>
        <DialogFooter className="p-6 pt-0 flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1 rounded-xl h-11 font-bold dark:bg-zinc-900 dark:border-zinc-700 dark:text-zinc-400">Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !canSave} className="flex-1 bg-brand-700 hover:bg-brand-800 text-white font-black rounded-xl h-11">{saving ? "Saving..." : "Apply"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Restock Dialog ───────────────────────────────────────────────────────────

function RestockDialog({ material, onClose, onDone }: { material: Material | null; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({
    itemName: "",
    category: "General",
    widthFt: "",
    rawLength: "",
    lengthUnit: "m" as "m" | "ft",
    price: "",
    cost: "",
    lowStockThreshold: "20",
    quantity: "1",
    supplier: "",
    purchaseDate: new Date().toISOString().split("T")[0],
    poReference: "",
  });
  const [saving, setSaving] = useState(false);

  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    if (material) {
      setForm({
        itemName: material["Material Name"] || "",
        category: material["Category"] || "General",
        widthFt: String(parseNum(material["Width (ft)"]) || ""),
        rawLength: "",
        lengthUnit: "m",
        price: String(parseNum(material["Selling Price"]) || ""),
        cost: "",
        lowStockThreshold: String(parseNum(material["Low Stock Threshold (ft)"]) || "20"),
        quantity: "1",
        supplier: "",
        purchaseDate: new Date().toISOString().split("T")[0],
        poReference: "",
      });
    }
  }, [material]);

  const rawLengthFt = useMemo(() => {
    const raw = parseFloat(form.rawLength) || 0;
    return form.lengthUnit === "m" ? raw * METERS_TO_FEET : raw;
  }, [form.rawLength, form.lengthUnit]);

  const widthFt = parseFloat(form.widthFt) || 0;
  const usableLength = Math.max(0, rawLengthFt - 10);
  const totalAreaSqft = widthFt * usableLength;
  const qty = Math.max(1, parseInt(form.quantity, 10) || 1);
  const costPerRoll = qty > 0 ? (parseFloat(form.cost) || 0) / qty : 0;
  const costPerSqft = totalAreaSqft > 0 ? costPerRoll / totalAreaSqft : 0;

  const handleSave = async () => {
    if (!form.rawLength) {
      toast.error("Roll length is required.");
      return;
    }
    if (rawLengthFt <= 10) {
      toast.error("Roll length must exceed 10ft (the reserved waste factor). Usable stock would be zero or negative.");
      return;
    }
    setSaving(true);
    try {
      const loggedBy = typeof window !== "undefined" ? localStorage.getItem("userName") || "Unknown" : "Unknown";
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemName: form.itemName.trim(),
          category: form.category.trim(),
          widthFt: widthFt,
          rawLengthFt: rawLengthFt.toFixed(2),
          unit: form.lengthUnit,
          price: form.price,
          cost: form.cost,
          lowStockThreshold: form.lowStockThreshold,
          quantity: qty,
          supplier: form.supplier.trim() || undefined,
          purchaseDate: form.purchaseDate,
          poReference: form.poReference.trim() || undefined,
          loggedBy,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to add roll");
      const ids = json.rollIds ? json.rollIds.join(", ") : json.rollId;
      toast.success(`Restock complete — Roll ID(s): ${ids}`);
      onDone();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!material} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg bg-white dark:bg-zinc-900 rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
        <DialogHeader className="p-6 bg-brand-700 text-white">
          <DialogTitle className="text-xl font-black">Restock Material</DialogTitle>
          <p className="text-white/75 text-xs mt-1">Creates new rolls inheriting parent material properties.</p>
        </DialogHeader>
        <div className="p-6 space-y-5 overflow-y-auto max-h-[70vh]">
          {/* Inherited Fields (Disabled/Read-only inputs) */}
          <div className="space-y-4 p-4 bg-gray-50/50 dark:bg-zinc-800/30 rounded-2xl border border-gray-100 dark:border-zinc-800">
            <p className="text-[10px] font-black text-gray-400 dark:text-zinc-500 uppercase tracking-widest border-b border-gray-100 dark:border-zinc-800 pb-2">Inherited Profile Properties</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5 col-span-2">
                <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider">Material Name</Label>
                <Input value={form.itemName} disabled className="rounded-xl bg-gray-100/50 dark:bg-zinc-800/50 dark:text-zinc-400 dark:border-zinc-700 cursor-not-allowed opacity-70" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider">Category</Label>
                <Input value={form.category} disabled className="rounded-xl bg-gray-100/50 dark:bg-zinc-800/50 dark:text-zinc-400 dark:border-zinc-700 cursor-not-allowed opacity-70" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider">Width (ft)</Label>
                <Input value={form.widthFt ? `${form.widthFt} ft` : ""} disabled className="rounded-xl bg-gray-100/50 dark:bg-zinc-800/50 dark:text-zinc-400 dark:border-zinc-700 cursor-not-allowed opacity-70" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider">Selling Price (₦/sqft)</Label>
                <Input value={form.price ? `₦ ${parseFloat(form.price).toLocaleString()}` : ""} disabled className="rounded-xl bg-gray-100/50 dark:bg-zinc-800/50 dark:text-zinc-400 dark:border-zinc-700 cursor-not-allowed opacity-70" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider">Low Stock Threshold (ft)</Label>
                <Input value={form.lowStockThreshold ? `${form.lowStockThreshold} ft` : ""} disabled className="rounded-xl bg-gray-100/50 dark:bg-zinc-800/50 dark:text-zinc-400 dark:border-zinc-700 cursor-not-allowed opacity-70" />
              </div>
            </div>
          </div>

          {/* New inputs form */}
          <div className="space-y-4">
            <p className="text-[10px] font-black text-brand-600 dark:text-brand-400 uppercase tracking-widest border-b border-brand-100 dark:border-zinc-800 pb-2">New Roll Details</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider">Quantity of Rolls *</Label>
                <Input type="number" min="1" value={form.quantity} onChange={e => set("quantity", e.target.value)} className="rounded-xl dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider">Total Buy Cost (₦) *</Label>
                <Input type="number" placeholder="e.g. 60000" value={form.cost} onChange={e => set("cost", e.target.value)} className="rounded-xl dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100" />
              </div>
            </div>

            <div className="p-4 bg-brand-50/50 dark:bg-brand-900/20 rounded-2xl space-y-3 border border-brand-100 dark:border-brand-800/50">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-brand-700 dark:text-brand-400">Roll Length *</Label>
                <div className="flex gap-2">
                  <Input type="number" placeholder={form.lengthUnit === "m" ? "e.g. 50" : "e.g. 164"} value={form.rawLength} onChange={e => set("rawLength", e.target.value)} className="rounded-xl flex-1 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100" />
                  <Button variant="ghost" size="sm" onClick={() => set("lengthUnit", form.lengthUnit === "m" ? "ft" : "m")} className="px-4 font-black text-xs h-10 border border-brand-100 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 dark:text-zinc-300 uppercase">{form.lengthUnit}</Button>
                </div>
              </div>
              {rawLengthFt > 0 && (
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    { label: "Full Length", value: `${rawLengthFt.toFixed(1)}ft`, highlight: false, accent: false },
                    { label: "−10ft Waste", value: "−10ft", highlight: false, accent: true },
                    { label: "Usable Stock", value: `${usableLength.toFixed(1)}ft`, highlight: true, accent: false },
                  ].map(({ label, value, highlight, accent }) => (
                    <div key={label} className={cn("p-2 rounded-xl", highlight ? "bg-brand-600 text-white" : accent ? "bg-rose-50 dark:bg-rose-900/20 text-rose-600" : "bg-white dark:bg-zinc-800 text-gray-700 dark:text-zinc-300")}>
                      <p className={cn("text-[9px] font-bold uppercase", highlight ? "text-white/70" : "text-gray-400 dark:text-zinc-500")}>{label}</p>
                      <p className="text-sm font-black leading-tight">{value}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Auditing & Purchase Details */}
            <div className="p-4 bg-gray-50/50 dark:bg-zinc-800/30 rounded-2xl space-y-3 border border-gray-100 dark:border-zinc-800">
              <p className="text-[10px] font-black text-gray-500 dark:text-zinc-500 uppercase tracking-widest border-b border-gray-100 dark:border-zinc-800 pb-2">Auditing & Purchase Details</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 col-span-2">
                  <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider">Supplier / Vendor</Label>
                  <Input placeholder="e.g. Star Graphics, Avery Supplier" value={form.supplier} onChange={e => set("supplier", e.target.value)} className="rounded-xl dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider">PO / Invoice Reference</Label>
                  <Input placeholder="e.g. PO-2026-001" value={form.poReference} onChange={e => set("poReference", e.target.value)} className="rounded-xl dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider">Purchase Date</Label>
                  <Input type="date" value={form.purchaseDate} onChange={e => set("purchaseDate", e.target.value)} className="rounded-xl dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100" />
                </div>
              </div>
            </div>

            {costPerSqft > 0 && (
              <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-zinc-800/50 rounded-xl">
                <Info className="w-4 h-4 text-gray-400 shrink-0" />
                <p className="text-xs text-gray-500 dark:text-zinc-400">
                  Cost per sqft: <span className="font-black text-gray-800 dark:text-zinc-100">₦{costPerSqft.toFixed(2)}</span> based on {totalAreaSqft.toFixed(0)} usable sqft per roll (unit cost: ₦{costPerRoll.toFixed(2)})
                </p>
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="p-6 bg-gray-50 dark:bg-zinc-800/50 flex gap-3 border-t dark:border-zinc-800">
          <Button variant="outline" onClick={onClose} className="flex-1 h-12 rounded-xl font-bold dark:bg-zinc-900 dark:border-zinc-700 dark:text-zinc-400">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1 h-12 rounded-xl bg-brand-700 hover:bg-brand-800 text-white font-black">{saving ? "Adding Roll..." : "Confirm Restock"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const router = useRouter();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [inventory, setInventory] = useState<Roll[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [adjustTarget, setAdjustTarget] = useState<Roll | null>(null);
  const [wasteTarget, setWasteTarget] = useState<Roll | null>(null);
  const [restockTarget, setRestockTarget] = useState<Material | null>(null);
  const [expandedMaterialId, setExpandedMaterialId] = useState<string | null>(null);

  const fetchData = async () => {
    setRefreshing(true);
    try {
      const [invRes, matRes] = await Promise.all([
        fetch("/api/inventory"),
        fetch("/api/materials")
      ]);
      const invJson = await invRes.json();
      const matJson = await matRes.json();

      if (invRes.ok) setInventory(invJson.data || []);
      if (matRes.ok) setMaterials(matJson.data || []);

      if (!invRes.ok) toast.error(invJson.error || "Failed to load inventory");
      if (!matRes.ok) toast.error(matJson.error || "Failed to load materials");
    } catch {
      toast.error("Network error fetching inventory data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const filteredMaterials = useMemo(() => {
    const s = search.toLowerCase();
    return materials.filter(m =>
      m["Material ID"]?.toLowerCase().includes(s) ||
      m["Material Name"]?.toLowerCase().includes(s) ||
      m["Category"]?.toLowerCase().includes(s)
    );
  }, [materials, search]);

  const formatRollGroupKey = (width: any, itemName: string) => {
    const w = parseFloat(String(width)) || 0;
    const name = String(itemName || "").trim();
    const formattedName = name
      .toLowerCase()
      .split(" ")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
    return `${w}ft ${formattedName}`;
  };

  const activeRollGroups = useMemo(() => {
    const groups: Record<string, number> = {};
    inventory.forEach(roll => {
      const remaining = parseNum(roll["Remaining Length (ft)"]);
      if (remaining > 0.1) {
        const key = formatRollGroupKey(roll["Width (ft)"], roll["Item Name"]);
        groups[key] = (groups[key] || 0) + 1;
      }
    });
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  }, [inventory]);

  const depletedRollGroups = useMemo(() => {
    const groups: Record<string, number> = {};
    inventory.forEach(roll => {
      const remaining = parseNum(roll["Remaining Length (ft)"]);
      if (remaining <= 0.1) {
        const key = formatRollGroupKey(roll["Width (ft)"], roll["Item Name"]);
        groups[key] = (groups[key] || 0) + 1;
      }
    });
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  }, [inventory]);

  const totalActiveRollsCount = useMemo(() => {
    return inventory.filter(r => parseNum(r["Remaining Length (ft)"]) > 0.1).length;
  }, [inventory]);

  const totalDepletedRollsCount = useMemo(() => {
    return inventory.filter(r => parseNum(r["Remaining Length (ft)"]) <= 0.1).length;
  }, [inventory]);

  const stats = useMemo(() => {
    let active = 0;
    let lowStock = 0;
    let outOfStock = 0;
    let totalFt = 0;
    let totalSpent = 0;
    let totalRemainingAsset = 0;
    let totalRemainingRevenue = 0;
    let totalRealisedRevenue = 0;

    materials.forEach(m => {
      if (m.Status === "Active") active++;
      else if (m.Status === "Low Stock") lowStock++;
      else if (m.Status === "Out of Stock" || m.Status === "Depleted") outOfStock++;

      totalFt += parseNum(m["Total Remaining (ft)"]);
      totalSpent += parseNum(m["Total Spent"]);
      totalRemainingAsset += parseNum(m["Total Remaining Asset Value"]);
      totalRemainingRevenue += parseNum(m["Total Remaining Revenue"]);
      totalRealisedRevenue += parseNum(m["Total Realised Revenue"]);
    });

    return {
      active,
      lowStock,
      outOfStock,
      totalFt,
      totalSpent,
      totalRemainingAsset,
      totalRemainingRevenue,
      totalRealisedRevenue
    };
  }, [materials]);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen bg-slate-50/80 dark:bg-zinc-950">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-brand-700 dark:text-brand-400 animate-spin mx-auto mb-4" />
          <p className="text-gray-500 dark:text-zinc-400 font-bold uppercase tracking-widest text-xs">Loading Inventory...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 bg-slate-50/80 dark:bg-zinc-950 min-h-screen pb-32">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.back()}
              className="md:hidden rounded-xl h-9 w-9 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 transition-[transform] duration-150 ease-out active:scale-[0.97]">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">Inventory Management</h1>
            {refreshing && <RefreshCw className="w-4 h-4 text-brand-600 animate-spin" />}
          </div>
          <p className="text-gray-500 dark:text-zinc-400 text-sm mt-1">Linear length tracking per roll · 10ft waste reserved upfront</p>
        </div>
        <AddRollDialog onAdded={fetchData} />
      </div>

      {/* Overview Analytics Banner */}
      <div className="flex flex-col gap-6 mb-8">
        
        {/* Top Row: Health & Assets */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-white dark:bg-zinc-900 border-none shadow-sm md:col-span-1">
            <CardContent className="p-5 space-y-4">
              <div>
                <p className="text-[10px] font-black text-gray-400 dark:text-zinc-500 uppercase tracking-widest border-b pb-2 dark:border-zinc-800">Warehouse Health</p>
                <div className="grid grid-cols-3 gap-2 text-center mt-3">
                  {[
                    { label: "Active Mat", val: stats.active, color: "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-900/30" },
                    { label: "Low Stock", val: stats.lowStock, color: "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/30" },
                    { label: "Out of Stock", val: stats.outOfStock, color: "text-rose-600 bg-rose-50 dark:text-rose-400 dark:bg-rose-900/30" },
                  ].map((s) => (
                    <div key={s.label} className={cn("p-2 rounded-xl", s.color)}>
                      <p className="text-xl font-black">{s.val}</p>
                      <p className="text-[8px] font-black uppercase tracking-normal mt-0.5 opacity-80">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t dark:border-zinc-800">
                <p className="text-[9px] font-black text-gray-400 dark:text-zinc-500 uppercase tracking-widest mb-3">Live Roll Analytics</p>
                <div className="grid grid-cols-2 gap-3">
                  
                  {/* Active Rolls Popover */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="flex flex-col items-center justify-center p-3 rounded-2xl bg-emerald-500 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white w-full active:scale-[0.97] transition-all shadow-md shadow-emerald-500/10">
                        <span className="text-2xl font-black">{totalActiveRollsCount}</span>
                        <span className="text-[9px] font-black uppercase tracking-wider mt-0.5 opacity-90 flex items-center gap-1">
                          Active Rolls <ChevronDown className="w-2.5 h-2.5" />
                        </span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-4 rounded-2xl bg-white dark:bg-zinc-900 shadow-xl border border-gray-100 dark:border-zinc-800" align="center">
                      <div className="space-y-3">
                        <div className="border-b dark:border-zinc-800 pb-2 flex items-center justify-between">
                          <h4 className="text-xs font-black uppercase text-gray-500 dark:text-zinc-400 tracking-wider">Active Rolls</h4>
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">{totalActiveRollsCount} total</span>
                        </div>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto no-scrollbar">
                          {activeRollGroups.length === 0 ? (
                            <p className="text-[10px] text-gray-400 dark:text-zinc-500 italic py-2 text-center">No active rolls.</p>
                          ) : (
                            activeRollGroups.map(([key, count]) => (
                              <div key={key} className="flex justify-between items-center text-xs py-1">
                                <span className="font-bold text-gray-700 dark:text-zinc-300">{key}</span>
                                <span className="font-black text-gray-900 dark:text-white bg-slate-50 dark:bg-zinc-800 px-2 py-0.5 rounded-md">{count} {count === 1 ? 'roll' : 'rolls'}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>

                  {/* Depleted/Used Rolls Popover */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="flex flex-col items-center justify-center p-3 rounded-2xl bg-gray-500 hover:bg-gray-600 dark:bg-zinc-700 dark:hover:bg-zinc-650 text-white w-full active:scale-[0.97] transition-all shadow-md shadow-gray-500/10">
                        <span className="text-2xl font-black">{totalDepletedRollsCount}</span>
                        <span className="text-[9px] font-black uppercase tracking-wider mt-0.5 opacity-90 flex items-center gap-1">
                          Used Rolls <ChevronDown className="w-2.5 h-2.5" />
                        </span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-4 rounded-2xl bg-white dark:bg-zinc-900 shadow-xl border border-gray-100 dark:border-zinc-800" align="center">
                      <div className="space-y-3">
                        <div className="border-b dark:border-zinc-800 pb-2 flex items-center justify-between">
                          <h4 className="text-xs font-black uppercase text-gray-500 dark:text-zinc-400 tracking-wider">Used / Depleted</h4>
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400">{totalDepletedRollsCount} total</span>
                        </div>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto no-scrollbar">
                          {depletedRollGroups.length === 0 ? (
                            <p className="text-[10px] text-gray-400 dark:text-zinc-500 italic py-2 text-center">No depleted rolls.</p>
                          ) : (
                            depletedRollGroups.map(([key, count]) => (
                              <div key={key} className="flex justify-between items-center text-xs py-1">
                                <span className="font-bold text-gray-700 dark:text-zinc-300">{key}</span>
                                <span className="font-black text-gray-900 dark:text-white bg-slate-50 dark:bg-zinc-800 px-2 py-0.5 rounded-md">{count} {count === 1 ? 'roll' : 'rolls'}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>

                </div>
              </div>
            </CardContent>
          </Card>

          <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { 
                title: "Capital Invested", 
                val: `₦${stats.totalSpent.toLocaleString()}`, 
                icon: Coins, 
                color: "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/30",
                sub: "Total Spent on Roll Assets"
              },
              { 
                title: "Remaining Asset Cost", 
                val: `₦${stats.totalRemainingAsset.toLocaleString()}`, 
                icon: CircleDollarSign, 
                color: "text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-900/30",
                sub: `${Math.round(stats.totalFt).toLocaleString()} ft remaining`
              },
            ].map((s, i) => (
              <Card key={i} className="bg-white dark:bg-zinc-900 border-none shadow-sm h-full">
                <CardContent className="p-5 flex items-center justify-between h-full">
                  <div>
                    <p className="text-[10px] font-black text-gray-500 dark:text-zinc-400 uppercase tracking-widest mb-1.5">{s.title}</p>
                    <p className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white leading-tight">{s.val}</p>
                    <p className="text-[9px] text-gray-400 dark:text-zinc-500 font-bold uppercase mt-1.5 tracking-wider leading-none">{s.sub}</p>
                  </div>
                  <div className={`p-3 rounded-2xl ${s.color}`}><s.icon className="w-5 h-5" /></div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Bottom Row: Revenue */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-white dark:bg-zinc-900 border-none shadow-sm md:col-span-2 overflow-hidden">
            <CardContent className="p-0 h-full flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-gray-50 dark:divide-zinc-800">
              {[
                { 
                  title: "Realised Revenue", 
                  val: `₦${stats.totalRealisedRevenue.toLocaleString()}`, 
                  icon: CheckCircle2, 
                  color: "text-sky-600 bg-sky-50 dark:text-sky-400 dark:bg-sky-900/30",
                  sub: "Revenue from Used Stock"
                },
                { 
                  title: "Expected Revenue", 
                  val: `₦${stats.totalRemainingRevenue.toLocaleString()}`, 
                  icon: TrendingUp, 
                  color: "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-900/30",
                  sub: "Estimated Sales Potential"
                },
              ].map((s, i) => (
                <div key={i} className="flex-1 p-5 flex items-center justify-between hover:bg-gray-50/50 dark:hover:bg-zinc-800/30 transition-colors">
                  <div>
                    <p className="text-[10px] font-black text-gray-500 dark:text-zinc-400 uppercase tracking-widest mb-1.5">{s.title}</p>
                    <p className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white leading-tight">{s.val}</p>
                    <p className="text-[9px] text-gray-400 dark:text-zinc-500 font-bold uppercase mt-1.5 tracking-wider leading-none">{s.sub}</p>
                  </div>
                  <div className={`p-3 rounded-2xl ${s.color}`}><s.icon className="w-5 h-5" /></div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-brand-700 dark:bg-brand-900 border-none shadow-lg shadow-brand-700/20 md:col-span-1 text-white relative overflow-hidden group">
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none group-hover:bg-white/20 transition-all duration-700" />
            <div className="absolute -bottom-10 -left-10 w-24 h-24 bg-black/10 rounded-full blur-xl pointer-events-none" />
            <CardContent className="p-6 h-full flex flex-col justify-center relative z-10">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-brand-100/80">Total Est. Revenue</p>
                <div className="p-2 bg-white/10 rounded-xl">
                  <Sparkles className="w-4 h-4 text-brand-100" />
                </div>
              </div>
              <p className="text-3xl lg:text-4xl font-black leading-tight tracking-tight mb-2">
                ₦{(stats.totalRealisedRevenue + stats.totalRemainingRevenue).toLocaleString()}
              </p>
              <p className="text-[10px] text-brand-200 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Realised + Expected
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-sm border border-gray-100 dark:border-zinc-800 overflow-hidden">
        <div className="p-6 border-b border-gray-50 dark:border-zinc-800 flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 dark:text-zinc-400" />
            <Input placeholder="Search materials by name or category..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 h-11 bg-gray-50 dark:bg-zinc-800 border-none rounded-xl dark:text-zinc-100" />
          </div>
          <Button variant="ghost" size="sm" onClick={fetchData} className="font-bold text-gray-500 dark:text-zinc-400">
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/50 dark:bg-zinc-800/50 border-none">
                {["Material Profile", "Width", "Rolls", "Total Stock", "Status"].map(h => (
                  <TableHead key={h} className={cn("text-[10px] font-black uppercase text-gray-600 dark:text-zinc-400 py-4 whitespace-nowrap", h === "Material Profile" ? "pl-6" : ["Rolls","Total Stock","Status"].includes(h) ? "text-center" : "")}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMaterials.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-20">
                    <div className="flex flex-col items-center gap-2 text-gray-300 dark:text-zinc-700">
                      <Package className="w-10 h-10 mb-1 opacity-40" />
                      <p className="text-sm font-bold text-gray-500 dark:text-zinc-400">No materials found</p>
                      <p className="text-xs text-gray-400 dark:text-zinc-500">{search ? "Try a different search term" : "Add your first roll using the button above"}</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredMaterials.map((mat, index) => {
                const matId = mat["Material ID"];
                const total = parseNum(mat["Total Capacity (ft)"]);
                const remaining = parseNum(mat["Total Remaining (ft)"]);
                const rollCount = parseNum(mat["Roll Count"]) || 0;
                const activeRollId = mat["Active Roll ID"] || "";
                const matchedRolls = inventory.filter(r => r["Material ID"] === matId);
                const displayRolls = matchedRolls.length > 0 ? matchedRolls : inventory.filter(r => (r["Roll ID"] || "").startsWith(mat["Material Name"] || "XXXXXX"));
                const pct = total > 0 ? Math.min(100, (remaining / total) * 100) : 0;
                const barColor = mat.Status === "Out of Stock" || mat.Status === "Depleted" ? "bg-rose-500" : mat.Status === "Low Stock" ? "bg-amber-500" : "bg-emerald-500";
                const isExpanded = expandedMaterialId === matId;
                const rollCountDisplay = rollCount || displayRolls.length;
                const bgClass = index % 2 === 0
                  ? "bg-white dark:bg-zinc-900"
                  : "bg-slate-50/50 dark:bg-zinc-900/30";

                return (
                  <Fragment key={matId}>
                    <TableRow className={cn("border-b border-gray-50 dark:border-zinc-800 hover:bg-gray-50/30 dark:hover:bg-zinc-800/50 cursor-pointer", bgClass)} onClick={() => setExpandedMaterialId(isExpanded ? null : matId)}>
                      <TableCell className="font-bold py-4 pl-6">
                        <div className="flex items-center gap-2">
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-400 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
                          <div className="min-w-0">
                            <p className="text-sm font-black text-gray-900 dark:text-zinc-100 truncate">{mat["Material Name"]}</p>
                            <p className="text-[10px] text-gray-400 dark:text-zinc-500 font-mono">{matId}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-black text-brand-700 dark:text-brand-400 whitespace-nowrap">{parseNum(mat["Width (ft)"])}ft</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-[10px] font-bold border-gray-200 dark:border-zinc-700 whitespace-nowrap">
                          {rollCountDisplay} {rollCountDisplay === 1 ? "Roll" : "Rolls"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className="font-black text-gray-900 dark:text-white text-sm whitespace-nowrap">{remaining.toFixed(1)}ft</span>
                          <div className="w-20 h-1.5 rounded-full bg-gray-100 dark:bg-zinc-700 overflow-hidden">
                            <div className={`h-full rounded-full [transition:width_500ms_ease-out] ${barColor}`} style={{ width: `${pct.toFixed(1)}%` }} />
                          </div>
                          <span className="text-[9px] text-gray-400 dark:text-zinc-500">{pct.toFixed(0)}% left</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center"><StatusPill status={mat.Status || "Active"} /></TableCell>
                    </TableRow>

                    {isExpanded && (
                      <TableRow className="bg-gray-50/50 dark:bg-zinc-800/20 border-b border-gray-50 dark:border-zinc-800">
                        <TableCell colSpan={5} className="p-0">
                          <div className="p-4 md:p-6">
                            {/* Material Valuation Sub-Panel */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 p-4 bg-gray-50 dark:bg-zinc-900/30 border border-gray-100 dark:border-zinc-800 rounded-2xl shadow-inner">
                              <div>
                                <span className="text-gray-400 dark:text-zinc-500 block uppercase tracking-wider font-black text-[9px]">Spent on Material</span>
                                <span className="font-black text-base text-gray-900 dark:text-white">₦{parseNum(mat["Total Spent"]).toLocaleString()}</span>
                              </div>
                              <div>
                                <span className="text-gray-400 dark:text-zinc-500 block uppercase tracking-wider font-black text-[9px]">Remaining Cost Value</span>
                                <span className="font-black text-base text-purple-600 dark:text-purple-400">₦{parseNum(mat["Total Remaining Asset Value"]).toLocaleString()}</span>
                              </div>
                              <div>
                                <span className="text-gray-400 dark:text-zinc-500 block uppercase tracking-wider font-black text-[9px]">Expected Sales Revenue</span>
                                <span className="font-black text-base text-emerald-600 dark:text-emerald-400">₦{parseNum(mat["Total Remaining Revenue"]).toLocaleString()}</span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between mb-4">
                              <h4 className="text-[10px] font-black uppercase text-gray-400 dark:text-zinc-500 tracking-widest flex items-center gap-2">
                                <Package className="w-3 h-3" /> Physical Roll Log
                              </h4>
                              <div className="flex items-center gap-2">
                                {activeRollId && (
                                  <span className="flex items-center gap-1 text-[9px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 rounded-full border border-emerald-100 dark:border-emerald-900/30">
                                    <Zap className="w-2.5 h-2.5" /> Active: {activeRollId}
                                  </span>
                                )}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 rounded-lg text-[10px] font-black border-amber-200 dark:border-amber-800/40 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/10 whitespace-nowrap"
                                  onClick={(e) => { e.stopPropagation(); setRestockTarget(mat); }}
                                >
                                  Restock Material
                                </Button>
                              </div>
                            </div>
                            <div className="space-y-2">
                              {displayRolls.length === 0 ? (
                                <p className="text-xs text-gray-400 dark:text-zinc-500 italic py-4 text-center">No physical rolls linked to this profile yet.</p>
                              ) : displayRolls.map(roll => {
                                const rTotal = parseNum(roll["Total Length (ft)"]);
                                const rRem = parseNum(roll["Remaining Length (ft)"]);
                                const rPct = rTotal > 0 ? Math.min(100, (rRem / rTotal) * 100) : 0;
                                const isActiveRoll = roll["Roll ID"] === activeRollId;
                                const rollBarColor = roll.Status === "Out of Stock" || rRem <= 0 ? "bg-rose-500" : roll.Status === "Low Stock" ? "bg-amber-500" : "bg-brand-500";

                                const isFinished = roll.Status === "Depleted" || roll.Status === "Out of Stock";
                                return (
                                  <div
                                    key={roll["Roll ID"]}
                                    className={cn(
                                      "p-4 rounded-xl border shadow-sm",
                                      isFinished
                                        ? "bg-gray-50 dark:bg-zinc-800/30 border-gray-100 dark:border-zinc-800 opacity-60"
                                        : isActiveRoll
                                        ? "bg-white dark:bg-zinc-900 border-emerald-200 dark:border-emerald-800/40 ring-1 ring-emerald-200 dark:ring-emerald-800/40"
                                        : "bg-white dark:bg-zinc-900 border-gray-100 dark:border-zinc-800"
                                    )}
                                  >
                                    {/* Roll header row */}
                                    <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                                      <div className="flex items-center gap-3">
                                        <div className={cn(
                                          "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                                          isFinished ? "bg-gray-100 dark:bg-zinc-700/50" : isActiveRoll ? "bg-emerald-50 dark:bg-emerald-900/20" : "bg-gray-50 dark:bg-zinc-800"
                                        )}>
                                          <Package className={cn("w-4 h-4", isFinished ? "text-gray-300 dark:text-zinc-600" : isActiveRoll ? "text-emerald-500" : "text-gray-400 dark:text-zinc-500")} />
                                        </div>
                                        <div>
                                          <div className="flex items-center gap-2">
                                            <p className="text-sm font-black text-gray-900 dark:text-white">{roll["Roll ID"]}</p>
                                            {isActiveRoll && (
                                              <span className="text-[8px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-1.5 py-0.5 rounded-full border border-emerald-100 dark:border-emerald-800/30 uppercase tracking-wide">
                                                Active
                                              </span>
                                            )}
                                          </div>
                                          <p className="text-[10px] text-gray-400 dark:text-zinc-500">{roll["Date Added"] || "—"}</p>
                                        </div>
                                      </div>
                                      <StatusPill status={roll.Status || "Active"} />
                                    </div>

                                    {/* Progress bar */}
                                    <div className="mb-3">
                                      <div className="flex items-center justify-between mb-1">
                                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider">Remaining</span>
                                        <span className="text-[10px] font-black text-gray-700 dark:text-zinc-300">
                                          {rRem.toFixed(1)}ft <span className="text-gray-400 font-medium">of {rTotal.toFixed(0)}ft</span>
                                        </span>
                                      </div>
                                      <div className="w-full h-2 rounded-full bg-gray-100 dark:bg-zinc-800 overflow-hidden">
                                        <div
                                          className={cn("h-full rounded-full [transition:width_500ms_ease-out]", rollBarColor)}
                                          style={{ width: `${rPct.toFixed(1)}%` }}
                                        />
                                      </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-2 justify-end">
                                      {isFinished ? (
                                        <span className="text-[9px] font-black text-gray-300 dark:text-zinc-600 uppercase tracking-widest">Roll Complete</span>
                                      ) : (
                                        <>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-8 rounded-lg text-[10px] font-black border-rose-200 dark:border-rose-900/40 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/10"
                                            onClick={(e) => { e.stopPropagation(); setWasteTarget(roll); }}
                                          >
                                            Log Waste
                                          </Button>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-8 rounded-lg text-[10px] font-black border-gray-200 dark:border-zinc-700 hover:bg-brand-50 dark:hover:bg-zinc-800"
                                            onClick={(e) => { e.stopPropagation(); setAdjustTarget(roll); }}
                                          >
                                            Adjust Stock
                                          </Button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <AdjustDialog roll={adjustTarget} onClose={() => setAdjustTarget(null)} onDone={() => { setAdjustTarget(null); fetchData(); }} />
      <RestockDialog material={restockTarget} onClose={() => setRestockTarget(null)} onDone={() => { setRestockTarget(null); fetchData(); }} />
      {wasteTarget && (
        <WasteLogModal
          roll={wasteTarget as InventoryRollForWaste}
          isOpen={!!wasteTarget}
          onClose={() => setWasteTarget(null)}
          onSaved={() => { setWasteTarget(null); fetchData(); }}
        />
      )}
    </div>
  );
}

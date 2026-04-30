"use client";

import { useEffect, useState, useMemo } from "react";
import { Package, Plus, Search, RefreshCw, AlertTriangle, CheckCircle2, XCircle, Ruler, ChevronDown, ChevronUp, Info } from "lucide-react";
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

type Roll = Record<string, any> & { _rowIndex: number };

const parseNum = (v: any) => parseFloat(String(v ?? "0").replace(/,/g, "")) || 0;
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
  const [form, setForm] = useState({ itemName: "", category: "General", widthFt: "", rawLength: "", lengthUnit: "m" as "m" | "ft", price: "", cost: "", lowStockThreshold: "20" });

  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));

  const rawLengthFt = useMemo(() => {
    const raw = parseFloat(form.rawLength) || 0;
    return form.lengthUnit === "m" ? raw * METERS_TO_FEET : raw;
  }, [form.rawLength, form.lengthUnit]);

  const usableLength = Math.max(0, rawLengthFt - 10);
  const totalAreaSqft = (parseFloat(form.widthFt) || 0) * usableLength;
  const costPerSqft = totalAreaSqft > 0 ? (parseFloat(form.cost) || 0) / totalAreaSqft : 0;

  const handleSave = async () => {
    if (!form.itemName || !form.widthFt || !form.rawLength) {
      toast.error("Material name, width, and length are required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemName: form.itemName.trim(), category: form.category.trim(), widthFt: parseFloat(form.widthFt), rawLengthFt: rawLengthFt.toFixed(2), unit: form.lengthUnit, price: form.price, cost: form.cost, lowStockThreshold: form.lowStockThreshold }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to add roll");
      toast.success(`Roll added — ID: ${json.rollId}`);
      setOpen(false);
      setForm({ itemName: "", category: "General", widthFt: "", rawLength: "", lengthUnit: "m", price: "", cost: "", lowStockThreshold: "20" });
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
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5 col-span-2">
              <Label className="text-[10px] uppercase font-black text-gray-400 tracking-wider">Material Name *</Label>
              <Input placeholder="e.g. Flex, SAV, Clear Sticker" value={form.itemName} onChange={e => set("itemName", e.target.value)} className="rounded-xl dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-black text-gray-400 tracking-wider">Category</Label>
              <Input value={form.category} onChange={e => set("category", e.target.value)} className="rounded-xl dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100" />
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
                    className={cn("flex-1 h-10 rounded-xl text-xs font-black border-2 transition-all", form.widthFt === w ? "border-brand-600 bg-brand-600 text-white" : "border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-zinc-400 hover:border-brand-300")}>
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
          {costPerSqft > 0 && (
            <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-zinc-800/50 rounded-xl">
              <Info className="w-4 h-4 text-gray-400 shrink-0" />
              <p className="text-xs text-gray-500 dark:text-zinc-400">
                Cost per sqft: <span className="font-black text-gray-800 dark:text-zinc-100">₦{costPerSqft.toFixed(2)}</span> based on {totalAreaSqft.toFixed(0)} usable sqft
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
  const [saving, setSaving] = useState(false);

  if (!roll) return null;

  const handleSave = async () => {
    const adj = parseFloat(amount);
    if (isNaN(adj)) return;
    setSaving(true);
    try {
      const res = await fetch("/api/inventory", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rowIndex: roll._rowIndex, adjustment: adj }) });
      if (res.ok) { toast.success("Stock adjusted!"); setAmount(""); onDone(); }
      else { const j = await res.json(); toast.error(j.error || "Failed"); }
    } catch { toast.error("Network error"); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={!!roll} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm bg-white dark:bg-zinc-900 rounded-3xl p-6 border-none shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-black text-gray-900 dark:text-white">Manual Adjustment</DialogTitle>
          <p className="text-xs text-gray-500 dark:text-zinc-400">{roll["Roll ID"]} — Current: <span className="font-black">{parseNum(roll["Remaining Length (ft)"]).toFixed(1)}ft</span></p>
        </DialogHeader>
        <div className="space-y-3 py-4">
          <Label className="text-[10px] uppercase font-black text-gray-400 tracking-wider">Adjustment (ft)</Label>
          <Input type="number" placeholder="e.g. -5 for damage, +50 for restock" value={amount} onChange={e => setAmount(e.target.value)} className="rounded-xl h-12 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100" />
          <p className="text-[9px] text-gray-400 italic">Use negative (−) to subtract, positive (+) to add.</p>
        </div>
        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1 rounded-xl h-11 font-bold dark:bg-zinc-900 dark:border-zinc-700 dark:text-zinc-400">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1 bg-brand-700 hover:bg-brand-800 text-white font-black rounded-xl h-11">Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const [rolls, setRolls] = useState<Roll[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [adjustTarget, setAdjustTarget] = useState<Roll | null>(null);
  const [wasteTarget, setWasteTarget] = useState<Roll | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchInventory = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/inventory");
      const json = await res.json();
      if (res.ok) setRolls(json.data || []);
      else toast.error(json.error || "Failed to load inventory");
    } catch { toast.error("Network error"); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetchInventory(); }, []);

  const filtered = useMemo(() => rolls.filter(r =>
    r["Roll ID"]?.toLowerCase().includes(search.toLowerCase()) ||
    r["Item Name"]?.toLowerCase().includes(search.toLowerCase()) ||
    r["Category"]?.toLowerCase().includes(search.toLowerCase())
  ), [rolls, search]);

  const stats = useMemo(() => ({
    active: rolls.filter(r => r.Status === "Active").length,
    lowStock: rolls.filter(r => r.Status === "Low Stock").length,
    outOfStock: rolls.filter(r => r.Status === "Out of Stock" || r.Status === "Depleted").length,
    totalFt: rolls.reduce((acc, r) => acc + parseNum(r["Remaining Length (ft)"]), 0),
  }), [rolls]);

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
            <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">Inventory Management</h1>
            {refreshing && <RefreshCw className="w-4 h-4 text-brand-600 animate-spin" />}
          </div>
          <p className="text-gray-500 dark:text-zinc-400 text-sm mt-1">Linear length tracking per roll · 10ft waste reserved upfront</p>
        </div>
        <AddRollDialog onAdded={fetchInventory} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { title: "Active Rolls", val: stats.active, icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-900/30" },
          { title: "Low Stock", val: stats.lowStock, icon: AlertTriangle, color: "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/30" },
          { title: "Out of Stock", val: stats.outOfStock, icon: XCircle, color: "text-rose-600 bg-rose-50 dark:text-rose-400 dark:bg-rose-900/30" },
          { title: "Total Remaining", val: `${Math.round(stats.totalFt).toLocaleString()}ft`, icon: Ruler, color: "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/30" },
        ].map((s, i) => (
          <Card key={i} className="bg-white dark:bg-zinc-900 border-none shadow-sm hover:shadow-md transition-all">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-gray-500 dark:text-zinc-400 uppercase tracking-widest mb-1">{s.title}</p>
                <p className="text-2xl font-black text-gray-900 dark:text-white">{s.val}</p>
              </div>
              <div className={`p-3 rounded-2xl ${s.color}`}><s.icon className="w-5 h-5" /></div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-sm border border-gray-100 dark:border-zinc-800 overflow-hidden">
        <div className="p-6 border-b border-gray-50 dark:border-zinc-800 flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 dark:text-zinc-400" />
            <Input placeholder="Search rolls by ID, material, category..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 h-11 bg-gray-50 dark:bg-zinc-800 border-none rounded-xl dark:text-zinc-100" />
          </div>
          <Button variant="ghost" size="sm" onClick={fetchInventory} className="font-bold text-gray-500 dark:text-zinc-400">
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/50 dark:bg-zinc-800/50 border-none">
              {["Roll ID", "Width", "Usable Total", "Remaining", "Waste Logged", "Status", "Actions"].map(h => (
                <TableHead key={h} className={cn("text-[10px] font-black uppercase text-gray-600 dark:text-zinc-400 py-4", h === "Roll ID" ? "pl-6" : ["Usable Total","Remaining","Waste Logged","Status","Actions"].includes(h) ? "text-center" : "")}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-20 text-gray-500 italic">No inventory rolls found.</TableCell></TableRow>
            ) : filtered.map(roll => {
              const total = parseNum(roll["Total Length (ft)"]);
              const remaining = parseNum(roll["Remaining Length (ft)"]);
              const wasteFt = parseNum(roll["Waste Logged (ft)"]);
              const pct = total > 0 ? Math.min(100, (remaining / total) * 100) : 0;
              const barColor = roll.Status === "Out of Stock" || roll.Status === "Depleted" ? "bg-rose-500" : roll.Status === "Low Stock" ? "bg-amber-500" : "bg-emerald-500";
              const isExpanded = expandedId === roll["Roll ID"];

              return (
                <>
                  <TableRow key={roll._rowIndex} className="border-b border-gray-50 dark:border-zinc-800 hover:bg-gray-50/30 dark:hover:bg-zinc-800/50 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : roll["Roll ID"])}>
                    <TableCell className="font-bold py-4 pl-6">
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                        <div>
                          <p className="text-sm font-black text-gray-900 dark:text-zinc-100">{roll["Roll ID"]}</p>
                          <p className="text-[10px] text-gray-400 dark:text-zinc-500">{roll["Category"]}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-black text-brand-700 dark:text-brand-400">{parseNum(roll["Width (ft)"])}ft</TableCell>
                    <TableCell className="text-center font-bold text-gray-700 dark:text-zinc-300">{total.toFixed(1)}ft</TableCell>
                    <TableCell className="text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className="font-black text-gray-900 dark:text-white text-sm">{remaining.toFixed(1)}ft</span>
                        <div className="w-20 h-1.5 rounded-full bg-gray-100 dark:bg-zinc-700 overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct.toFixed(1)}%` }} />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-sm font-bold text-rose-500 dark:text-rose-400">{wasteFt.toFixed(1)}ft</TableCell>
                    <TableCell className="text-center"><StatusPill status={roll.Status || "Active"} /></TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1.5">
                        <Button variant="outline" size="sm" className="h-7 rounded-lg text-[10px] font-black text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900/50 hover:bg-rose-50" onClick={() => setWasteTarget(roll)}>Log Waste</Button>
                        <Button variant="outline" size="sm" className="h-7 rounded-lg border-gray-200 dark:border-zinc-700 text-[10px] font-bold dark:text-zinc-300" onClick={() => setAdjustTarget(roll)}>Adjust</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow key={`${roll._rowIndex}-detail`} className="bg-gray-50/50 dark:bg-zinc-800/20 border-b border-gray-50 dark:border-zinc-800">
                      <TableCell colSpan={7} className="py-4 pl-10">
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-xs">
                          {[
                            { label: "Raw Length", val: `${parseNum(roll["Raw Length (ft)"]).toFixed(1)}ft` },
                            { label: "Waste Reserved", val: "10ft upfront" },
                            { label: "Selling Price", val: `₦${parseNum(roll["Price"]).toLocaleString()}/sqft` },
                            { label: "Cost per Sqft", val: `₦${parseFloat(String(roll["Cost per Sqft"] || "0")).toFixed(2)}` },
                            { label: "Date Added", val: roll["Date Added"] || "—" },
                            { label: "Low Stock Threshold", val: `${parseNum(roll["Low Stock Threshold (ft)"])}ft` },
                          ].map(({ label, val }) => (
                            <div key={label}>
                              <p className="text-[9px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider mb-0.5">{label}</p>
                              <p className="font-bold text-gray-700 dark:text-zinc-300">{val}</p>
                            </div>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <AdjustDialog roll={adjustTarget} onClose={() => setAdjustTarget(null)} onDone={() => { setAdjustTarget(null); fetchInventory(); }} />
      {wasteTarget && (
        <WasteLogModal
          roll={wasteTarget as InventoryRollForWaste}
          isOpen={!!wasteTarget}
          onClose={() => setWasteTarget(null)}
          onSaved={() => { setWasteTarget(null); fetchInventory(); }}
        />
      )}
    </div>
  );
}

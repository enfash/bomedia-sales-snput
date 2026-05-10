"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Ruler, Calculator, RefreshCw, Share2, Copy, Check,
  ChevronRight, Package, AlertTriangle, Plus, Trash2,
  ArrowLeft, ChevronDown, ChevronUp, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import Link from "next/link";
import { useSyncStore } from "@/lib/store";

// ─── Types ────────────────────────────────────────────────────────────────────

interface InventoryRoll {
  "Roll ID": string;
  "Item Name": string;
  "Width (ft)": string | number;
  "Remaining Length (ft)": string | number;
  "Price": string | number;
  "Cost per Sqft": string | number;
  "Status": string;
  _rowIndex: number;
}

interface QuoteItem {
  id: string;
  description: string;
  width: string;
  height: string;
  qty: string;
  dimUnit: "ft" | "in";
  margin: string;
  rollId: string;
  open: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const parseNum = (v: any) => parseFloat(String(v ?? "0").replace(/,/g, "")) || 0;
const fmtMoney = (n: number) => `₦${n.toLocaleString(undefined, { minimumFractionDigits: 0 })}`;
const uid = () => Math.random().toString(36).slice(2, 8);

const toFt = (val: string, unit: "ft" | "in") => {
  const n = parseFloat(val) || 0;
  return unit === "in" ? n / 12 : n;
};

const PRESETS = [
  { label: "3×2", w: 3, h: 2 },
  { label: "4×3", w: 4, h: 3 },
  { label: "6×4", w: 6, h: 4 },
  { label: "8×4", w: 8, h: 4 },
  { label: "10×4", w: 10, h: 4 },
  { label: "12×4", w: 12, h: 4 },
];

function newItem(): QuoteItem {
  return { id: uid(), description: "", width: "", height: "", qty: "1", dimUnit: "ft", margin: "0", rollId: "", open: true };
}

// ─── Per-item calculation ─────────────────────────────────────────────────────

function calcItem(item: QuoteItem, roll: InventoryRoll | null) {
  const wFt          = toFt(item.width, item.dimUnit);
  const hFt          = toFt(item.height, item.dimUnit);
  const qty          = parseInt(item.qty) || 1;
  const basePrice    = roll ? parseNum(roll["Price"]) : 0;
  const costPerSqft  = roll ? parseNum(roll["Cost per Sqft"]) : 0;
  const marginPct    = parseFloat(item.margin) || 0;
  const rate         = basePrice * (1 + marginPct / 100);
  const rollWidth    = roll ? parseNum(roll["Width (ft)"]) : 0;
  const fitsNormal   = !roll || wFt <= rollWidth;
  const fitsFlipped  = !roll || hFt <= rollWidth;
  const isFlipped    = !fitsNormal && fitsFlipped;
  const widthOk      = fitsNormal || fitsFlipped;
  const unitSqft     = wFt * hFt;
  const unitCost     = unitSqft * rate;
  const totalCost    = unitCost * qty;
  const totalLength  = (isFlipped ? wFt : hFt) * qty;
  const remaining    = roll ? parseNum(roll["Remaining Length (ft)"]) : 0;
  const remainAfter  = remaining - totalLength;
  const stockOk      = totalLength === 0 || remainAfter >= 0;
  const matCost      = unitSqft * costPerSqft;
  const profit       = unitCost - matCost;
  const profitPct    = unitCost > 0 ? (profit / unitCost) * 100 : 0;
  return { wFt, hFt, qty, rollWidth, isFlipped, widthOk, unitSqft, unitCost, totalCost, stockOk, remainAfter, profit, profitPct, costPerSqft, rate };
}

// ─── Material picker (filtered) ───────────────────────────────────────────────

function MaterialPicker({
  item,
  inventory,
  onChange,
}: {
  item: QuoteItem;
  inventory: InventoryRoll[];
  onChange: (rollId: string) => void;
}) {
  const wFt    = toFt(item.width, item.dimUnit);
  const hFt    = toFt(item.height, item.dimUnit);
  const hasDims = wFt > 0 && hFt > 0;
  const minDim  = Math.min(wFt, hFt);

  const eligible = useMemo(() =>
    hasDims ? inventory.filter(r => parseNum(r["Width (ft)"]) >= minDim) : inventory,
    [inventory, hasDims, minDim],
  );

  const grouped = useMemo(() => {
    const map: Record<string, InventoryRoll[]> = {};
    eligible.forEach(r => {
      const k = r["Item Name"] || "Other";
      if (!map[k]) map[k] = [];
      map[k].push(r);
    });
    return map;
  }, [eligible]);

  if (eligible.length === 0 && hasDims) {
    return (
      <div className="flex items-center gap-2 p-3 bg-rose-50 dark:bg-rose-900/20 rounded-xl border border-rose-200 dark:border-rose-900/40">
        <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
        <p className="text-xs font-bold text-rose-600 dark:text-rose-400">
          No roll wide enough for {wFt.toFixed(1)}×{hFt.toFixed(1)}ft. Try a smaller size or add wider stock.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {hasDims && inventory.length !== eligible.length && (
        <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          Showing {eligible.length} of {inventory.length} rolls that fit this size
        </p>
      )}
      {Object.entries(grouped).map(([material, rolls]) => (
        <div key={material}>
          <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-zinc-600 mb-2">
            {material}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {rolls.map(roll => {
              const remaining = parseNum(roll["Remaining Length (ft)"]);
              const isOut = remaining <= 0 || roll.Status === "Out of Stock";
              const isLow = !isOut && roll.Status === "Low Stock";
              const isSel = roll["Roll ID"] === item.rollId;
              return (
                <button
                  key={roll["Roll ID"]}
                  type="button"
                  disabled={isOut}
                  onClick={() => onChange(roll["Roll ID"])}
                  className={cn(
                    "p-3 rounded-xl border-2 text-left transition-[border-color,background-color]",
                    isSel
                      ? "border-primary bg-primary/5 dark:bg-primary/10"
                      : isOut
                      ? "border-gray-100 dark:border-zinc-800 opacity-40 cursor-not-allowed"
                      : "border-gray-100 dark:border-zinc-800 hover:border-primary/40",
                  )}
                >
                  <p className="text-xs font-black text-gray-900 dark:text-white">
                    {parseNum(roll["Width (ft)"])}ft wide
                  </p>
                  <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-0.5">
                    ₦{parseNum(roll["Price"]).toLocaleString()}/sqft
                  </p>
                  <div className="flex items-center gap-1 mt-1.5">
                    <div className={cn("w-1.5 h-1.5 rounded-full",
                      isOut ? "bg-rose-400" : isLow ? "bg-amber-400" : "bg-emerald-400"
                    )} />
                    <span className="text-[9px] text-gray-400 dark:text-zinc-500">
                      {isOut ? "Out" : isLow ? "Low" : `${remaining.toFixed(0)}ft left`}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Single quote item card ───────────────────────────────────────────────────

function QuoteItemCard({
  item,
  index,
  inventory,
  canRemove,
  onChange,
  onRemove,
}: {
  item: QuoteItem;
  index: number;
  inventory: InventoryRoll[];
  canRemove: boolean;
  onChange: (patch: Partial<QuoteItem>) => void;
  onRemove: () => void;
}) {
  const roll = inventory.find(r => r["Roll ID"] === item.rollId) ?? null;
  const { wFt, hFt, qty, rollWidth, isFlipped, widthOk, unitSqft, unitCost, totalCost, stockOk, profit, profitPct, costPerSqft } = calcItem(item, roll);
  const hasResult = roll && unitSqft > 0;

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm overflow-hidden">
      {/* ── Header ── */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer select-none"
        onClick={() => onChange({ open: !item.open })}
      >
        <div className="w-7 h-7 rounded-full bg-primary/10 dark:bg-primary/20 flex items-center justify-center shrink-0">
          <span className="text-xs font-black text-primary">{index + 1}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-gray-900 dark:text-white truncate">
            {item.description || `Item ${index + 1}`}
          </p>
          {hasResult && !item.open && (
            <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-0.5">
              {item.width}{item.dimUnit} × {item.height}{item.dimUnit} × {qty} — <span className="text-primary font-bold">{fmtMoney(totalCost)}</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasResult && <span className="text-sm font-black text-primary">{fmtMoney(totalCost)}</span>}
          {canRemove && (
            <button type="button"
              onClick={e => { e.stopPropagation(); onRemove(); }}
              className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20 text-gray-400 hover:text-rose-500 transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97]">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          {item.open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </div>

      {/* ── Body ── */}
      {item.open && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-50 dark:border-zinc-800 pt-4">

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider">
              Description (optional)
            </Label>
            <Input placeholder="e.g. Banner, Roll-up, Sticker…"
              value={item.description}
              onChange={e => onChange({ description: e.target.value })}
              className="h-10 rounded-xl dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
            />
          </div>

          {/* Dimensions */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider flex items-center gap-1.5">
                <Ruler className="w-3 h-3" /> Size
              </Label>
              <div className="flex bg-gray-100 dark:bg-zinc-800 p-0.5 rounded-lg">
                {(["ft", "in"] as const).map(u => (
                  <button key={u} type="button" onClick={() => onChange({ dimUnit: u })}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-[10px] font-black uppercase transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97]",
                      item.dimUnit === u ? "bg-primary text-white" : "text-gray-500 dark:text-zinc-400",
                    )}>
                    {u}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 mb-3">
              {PRESETS.map(p => (
                <button key={p.label} type="button"
                  onClick={() => onChange({
                    width:  item.dimUnit === "in" ? String(p.w * 12) : String(p.w),
                    height: item.dimUnit === "in" ? String(p.h * 12) : String(p.h),
                  })}
                  className="px-2.5 py-1 rounded-lg bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-[10px] font-black text-gray-600 dark:text-zinc-400 hover:border-primary/50 hover:text-primary transition-[border-color,color,transform] duration-150 ease-out active:scale-[0.97]">
                  {p.label}ft
                </button>
              ))}
            </div>

            <div className="grid grid-cols-4 gap-2">
              {[
                { key: "width",  label: `W (${item.dimUnit})`, ph: item.dimUnit === "ft" ? "4" : "48" },
                { key: "height", label: `H (${item.dimUnit})`, ph: item.dimUnit === "ft" ? "8" : "96" },
                { key: "qty",    label: "Qty",                 ph: "1" },
                { key: "margin", label: "Margin %",            ph: "0" },
              ].map(({ key, label, ph }) => (
                <div key={key} className="space-y-1">
                  <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider">{label}</Label>
                  <Input type="number" min={key === "qty" ? "1" : "0"} placeholder={ph}
                    value={item[key as keyof QuoteItem] as string}
                    onChange={e => onChange({ [key]: e.target.value })}
                    className="h-11 rounded-xl font-bold dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
                  />
                </div>
              ))}
            </div>

            {roll && wFt > 0 && hFt > 0 && isFlipped && (
              <div className="mt-2 flex items-center gap-2 p-2.5 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-900/40">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
                  Rotated to fit — {item.dimUnit === "in" ? `${parseFloat(item.height)}in` : `${hFt.toFixed(1)}ft`} side along the {rollWidth.toFixed(1)}ft roll
                </p>
              </div>
            )}
            {roll && wFt > 0 && !widthOk && (
              <div className="mt-2 flex items-center gap-2 p-2.5 bg-rose-50 dark:bg-rose-900/20 rounded-xl border border-rose-200 dark:border-rose-900/40">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                <p className="text-[10px] font-bold text-rose-600 dark:text-rose-400">
                  Both dimensions exceed this roll's width — choose a wider material
                </p>
              </div>
            )}
          </div>

          {/* Material */}
          <div>
            <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider mb-2 block">
              Material
            </Label>
            <MaterialPicker item={item} inventory={inventory} onChange={rollId => onChange({ rollId })} />
          </div>

          {/* Result cards */}
          {hasResult && widthOk && (
            <>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "Area",      value: `${unitSqft.toFixed(2)} sqft` },
                  { label: "Rate",      value: `₦${calcItem(item, roll).rate.toFixed(0)}/sqft` },
                  { label: "Unit",      value: fmtMoney(unitCost) },
                  { label: "Total",     value: fmtMoney(totalCost), accent: true },
                ].map(c => (
                  <div key={c.label} className={cn(
                    "p-3 rounded-xl border text-center",
                    c.accent
                      ? "bg-primary border-primary/80 text-white"
                      : "bg-gray-50 dark:bg-zinc-800 border-gray-100 dark:border-zinc-700",
                  )}>
                    <p className={cn("text-[9px] font-black uppercase tracking-widest mb-1",
                      c.accent ? "text-white/60" : "text-gray-400 dark:text-zinc-500"
                    )}>{c.label}</p>
                    <p className={cn("text-sm font-black",
                      c.accent ? "text-white" : "text-gray-900 dark:text-white"
                    )}>{c.value}</p>
                  </div>
                ))}
              </div>

              {/* Profitability */}
              {costPerSqft > 0 && (
                <div className={cn(
                  "flex items-center justify-between p-2.5 rounded-xl border text-xs font-bold",
                  profitPct >= 40
                    ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-400"
                    : profitPct >= 20
                    ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-900/40 text-amber-700 dark:text-amber-400"
                    : "bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-900/40 text-rose-700 dark:text-rose-400"
                )}>
                  <span className="flex items-center gap-1"><Info className="w-3 h-3" /> Profit: {fmtMoney(profit * qty)}</span>
                  <span>{profitPct.toFixed(1)}% margin</span>
                </div>
              )}

              {!stockOk && (
                <div className="flex items-center gap-2 p-2.5 bg-rose-50 dark:bg-rose-900/20 rounded-xl border border-rose-200 dark:border-rose-900/40">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                  <p className="text-[10px] font-bold text-rose-600 dark:text-rose-400">
                    Insufficient stock for this quantity
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EstimatorPage() {
  const { cachedInventory, setCachedData, cachedSales, cachedExpenses, cachedPayments, cachedMaterials } = useSyncStore();
  const [mounted, setMounted] = useState(false);
  const [syncing, setSyncing]   = useState(false);
  const [clientName, setClientName] = useState("");
  const [items, setItems]       = useState<QuoteItem[]>([newItem()]);
  const [copied, setCopied]     = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const inventory = useMemo(() =>
    mounted ? (cachedInventory as InventoryRoll[]).filter(r => r["Status"] !== "Out of Stock") : [],
    [cachedInventory, mounted],
  );

  const refreshInventory = useCallback(async () => {
    setSyncing(true);
    try {
      const r = await fetch("/api/inventory");
      const j = await r.json();
      if (j.data) setCachedData(cachedSales, cachedExpenses, j.data, cachedPayments, cachedMaterials);
    } catch { /* silent */ }
    finally { setSyncing(false); }
  }, [cachedSales, cachedExpenses, cachedPayments, cachedMaterials, setCachedData]);

  useEffect(() => { refreshInventory(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const updateItem = (id: string, patch: Partial<QuoteItem>) =>
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it));

  const removeItem = (id: string) =>
    setItems(prev => prev.filter(it => it.id !== id));

  const addItem = () =>
    setItems(prev => [...prev.map(it => ({ ...it, open: false })), newItem()]);

  const grandTotal = useMemo(() =>
    items.reduce((sum, item) => {
      const roll = inventory.find(r => r["Roll ID"] === item.rollId) ?? null;
      return sum + calcItem(item, roll).totalCost;
    }, 0),
    [items, inventory],
  );

  const totalProfit = useMemo(() =>
    items.reduce((sum, item) => {
      const roll = inventory.find(r => r["Roll ID"] === item.rollId) ?? null;
      const { profit, qty } = calcItem(item, roll);
      return sum + profit * qty;
    }, 0),
    [items, inventory],
  );

  const quoteText = useMemo(() => {
    const lines: string[] = [`📋 *BOMedia Price Quote*`];
    if (clientName) lines.push(`👤 Client: ${clientName}`);
    lines.push("");

    let count = 0;
    items.forEach((item, i) => {
      const roll = inventory.find(r => r["Roll ID"] === item.rollId) ?? null;
      const { wFt, hFt, qty, unitCost, totalCost } = calcItem(item, roll);
      if (!roll || !wFt || !hFt) return;
      count++;
      lines.push(`*Item ${i + 1}${item.description ? ` — ${item.description}` : ""}*`);
      lines.push(`📐 ${item.width}${item.dimUnit} × ${item.height}${item.dimUnit} × ${qty} pcs`);
      lines.push(`🎨 ${roll["Item Name"]} (${parseNum(roll["Width (ft)"])}ft roll)`);
      lines.push(`💰 ₦${unitCost.toLocaleString()} × ${qty} = *${fmtMoney(totalCost)}*`);
      lines.push("");
    });

    if (count === 0) return "";
    if (count > 1) { lines.push(`✅ *Grand Total: ${fmtMoney(grandTotal)}*`); lines.push(""); }
    lines.push("_BOMedia — Large Format Printing_");
    return lines.join("\n");
  }, [items, inventory, clientName, grandTotal]);

  const handleCopy = async () => {
    if (!quoteText) return;
    await navigator.clipboard.writeText(quoteText);
    setCopied(true);
    toast.success("Quote copied");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWhatsApp = () => {
    if (!quoteText) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(quoteText)}`, "_blank");
  };

  const hasAnyResult = grandTotal > 0;

  return (
    <div className="min-h-screen bg-slate-50/80 dark:bg-zinc-950 pb-24 transition-colors duration-500">

      {/* ── Hero ── */}
      <div className="bg-primary dark:bg-primary/90 text-white px-4 py-8 md:px-8">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3">
            <Link href="/bom03">
              <button type="button" className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center hover:bg-white/30 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97]">
                <ArrowLeft className="w-4 h-4 text-white" />
              </button>
            </Link>
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
              <Calculator className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">Price Estimator</h1>
              <p className="text-white/70 text-xs font-medium">Multi-item quote builder · no sale logged</p>
            </div>
            <button type="button" onClick={refreshInventory}
              className="ml-auto p-2 rounded-xl bg-white/20 hover:bg-white/30 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97]">
              <RefreshCw className={cn("w-4 h-4 text-white", syncing && "animate-spin")} />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">

        {/* ── Client name ── */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm p-4">
          <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider">
            Client Name (optional)
          </Label>
          <Input placeholder="e.g. John Doe — appears on the quote"
            value={clientName}
            onChange={e => setClientName(e.target.value)}
            className="mt-1.5 h-11 rounded-xl dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
          />
        </div>

        {/* ── Loading states ── */}
        {inventory.length === 0 && syncing && (
          <div className="text-center py-10 bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800">
            <RefreshCw className="w-6 h-6 text-primary animate-spin mx-auto mb-2" />
            <p className="text-xs text-gray-400 dark:text-zinc-600 font-medium">Loading stock…</p>
          </div>
        )}
        {inventory.length === 0 && !syncing && (
          <div className="text-center py-10 bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800">
            <Package className="w-8 h-8 text-gray-200 dark:text-zinc-700 mx-auto mb-2" />
            <p className="text-sm text-gray-400 dark:text-zinc-600 font-medium">No materials in inventory.</p>
            <Link href="/bom03/inventory">
              <Button variant="ghost" size="sm" className="mt-2 text-primary font-black text-xs">
                Add rolls to inventory <ChevronRight className="w-3 h-3 ml-1" />
              </Button>
            </Link>
          </div>
        )}

        {/* ── Items ── */}
        {inventory.length > 0 && items.map((item, idx) => (
          <QuoteItemCard
            key={item.id}
            item={item}
            index={idx}
            inventory={inventory}
            canRemove={items.length > 1}
            onChange={patch => updateItem(item.id, patch)}
            onRemove={() => removeItem(item.id)}
          />
        ))}

        {/* ── Add item ── */}
        {inventory.length > 0 && (
          <button type="button" onClick={addItem}
            className="w-full flex items-center justify-center gap-2 p-3.5 rounded-2xl border-2 border-dashed border-primary/20 dark:border-primary/30 text-primary hover:border-primary/50 hover:bg-primary/5 transition-[border-color,background-color,transform] duration-150 ease-out active:scale-[0.97] font-bold text-sm">
            <Plus className="w-4 h-4" /> Add Another Item
          </button>
        )}

        {/* ── Grand total + actions ── */}
        {hasAnyResult && (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-black uppercase tracking-widest text-gray-700 dark:text-zinc-300">
                {items.length > 1 ? "Grand Total" : "Total"}
              </p>
              <p className="text-2xl font-black text-primary">{fmtMoney(grandTotal)}</p>
            </div>

            {/* Profit summary (admin) */}
            {totalProfit > 0 && (
              <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-900/40 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                <span>Est. total profit</span>
                <span className="font-black">{fmtMoney(totalProfit)} ({grandTotal > 0 ? ((totalProfit / grandTotal) * 100).toFixed(1) : 0}%)</span>
              </div>
            )}

            {/* Item breakdown */}
            {items.length > 1 && (
              <div className="space-y-1.5 border-t border-gray-50 dark:border-zinc-800 pt-3">
                {items.map((item, idx) => {
                  const roll = inventory.find(r => r["Roll ID"] === item.rollId) ?? null;
                  const { totalCost } = calcItem(item, roll);
                  if (!roll || totalCost === 0) return null;
                  return (
                    <div key={item.id} className="flex items-center justify-between text-xs">
                      <span className="text-gray-500 dark:text-zinc-400 font-medium">
                        {idx + 1}. {item.description || `Item ${idx + 1}`}
                      </span>
                      <span className="font-black text-gray-900 dark:text-white">{fmtMoney(totalCost)}</span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={handleWhatsApp}
                className="flex-1 h-11 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-black shadow-sm flex items-center justify-center gap-2">
                <Share2 className="w-4 h-4" /> Send via WhatsApp
              </Button>
              <Button onClick={handleCopy} variant="outline"
                className="h-11 px-4 rounded-xl font-black dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300">
                {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        )}

        {/* ── Log sale CTA ── */}
        {hasAnyResult && (
          <Link href="/new-entry">
            <div className="flex items-center justify-between p-4 bg-primary hover:bg-primary/90 rounded-2xl text-white transition-[background-color] shadow-lg shadow-primary/20 cursor-pointer">
              <div>
                <p className="text-sm font-black">Ready to log as a sale?</p>
                <p className="text-white/70 text-xs mt-0.5">Head to New Entry with these dimensions</p>
              </div>
              <ChevronRight className="w-5 h-5 text-white/70" />
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}

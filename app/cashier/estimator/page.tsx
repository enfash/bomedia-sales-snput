"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Ruler, Calculator, RefreshCw, Share2, Copy, Check,
  ChevronRight, Package, AlertTriangle, Plus, Trash2,
  ArrowLeft, ChevronDown, ChevronUp, Save
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSyncStore } from "@/lib/store";
import { MaterialSelector } from "@/components/material-selector";

// ─── Types ────────────────────────────────────────────────────────────────────

interface QuoteItem {
  id: string;
  description: string;
  width: string;
  height: string;
  qty: string;
  dimUnit: "ft" | "in";
  materialId: string;
  open: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const parseNum = (v: any) => parseFloat(String(v ?? "0").replace(/[^\d.-]/g, "")) || 0;
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
  return { id: uid(), description: "", width: "", height: "", qty: "1", dimUnit: "ft", materialId: "", open: true };
}

// ─── Per-item calculation ─────────────────────────────────────────────────────

function calcItem(item: QuoteItem, material: any) {
  const wFt = toFt(item.width, item.dimUnit);
  const hFt = toFt(item.height, item.dimUnit);
  const qty = parseInt(item.qty) || 1;
  const price = material ? parseNum(material["Selling Price"]) : 0;
  const rollWidth = material ? parseNum(material["Width (ft)"]) : 0;
  
  const fitsNormal  = !material || wFt <= rollWidth;
  const fitsFlipped = !material || hFt <= rollWidth;
  const isFlipped   = !fitsNormal && fitsFlipped;
  const widthOk     = fitsNormal || fitsFlipped;
  
  const unitSqft    = wFt * hFt;
  const unitCost    = unitSqft * price;
  const totalCost   = unitCost * qty;
  
  const totalLength = (isFlipped ? wFt : hFt) * qty;
  const remaining   = material ? parseNum(material["Total Remaining (ft)"]) : 0;
  const remainAfter = remaining - totalLength;
  const stockOk     = totalLength === 0 || remainAfter >= 0;
  
  return { wFt, hFt, qty, rollWidth, isFlipped, widthOk, unitSqft, unitCost, totalCost, stockOk, remainAfter };
}

// ─── Single quote item row ────────────────────────────────────────────────────

function QuoteItemCard({
  item,
  index,
  materials,
  canRemove,
  onChange,
  onRemove,
}: {
  item: QuoteItem;
  index: number;
  materials: any[];
  canRemove: boolean;
  onChange: (patch: Partial<QuoteItem>) => void;
  onRemove: () => void;
}) {
  const material = materials.find(m => m["Material ID"] === item.materialId) ?? null;
  const { wFt, hFt, qty, rollWidth, isFlipped, widthOk, unitSqft, unitCost, totalCost, stockOk } = calcItem(item, material);
  const hasResult = material && unitSqft > 0;

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm overflow-hidden">
      {/* ── Item header ── */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer select-none"
        onClick={() => onChange({ open: !item.open })}
      >
        <div className="w-7 h-7 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
          <span className="text-xs font-black text-orange-600 dark:text-orange-400">{index + 1}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-gray-900 dark:text-white truncate">
            {item.description || `Item ${index + 1}`}
          </p>
          {hasResult && !item.open && (
            <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-0.5">
              {item.width}{item.dimUnit} × {item.height}{item.dimUnit} × {qty} — <span className="text-orange-500 font-bold">{fmtMoney(totalCost)}</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasResult && (
            <span className="text-sm font-black text-orange-500">{fmtMoney(totalCost)}</span>
          )}
          {canRemove && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onRemove(); }}
              className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20 text-gray-400 hover:text-rose-500 transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97]"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          {item.open
            ? <ChevronUp className="w-4 h-4 text-gray-400" />
            : <ChevronDown className="w-4 h-4 text-gray-400" />
          }
        </div>
      </div>

      {/* ── Expanded body ── */}
      {item.open && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-50 dark:border-zinc-800 pt-4">

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider">
              Description (optional)
            </Label>
            <Input
              placeholder="e.g. Banner, Flex, Sticker…"
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
                  <button key={u} type="button"
                    onClick={() => onChange({ dimUnit: u })}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-[10px] font-black uppercase transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97]",
                      item.dimUnit === u ? "bg-orange-500 text-white" : "text-gray-500 dark:text-zinc-400",
                    )}>
                    {u}
                  </button>
                ))}
              </div>
            </div>

            {/* Presets */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {PRESETS.map(p => (
                <button key={p.label} type="button"
                  onClick={() => onChange({
                    width:  item.dimUnit === "in" ? String(p.w * 12) : String(p.w),
                    height: item.dimUnit === "in" ? String(p.h * 12) : String(p.h),
                  })}
                  className="px-2.5 py-1 rounded-lg bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-[10px] font-black text-gray-600 dark:text-zinc-400 hover:border-orange-400 hover:text-orange-600 transition-[border-color,color,transform] duration-150 ease-out active:scale-[0.97]">
                  {p.label}ft
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { key: "width",  label: `W (${item.dimUnit})`, ph: item.dimUnit === "ft" ? "4" : "48" },
                { key: "height", label: `H (${item.dimUnit})`, ph: item.dimUnit === "ft" ? "8" : "96" },
                { key: "qty",    label: "Qty",                 ph: "1" },
              ].map(({ key, label, ph }) => (
                <div key={key} className="space-y-1">
                  <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider">{label}</Label>
                  <Input
                    type="number"
                    min={key === "qty" ? "1" : undefined}
                    placeholder={ph}
                    value={item[key as keyof QuoteItem] as string}
                    onChange={e => onChange({ [key]: e.target.value })}
                    className="h-11 rounded-xl font-bold dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
                  />
                </div>
              ))}
            </div>

            {/* Orientation warnings */}
            {material && wFt > 0 && hFt > 0 && isFlipped && (
              <div className="mt-2 flex items-center gap-2 p-2.5 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-900/40">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
                  Rotated to fit — {item.dimUnit === "in" ? `${parseFloat(item.height)}in` : `${hFt.toFixed(1)}ft`} side along the {rollWidth.toFixed(1)}ft roll
                </p>
              </div>
            )}
            {material && wFt > 0 && !widthOk && (
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
            <MaterialSelector 
              materials={materials}
              selectedMaterialId={item.materialId}
              onSelect={mat => onChange({ materialId: mat["Material ID"] })}
              loading={false}
            />
          </div>

          {/* Line result */}
          {hasResult && widthOk && (
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Area",       value: `${unitSqft.toFixed(2)} sqft` },
                { label: "Unit Price", value: fmtMoney(unitCost) },
                { label: "Total",      value: fmtMoney(totalCost), accent: true },
              ].map(c => (
                <div key={c.label} className={cn(
                  "p-3 rounded-xl border text-center",
                  c.accent
                    ? "bg-orange-500 border-orange-400 text-white"
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
          )}
          {hasResult && !stockOk && (
            <div className="flex items-center gap-2 p-2.5 bg-rose-50 dark:bg-rose-900/20 rounded-xl border border-rose-200 dark:border-rose-900/40">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
              <p className="text-[10px] font-bold text-rose-600 dark:text-rose-400">
                Insufficient stock — confirm with your manager
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CashierEstimatorPage() {
  const router = useRouter();
  const { cachedMaterials, setCachedData, cachedSales, cachedExpenses, cachedPayments, cachedInventory } = useSyncStore();
  const [mounted, setMounted] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [clientName, setClientName] = useState("");
  const [items, setItems] = useState<QuoteItem[]>([newItem()]);
  const [copied, setCopied] = useState(false);
  const [savingQuote, setSavingQuote] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const materials = useMemo(() =>
    mounted ? cachedMaterials : [],
    [cachedMaterials, mounted],
  );

  const refreshMaterials = useCallback(async () => {
    setSyncing(true);
    try {
      const r = await fetch("/api/materials");
      const j = await r.json();
      if (j.data) setCachedData(cachedSales, cachedExpenses, cachedInventory, cachedPayments, j.data);
    } catch { /* silent */ }
    finally { setSyncing(false); }
  }, [cachedSales, cachedExpenses, cachedPayments, cachedInventory, setCachedData]);

  useEffect(() => { refreshMaterials(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const updateItem = (id: string, patch: Partial<QuoteItem>) =>
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it));

  const removeItem = (id: string) =>
    setItems(prev => prev.filter(it => it.id !== id));

  const addItem = () =>
    setItems(prev => [...prev.map(it => ({ ...it, open: false })), newItem()]);

  // Grand total
  const grandTotal = useMemo(() =>
    items.reduce((sum, item) => {
      const mat = materials.find(m => m["Material ID"] === item.materialId) ?? null;
      return sum + calcItem(item, mat).totalCost;
    }, 0),
    [items, materials],
  );

  // Multi-item quote text
  const quoteText = useMemo(() => {
    const lines: string[] = [`📋 *BOMedia Price Quote*`];
    if (clientName) lines.push(`👤 Client: ${clientName}`);
    lines.push("");

    let hasAny = false;
    items.forEach((item, i) => {
      const mat = materials.find(m => m["Material ID"] === item.materialId) ?? null;
      const { wFt, hFt, qty, unitCost, totalCost } = calcItem(item, mat);
      if (!mat || !wFt || !hFt) return;
      hasAny = true;
      lines.push(`*Item ${i + 1}${item.description ? ` — ${item.description}` : ""}*`);
      lines.push(`📐 ${item.width}${item.dimUnit} × ${item.height}${item.dimUnit} × ${qty} pcs`);
      lines.push(`🎨 ${mat["Material ID"]} (${parseNum(mat["Width (ft)"])}ft)`);
      lines.push(`💰 ₦${unitCost.toLocaleString()} × ${qty} = *${fmtMoney(totalCost)}*`);
      lines.push("");
    });

    if (!hasAny) return "";
    if (items.filter(it => {
      const mat = materials.find(m => m["Material ID"] === it.materialId) ?? null;
      const { wFt, hFt } = calcItem(it, mat);
      return mat && wFt && hFt;
    }).length > 1) {
      lines.push(`✅ *Grand Total: ${fmtMoney(grandTotal)}*`);
      lines.push("");
    }
    lines.push("_BOMedia — Large Format Printing_");
    return lines.join("\n");
  }, [items, materials, clientName, grandTotal]);

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

  const handleSaveQuote = async () => {
    if (!clientName.trim()) {
      toast.error("Please enter a Client Name to save a quote.");
      return;
    }
    if (grandTotal === 0) {
      toast.error("Add at least one valid item to save a quote.");
      return;
    }

    setSavingQuote(true);
    const quoteId = `QT-${Math.floor(1000 + Math.random() * 9000)}`;

    try {
      const res = await fetch("/api/estimates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteId,
          clientName,
          cartData: items
        })
      });
      
      const json = await res.json();
      if (res.ok) {
        toast.success(`Quote saved! ID: ${quoteId}`);
        // Copy to clipboard to make it easier for them
        navigator.clipboard.writeText(`Quote ID: ${quoteId}\n` + quoteText);
      } else {
        toast.error(json.error || "Failed to save quote");
      }
    } catch (e) {
      toast.error("Network error saving quote");
    } finally {
      setSavingQuote(false);
    }
  };

  const handleLogSale = () => {
    // Save to local storage for the new-entry page to pick up
    localStorage.setItem("estimatorCart", JSON.stringify({
      clientName,
      items
    }));
    router.push("/cashier/new-entry");
  };

  const hasAnyResult = grandTotal > 0;
  const allStockOk = items.every(item => {
    const mat = materials.find(m => m["Material ID"] === item.materialId) ?? null;
    return calcItem(item, mat).stockOk;
  });

  return (
    <div className="min-h-screen bg-slate-50/80 dark:bg-zinc-950 pb-24 transition-colors duration-500">

      {/* ── Hero ── */}
      <div className="bg-orange-500 dark:bg-orange-600 text-white px-4 py-8 md:px-8">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3">
            <Link href="/cashier">
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
            <button type="button" onClick={refreshMaterials}
              className="ml-auto p-2 rounded-xl bg-white/20 hover:bg-white/30 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97]"
              title="Refresh materials">
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
          <Input
            placeholder="e.g. John Doe — appears on the quote"
            value={clientName}
            onChange={e => setClientName(e.target.value)}
            className="mt-1.5 h-11 rounded-xl dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
          />
        </div>

        {/* ── Quote items ── */}
        {materials.length === 0 && syncing && (
          <div className="text-center py-10 bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800">
            <RefreshCw className="w-6 h-6 text-orange-400 animate-spin mx-auto mb-2" />
            <p className="text-xs text-gray-400 dark:text-zinc-600 font-medium">Loading materials…</p>
          </div>
        )}
        {materials.length === 0 && !syncing && (
          <div className="text-center py-10 bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800">
            <Package className="w-8 h-8 text-gray-200 dark:text-zinc-700 mx-auto mb-2" />
            <p className="text-sm text-gray-400 dark:text-zinc-600 font-medium">No materials available. Contact your manager.</p>
          </div>
        )}

        {materials.length > 0 && items.map((item, idx) => (
          <QuoteItemCard
            key={item.id}
            item={item}
            index={idx}
            materials={materials}
            canRemove={items.length > 1}
            onChange={patch => updateItem(item.id, patch)}
            onRemove={() => removeItem(item.id)}
          />
        ))}

        {/* ── Add item ── */}
        {materials.length > 0 && (
          <button
            type="button"
            onClick={addItem}
            className="w-full flex items-center justify-center gap-2 p-3.5 rounded-2xl border-2 border-dashed border-orange-200 dark:border-orange-900/40 text-orange-500 dark:text-orange-400 hover:border-orange-400 hover:bg-orange-50/50 dark:hover:bg-orange-900/10 transition-[border-color,background-color] font-bold text-sm"
          >
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
              <p className="text-2xl font-black text-orange-500">{fmtMoney(grandTotal)}</p>
            </div>

            {items.length > 1 && (
              <div className="space-y-1.5 border-t border-gray-50 dark:border-zinc-800 pt-3">
                {items.map((item, idx) => {
                  const mat = materials.find(m => m["Material ID"] === item.materialId) ?? null;
                  const { totalCost } = calcItem(item, mat);
                  if (!mat || totalCost === 0) return null;
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

            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={handleWhatsApp}
                className="h-11 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-black shadow-sm flex items-center justify-center gap-2"
              >
                <Share2 className="w-4 h-4" /> WhatsApp
              </Button>
              <Button
                onClick={handleSaveQuote}
                disabled={savingQuote}
                variant="outline"
                className="h-11 rounded-xl text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900/50 hover:bg-blue-50 dark:hover:bg-blue-900/20 font-black flex items-center justify-center gap-2"
              >
                <Save className={cn("w-4 h-4", savingQuote && "animate-pulse")} /> 
                {savingQuote ? "Saving..." : "Save Estimate"}
              </Button>
            </div>
            <Button onClick={handleCopy} variant="outline"
              className="w-full h-11 px-4 rounded-xl font-black dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300">
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <><Copy className="w-4 h-4 mr-2" /> Copy to Clipboard</>}
            </Button>
          </div>
        )}

        {/* ── Log sale CTA ── */}
        {hasAnyResult && allStockOk && (
          <button type="button" onClick={handleLogSale} className="w-full text-left">
            <div className="flex items-center justify-between p-4 bg-orange-500 hover:bg-orange-600 rounded-2xl text-white transition-[background-color] shadow-lg shadow-orange-500/20 cursor-pointer">
              <div>
                <p className="text-sm font-black">Ready to log as a sale?</p>
                <p className="text-white/70 text-xs mt-0.5">Head to New Entry with these dimensions</p>
              </div>
              <ChevronRight className="w-5 h-5 text-white/70" />
            </div>
          </button>
        )}
      </div>
    </div>
  );
}

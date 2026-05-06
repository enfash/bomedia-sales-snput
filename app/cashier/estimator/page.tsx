"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Ruler,
  Calculator,
  RefreshCw,
  Share2,
  Copy,
  Check,
  ChevronRight,
  Package,
  Layers,
  AlertTriangle,
  ArrowLeft,
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
  "Status": string;
  _rowIndex: number;
}

const parseNum = (v: any) =>
  parseFloat(String(v ?? "0").replace(/,/g, "")) || 0;

const fmtMoney = (n: number) =>
  `₦${n.toLocaleString(undefined, { minimumFractionDigits: 0 })}`;

// ─── Preset sizes ─────────────────────────────────────────────────────────────

const PRESETS = [
  { label: "3×2", w: 3, h: 2 },
  { label: "4×3", w: 4, h: 3 },
  { label: "6×4", w: 6, h: 4 },
  { label: "8×4", w: 8, h: 4 },
  { label: "10×4", w: 10, h: 4 },
  { label: "12×4", w: 12, h: 4 },
];

// ─── Quote display card ───────────────────────────────────────────────────────

function QuoteCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "p-4 rounded-2xl border text-center",
        accent
          ? "bg-orange-500 border-orange-400 text-white"
          : "bg-white dark:bg-zinc-900 border-gray-100 dark:border-zinc-800"
      )}
    >
      <p
        className={cn(
          "text-[9px] font-black uppercase tracking-widest mb-1",
          accent ? "text-white/60" : "text-gray-400 dark:text-zinc-500"
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          "text-xl font-black leading-tight",
          accent ? "text-white" : "text-gray-900 dark:text-white"
        )}
      >
        {value}
      </p>
      {sub && (
        <p
          className={cn(
            "text-[10px] mt-0.5",
            accent ? "text-white/50" : "text-gray-400 dark:text-zinc-500"
          )}
        >
          {sub}
        </p>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CashierEstimatorPage() {
  const { cachedInventory, setCachedData, cachedSales, cachedExpenses, cachedPayments } = useSyncStore();
  const [mounted, setMounted] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const inventory = useMemo(
    () => mounted
      ? (cachedInventory as InventoryRoll[]).filter((r) => r["Status"] !== "Out of Stock")
      : [],
    [cachedInventory, mounted]
  );

  const [selectedRollId, setSelectedRollId] = useState("");
  const [jobWidth, setJobWidth] = useState("");
  const [jobHeight, setJobHeight] = useState("");
  const [qty, setQty] = useState("1");
  const [dimUnit, setDimUnit] = useState<"ft" | "in">("ft");
  const [copied, setCopied] = useState(false);
  const [clientName, setClientName] = useState("");

  const refreshInventory = async () => {
    setSyncing(true);
    try {
      const r = await fetch("/api/inventory");
      const j = await r.json();
      if (j.data) {
        setCachedData(cachedSales, cachedExpenses, j.data, cachedPayments);
      }
    } catch {
      // silent — cached data remains available
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    refreshInventory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedRollId && inventory.length > 0) {
      setSelectedRollId(inventory[0]["Roll ID"]);
    }
  }, [inventory, selectedRollId]);

  const selectedRoll = useMemo(
    () => (inventory as InventoryRoll[]).find((r) => r["Roll ID"] === selectedRollId) || null,
    [inventory, selectedRollId]
  );

  // ── Calculations ─────────────────────────────────────────────────────────
  const wFt = useMemo(() => {
    const w = parseFloat(jobWidth) || 0;
    return dimUnit === "in" ? w / 12 : w;
  }, [jobWidth, dimUnit]);

  const hFt = useMemo(() => {
    const h = parseFloat(jobHeight) || 0;
    return dimUnit === "in" ? h / 12 : h;
  }, [jobHeight, dimUnit]);

  const qtyNum = parseInt(qty) || 1;
  const basePrice = selectedRoll ? parseNum(selectedRoll["Price"]) : 0;

  const rollWidth = selectedRoll ? parseNum(selectedRoll["Width (ft)"]) : 0;
  const fitsNormal  = !selectedRoll || wFt <= rollWidth;
  const fitsFlipped = !selectedRoll || hFt <= rollWidth;
  const isFlipped   = !fitsNormal && fitsFlipped;
  const widthOk     = fitsNormal || fitsFlipped;

  const unitSqft = wFt * hFt;
  const unitCost = unitSqft * basePrice;
  const totalCost = unitCost * qtyNum;
  const totalLength = (isFlipped ? wFt : hFt) * qtyNum;

  const rollRemaining = selectedRoll
    ? parseNum(selectedRoll["Remaining Length (ft)"])
    : 0;
  const remainingAfter = rollRemaining - totalLength;
  const stockOk = totalLength === 0 || remainingAfter >= 0;
  const isLowStock = stockOk && remainingAfter <= 20 && totalLength > 0;

  // ── Quote text (customer-facing) ──────────────────────────────────────────
  const quoteText = useMemo(() => {
    if (!selectedRoll || !wFt || !hFt) return "";
    const lines = [
      `📋 *BOMedia Price Quote*`,
      clientName ? `👤 Client: ${clientName}` : "",
      ``,
      `📐 Size: ${jobWidth}${dimUnit} × ${jobHeight}${dimUnit}`,
      `🎨 Material: ${selectedRoll["Item Name"]} (${parseNum(selectedRoll["Width (ft)"])}ft)`,
      `📦 Quantity: ${qtyNum}`,
      ``,
      `💰 Unit Price: ${fmtMoney(unitCost)}`,
      `✅ *Total: ${fmtMoney(totalCost)}*`,
      ``,
      `_BOMedia — Large Format Printing_`,
    ]
      .filter(Boolean)
      .join("\n");
    return lines;
  }, [selectedRoll, wFt, hFt, qtyNum, totalCost, unitCost, clientName, jobWidth, jobHeight, dimUnit]);

  const handleCopy = async () => {
    if (!quoteText) return;
    await navigator.clipboard.writeText(quoteText);
    setCopied(true);
    toast.success("Quote copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWhatsApp = () => {
    if (!quoteText) return;
    window.open(
      `https://wa.me/?text=${encodeURIComponent(quoteText)}`,
      "_blank"
    );
  };

  // ── Group rolls by material name ──────────────────────────────────────────
  const grouped = useMemo(() => {
    const map: Record<string, InventoryRoll[]> = {};
    (inventory as InventoryRoll[]).forEach((r) => {
      const key = r["Item Name"] || "Other";
      if (!map[key]) map[key] = [];
      map[key].push(r);
    });
    return map;
  }, [inventory]);

  return (
    <div className="min-h-screen bg-slate-50/80 dark:bg-zinc-950 pb-24 transition-colors duration-500">
      {/* ── Hero strip ───────────────────────────────────────────────────── */}
      <div className="bg-orange-500 dark:bg-orange-600 text-white px-4 py-8 md:px-8">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <Link href="/cashier">
              <button
                type="button"
                className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors mr-1"
              >
                <ArrowLeft className="w-4 h-4 text-white" />
              </button>
            </Link>
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
              <Calculator className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">
                Price Estimator
              </h1>
              <p className="text-white/70 text-xs font-medium">
                Instant quote calculator · no sale logged
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* ── Client (optional) ────────────────────────────────────────── */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm p-5">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider">
              Client Name (optional)
            </Label>
            <Input
              placeholder="e.g. John Doe — for the quote message"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="h-11 rounded-xl dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
            />
          </div>
        </div>

        {/* ── Material selector ────────────────────────────────────────── */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Layers className="w-4 h-4 text-orange-500 dark:text-orange-400" />
            <p className="text-sm font-black uppercase tracking-widest text-gray-700 dark:text-zinc-300">
              Select Material
            </p>
            {syncing && (
              <span className="ml-auto flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-zinc-600">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Syncing
              </span>
            )}
            {!syncing && (
              <button
                type="button"
                onClick={refreshInventory}
                className="ml-auto p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                title="Refresh"
              >
                <RefreshCw className="w-3.5 h-3.5 text-gray-400 dark:text-zinc-600" />
              </button>
            )}
          </div>

          {Object.entries(grouped).map(([material, rolls]) => (
            <div key={material} className="mb-4 last:mb-0">
              <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-zinc-600 mb-2">
                {material}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {rolls.map((roll) => {
                  const remaining = parseNum(roll["Remaining Length (ft)"]);
                  const isOut = remaining <= 0 || roll.Status === "Out of Stock";
                  const isSelected = roll["Roll ID"] === selectedRollId;
                  const isLow = !isOut && roll.Status === "Low Stock";

                  return (
                    <button
                      key={roll["Roll ID"]}
                      type="button"
                      disabled={isOut}
                      onClick={() => setSelectedRollId(roll["Roll ID"])}
                      className={cn(
                        "p-3 rounded-xl border-2 text-left transition-all",
                        isSelected
                          ? "border-orange-500 bg-orange-50 dark:bg-orange-900/20"
                          : isOut
                          ? "border-gray-100 dark:border-zinc-800 opacity-40 cursor-not-allowed"
                          : "border-gray-100 dark:border-zinc-800 hover:border-orange-300 dark:hover:border-orange-700 bg-white dark:bg-zinc-900"
                      )}
                    >
                      <p className="text-xs font-black text-gray-900 dark:text-white truncate">
                        {parseNum(roll["Width (ft)"])}ft wide
                      </p>
                      <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-0.5">
                        ₦{parseNum(roll["Price"]).toLocaleString()}/sqft
                      </p>
                      <div className="flex items-center gap-1 mt-1.5">
                        <div
                          className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            isOut
                              ? "bg-rose-400"
                              : isLow
                              ? "bg-amber-400"
                              : "bg-emerald-400"
                          )}
                        />
                        <span className="text-[9px] text-gray-400 dark:text-zinc-500">
                          {isOut ? "Out of stock" : isLow ? "Low stock" : "Available"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {inventory.length === 0 && !syncing && (
            <div className="text-center py-8">
              <Package className="w-8 h-8 text-gray-200 dark:text-zinc-700 mx-auto mb-2" />
              <p className="text-sm text-gray-400 dark:text-zinc-600 font-medium">
                No materials available. Contact your manager.
              </p>
            </div>
          )}
          {inventory.length === 0 && syncing && (
            <div className="text-center py-8">
              <RefreshCw className="w-6 h-6 text-orange-400 animate-spin mx-auto mb-2" />
              <p className="text-xs text-gray-400 dark:text-zinc-600 font-medium">Loading materials…</p>
            </div>
          )}
        </div>

        {/* ── Dimensions ───────────────────────────────────────────────── */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Ruler className="w-4 h-4 text-orange-500 dark:text-orange-400" />
              <p className="text-sm font-black uppercase tracking-widest text-gray-700 dark:text-zinc-300">
                Job Size
              </p>
            </div>
            <div className="flex bg-gray-100 dark:bg-zinc-800 p-0.5 rounded-xl">
              {(["ft", "in"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setDimUnit(u)}
                  className={cn(
                    "px-3 py-1 rounded-lg text-[10px] font-black uppercase transition-all",
                    dimUnit === u
                      ? "bg-orange-500 text-white"
                      : "text-gray-500 dark:text-zinc-400"
                  )}
                >
                  {u === "ft" ? "Feet" : "Inches"}
                </button>
              ))}
            </div>
          </div>

          {/* Quick presets */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  const wVal = dimUnit === "in" ? String(p.w * 12) : String(p.w);
                  const hVal = dimUnit === "in" ? String(p.h * 12) : String(p.h);
                  setJobWidth(wVal);
                  setJobHeight(hVal);
                }}
                className="px-3 py-1.5 rounded-xl bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-[10px] font-black text-gray-600 dark:text-zinc-400 hover:border-orange-400 hover:text-orange-600 dark:hover:text-orange-400 transition-all"
              >
                {p.label}ft
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider">
                Width ({dimUnit})
              </Label>
              <Input
                type="number"
                placeholder={dimUnit === "ft" ? "4" : "48"}
                value={jobWidth}
                onChange={(e) => setJobWidth(e.target.value)}
                className="h-12 rounded-xl font-bold dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider">
                Height ({dimUnit})
              </Label>
              <Input
                type="number"
                placeholder={dimUnit === "ft" ? "8" : "96"}
                value={jobHeight}
                onChange={(e) => setJobHeight(e.target.value)}
                className="h-12 rounded-xl font-bold dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider">
                Quantity
              </Label>
              <Input
                type="number"
                min="1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="h-12 rounded-xl font-bold dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
              />
            </div>
          </div>

          {/* Orientation / width feedback */}
          {selectedRoll && wFt > 0 && hFt > 0 && isFlipped && (
            <div className="mt-3 flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-900/40">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <p className="text-xs font-bold text-amber-600 dark:text-amber-400">
                Job will be rotated to fit — {dimUnit === "in" ? `${parseFloat(jobHeight)}in` : `${hFt.toFixed(1)}ft`} side runs along the roll width ({rollWidth.toFixed(1)}ft).
              </p>
            </div>
          )}
          {selectedRoll && wFt > 0 && !widthOk && (
            <div className="mt-3 flex items-center gap-2 p-3 bg-rose-50 dark:bg-rose-900/20 rounded-xl border border-rose-200 dark:border-rose-900/40">
              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
              <p className="text-xs font-bold text-rose-600 dark:text-rose-400">
                {dimUnit === "in"
                  ? `Both dimensions (${parseFloat(jobWidth)}in × ${parseFloat(jobHeight)}in) exceed the roll width (${(rollWidth * 12).toFixed(0)}in). Choose a wider material.`
                  : `Job (${wFt.toFixed(1)}ft × ${hFt.toFixed(1)}ft) exceeds roll width (${rollWidth.toFixed(1)}ft) in both orientations. Choose a wider material.`}
              </p>
            </div>
          )}
        </div>

        {/* ── Live Quote ───────────────────────────────────────────────── */}
        {selectedRoll && unitSqft > 0 && (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm p-5">
            <p className="text-sm font-black uppercase tracking-widest text-gray-700 dark:text-zinc-300 mb-4">
              Live Quote
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <QuoteCard
                label="Area / Piece"
                value={`${unitSqft.toFixed(2)} sqft`}
                sub={`${wFt.toFixed(1)}×${hFt.toFixed(1)}ft`}
              />
              <QuoteCard
                label="Rate"
                value={`₦${basePrice.toFixed(0)}/sqft`}
                sub="per square foot"
              />
              <QuoteCard
                label="Unit Price"
                value={fmtMoney(unitCost)}
                sub="per piece"
              />
              <QuoteCard
                label="Total"
                value={fmtMoney(totalCost)}
                sub={`${qtyNum} piece${qtyNum !== 1 ? "s" : ""}`}
                accent
              />
            </div>

            {/* Stock availability */}
            <div
              className={cn(
                "p-3 rounded-xl flex items-center gap-2 text-xs font-bold border mb-4",
                !stockOk
                  ? "bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-900/40 text-rose-600 dark:text-rose-400"
                  : isLowStock
                  ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-900/40 text-amber-600 dark:text-amber-400"
                  : "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-900/40 text-emerald-600 dark:text-emerald-400"
              )}
            >
              {!stockOk ? (
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <Package className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>
                {!stockOk
                  ? "Cannot fulfill — insufficient stock. Check with your manager."
                  : isLowStock
                  ? "Stock is low for this job — confirm with your manager before proceeding."
                  : "Can fulfill this job"}
              </span>
            </div>

            {/* Share actions */}
            <div className="flex gap-2">
              <Button
                onClick={handleWhatsApp}
                className="flex-1 h-11 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-black shadow-sm flex items-center justify-center gap-2"
              >
                <Share2 className="w-4 h-4" />
                Send Quote via WhatsApp
              </Button>
              <Button
                onClick={handleCopy}
                variant="outline"
                className="h-11 px-4 rounded-xl font-black dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        )}

        {/* ── Log Sale CTA ─────────────────────────────────────────────── */}
        {totalCost > 0 && stockOk && (
          <Link href="/cashier/new-entry">
            <div className="flex items-center justify-between p-4 bg-orange-500 hover:bg-orange-600 rounded-2xl text-white transition-all shadow-lg shadow-orange-500/20 cursor-pointer">
              <div>
                <p className="text-sm font-black">Ready to log this as a sale?</p>
                <p className="text-white/70 text-xs font-medium mt-0.5">
                  Head to New Entry and use the same dimensions
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-white/70" />
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}

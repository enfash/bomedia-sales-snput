"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Ruler, Calculator, RefreshCw, Share2, Copy, Check,
  ChevronRight, Package, AlertTriangle, Plus, Trash2,
  ArrowLeft, ChevronDown, ChevronUp, Info,
} from "lucide-react";
import {
  Box, Stack, Typography, Button, TextField, Paper, IconButton
} from "@mui/material";
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
  return { id: uid(), description: "", width: "", height: "", qty: "1", dimUnit: "ft", margin: "0", rollId: "", open: true };
}

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
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: 1.5, bgcolor: "error.light", borderRadius: 2, border: "1px solid", borderColor: "error.main" }}>
        <AlertTriangle size={16} color="#d32f2f" style={{ flexShrink: 0 }} />
        <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, color: "error.dark" }}>
          No roll wide enough for {wFt.toFixed(1)}×{hFt.toFixed(1)}ft. Try a smaller size or add wider stock.
        </Typography>
      </Box>
    );
  }

  return (
    <Stack sx={{ gap: 2 }}>
      {hasDims && inventory.length !== eligible.length && (
        <Stack direction="row" sx={{ alignItems: "center", gap: 0.5 }}>
          <AlertTriangle size={12} color="#f57c00" />
          <Typography sx={{ fontSize: "0.625rem", fontWeight: 700, color: "warning.dark" }}>
            Showing {eligible.length} of {inventory.length} rolls that fit this size
          </Typography>
        </Stack>
      )}
      {Object.entries(grouped).map(([material, rolls]) => (
        <Box key={material}>
          <Typography sx={{ fontSize: "0.5625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "text.secondary", mb: 1 }}>
            {material}
          </Typography>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(3, 1fr)" }, gap: 1 }}>
            {rolls.map(roll => {
              const remaining = parseNum(roll["Remaining Length (ft)"]);
              const isOut = remaining <= 0 || roll.Status === "Out of Stock";
              const isLow = !isOut && roll.Status === "Low Stock";
              const isSel = roll["Roll ID"] === item.rollId;
              
              const statusColor = isOut ? "error.main" : isLow ? "warning.main" : "success.main";
              const statusText = isOut ? "Out" : isLow ? "Low" : `${remaining.toFixed(0)}ft left`;
              
              return (
                <Paper
                  key={roll["Roll ID"]}
                  component="button"
                  onClick={() => !isOut && onChange(roll["Roll ID"])}
                  disabled={isOut}
                  variant="outlined"
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    textAlign: "left",
                    cursor: isOut ? "not-allowed" : "pointer",
                    opacity: isOut ? 0.5 : 1,
                    transition: "all 0.2s",
                    bgcolor: isSel ? "primary.light" : "background.paper",
                    borderColor: isSel ? "primary.main" : "divider",
                    "&:hover": {
                      borderColor: !isOut ? "primary.main" : "divider"
                    }
                  }}
                >
                  <Typography sx={{ fontSize: "0.75rem", fontWeight: 900, color: "text.primary" }}>
                    {parseNum(roll["Width (ft)"])}ft wide
                  </Typography>
                  <Typography sx={{ fontSize: "0.625rem", color: "text.secondary", mt: 0.5 }}>
                    ₦{parseNum(roll["Price"]).toLocaleString()}/sqft
                  </Typography>
                  <Stack direction="row" sx={{ alignItems: "center", gap: 0.5, mt: 1 }}>
                    <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: statusColor }} />
                    <Typography sx={{ fontSize: "0.5625rem", color: "text.secondary" }}>
                      {statusText}
                    </Typography>
                  </Stack>
                </Paper>
              );
            })}
          </Box>
        </Box>
      ))}
    </Stack>
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
    <Paper variant="outlined" sx={{ borderRadius: 3, mb: 2, overflow: "hidden" }}>
      {/* ── Header ── */}
      <Box
        onClick={() => onChange({ open: !item.open })}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          p: 2,
          cursor: "pointer",
          userSelect: "none",
          "&:hover": { bgcolor: "action.hover" }
        }}
      >
        <Box sx={{ width: 28, height: 28, borderRadius: "50%", bgcolor: "primary.light", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Typography sx={{ fontSize: "0.75rem", fontWeight: 900, color: "primary.main" }}>{index + 1}</Typography>
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography noWrap sx={{ fontSize: "0.875rem", fontWeight: 900, color: "text.primary" }}>
            {item.description || `Item ${index + 1}`}
          </Typography>
          {hasResult && !item.open && (
            <Typography sx={{ fontSize: "0.625rem", color: "text.secondary", mt: 0.5 }}>
              {item.width}{item.dimUnit} × {item.height}{item.dimUnit} × {qty} — <span style={{ color: "var(--mui-palette-primary-main)", fontWeight: "bold" }}>{fmtMoney(totalCost)}</span>
            </Typography>
          )}
        </Box>
        <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
          {hasResult && <Typography sx={{ fontSize: "0.875rem", fontWeight: 900, color: "primary.main" }}>{fmtMoney(totalCost)}</Typography>}
          {canRemove && (
            <IconButton
              size="small"
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              sx={{ color: "text.disabled", "&:hover": { color: "error.main", bgcolor: "error.light" } }}
            >
              <Trash2 size={14} />
            </IconButton>
          )}
          {item.open ? <ChevronUp size={16} style={{ color: "var(--mui-palette-text-disabled)" }} /> : <ChevronDown size={16} style={{ color: "var(--mui-palette-text-disabled)" }} />}
        </Stack>
      </Box>

      {/* ── Body ── */}
      {item.open && (
        <Box sx={{ px: 2, pb: 2, pt: 2, borderTop: "1px solid", borderColor: "divider" }}>
          <Stack sx={{ gap: 2 }}>
            {/* Description */}
            <Box>
              <Typography sx={{ fontSize: "0.625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em", color: "text.secondary", mb: 0.5 }}>
                Description (optional)
              </Typography>
              <TextField
                placeholder="e.g. Banner, Roll-up, Sticker…"
                value={item.description}
                onChange={e => onChange({ description: e.target.value })}
                fullWidth
                size="small"
              />
            </Box>

            {/* Dimensions */}
            <Box>
              <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
                <Typography sx={{ fontSize: "0.625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em", color: "text.secondary", display: "flex", alignItems: "center", gap: 0.5 }}>
                  <Ruler size={12} /> Size
                </Typography>
                <Box sx={{ display: "flex", bgcolor: "action.selected", p: 0.5, borderRadius: 1.5 }}>
                  {(["ft", "in"] as const).map(u => (
                    <Button
                      key={u}
                      size="small"
                      onClick={() => onChange({ dimUnit: u })}
                      sx={{
                        minWidth: 0,
                        px: 1.5,
                        py: 0.25,
                        borderRadius: 1,
                        fontSize: "0.625rem",
                        fontWeight: 900,
                        textTransform: "uppercase",
                        bgcolor: item.dimUnit === u ? "primary.main" : "transparent",
                        color: item.dimUnit === u ? "primary.contrastText" : "text.secondary",
                        "&:hover": {
                          bgcolor: item.dimUnit === u ? "primary.dark" : "action.hover",
                        }
                      }}
                    >
                      {u}
                    </Button>
                  ))}
                </Box>
              </Stack>

              <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.75, mb: 1.5 }}>
                {PRESETS.map(p => (
                  <Button
                    key={p.label}
                    size="small"
                    variant="outlined"
                    onClick={() => onChange({
                      width:  item.dimUnit === "in" ? String(p.w * 12) : String(p.w),
                      height: item.dimUnit === "in" ? String(p.h * 12) : String(p.h),
                    })}
                    sx={{
                      fontSize: "0.625rem",
                      fontWeight: 900,
                      py: 0.25,
                      px: 1,
                      borderRadius: 1.5,
                      borderColor: "divider",
                      color: "text.secondary",
                      "&:hover": { borderColor: "primary.main", color: "primary.main", bgcolor: "primary.light" }
                    }}
                  >
                    {p.label}ft
                  </Button>
                ))}
              </Stack>

              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1 }}>
                {[
                  { key: "width",  label: `W (${item.dimUnit})`, ph: item.dimUnit === "ft" ? "4" : "48" },
                  { key: "height", label: `H (${item.dimUnit})`, ph: item.dimUnit === "ft" ? "8" : "96" },
                  { key: "qty",    label: "Qty",                 ph: "1" },
                  { key: "margin", label: "Margin %",            ph: "0" },
                ].map(({ key, label, ph }) => (
                  <Box key={key}>
                    <Typography sx={{ fontSize: "0.5625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em", color: "text.secondary", mb: 0.5 }}>
                      {label}
                    </Typography>
                    <TextField
                      type="number"
                      placeholder={ph}
                      value={item[key as keyof QuoteItem] as string}
                      onChange={e => onChange({ [key]: e.target.value })}
                      fullWidth
                      size="small"
                    />
                  </Box>
                ))}
              </Box>

              {roll && wFt > 0 && hFt > 0 && isFlipped && (
                <Box sx={{ mt: 1, display: "flex", alignItems: "center", gap: 1, p: 1.5, bgcolor: "warning.light", borderRadius: 2, border: "1px solid", borderColor: "warning.main" }}>
                  <AlertTriangle size={14} color="#f57c00" style={{ flexShrink: 0 }} />
                  <Typography sx={{ fontSize: "0.625rem", fontWeight: 700, color: "warning.dark" }}>
                    Rotated to fit — {item.dimUnit === "in" ? `${parseFloat(item.height)}in` : `${hFt.toFixed(1)}ft`} side along the {rollWidth.toFixed(1)}ft roll
                  </Typography>
                </Box>
              )}
              {roll && wFt > 0 && !widthOk && (
                <Box sx={{ mt: 1, display: "flex", alignItems: "center", gap: 1, p: 1.5, bgcolor: "error.light", borderRadius: 2, border: "1px solid", borderColor: "error.main" }}>
                  <AlertTriangle size={14} color="#d32f2f" style={{ flexShrink: 0 }} />
                  <Typography sx={{ fontSize: "0.625rem", fontWeight: 700, color: "error.dark" }}>
                    Both dimensions exceed this roll's width — choose a wider material
                  </Typography>
                </Box>
              )}
            </Box>

            {/* Material */}
            <Box>
              <Typography sx={{ fontSize: "0.625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em", color: "text.secondary", mb: 1 }}>
                Material
              </Typography>
              <MaterialPicker item={item} inventory={inventory} onChange={rollId => onChange({ rollId })} />
            </Box>

            {/* Result cards */}
            {hasResult && widthOk && (
              <Stack sx={{ gap: 1.5 }}>
                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1 }}>
                  {[
                    { label: "Area",      value: `${unitSqft.toFixed(2)} sqft` },
                    { label: "Rate",      value: `₦${calcItem(item, roll).rate.toFixed(0)}/sqft` },
                    { label: "Unit",      value: fmtMoney(unitCost) },
                    { label: "Total",     value: fmtMoney(totalCost), accent: true },
                  ].map(c => (
                    <Paper
                      key={c.label}
                      variant="outlined"
                      sx={{
                        p: 1.5,
                        textAlign: "center",
                        bgcolor: c.accent ? "primary.main" : "background.paper",
                        borderColor: c.accent ? "primary.main" : "divider",
                        color: c.accent ? "primary.contrastText" : "text.primary"
                      }}
                    >
                      <Typography sx={{ fontSize: "0.5625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", opacity: c.accent ? 0.8 : 0.6, mb: 0.5 }}>
                        {c.label}
                      </Typography>
                      <Typography sx={{ fontSize: "0.875rem", fontWeight: 900 }}>
                        {c.value}
                      </Typography>
                    </Paper>
                  ))}
                </Box>

                {/* Profitability */}
                {costPerSqft > 0 && (
                  <Box sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    p: 1.5,
                    borderRadius: 2,
                    border: "1px solid",
                    borderColor: profitPct >= 40 ? "success.light" : profitPct >= 20 ? "warning.light" : "error.light",
                    bgcolor: profitPct >= 40 ? "success.light" : profitPct >= 20 ? "warning.light" : "error.light",
                    color: profitPct >= 40 ? "success.dark" : profitPct >= 20 ? "warning.dark" : "error.dark",
                    opacity: 0.9,
                  }}>
                    <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 0.5 }}>
                      <Info size={12} /> Profit: {fmtMoney(profit * qty)}
                    </Typography>
                    <Typography sx={{ fontSize: "0.75rem", fontWeight: 700 }}>
                      {profitPct.toFixed(1)}% margin
                    </Typography>
                  </Box>
                )}

                {!stockOk && (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: 1.5, bgcolor: "error.light", borderRadius: 2, border: "1px solid", borderColor: "error.main" }}>
                    <AlertTriangle size={14} color="#d32f2f" style={{ flexShrink: 0 }} />
                    <Typography sx={{ fontSize: "0.625rem", fontWeight: 700, color: "error.dark" }}>
                      Insufficient stock for this quantity
                    </Typography>
                  </Box>
                )}
              </Stack>
            )}
          </Stack>
        </Box>
      )}
    </Paper>
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
    <Box sx={{p: { xs: 3, md: 4 }, pb: { xs: 12, md: 4 }, minHeight: "100vh", bgcolor: "background.default", transition: "background-color 0.5s"}}>
      {/* ── Hero ── */}
      <Box sx={{ bgcolor: "primary.main", color: "primary.contrastText", px: { xs: 2, md: 4 }, py: 4 }}>
        <Box sx={{ maxWidth: "md", mx: "auto" }}>
          <Stack direction="row" sx={{ alignItems: "center", gap: 1.5 }}>
            <Link href="/bom03" passHref>
              <IconButton sx={{ bgcolor: "rgba(255,255,255,0.2)", "&:hover": { bgcolor: "rgba(255,255,255,0.3)" } }}>
                <ArrowLeft size={16} color="white" />
              </IconButton>
            </Link>
            <Box sx={{ width: 40, height: 40, borderRadius: 3, bgcolor: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Calculator size={20} color="white" />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="h6" sx={{ fontWeight: 900, lineHeight: 1.2 }}>Price Estimator</Typography>
              <Typography sx={{ fontSize: "0.75rem", fontWeight: 500, opacity: 0.8 }}>Multi-item quote builder · no sale logged</Typography>
            </Box>
            <IconButton onClick={refreshInventory} sx={{ bgcolor: "rgba(255,255,255,0.2)", "&:hover": { bgcolor: "rgba(255,255,255,0.3)" } }}>
              <RefreshCw size={16} color="white" className={syncing ? "animate-spin" : ""} />
            </IconButton>
          </Stack>
        </Box>
      </Box>

      <Box sx={{ maxWidth: "md", mx: "auto", px: { xs: 2, md: 4 }, py: 3 }}>
        <Stack sx={{ gap: 2 }}>
          {/* ── Client name ── */}
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
            <Typography sx={{ fontSize: "0.625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em", color: "text.secondary", mb: 1 }}>
              Client Name (optional)
            </Typography>
            <TextField
              placeholder="e.g. John Doe — appears on the quote"
              value={clientName}
              onChange={e => setClientName(e.target.value)}
              fullWidth
              size="small"
            />
          </Paper>

          {/* ── Loading states ── */}
          {inventory.length === 0 && syncing && (
            <Paper variant="outlined" sx={{ p: 5, textAlign: "center", borderRadius: 3 }}>
              <RefreshCw size={24} className="animate-spin" style={{ margin: "0 auto 8px auto", color: "var(--mui-palette-primary-main)" }} />
              <Typography sx={{ fontSize: "0.75rem", fontWeight: 500, color: "text.secondary" }}>Loading stock…</Typography>
            </Paper>
          )}
          {inventory.length === 0 && !syncing && (
            <Paper variant="outlined" sx={{ p: 5, textAlign: "center", borderRadius: 3 }}>
              <Package size={32} style={{ margin: "0 auto 8px auto", color: "var(--mui-palette-text-disabled)" }} />
              <Typography sx={{ fontSize: "0.875rem", fontWeight: 500, color: "text.secondary", mb: 1 }}>No materials in inventory.</Typography>
              <Link href="/bom03/inventory" passHref>
                <Button size="small" endIcon={<ChevronRight size={12} />} sx={{ fontWeight: 700 }}>
                  Add rolls to inventory
                </Button>
              </Link>
            </Paper>
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
            <Button
              variant="outlined"
              onClick={addItem}
              startIcon={<Plus size={16} />}
              sx={{
                py: 1.5,
                borderRadius: 3,
                borderStyle: "dashed",
                borderWidth: 2,
                fontWeight: 700,
                color: "primary.main",
                borderColor: "primary.light",
                "&:hover": { borderWidth: 2, borderColor: "primary.main", bgcolor: "primary.light" }
              }}
            >
              Add Another Item
            </Button>
          )}

          {/* ── Grand total + actions ── */}
          {hasAnyResult && (
            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, display: "flex", flexDirection: "column", gap: 2 }}>
              <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
                <Typography sx={{ fontSize: "0.875rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "text.secondary" }}>
                  {items.length > 1 ? "Grand Total" : "Total"}
                </Typography>
                <Typography sx={{ fontSize: "1.5rem", fontWeight: 900, color: "primary.main" }}>
                  {fmtMoney(grandTotal)}
                </Typography>
              </Stack>

              {/* Profit summary (admin) */}
              {totalProfit > 0 && (
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", p: 1.5, borderRadius: 2, bgcolor: "success.light", color: "success.dark", border: "1px solid", borderColor: "success.main" }}>
                  <Typography sx={{ fontSize: "0.75rem", fontWeight: 700 }}>Est. total profit</Typography>
                  <Typography sx={{ fontSize: "0.75rem", fontWeight: 900 }}>
                    {fmtMoney(totalProfit)} ({grandTotal > 0 ? ((totalProfit / grandTotal) * 100).toFixed(1) : 0}%)
                  </Typography>
                </Box>
              )}

              {/* Item breakdown */}
              {items.length > 1 && (
                <Stack sx={{ gap: 1, pt: 1.5, borderTop: "1px solid", borderColor: "divider" }}>
                  {items.map((item, idx) => {
                    const roll = inventory.find(r => r["Roll ID"] === item.rollId) ?? null;
                    const { totalCost } = calcItem(item, roll);
                    if (!roll || totalCost === 0) return null;
                    return (
                      <Stack key={item.id} direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
                        <Typography sx={{ fontSize: "0.75rem", fontWeight: 500, color: "text.secondary" }}>
                          {idx + 1}. {item.description || `Item ${idx + 1}`}
                        </Typography>
                        <Typography sx={{ fontSize: "0.75rem", fontWeight: 900, color: "text.primary" }}>
                          {fmtMoney(totalCost)}
                        </Typography>
                      </Stack>
                    );
                  })}
                </Stack>
              )}

              <Stack direction="row" sx={{ gap: 1 }}>
                <Button
                  variant="contained"
                  onClick={handleWhatsApp}
                  startIcon={<Share2 size={16} />}
                  sx={{ flex: 1, height: 44, borderRadius: 3, bgcolor: "#10b981", color: "white", fontWeight: 900, "&:hover": { bgcolor: "#059669" } }}
                >
                  Send via WhatsApp
                </Button>
                <Button
                  variant="outlined"
                  onClick={handleCopy}
                  sx={{ width: 64, height: 44, borderRadius: 3, borderColor: "divider" }}
                >
                  {copied ? <Check size={16} color="#10b981" /> : <Copy size={16} />}
                </Button>
              </Stack>
            </Paper>
          )}

          {/* ── Log sale CTA ── */}
          {hasAnyResult && (
            <Link href="/new-entry" passHref>
              <Paper sx={{ p: 2, borderRadius: 3, bgcolor: "primary.main", color: "primary.contrastText", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", "&:hover": { bgcolor: "primary.dark" } }}>
                <Box>
                  <Typography sx={{ fontSize: "0.875rem", fontWeight: 900 }}>Ready to log as a sale?</Typography>
                  <Typography sx={{ fontSize: "0.75rem", fontWeight: 500, opacity: 0.8, mt: 0.5 }}>Head to New Entry with these dimensions</Typography>
                </Box>
                <ChevronRight size={20} style={{ opacity: 0.8 }} />
              </Paper>
            </Link>
          )}
        </Stack>
      </Box>
    </Box>
  );
}

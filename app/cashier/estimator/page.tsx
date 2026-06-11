"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Ruler, Calculator, RefreshCw, Share2, Copy, Check,
  ChevronRight, Package, AlertTriangle, Plus, Trash2,
  ArrowLeft, ChevronDown, ChevronUp, Save
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSyncStore } from "@/lib/store";
import { MaterialSelector } from "@/components/material-selector";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";

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
    <Card
      sx={{
        borderRadius: "16px",
        border: "1px solid",
        borderColor: "divider",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        overflow: "hidden",
      }}
    >
      {/* ── Item header ── */}
      <Box
        onClick={() => onChange({ open: !item.open })}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          p: 2,
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        {/* Index badge */}
        <Box
          sx={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            bgcolor: "rgba(247,104,8,0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Typography
            sx={{
              fontSize: "0.65rem",
              fontWeight: 900,
              color: "#B8842E",
              lineHeight: 1,
            }}
          >
            {index + 1}
          </Typography>
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              fontSize: "0.875rem",
              fontWeight: 900,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {item.description || `Item ${index + 1}`}
          </Typography>
          {hasResult && !item.open && (
            <Typography
              sx={{
                fontSize: "0.625rem",
                color: "text.secondary",
                mt: 0.25,
              }}
            >
              {item.width}{item.dimUnit} × {item.height}{item.dimUnit} × {qty} —{" "}
              <Box component="span" sx={{ color: "primary.main", fontWeight: 700 }}>
                {fmtMoney(totalCost)}
              </Box>
            </Typography>
          )}
        </Box>

        <Stack sx={{ gap: 1, alignItems: "center" }} direction="row">
          {hasResult && (
            <Typography sx={{ fontSize: "0.875rem", fontWeight: 900, color: "primary.main" }}>
              {fmtMoney(totalCost)}
            </Typography>
          )}
          {canRemove && (
            <IconButton
              size="small"
              onClick={e => { e.stopPropagation(); onRemove(); }}
              sx={{
                color: "text.disabled",
                borderRadius: "10px",
                "&:hover": { bgcolor: "error.lighter", color: "error.main" },
              }}
            >
              <Trash2 size={14} />
            </IconButton>
          )}
          {item.open
            ? <ChevronUp size={16} color="var(--mui-palette-text-disabled, #9ca3af)" />
            : <ChevronDown size={16} color="var(--mui-palette-text-disabled, #9ca3af)" />
          }
        </Stack>
      </Box>

      {/* ── Expanded body ── */}
      {item.open && (
        <Box
          sx={{
            px: 2,
            pb: 2,
            pt: 2,
            borderTop: "1px solid",
            borderColor: "divider",
          }}
        >
          <Stack sx={{ gap: 3 }}>
            {/* Description */}
            <Box>
              <Typography
                sx={{
                  fontSize: "0.625rem",
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "text.secondary",
                  mb: 0.75,
                }}
              >
                Description (optional)
              </Typography>
              <TextField
                fullWidth
                placeholder="e.g. Banner, Flex, Sticker…"
                value={item.description}
                onChange={e => onChange({ description: e.target.value })}
                size="small"
              />
            </Box>

            {/* Dimensions */}
            <Box>
              {/* Size label + unit toggle */}
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  mb: 1.5,
                }}
              >
                <Stack direction="row" sx={{ gap: 0.75, alignItems: "center" }}>
                  <Ruler size={12} color="var(--mui-palette-text-secondary, #6B7480)" />
                  <Typography
                    sx={{
                      fontSize: "0.625rem",
                      fontWeight: 900,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      color: "text.secondary",
                    }}
                  >
                    Size
                  </Typography>
                </Stack>

                {/* Unit toggle */}
                <Box
                  sx={{
                    display: "flex",
                    bgcolor: "action.hover",
                    borderRadius: "10px",
                    p: 0.25,
                  }}
                >
                  {(["ft", "in"] as const).map(u => (
                    <Box
                      key={u}
                      component="button"
                      type="button"
                      onClick={() => onChange({ dimUnit: u })}
                      sx={{
                        px: 1.25,
                        py: 0.5,
                        border: "none",
                        borderRadius: "10px",
                        fontSize: "0.625rem",
                        fontWeight: 900,
                        textTransform: "uppercase",
                        cursor: "pointer",
                        transition: "background-color 0.15s ease, color 0.15s ease",
                        bgcolor: item.dimUnit === u ? "primary.main" : "transparent",
                        color: item.dimUnit === u ? "primary.contrastText" : "text.secondary",
                        "&:active": { transform: "scale(0.97)" },
                      }}
                    >
                      {u}
                    </Box>
                  ))}
                </Box>
              </Box>

              {/* Presets */}
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mb: 1.5 }}>
                {PRESETS.map(p => (
                  <Box
                    key={p.label}
                    component="button"
                    type="button"
                    onClick={() => onChange({
                      width:  item.dimUnit === "in" ? String(p.w * 12) : String(p.w),
                      height: item.dimUnit === "in" ? String(p.h * 12) : String(p.h),
                    })}
                    sx={{
                      px: 1.25,
                      py: 0.5,
                      border: "1px solid",
                      borderColor: "divider",
                      borderRadius: "10px",
                      bgcolor: "background.default",
                      fontSize: "0.625rem",
                      fontWeight: 900,
                      color: "text.secondary",
                      cursor: "pointer",
                      transition: "border-color 0.15s ease, color 0.15s ease",
                      "&:hover": { borderColor: "primary.main", color: "primary.main" },
                      "&:active": { transform: "scale(0.97)" },
                    }}
                  >
                    {p.label}ft
                  </Box>
                ))}
              </Box>

              {/* W / H / Qty inputs */}
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1 }}>
                {[
                  { key: "width",  label: `W (${item.dimUnit})`, ph: item.dimUnit === "ft" ? "4" : "48" },
                  { key: "height", label: `H (${item.dimUnit})`, ph: item.dimUnit === "ft" ? "8" : "96" },
                  { key: "qty",    label: "Qty",                 ph: "1" },
                ].map(({ key, label, ph }) => (
                  <Box key={key}>
                    <Typography
                      sx={{
                        fontSize: "0.625rem",
                        fontWeight: 900,
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        color: "text.secondary",
                        mb: 0.5,
                      }}
                    >
                      {label}
                    </Typography>
                    <TextField
                      fullWidth
                      type="number"
                      size="small"
                      placeholder={ph}
                      value={item[key as keyof QuoteItem] as string}
                      onChange={e => onChange({ [key]: e.target.value })}
                      slotProps={{ htmlInput: { min: key === "qty" ? 1 : undefined } }}
                      sx={{ "& input": { fontWeight: 700 } }}
                    />
                  </Box>
                ))}
              </Box>

              {/* Orientation warnings */}
              {material && wFt > 0 && hFt > 0 && isFlipped && (
                <Box
                  sx={{
                    mt: 1.5,
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    p: 1.25,
                    bgcolor: "rgba(245,158,11,0.08)",
                    borderRadius: "10px",
                    border: "1px solid rgba(245,158,11,0.25)",
                  }}
                >
                  <AlertTriangle size={14} color="#D97706" style={{ flexShrink: 0 }} />
                  <Typography sx={{ fontSize: "0.625rem", fontWeight: 700, color: "#D97706" }}>
                    Rotated to fit — {item.dimUnit === "in" ? `${parseFloat(item.height)}in` : `${hFt.toFixed(1)}ft`} side along the {rollWidth.toFixed(1)}ft roll
                  </Typography>
                </Box>
              )}
              {material && wFt > 0 && !widthOk && (
                <Box
                  sx={{
                    mt: 1.5,
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    p: 1.25,
                    bgcolor: "rgba(192,57,43,0.06)",
                    borderRadius: "10px",
                    border: "1px solid rgba(192,57,43,0.2)",
                  }}
                >
                  <AlertTriangle size={14} color="#C0392B" style={{ flexShrink: 0 }} />
                  <Typography sx={{ fontSize: "0.625rem", fontWeight: 700, color: "error.main" }}>
                    Both dimensions exceed this roll's width — choose a wider material
                  </Typography>
                </Box>
              )}
            </Box>

            {/* Material */}
            <Box>
              <MaterialSelector
                materials={materials}
                selectedMaterialId={item.materialId}
                onSelect={mat => onChange({ materialId: mat["Material ID"] })}
                loading={false}
              />
            </Box>

            {/* Line result */}
            {hasResult && widthOk && (
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1 }}>
                {[
                  { label: "Area",       value: `${unitSqft.toFixed(2)} sqft`, accent: false },
                  { label: "Unit Price", value: fmtMoney(unitCost),             accent: false },
                  { label: "Total",      value: fmtMoney(totalCost),            accent: true  },
                ].map(c => (
                  <Box
                    key={c.label}
                    sx={{
                      p: 1.5,
                      borderRadius: "10px",
                      border: "1px solid",
                      textAlign: "center",
                      bgcolor: c.accent ? "primary.main" : "background.default",
                      borderColor: c.accent ? "primary.main" : "divider",
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: "0.55rem",
                        fontWeight: 900,
                        textTransform: "uppercase",
                        letterSpacing: "0.12em",
                        mb: 0.5,
                        color: c.accent ? "rgba(255,255,255,0.7)" : "text.secondary",
                      }}
                    >
                      {c.label}
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: "0.875rem",
                        fontWeight: 900,
                        color: c.accent ? "primary.contrastText" : "text.primary",
                      }}
                    >
                      {c.value}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}

            {hasResult && !stockOk && (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  p: 1.25,
                  bgcolor: "rgba(192,57,43,0.06)",
                  borderRadius: "10px",
                  border: "1px solid rgba(192,57,43,0.2)",
                }}
              >
                <AlertTriangle size={14} color="#C0392B" style={{ flexShrink: 0 }} />
                <Typography sx={{ fontSize: "0.625rem", fontWeight: 700, color: "error.main" }}>
                  Insufficient stock — confirm with your manager
                </Typography>
              </Box>
            )}
          </Stack>
        </Box>
      )}
    </Card>
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
    <Box sx={{p: { xs: 3, md: 4 }, pb: { xs: 12, md: 4 }, minHeight: "100vh", bgcolor: "background.default"}}>

      {/* ── Hero ── */}
      <Box sx={{ bgcolor: "primary.main", color: "primary.contrastText", px: { xs: 2, md: 4 }, py: 4 }}>
        <Box sx={{ maxWidth: 672, mx: "auto" }}>
          <Stack direction="row" sx={{ alignItems: "center", gap: 1.5 }}>
            <Link href="/cashier" style={{ textDecoration: "none" }}>
              <IconButton
                size="small"
                sx={{
                  bgcolor: "rgba(255,255,255,0.2)",
                  color: "primary.contrastText",
                  borderRadius: "10px",
                  "&:hover": { bgcolor: "rgba(255,255,255,0.3)" },
                  "&:active": { transform: "scale(0.97)" },
                }}
              >
                <ArrowLeft size={16} />
              </IconButton>
            </Link>

            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: "10px",
                bgcolor: "rgba(255,255,255,0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Calculator size={20} />
            </Box>

            <Box>
              <Typography sx={{ fontSize: "1.5rem", fontWeight: 900, letterSpacing: "-0.02em", color: "primary.contrastText" }}>
                Price Estimator
              </Typography>
              <Typography sx={{ fontSize: "0.75rem", fontWeight: 500, color: "rgba(26,20,16,0.6)" }}>
                Multi-item quote builder · no sale logged
              </Typography>
            </Box>

            <IconButton
              onClick={refreshMaterials}
              title="Refresh materials"
              sx={{
                ml: "auto",
                bgcolor: "rgba(255,255,255,0.2)",
                color: "primary.contrastText",
                borderRadius: "10px",
                "&:hover": { bgcolor: "rgba(255,255,255,0.3)" },
                "&:active": { transform: "scale(0.97)" },
              }}
            >
              <RefreshCw
                size={16}
                style={{
                  animation: syncing ? "spin 1s linear infinite" : undefined,
                }}
              />
            </IconButton>
          </Stack>
        </Box>
      </Box>

      <Box sx={{ maxWidth: 672, mx: "auto", px: 2, py: 3 }}>
        <Stack sx={{ gap: 2 }}>

          {/* ── Client name ── */}
          <Card sx={{ borderRadius: "16px", border: "1px solid", borderColor: "divider", p: 2 }}>
            <Typography
              sx={{
                fontSize: "0.625rem",
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "text.secondary",
                mb: 0.75,
              }}
            >
              Client Name (optional)
            </Typography>
            <TextField
              fullWidth
              placeholder="e.g. John Doe — appears on the quote"
              value={clientName}
              onChange={e => setClientName(e.target.value)}
              size="small"
            />
          </Card>

          {/* ── Loading / empty states ── */}
          {materials.length === 0 && syncing && (
            <Card
              sx={{
                borderRadius: "16px",
                border: "1px solid",
                borderColor: "divider",
                py: 5,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <RefreshCw
                size={24}
                color="var(--mui-palette-primary-main, #F76808)"
                style={{ animation: "spin 1s linear infinite", marginBottom: 8 }}
              />
              <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", fontWeight: 500 }}>
                Loading materials…
              </Typography>
            </Card>
          )}

          {materials.length === 0 && !syncing && (
            <Card
              sx={{
                borderRadius: "16px",
                border: "1px solid",
                borderColor: "divider",
                py: 5,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <Package size={32} color="var(--mui-palette-divider, #e0e0e0)" style={{ marginBottom: 8 }} />
              <Typography sx={{ fontSize: "0.875rem", color: "text.secondary", fontWeight: 500 }}>
                No materials available. Contact your manager.
              </Typography>
            </Card>
          )}

          {/* ── Quote items ── */}
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
            <Box
              component="button"
              type="button"
              onClick={addItem}
              sx={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 1,
                p: 1.75,
                borderRadius: "16px",
                border: "2px dashed",
                borderColor: "rgba(247,104,8,0.35)",
                bgcolor: "transparent",
                color: "primary.main",
                fontWeight: 700,
                fontSize: "0.875rem",
                cursor: "pointer",
                transition: "border-color 0.15s ease, background-color 0.15s ease",
                "&:hover": {
                  borderColor: "primary.main",
                  bgcolor: "rgba(247,104,8,0.06)",
                },
              }}
            >
              <Plus size={16} /> Add Another Item
            </Box>
          )}

          {/* ── Grand total + actions ── */}
          {hasAnyResult && (
            <Card
              sx={{
                borderRadius: "16px",
                border: "1px solid",
                borderColor: "divider",
                p: 2.5,
              }}
            >
              <Stack sx={{ gap: 2 }}>
                {/* Total row */}
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <Typography
                    sx={{
                      fontSize: "0.75rem",
                      fontWeight: 900,
                      textTransform: "uppercase",
                      letterSpacing: "0.12em",
                      color: "text.primary",
                    }}
                  >
                    {items.length > 1 ? "Grand Total" : "Total"}
                  </Typography>
                  <Typography sx={{ fontSize: "1.5rem", fontWeight: 900, color: "primary.main" }}>
                    {fmtMoney(grandTotal)}
                  </Typography>
                </Box>

                {/* Per-item breakdown */}
                {items.length > 1 && (
                  <Box sx={{ borderTop: "1px solid", borderColor: "divider", pt: 1.5 }}>
                    <Stack sx={{ gap: 0.75 }}>
                      {items.map((item, idx) => {
                        const mat = materials.find(m => m["Material ID"] === item.materialId) ?? null;
                        const { totalCost } = calcItem(item, mat);
                        if (!mat || totalCost === 0) return null;
                        return (
                          <Box
                            key={item.id}
                            sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
                          >
                            <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", fontWeight: 500 }}>
                              {idx + 1}. {item.description || `Item ${idx + 1}`}
                            </Typography>
                            <Typography sx={{ fontSize: "0.75rem", fontWeight: 900 }}>
                              {fmtMoney(totalCost)}
                            </Typography>
                          </Box>
                        );
                      })}
                    </Stack>
                  </Box>
                )}

                {/* Action buttons — row */}
                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
                  <Button
                    variant="contained"
                    onClick={handleWhatsApp}
                    startIcon={<Share2 size={16} />}
                    sx={{
                      bgcolor: "#10B981",
                      color: "#fff",
                      borderRadius: "10px",
                      fontWeight: 900,
                      "&:hover": { bgcolor: "#059669" },
                    }}
                  >
                    WhatsApp
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={handleSaveQuote}
                    disabled={savingQuote}
                    startIcon={
                      <Save
                        size={16}
                        style={{ animation: savingQuote ? "pulse 1s ease infinite" : undefined }}
                      />
                    }
                    sx={{
                      borderRadius: "10px",
                      fontWeight: 900,
                      color: "#2563EB",
                      borderColor: "rgba(37,99,235,0.3)",
                      "&:hover": { bgcolor: "rgba(37,99,235,0.06)", borderColor: "#2563EB" },
                    }}
                  >
                    {savingQuote ? "Saving..." : "Save Estimate"}
                  </Button>
                </Box>

                {/* Copy button — full width */}
                <Button
                  variant="outlined"
                  fullWidth
                  onClick={handleCopy}
                  startIcon={copied ? <Check size={16} /> : <Copy size={16} />}
                  sx={{
                    borderRadius: "10px",
                    fontWeight: 900,
                    color: copied ? "#10B981" : "text.primary",
                    borderColor: copied ? "#10B981" : "divider",
                  }}
                >
                  {copied ? "Copied!" : "Copy to Clipboard"}
                </Button>
              </Stack>
            </Card>
          )}

          {/* ── Log sale CTA ── */}
          {hasAnyResult && allStockOk && (
            <Box
              component="button"
              type="button"
              onClick={handleLogSale}
              sx={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                p: 2,
                bgcolor: "primary.main",
                borderRadius: "16px",
                border: "none",
                cursor: "pointer",
                color: "primary.contrastText",
                boxShadow: "0 4px 16px rgba(247,104,8,0.3)",
                transition: "background-color 0.15s ease",
                textAlign: "left",
                "&:hover": { bgcolor: "#D4912E" },
              }}
            >
              <Box>
                <Typography sx={{ fontSize: "0.875rem", fontWeight: 900, color: "primary.contrastText" }}>
                  Ready to log as a sale?
                </Typography>
                <Typography sx={{ fontSize: "0.75rem", color: "rgba(26,20,16,0.6)", mt: 0.25 }}>
                  Head to New Entry with these dimensions
                </Typography>
              </Box>
              <ChevronRight size={20} color="rgba(26,20,16,0.5)" />
            </Box>
          )}

        </Stack>
      </Box>

      {/* CSS for spin animation (used inline via style prop) */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
    </Box>
  );
}

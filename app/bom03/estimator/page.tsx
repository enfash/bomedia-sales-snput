"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Info, Package, ChevronRight, Share2, Copy, Check } from "lucide-react";
import { Box, Button, Paper, Stack, TextField, Typography } from "@mui/material";
import { toast } from "sonner";
import NextLink from "next/link";
import { useSyncStore } from "@/lib/store";
import { estimatorStyles as styles } from "@/app/theme";
import {
  AddItemButton, EmptyCard, EstimatorHeading, FieldLabel, ItemCard, LinkCta, Notice, QuoteSummary, ResultTiles, SizeFields,
} from "@/components/estimator/estimator-parts";
import { fmtMoney, marginTone, newItemId, parseNum, toFt } from "@/lib/estimator-view";

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

function newItem(): QuoteItem {
  return { id: newItemId(), description: "", width: "", height: "", qty: "1", dimUnit: "ft", margin: "0", rollId: "", open: true };
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
    return <Notice tone="error">No roll wide enough for {wFt.toFixed(1)}×{hFt.toFixed(1)}ft. Try a smaller size or add wider stock.</Notice>;
  }

  return (
    <Stack spacing={2}>
      {hasDims && inventory.length !== eligible.length && (
        <Notice tone="warning">Showing {eligible.length} of {inventory.length} rolls that fit this size</Notice>
      )}
      {Object.entries(grouped).map(([material, rolls]) => (
        <Box key={material} sx={styles.rollGroup}>
          <Typography variant="overline" color="text.secondary">{material}</Typography>
          <Box sx={styles.rolls}>
            {rolls.map(roll => {
              const remaining = parseNum(roll["Remaining Length (ft)"]);
              const isOut = remaining <= 0 || roll.Status === "Out of Stock";
              const isLow = !isOut && roll.Status === "Low Stock";
              const isSel = roll["Roll ID"] === item.rollId;
              const statusText = isOut ? "Out" : isLow ? "Low" : `${remaining.toFixed(0)}ft left`;

              return (
                <Paper
                  key={roll["Roll ID"]}
                  component="button"
                  type="button"
                  onClick={() => !isOut && onChange(roll["Roll ID"])}
                  disabled={isOut}
                  aria-pressed={isSel}
                  variant="outlined"
                  sx={[styles.roll, ...(isSel ? [styles.rollOn] : [])]}
                >
                  <Typography sx={styles.strong}>{parseNum(roll["Width (ft)"])}ft wide</Typography>
                  <Typography variant="body2" color="text.secondary">₦{parseNum(roll["Price"]).toLocaleString()}/sqft</Typography>
                  <Box sx={styles.rollStatus}>
                    <Box component="span" sx={[styles.dot, isOut ? styles.dotOut : isLow ? styles.dotLow : styles.dotOk]} />
                    <Typography variant="body2" color="text.secondary">{statusText}</Typography>
                  </Box>
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
  const { wFt, hFt, qty, rollWidth, isFlipped, widthOk, unitSqft, unitCost, totalCost, stockOk, profit, profitPct, costPerSqft, rate } = calcItem(item, roll);
  const hasResult = roll && unitSqft > 0;

  return (
    <ItemCard
      index={index}
      title={item.description || `Item ${index + 1}`}
      summary={hasResult ? <>{item.width}{item.dimUnit} × {item.height}{item.dimUnit} × {qty} — <Box component="span" sx={styles.itemSummaryValue}>{fmtMoney(totalCost)}</Box></> : undefined}
      money={hasResult ? fmtMoney(totalCost) : undefined}
      open={item.open}
      canRemove={canRemove}
      onToggle={() => onChange({ open: !item.open })}
      onRemove={onRemove}
    >
      <Box>
        <FieldLabel>Description (optional)</FieldLabel>
        <TextField placeholder="e.g. Banner, Roll-up, Sticker…" value={item.description} onChange={e => onChange({ description: e.target.value })} fullWidth size="small" />
      </Box>

      <Box>
        <SizeFields item={item} onChange={onChange} withMargin />
        {roll && wFt > 0 && hFt > 0 && isFlipped && (
          <Notice tone="warning" spaced>Rotated to fit — {item.dimUnit === "in" ? `${parseFloat(item.height)}in` : `${hFt.toFixed(1)}ft`} side along the {rollWidth.toFixed(1)}ft roll</Notice>
        )}
        {roll && wFt > 0 && !widthOk && (
          <Notice tone="error" spaced>Both dimensions exceed this roll&apos;s width — choose a wider material</Notice>
        )}
      </Box>

      <Box>
        <FieldLabel>Material</FieldLabel>
        <MaterialPicker item={item} inventory={inventory} onChange={rollId => onChange({ rollId })} />
      </Box>

      {hasResult && widthOk && (
        <Stack spacing={1.5}>
          <ResultTiles tiles={[
            { label: "Area", value: `${unitSqft.toFixed(2)} sqft` },
            { label: "Rate", value: `₦${rate.toFixed(0)}/sqft` },
            { label: "Unit", value: fmtMoney(unitCost) },
            { label: "Total", value: fmtMoney(totalCost), accent: true },
          ]} />
          {costPerSqft > 0 && (
            <Notice tone={marginTone(profitPct)}>
              <Box sx={styles.profit}>
                <Box component="span"><Info size={14} /> Profit: {fmtMoney(profit * qty)}</Box>
                <Box component="span">{profitPct.toFixed(1)}% margin</Box>
              </Box>
            </Notice>
          )}
          {!stockOk && <Notice tone="error">Insufficient stock for this quantity</Notice>}
        </Stack>
      )}
    </ItemCard>
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
  const breakdown = items.flatMap((item, idx) => {
    const roll = inventory.find(r => r["Roll ID"] === item.rollId) ?? null;
    const { totalCost } = calcItem(item, roll);
    return roll && totalCost > 0 ? [{ id: item.id, label: `${idx + 1}. ${item.description || `Item ${idx + 1}`}`, money: fmtMoney(totalCost) }] : [];
  });

  return (
    <Box sx={styles.page}>
      <EstimatorHeading backHref="/bom03" backLabel="Dashboard" onRefresh={refreshInventory} syncing={syncing} refreshLabel="Refresh stock" />

      <Box sx={styles.stack}>
        <Paper variant="outlined" sx={styles.card}>
          <FieldLabel>Client name (optional)</FieldLabel>
          <TextField placeholder="e.g. John Doe — appears on the quote" value={clientName} onChange={e => setClientName(e.target.value)} fullWidth size="small" />
        </Paper>

        {inventory.length === 0 && syncing && <EmptyCard icon={<Package size={28} />}>Loading stock…</EmptyCard>}
        {inventory.length === 0 && !syncing && (
          <EmptyCard icon={<Package size={28} />}>
            <Typography>No materials in inventory.</Typography>
            <Button component={NextLink} href="/bom03/inventory" size="small" endIcon={<ChevronRight size={14} />}>Add rolls to inventory</Button>
          </EmptyCard>
        )}

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

        {inventory.length > 0 && <AddItemButton onClick={addItem} />}

        {hasAnyResult && (
          <QuoteSummary total={fmtMoney(grandTotal)} count={items.length} breakdown={breakdown}>
            {totalProfit > 0 && (
              <Notice tone="success">
                <Box sx={styles.profit}>
                  <Box component="span">Est. total profit</Box>
                  <Box component="span">{fmtMoney(totalProfit)} ({grandTotal > 0 ? ((totalProfit / grandTotal) * 100).toFixed(1) : 0}%)</Box>
                </Box>
              </Notice>
            )}
            <Box sx={styles.actionsTwo}>
              <Button variant="contained" color="success" onClick={handleWhatsApp} startIcon={<Share2 size={16} />}>Send via WhatsApp</Button>
              <Button variant="outlined" color="inherit" onClick={handleCopy} startIcon={copied ? <Check size={16} /> : <Copy size={16} />}>{copied ? "Copied" : "Copy to clipboard"}</Button>
            </Box>
          </QuoteSummary>
        )}

        {hasAnyResult && (
          <LinkCta href="/bom03/new-entry" title="Ready to log as a sale?" note="Open New Sale to log it"><ChevronRight size={20} /></LinkCta>
        )}
      </Box>
    </Box>
  );
}

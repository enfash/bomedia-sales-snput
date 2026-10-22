"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { ChevronRight, Package, Share2, Copy, Check, Save } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useSyncStore } from "@/lib/store";
import { paymentContext } from '@/lib/payment-outbox';
import { saveScreenOrder } from '@/lib/order-outbox';
import { orderTotal, orderItemTotal, type OrderItem } from '@/lib/order-contract';
import { lagosBusinessDate, nairaToKobo } from '@/lib/accounting-entry';
import { MaterialSelector } from "@/components/material-selector";
import { estimatorStyles as styles } from "@/app/theme";
import {
  AddItemButton, EmptyCard, EstimatorHeading, FieldLabel, ItemCard, LinkCta, Notice, QuoteSummary, ResultTiles, SizeFields,
} from "@/components/estimator/estimator-parts";
import { fmtMoney, newItemId, parseNum, toFt } from "@/lib/estimator-view";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { LoadingState } from "@/components/loading-state";

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

function newItem(): QuoteItem {
  return { id: newItemId(), description: "", width: "", height: "", qty: "1", dimUnit: "ft", materialId: "", open: true };
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
  const normal = fitsNormal && wFt > 0 ? Math.ceil(qty/Math.floor(rollWidth/wFt))*hFt : Infinity;
  const rotated = fitsFlipped && hFt > 0 ? Math.ceil(qty/Math.floor(rollWidth/hFt))*wFt : Infinity;
  const isFlipped = rotated < normal;
  const widthOk     = fitsNormal || fitsFlipped;

  const unitSqft    = wFt * hFt;
  let unitCost = unitSqft * price;
  try {
    const priceKobo=nairaToKobo(String(price));
    if(priceKobo && wFt>0 && hFt>0) unitCost=Number(orderItemTotal({kind:'print',ref:item.materialId,description:item.description,quantity:'1',width:item.width,height:item.height,unit:item.dimUnit,priceKobo}))/100;
  } catch { /* Incomplete input keeps the estimate editable. Save validates it. */ }
  const totalCost   = unitCost * qty;

  const totalLength = Number.isFinite(Math.min(normal,rotated)) ? Math.min(normal,rotated) : 0;
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
        <TextField fullWidth placeholder="e.g. Banner, Flex, Sticker…" value={item.description} onChange={e => onChange({ description: e.target.value })} size="small" />
      </Box>

      <Box>
        <SizeFields item={item} onChange={onChange} />
        {material && wFt > 0 && hFt > 0 && isFlipped && (
          <Notice tone="warning" spaced>Rotated to fit — {item.dimUnit === "in" ? `${parseFloat(item.height)}in` : `${hFt.toFixed(1)}ft`} side along the {rollWidth.toFixed(1)}ft roll</Notice>
        )}
        {material && wFt > 0 && !widthOk && (
          <Notice tone="error" spaced>Both dimensions exceed this roll&apos;s width — choose a wider material</Notice>
        )}
      </Box>

      <Box>
        <MaterialSelector
          materials={materials}
          selectedMaterialId={item.materialId}
          onSelect={mat => onChange({ materialId: mat["Material ID"] })}
          loading={false}
        />
      </Box>

      {hasResult && widthOk && (
        <ResultTiles tiles={[
          { label: "Area", value: `${unitSqft.toFixed(2)} sqft` },
          { label: "Unit price", value: fmtMoney(unitCost) },
          { label: "Total", value: fmtMoney(totalCost), accent: true },
        ]} />
      )}

      {hasResult && !stockOk && <Notice tone="error">Insufficient stock — confirm with your manager</Notice>}
    </ItemCard>
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
  const quoteSavingRef = useRef(false);
  const savedRequest = useRef<{id:string;snapshot:string}|null>(null);
  const [savedQuote, setSavedQuote] = useState<{number:string;snapshot:string}|null>(null);
  useEffect(()=>{
    const confirmed=(event:Event)=>{
      const result=(event as CustomEvent).detail;
      if(result?.request_id===savedRequest.current?.id && result.quote_number)
        setSavedQuote({number:result.quote_number,snapshot:savedRequest.current!.snapshot});
    };
    window.addEventListener('bomedia-order-confirmed',confirmed);
    return()=>window.removeEventListener('bomedia-order-confirmed',confirmed);
  },[]);

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
      if (j.data) useSyncStore.setState({cachedMaterials:j.data});
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
    if(savedQuote?.snapshot===JSON.stringify({clientName,items})) {
      toast.success(`This quote is already saved: ${savedQuote.number}`);return;
    }
    if (!clientName.trim()) {
      toast.error("Please enter a Client Name to save a quote.");
      return;
    }
    if (grandTotal === 0) {
      toast.error("Add at least one valid item to save a quote.");
      return;
    }

    if (quoteSavingRef.current) return;
    quoteSavingRef.current=true;setSavingQuote(true);
    try {
      const context=await paymentContext();
      if(context.backend==='postgres') {
        const orderItems:OrderItem[]=items.map(item=>{
          const material=materials.find(m=>m['Material ID']===item.materialId);
          const price=material ? nairaToKobo(String(material['Selling Price'])) : null;
          if(!price)throw new Error('Refresh material prices before saving the quote.');
          return {kind:'print',ref:item.materialId,description:item.description.trim()||`${material['Material Name']} print job`,quantity:item.qty,
            width:item.width,height:item.height,unit:item.dimUnit,priceKobo:price};
        });
        const entry=await saveScreenOrder({operation:'quote',businessDate:lagosBusinessDate(),clientName:clientName.trim(),contact:'',jobStatus:'Quoted',
          initialPaymentKobo:'0',totalKobo:orderTotal(orderItems),items:orderItems});
        savedRequest.current={id:entry.order.requestId,snapshot:JSON.stringify({clientName,items})};
        toast.success('Quote saved on this device. Its number appears after confirmation.');
        return;
      }
    } catch(e) { toast.error(e instanceof Error ? e.message : 'Quote could not be saved.'); return; }
    finally {quoteSavingRef.current=false;setSavingQuote(false);}
    quoteSavingRef.current=true;setSavingQuote(true);
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
      quoteSavingRef.current=false;setSavingQuote(false);
    }
  };

  const handleLogSale = async () => {
    if(savedRequest.current?.snapshot===JSON.stringify({clientName,items}) && savedQuote?.snapshot!==savedRequest.current.snapshot) {
      toast.error('Wait for this saved quote to be confirmed, then continue to New Entry.');return;
    }
    let context;
    try { context=await paymentContext(); } catch(e) { toast.error(e instanceof Error?e.message:"Reconnect before continuing.");return; }
    // Save to local storage for the new-entry page to pick up
    localStorage.setItem("estimatorCart", JSON.stringify({
      version: 3, backend: context.backend,
      clientName,
      items,
      ...(savedQuote?.snapshot===JSON.stringify({clientName,items}) ? {quoteNumber:savedQuote.number} : {})
    }));
    router.push("/cashier/new-entry");
  };

  const hasAnyResult = grandTotal > 0;
  const allStockOk = items.every(item => {
    const mat = materials.find(m => m["Material ID"] === item.materialId) ?? null;
    return calcItem(item, mat).stockOk;
  });

  const breakdown = items.flatMap((item, idx) => {
    const mat = materials.find(m => m["Material ID"] === item.materialId) ?? null;
    const { totalCost } = calcItem(item, mat);
    return mat && totalCost > 0 ? [{ id: item.id, label: `${idx + 1}. ${item.description || `Item ${idx + 1}`}`, money: fmtMoney(totalCost) }] : [];
  });

  return (
    <Box sx={styles.page}>
      <EstimatorHeading backHref="/cashier" backLabel="Home" onRefresh={refreshMaterials} syncing={syncing} refreshLabel="Refresh materials" />
      {savedQuote && <Notice tone="success">Saved quote: {savedQuote.number}</Notice>}

      <Box sx={styles.stack}>
        <Paper variant="outlined" sx={styles.card}>
          <FieldLabel>Client name (optional)</FieldLabel>
          <TextField fullWidth placeholder="e.g. John Doe — appears on the quote" value={clientName} onChange={e => setClientName(e.target.value)} size="small" />
        </Paper>

        {materials.length === 0 && syncing && <LoadingState pieces={[{ k: "cards", n: 2 }]} label="Loading materials" />}
        {materials.length === 0 && !syncing && <EmptyCard icon={<Package size={28} />}>No materials available. Contact your manager.</EmptyCard>}

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

        {materials.length > 0 && <AddItemButton onClick={addItem} />}

        {hasAnyResult && (
          <QuoteSummary total={fmtMoney(grandTotal)} count={items.length} breakdown={breakdown}>
            <Box sx={styles.actions}>
              <Button variant="contained" color="success" onClick={handleWhatsApp} startIcon={<Share2 size={16} />}>WhatsApp</Button>
              <Button variant="outlined" color="info" onClick={handleSaveQuote} disabled={savingQuote} startIcon={<Save size={16} />}>{savingQuote ? "Saving..." : "Save estimate"}</Button>
              <Button variant="outlined" color="inherit" onClick={handleCopy} startIcon={copied ? <Check size={16} /> : <Copy size={16} />}>{copied ? "Copied" : "Copy to clipboard"}</Button>
            </Box>
          </QuoteSummary>
        )}

        {hasAnyResult && allStockOk && (
          <LinkCta onClick={handleLogSale} title="Ready to log as a sale?" note="Head to New Entry with these dimensions"><ChevronRight size={20} /></LinkCta>
        )}
      </Box>
    </Box>
  );
}

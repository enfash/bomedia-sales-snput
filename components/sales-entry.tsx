"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, PenLine, Plus, RefreshCw, Sparkles } from "lucide-react";
import { useSyncStore } from "@/lib/store";
import { MaterialSelector } from "@/components/material-selector";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs from "dayjs";
import { JOB_STATUSES, STORAGE_KEYS } from "@/lib/constants";
import { canonicalClientName } from "@/lib/client-names";
import { clearDraft, readDraft, restoredDate, writeDraft } from "@/lib/sale-draft";

import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Alert from "@mui/material/Alert";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import { MoneyField } from "@/components/money-field";
import { PaidBy } from "@/components/paid-by";
import type { PaymentMethod } from "@/lib/payment-methods";

import { paymentContext, cachedPaymentContext } from '@/lib/payment-outbox';
import { lagosBusinessDate, nairaToKobo } from '@/lib/accounting-entry';
import { saveScreenOrder } from '@/lib/order-outbox';
import { entryChanges, type ApprovalRuleRow, type EntryChange } from '@/lib/approvals-view';
import { phoneProblem } from '@/lib/new-sale';
import { OrderPanel, TotalBar } from '@/components/new-sale/order-panel';
import { ReviewSheet } from '@/components/new-sale/review-sheet';
import { newSaleStyles as styles } from '@/app/theme';
import { orderItemTotal, orderTotal, type OrderCatalog } from '@/lib/order-contract';
import { cartOrderItem, quoteCart, type OrderCartRow, type ScreenQuote } from '@/lib/order-cart';
import { ServiceOrderEntry } from '@/components/service-order-entry';

// ─── Types ────────────────────────────────────────────────────────────────────

interface InventoryRoll {
  "Roll ID": string;
  "Item Name": string;
  "Category": string;
  "Width (ft)": string | number;
  "Total Length (ft)": string | number;
  "Remaining Length (ft)": string | number;
  "Price": string | number;
  "Status": string;
  _rowIndex: number;
}

type CartItem = OrderCartRow;

interface BatchMeta {
  date: string;
  clientName: string;
  contact: string;
  jobStatus: string;
  initialPayment: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const parseNum = (v: string | number | undefined) =>
  parseFloat(String(v ?? "0").replace(/[^\d.-]/g, "")) || 0;

const fmtCurrency = (n: number) =>
  `₦${n.toLocaleString(undefined, { minimumFractionDigits: 0 })}`;

// ─── Main SalesEntry Component ────────────────────────────────────────────────

export function SalesEntry() {
  // ── Inventory/Materials state ───────────────────────────────────────────
  const { cachedMaterials, setCachedData, cachedSales, cachedExpenses, cachedInventory, cachedPayments } = useSyncStore();
  const [materialsLoading, setMaterialsLoading] = useState(false);

  const materials = cachedMaterials;

  const fetchSalesForSuggestions = useCallback(async () => {
    try {
      const res = await fetch("/api/sales");
      const json = await res.json();
      if (res.ok && json.data?.length) {
        useSyncStore.setState({cachedSales:json.data});
      }
    } catch { /* silent */ }
  }, [cachedExpenses, cachedInventory, cachedPayments, cachedMaterials, setCachedData]);

  useEffect(() => {
    if (cachedSales.length === 0) fetchSalesForSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchMaterials = useCallback(async (silent = false) => {
    if (!silent) setMaterialsLoading(true);
    try {
      const res = await fetch("/api/materials");
      const json = await res.json();
      if (res.ok) {
        useSyncStore.setState({cachedMaterials:json.data || []});
      } else {
        toast.error(`Materials: ${json.error || "Failed to load"}`);
      }
    } catch {
      toast.error("Could not load material profiles — check connection");
    } finally {
      setMaterialsLoading(false);
    }
  }, [cachedSales, cachedExpenses, cachedInventory, cachedPayments, setCachedData]);

  useEffect(() => {
    if (cachedMaterials.length === 0) fetchMaterials();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Batch meta ───────────────────────────────────────────────────────────
  const [meta, setMeta] = useState<BatchMeta>({
    date: lagosBusinessDate(),
    clientName: "",
    contact: "",
    jobStatus: JOB_STATUSES[0],
    initialPayment: "0",
  });
  const setMetaField = (k: keyof BatchMeta, v: string) =>
    setMeta((prev) => ({ ...prev, [k]: v }));
  // How the customer paid the initial payment. The books keep cash, bank
  // transfer and POS apart, so it is asked whenever money is entered.
  const [paidBy, setPaidBy] = useState<PaymentMethod | "">("");
  const savingRef = useRef(false);
  const [catalog, setCatalog] = useState<OrderCatalog | null>(null);
  // The owner's approval rules, so the cashier is asked for a reason before sending a sale the owner must approve.
  const [approvalRules, setApprovalRules] = useState<{ rules: ApprovalRuleRow[]; isOwner: boolean } | null>(null);
  // What makes this sale need the owner, worked out when the review opens.
  const [reviewChanges, setReviewChanges] = useState<EntryChange[]>([]);
  const [postgres, setPostgres] = useState(false);
  const [backendReady,setBackendReady]=useState(false);
  const [customerId, setCustomerId] = useState<string | undefined>();
  const [loadedQuote, setLoadedQuote] = useState<{id:string;number:string;changed:boolean}|null>(null);
  const [quoteInput, setQuoteInput] = useState('');
  const [quoteLoading, setQuoteLoading] = useState(false);
  useEffect(() => {
    let active = true;
    void paymentContext().then(async context => {
      if (!active) return;
      setPostgres(context.backend === 'postgres');setBackendReady(true);
      if (context.backend !== 'postgres') return;
      const response = await fetch('/api/accounting/orders', {cache:'no-store'});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Customer and service list unavailable.');
      if (active) { setCatalog(result); localStorage.setItem('bomedia-order-catalog',JSON.stringify(result)); }
      try {
        const rulesResponse = await fetch('/api/accounting/approval-rules?for=entry', {cache:'no-store'}), rules = await rulesResponse.json();
        if (rulesResponse.ok && Array.isArray(rules.rules) && active) { setApprovalRules(rules); localStorage.setItem('bomedia-approval-rules',JSON.stringify(rules)); }
      } catch { /* The server still decides; without the rules the sale is simply sent and answered there. */ }
    }).catch(() => {
      if (active && cachedPaymentContext(localStorage)?.backend === 'postgres') {
        setPostgres(true);setBackendReady(true);
        try { setCatalog(JSON.parse(localStorage.getItem('bomedia-order-catalog') || 'null')); } catch { /* Keep entered items. */ }
        try { setApprovalRules(JSON.parse(localStorage.getItem('bomedia-approval-rules') || 'null')); } catch { /* Same: the server decides. */ }
      }
    });
    return () => { active = false; };
  }, []);


  // ── Client suggestions ───────────────────────────────────────────────────
  const [showSuggestions, setShowSuggestions] = useState(false);

  const uniqueClients = useMemo(() => {
    const names = new Set<string>();
    cachedSales.forEach((s: any) => {
      const n = (s["CLIENT NAME"] || s["Client Name"] || "").trim();
      if (n) names.add(n);
    });
    return Array.from(names).sort();
  }, [cachedSales]);

  // Raw list, one entry per sale — duplicates identify the dominant spelling
  // when the sheet holds more than one version of a customer's name.
  const allClientNames = useMemo(
    () =>
      cachedSales
        .map((s: any) => ((s["CLIENT NAME"] || s["Client Name"] || "") as string).trim())
        .filter(Boolean),
    [cachedSales]
  );

  const clientContacts = useMemo(() => {
    const map: Record<string, string> = {};
    cachedSales.forEach((s: any) => {
      const n = (s["CLIENT NAME"] || s["Client Name"] || "").trim();
      const c = (s["CONTACT"] || s["Contact"] || "").trim();
      if (n && c) map[n] = c;
    });
    return map;
  }, [cachedSales]);

  const filteredClients = useMemo(() => {
    const q = meta.clientName.toLowerCase();
    return catalog ? catalog.customers.filter(c=>c.name.toLowerCase().includes(q)).slice(0,6).map(c=>({label:c.name,id:c.id,contact:c.contact||''}))
      : uniqueClients.filter(c=>c.toLowerCase().includes(q)).slice(0,6).map(c=>({label:c,id:undefined,contact:clientContacts[c]||''}));
  }, [uniqueClients, meta.clientName, catalog, clientContacts]);

  // ── Job form ─────────────────────────────────────────────────────────────
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [jobDesc, setJobDesc] = useState("");
  const [jobWidth, setJobWidth] = useState("");
  const [jobHeight, setJobHeight] = useState("");
  const [qty, setQty] = useState("1");
  const [costOverride, setCostOverride] = useState("");
  const [dimUnit, setDimUnit] = useState<"ft" | "in">("ft");
  const [formTouched, setFormTouched] = useState(false);

  const selectedMaterial = useMemo(
    () => materials.find((m) => m["Material ID"] === selectedMaterialId) || null,
    [materials, selectedMaterialId]
  );

  // The list price is filled in once, at the moment a material is chosen. It must not be re-applied when the materials list refreshes in the
  // background (every 30 seconds), or a price the cashier typed would silently go back to the list price.
  const chooseMaterial = (material: Record<string, string | number | undefined>) => {
    setSelectedMaterialId(String(material["Material ID"]));
    const price = parseNum(material["Selling Price"] as string | number | undefined);
    if (price > 0) setCostOverride(String(price));
  };

  const jobWFt = useMemo(() => {
    const w = parseFloat(jobWidth) || 0;
    return dimUnit === "in" ? w / 12 : w;
  }, [jobWidth, dimUnit]);

  const jobHFt = useMemo(() => {
    const h = parseFloat(jobHeight) || 0;
    return dimUnit === "in" ? h / 12 : h;
  }, [jobHeight, dimUnit]);

  const rollWidth = selectedMaterial ? parseNum(selectedMaterial["Width (ft)"]) : 0;
  const qtyNum = parseInt(qty) || 1;

  let normalLen = Infinity;
  let flippedLen = Infinity;
  if (rollWidth > 0 && jobWFt > 0 && jobHFt > 0) {
    if (jobWFt <= rollWidth + 0.01) {
      const itemsPerRow = Math.floor((rollWidth + 0.01) / jobWFt);
      normalLen = Math.ceil(qtyNum / itemsPerRow) * jobHFt;
    }
    if (jobHFt <= rollWidth + 0.01) {
      const itemsPerRow = Math.floor((rollWidth + 0.01) / jobHFt);
      flippedLen = Math.ceil(qtyNum / itemsPerRow) * jobWFt;
    }
  }

  const widthCompatible = !selectedMaterial || normalLen !== Infinity || flippedLen !== Infinity;
  const isFlipped = widthCompatible && flippedLen < normalLen;
  const jobLengthFt = widthCompatible && (normalLen !== Infinity || flippedLen !== Infinity)
    ? (isFlipped ? flippedLen : normalLen)
    : 0;

  const costPerSqft = parseFloat(costOverride) || 0;
  const listPricePerSqft = selectedMaterial ? parseNum(selectedMaterial["Selling Price"]) : 0;
  const unitSqft = jobWFt * jobHFt;
  const unitCost = unitSqft * costPerSqft;
  const totalAmount = unitCost * qtyNum;

  const matRemaining = selectedMaterial
    ? parseNum(selectedMaterial["Total Remaining (ft)"])
    : 0;
  const remainingAfterJob = matRemaining - jobLengthFt;
  const stockOk = jobLengthFt === 0 || remainingAfterJob >= 0;

  // ── Cart ─────────────────────────────────────────────────────────────────
  const [cart, setCart] = useState<CartItem[]>([]);

  const handleAddToCart = () => {
    if (loadedQuote) { toast.error('Start a new order before changing quoted items.'); return; }
    setFormTouched(true);
    if (!/^[1-9][0-9]{0,4}$/.test(qty) || Number(qty) > 10000 || !nairaToKobo(costOverride) || costPerSqft <= 0 || jobWFt <= 0 || jobHFt <= 0) {
      toast.error('Enter positive sizes, a whole quantity, and a price with at most two decimal places.'); return;
    }
    if (!selectedMaterialId) { toast.error("Please select a material profile"); return; }
    if (!jobWidth || !jobHeight) { toast.error("Enter both job width and height"); return; }
    if (!widthCompatible) {
      if (dimUnit === "in") {
        const wIn = parseFloat(jobWidth) || 0;
        const hIn = parseFloat(jobHeight) || 0;
        const rwIn = (rollWidth * 12).toFixed(0);
        toast.error(`Job (${wIn}in × ${hIn}in): largest dimension must be ≤ ${rwIn}in to fit the roll (${rollWidth}ft wide).`);
      } else {
        toast.error(`Job (${jobWFt.toFixed(1)}ft × ${jobHFt.toFixed(1)}ft) exceeds roll width (${rollWidth.toFixed(1)}ft) in both orientations.`);
      }
      return;
    }
    if (!stockOk) {
      toast.warning(`Low stock warning: need ${jobLengthFt.toFixed(1)}ft but only ${matRemaining.toFixed(1)}ft available. Job added — restock before printing.`);
    }

    const newItem: CartItem = {
      id: crypto.randomUUID(),
      materialId: selectedMaterialId,
      rollLabel: selectedMaterialId,
      itemName: selectedMaterial!["Material Name"],
      widthFt: parseNum(selectedMaterial!["Width (ft)"]),
      jobDescription: jobDesc.trim() || `${selectedMaterial!["Material Name"]} print job`,
      jobWidth: parseFloat(jobWidth),
      jobHeight: parseFloat(jobHeight),
      dimUnit,
      qty: qtyNum,
      costPerSqft,
      unitSqft,
      unitCost,
      totalAmount,
      jobLengthFt,
      remainingAfterJob,
      fromInventory: true,
      isFlipped,
    };

    if (postgres) {
      try { newItem.orderItem = cartOrderItem(newItem,catalog); newItem.totalAmount = Number(orderItemTotal(newItem.orderItem))/100; newItem.unitCost = newItem.totalAmount/newItem.qty; }
      catch (e) { toast.error((e as Error).message); return; }
    }
    setLoadedQuote(null);
    setCart((prev) => [...prev, newItem]);
    toast.success("Job added to order");
    setJobDesc(""); setJobWidth(""); setJobHeight(""); setQty("1"); setFormTouched(false);
  };

  async function loadPostgresQuote(qId: string) {
                          const [response, catalogResponse] = await Promise.all([
                            fetch(`/api/accounting/quotes?number=${encodeURIComponent(qId)}`,{cache:'no-store'}),
                            fetch('/api/accounting/orders',{cache:'no-store'})]);
                          const quote = await response.json(); const fresh = await catalogResponse.json();
                          if (!response.ok || !catalogResponse.ok) throw new Error(quote.error || fresh.error || 'Quote unavailable.');
                          const items = quoteCart(quote as ScreenQuote,fresh);
                          setCatalog(fresh); setCart(items); setCustomerId(quote.customer_id || undefined);
                          setMeta(previous=>({...previous,clientName:quote.client_name,contact:fresh.customers.find((c:{id:string})=>c.id===quote.customer_id)?.contact||'',initialPayment:'0'}));
                          setPaidBy(''); setLoadedQuote({id:quote.estimate_id,number:quote.quote_number,changed:orderTotal(items.map(i=>cartOrderItem(i,fresh)))!==quote.total_kobo});
                          toast.success('Quote loaded. Review the order and payment before saving.');
  }
  const handoffLoading = useRef(false);

  // ── Load from Estimator Handoff ──────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem("estimatorCart");
    if (saved && materials.length > 0 && backendReady) {
      try {
        const data = JSON.parse(saved);
        if ((data.backend && data.backend !== (postgres?'postgres':'sheets')) || (!data.backend && postgres)) throw new Error('This older estimate needs review. Load a saved PostgreSQL quote or re-enter its items; the original draft is preserved.');
        if (data.quoteNumber) {
          if (!handoffLoading.current) {
            handoffLoading.current = true;
            void loadPostgresQuote(data.quoteNumber).then(()=>{setQuoteInput(data.quoteNumber);localStorage.removeItem('estimatorCart');})
              .catch(error=>toast.error(error.message)).finally(()=>{handoffLoading.current=false;});
          }
          return;
        }
        if (data.clientName) setMetaField("clientName", data.clientName);
        if (data.items && Array.isArray(data.items)) {
          const newCartItems = data.items.map((it: any) => {
            const material = materials.find(m => m["Material ID"] === it.materialId);
            if (!material) throw new Error("A quoted material is unavailable. No items were dropped.");
            const wFt = it.dimUnit === "in" ? (parseFloat(it.width) || 0) / 12 : (parseFloat(it.width) || 0);
            const hFt = it.dimUnit === "in" ? (parseFloat(it.height) || 0) / 12 : (parseFloat(it.height) || 0);
            if (!/^[1-9][0-9]{0,4}$/.test(String(it.qty)) || Number(it.qty)>10000 || wFt<=0 || hFt<=0) throw new Error('Estimate dimensions or quantity need review.');
            const qty = Number(it.qty);
            const costPerSqft = parseNum(material["Selling Price"]);
            const unitSqft = wFt * hFt;
            const rollWidth = parseNum(material["Width (ft)"]);
            const fitsNormal = wFt <= rollWidth;
            const fitsFlipped = hFt <= rollWidth;
            if (!fitsNormal && !fitsFlipped) throw new Error('An estimate item does not fit its roll.');
            const normal = fitsNormal ? Math.ceil(qty/Math.floor(rollWidth/wFt))*hFt : Infinity;
            const rotated = fitsFlipped ? Math.ceil(qty/Math.floor(rollWidth/hFt))*wFt : Infinity;
            const isFlipped = rotated < normal;
            const jobLengthFt = Math.min(normal,rotated);
            return {
              id: crypto.randomUUID(),
              materialId: it.materialId,
              rollLabel: it.materialId,
              itemName: material["Material Name"],
              widthFt: rollWidth,
              jobDescription: it.description || `${material["Material Name"]} print job`,
              jobWidth: parseFloat(it.width),
              jobHeight: parseFloat(it.height),
              dimUnit: it.dimUnit,
              qty,
              costPerSqft,
              unitSqft,
              unitCost: unitSqft * costPerSqft,
              totalAmount: unitSqft * costPerSqft * qty,
              jobLengthFt,
              remainingAfterJob: parseNum(material["Total Remaining (ft)"]) - jobLengthFt,
              fromInventory: true,
              isFlipped,
            };
          }).map((row:CartItem)=>{const item=cartOrderItem(row,catalog);const exact=Number(orderItemTotal(item))/100;return {...row,orderItem:postgres?item:undefined,totalAmount:exact,unitCost:exact/row.qty};});
          if (newCartItems.length > 0) {
            setCart(prev => [...prev, ...newCartItems]);
            toast.success("Loaded estimate from Calculator!");
          }
        }
        localStorage.removeItem("estimatorCart");
      } catch (error) { toast.error(error instanceof Error ? error.message : "Estimate needs review."); }
    }
  }, [materials,backendReady,postgres]);

  // ── Totals ───────────────────────────────────────────────────────────────
  const grandTotal = useMemo(() => postgres ? Number(orderTotal(cart.map(i=>cartOrderItem(i,catalog))))/100 : cart.reduce((s, i) => s + i.totalAmount, 0), [cart, postgres, catalog]);
  const initialPaymentNum = parseFloat(meta.initialPayment) || 0;
  const balance = grandTotal - initialPaymentNum;
  const paymentStatus = useMemo(() => {
    if (grandTotal === 0) return cart.length ? "Free" : "Unpaid";
    if (balance <= 0) return "Paid";
    if (balance < grandTotal) return "Part-payment";
    return "Unpaid";
  }, [grandTotal, balance, cart.length]);

  // ── AI / NL state ────────────────────────────────────────────────────────
  const [nlText, setNlText] = useState("");
  const [nlParsing, setNlParsing] = useState(false);

  const handleNlSubmit = async () => {
    if (loadedQuote) { toast.error('Start a new order before changing quoted items.'); return; }
    if (!nlText.trim()) return;
    setNlParsing(true);
    try {
      const res = await fetch("/api/parse-nl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: nlText }),
      });
      const json = await res.json();
      if (res.ok && json.data) {
        const d = json.data;
        if (d["CLIENT NAME"]) { setMetaField("clientName", d["CLIENT NAME"]); setCustomerId(undefined); }
        if (d["CONTACT"]) setMetaField("contact", d["CONTACT"]);
        if (d["INITIAL PAYMENT (₦)"]) setMetaField("initialPayment", String(d["INITIAL PAYMENT (₦)"]));
        if (d["JOB DESCRIPTION"]) setJobDesc(d["JOB DESCRIPTION"]);
        if (d["COST PER SQRFT"]) setCostOverride(String(d["COST PER SQRFT"]));
        if (d["actualWidth"]) setJobWidth(String(d["actualWidth"]));
        if (d["actualHeight"]) setJobHeight(String(d["actualHeight"]));
        if (d["QTY"]) setQty(String(d["QTY"]));
        if (d._partial) {
          // The AI was unreachable and this came from local text extraction,
          // which fills in only what it could read with confidence. Anything
          // it could not find is left blank rather than guessed, so say so
          // instead of implying a clean parse.
          toast.warning(
            "AI unavailable — filled in only what could be read. Check every field before adding.",
            { duration: 8000 }
          );
        } else {
          toast.success("Parsed! Review the details then add to order.");
        }
      } else {
        toast.error(json.error || "Could not parse — try rephrasing");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setNlParsing(false);
    }
  };

  // ── Confirm & save ───────────────────────────────────────────────────────
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleReview = () => {
    if (!meta.clientName.trim()) { toast.error("Client name is required"); return; }
    // Safety net: blur normally handles this, but nothing should reach the
    // sheet under a spelling that splits an existing customer's history.
    const canonicalClient = postgres ? meta.clientName.trim() : canonicalClientName(meta.clientName, allClientNames);
    if (canonicalClient !== meta.clientName) setMetaField("clientName", canonicalClient);
    if (cart.length === 0) { toast.error("Add at least one job to the order"); return; }
    if (initialPaymentNum > 0 && !paidBy) { toast.error("Choose how the customer paid: Cash, Transfer or POS"); return; }
    const paid = nairaToKobo(meta.initialPayment || '0');
    if (paid === null || BigInt(paid) > BigInt(orderTotal(cart.map(i=>cartOrderItem(i,catalog))))) { toast.error('Enter a valid payment no greater than the order total.'); return; }
    setReviewChanges(approvalRules && !approvalRules.isOwner && catalog
      ? entryChanges({ businessDate: meta.date, today: lagosBusinessDate(), items: cart.map(i=>cartOrderItem(i,catalog)), materials: catalog.materials }, approvalRules.rules)
      : []);
    setShowConfirm(true);
  };

  const handleSave = async (reason?: string, acceptedRestoredPrices = false) => {
    if (savingRef.current) return;
    const contactProblem = phoneProblem(meta.contact, Math.round(balance * 100));
    if (contactProblem) { toast.error(contactProblem); return; }
    savingRef.current = true; setSaving(true);
    try {
      const context = await paymentContext();
      if (context.backend === 'postgres') {
        const items = cart.map(i=>cartOrderItem(i,catalog));
        if (draftPricesNeedReview && !loadedQuote && !acceptedRestoredPrices && (!catalog || !navigator.onLine || items.some(item => {
          if (item.kind !== 'print') return false;
          const current = catalog.materials.find(m=>m.id===item.ref || m.ref===item.ref);
          return !current || current.priceKobo !== item.priceKobo;
        }))) {
          setAsk({title:'Review restored prices',message:'This restored draft may contain older print prices. Keep these prices only if they are intentional; otherwise cancel and update the items.',yes:'Keep these prices',run:()=>{void handleSave(reason,true);}});
          return;
        }
        const paid = nairaToKobo(meta.initialPayment || '0');
        if (paid === null) throw new Error('Enter the initial payment to the nearest kobo.');
        if (reviewChanges.length && !reason) throw new Error('Tell the owner why this sale is different.');
        await saveScreenOrder({operation:'sale',businessDate:meta.date,clientName:meta.clientName.trim(),contact:meta.contact,
          ...(customerId ? {customerId} : {}), ...(loadedQuote ? {quoteId:loadedQuote.id} : {}), jobStatus:meta.jobStatus,
          initialPaymentKobo:paid,...(paid!=='0'&&paidBy ? {paymentMethod:paidBy} : {}),totalKobo:orderTotal(items),items,...(reason ? {approvalReason:reason} : {})});
        toast.success(reason ? 'Sent to the owner for approval. It is recorded once approved.' : 'Order saved on this device. Its reference appears after confirmation.');
        setShowConfirm(false);startFresh(false);
        return;
      }
      if (cart.some(i=>i.orderItem?.kind==='service') || loadedQuote) throw new Error('This order belongs to PostgreSQL. Reconnect before saving.');
    } catch(error) { toast.error(error instanceof Error ? error.message : 'Order could not be saved.'); return; }
    finally { savingRef.current=false;setSaving(false); }
    savingRef.current=true;setSaving(true);
    const loggedBy = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEYS.USER_NAME) || "Unknown" : "Unknown";
    let remainingPayment = initialPaymentNum;

    const rowArrays = cart.map((item) => {
      let paymentForRow = 0;
      if (remainingPayment >= item.totalAmount) {
        paymentForRow = item.totalAmount;
        remainingPayment -= item.totalAmount;
      } else if (remainingPayment > 0) {
        paymentForRow = remainingPayment;
        remainingPayment = 0;
      }
      const needsInchDiv = item.dimUnit === "in";
      const wRaw = item.jobWidth;
      const hRaw = item.jobHeight;
      const sizeFormula = needsInchDiv ? `=(${wRaw}*${hRaw})/144` : `=(${wRaw}*${hRaw})`;
      const rollWidthFt = item.widthFt;
      // Maps a roll width to its column on the Sales sheet. Any width not in
      // this list (a one-off/odd roll) falls into "custom" instead of being
      // silently misfiled under the nearest standard size.
      const colMap: Record<number, string> = { 3: "G", 4: "H", 5: "I", 6: "J", 7: "K", 8: "L", 10: "M" };
      const col = colMap[rollWidthFt] || "N"; // "N" = custom
      return [
        meta.date, meta.clientName,
        `${item.jobDescription} [${item.jobWidth}x${item.jobHeight}${item.dimUnit}]`,
        meta.contact, item.itemName, item.costPerSqft,
        col === "G" ? sizeFormula : "", col === "H" ? sizeFormula : "",
        col === "I" ? sizeFormula : "", col === "J" ? sizeFormula : "",
        col === "K" ? sizeFormula : "", col === "L" ? sizeFormula : "",
        col === "M" ? sizeFormula : "", col === "N" ? sizeFormula : "",
        item.qty,
        `=([COL_G_L][ROW]*F[ROW])`,
        paymentForRow,
        `=(O[ROW]*P[ROW])`,
        "", "",
        `=(R[ROW]-SUM(Q[ROW],S[ROW],T[ROW]))`,
        `=IF(R[ROW]=0,"Unpaid",IF(U[ROW]<=0,"Paid",IF(U[ROW]<R[ROW],"Part-payment","Unpaid")))`,
        meta.jobStatus, loggedBy, "",
      ];
    });

    try {
      useSyncStore.getState().addPendingEntry("sale", {
        batch: true,
        ...(initialPaymentNum > 0 && paidBy ? { paymentMethod: paidBy } : {}),
        items: rowArrays.map((row, i) => {
          const item = cart[i];
          return {
            values: row,
            totalArea: item.unitSqft * item.qty,
            jobLengthFt: item.jobLengthFt,
            canonicalItemName: item.materialId,
            jobDescription: item.jobDescription,
            qty: item.qty,
            materialId: item.materialId,
            jobWidth: item.jobWidth,
            jobHeight: item.jobHeight,
            dimUnit: item.dimUnit,
            rollWidthFt: item.widthFt,
          };
        }),
      });

      toast.success("Order saved locally — syncing to Google Sheets…");
      setShowConfirm(false);
      setMeta({ date: lagosBusinessDate(), clientName: "", contact: "", jobStatus: JOB_STATUSES[0], initialPayment: "0" });
      setPaidBy(""); setRestoredDraft(false);
      setCart([]); setSelectedMaterialId(""); setJobDesc(""); setJobWidth("");
      setJobHeight(""); setQty("1"); setCostOverride(""); setNlText(""); setFormTouched(false);
    } catch {
      toast.error("Failed to save locally");
    } finally {
      savingRef.current=false;setSaving(false);
    }
  };

  // ── View state ───────────────────────────────────────────────────────────
  const [tabValue, setTabValue] = useState(0);
  const [showQuote, setShowQuote] = useState(false);
  const [showService, setShowService] = useState(false);

  // ── Unsaved-sale draft ───────────────────────────────────────────────────
  // What has been filled in is kept on this phone, so leaving the page or refreshing does not lose it. It clears itself once the sale is saved.
  const [draftReady, setDraftReady] = useState(false);
  const [restoredDraft, setRestoredDraft] = useState(false);
  const [draftPricesNeedReview, setDraftPricesNeedReview] = useState(false);
  useEffect(() => {
    // Deferred one tick so no state is set synchronously inside the effect.
    void paymentContext().catch(() => null).then(() => {
      const draft = readDraft(localStorage);
      if (draft) {
        setMeta({ ...draft.meta, date: restoredDate(draft, lagosBusinessDate()) });
        setPaidBy(draft.paidBy as PaymentMethod | "");
        setCustomerId(draft.customerId); setCart(draft.cart); setLoadedQuote(draft.loadedQuote); setQuoteInput(draft.quoteInput);
        setSelectedMaterialId(draft.job.materialId); setJobDesc(draft.job.desc); setJobWidth(draft.job.width); setJobHeight(draft.job.height);
        setQty(draft.job.qty); setCostOverride(draft.job.price); setDimUnit(draft.job.unit); setNlText(draft.nlText);
        setRestoredDraft(true); setDraftPricesNeedReview(true);
      }
      setDraftReady(true);
    });
  }, []);
  useEffect(() => {
    if (!draftReady) return;
    writeDraft(localStorage, {
      version: 1, savedAt: Date.now(), savedOn: lagosBusinessDate(), meta, paidBy, customerId, cart, loadedQuote, quoteInput, nlText,
      job: { materialId: selectedMaterialId, desc: jobDesc, width: jobWidth, height: jobHeight, qty, price: costOverride, unit: dimUnit },
    });
  }, [draftReady, meta, paidBy, customerId, cart, loadedQuote, quoteInput, nlText, selectedMaterialId, jobDesc, jobWidth, jobHeight, qty, costOverride, dimUnit]);
  // An in-page question instead of the browser's pop-up, which some phones and app windows block (the button then does nothing).
  const [ask, setAsk] = useState<{ title: string; message: string; yes: string; run: () => void } | null>(null);
  const startFresh = (notify = true) => {
    clearDraft(localStorage); setDraftPricesNeedReview(false);
    setMeta({ date: lagosBusinessDate(), clientName: "", contact: "", jobStatus: JOB_STATUSES[0], initialPayment: "0" });
    setPaidBy(""); setCustomerId(undefined); setCart([]); setLoadedQuote(null); setQuoteInput("");
    setSelectedMaterialId(""); setJobDesc(""); setJobWidth(""); setJobHeight(""); setQty("1"); setCostOverride(""); setDimUnit("ft"); setNlText("");
    setFormTouched(false); setRestoredDraft(false);
    if (notify) toast.success("Started a new sale");
  };
  const isOwner = approvalRules?.isOwner ?? false;
  // Only the price rule is checked per item (the date is the same for the whole sale), and never for the owner.
  const priceFlagged = (item: CartItem) => !!approvalRules && !isOwner && !!catalog && item.orderItem?.kind !== "service"
    && entryChanges({ businessDate: meta.date, today: meta.date, items: [cartOrderItem(item, catalog)], materials: catalog.materials }, approvalRules.rules).length > 0;
  const removeFromCart = (id: string) => {
    if (loadedQuote) { toast.error("Start a new order before changing quoted items."); return; }
    setCart((prev) => prev.filter((i) => i.id !== id));
  };
  const reviewDisabled = cart.length === 0 || !meta.clientName.trim();

  const loadQuote = async (confirmed = false) => {
    const qId = quoteInput.trim().toUpperCase();
    if (!qId) return;
    if (cart.length && !confirmed) { setAsk({ title: "Replace the order?", message: "The items in this order will be replaced by the quote.", yes: "Replace", run: () => void loadQuote(true) }); return; }
    setQuoteLoading(true);
    try {
      const context = await paymentContext();
      if (context.backend === "postgres") {
        await loadPostgresQuote(qId);
      } else {
        const response = await fetch(`/api/estimates?quoteId=${encodeURIComponent(qId)}`);
        const result = await response.json();
        if (!response.ok || !result.data) throw new Error(result.error || "Quote not found.");
        localStorage.setItem("estimatorCart", JSON.stringify({ version: 3, backend: "sheets", clientName: result.data["CLIENT NAME"], items: JSON.parse(result.data["CART DATA"]) }));
        window.location.reload();
      }
    } catch (e) { toast.error(e instanceof Error ? e.message : "Quote could not be loaded."); }
    finally { setQuoteLoading(false); }
  };

  // ─────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────

  return (
    <Box sx={styles.page}>
      <Box sx={styles.tabs} role="group" aria-label="How to enter the sale">
        <Button variant={tabValue === 0 ? "contained" : "outlined"} color={tabValue === 0 ? "primary" : "inherit"} aria-pressed={tabValue === 0} startIcon={<PenLine size={16} />} onClick={() => setTabValue(0)}>Manual</Button>
        <Button variant={tabValue === 1 ? "contained" : "outlined"} color={tabValue === 1 ? "primary" : "inherit"} aria-pressed={tabValue === 1} startIcon={<Sparkles size={16} />} onClick={() => setTabValue(1)}>Describe it (AI)</Button>
      </Box>

      {restoredDraft && (
        <Alert severity="info" onClose={() => setRestoredDraft(false)} action={<Button color="inherit" size="small" onClick={() => setAsk({ title: "Start fresh?", message: "This throws away the unsaved sale on this phone.", yes: "Start fresh", run: startFresh })}>Start fresh</Button>}>
          Your unsaved sale was restored{meta.clientName.trim() ? ` (${meta.clientName.trim()})` : ""}. Nothing was lost.
        </Alert>
      )}

      <Box sx={styles.layout}>
        <Box sx={styles.stack}>
          {/* Customer */}
          <Paper variant="outlined" sx={styles.card}>
            <Typography variant="h6" component="h2">Customer</Typography>
            <Box sx={styles.customerGrid}>
              <DatePicker
                label="Date"
                value={meta.date ? dayjs(meta.date) : null}
                onChange={(val) => setMetaField("date", val?.format("YYYY-MM-DD") ?? "")}
                slotProps={{ textField: { fullWidth: true } }}
              />
              <Box sx={styles.suggestWrap}>
                <TextField
                  fullWidth required label="Client name"
                  disabled={!!loadedQuote}
                  value={meta.clientName}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => {
                    // Correct to the spelling already on file. Runs on tap-away, so it does not depend on a keyboard.
                    // Suggestion taps fire onMouseDown first, so this only ever confirms their choice.
                    if (!postgres) setMetaField("clientName", canonicalClientName(meta.clientName, allClientNames));
                    setTimeout(() => setShowSuggestions(false), 180);
                  }}
                  onChange={(e) => { setMetaField("clientName", e.target.value); setCustomerId(undefined); setLoadedQuote(null); setShowSuggestions(true); }}
                />
                {showSuggestions && filteredClients.length > 0 && (
                  <Paper variant="outlined" sx={styles.suggestions}>
                    {filteredClients.map((c) => (
                      <Box
                        key={c.id || c.label}
                        component="button"
                        type="button"
                        sx={styles.suggestion}
                        onMouseDown={() => {
                          setMetaField("clientName", c.label);
                          setCustomerId(c.id);
                          setMetaField("contact", c.contact || meta.contact);
                          setShowSuggestions(false);
                        }}
                      >
                        {c.label}{c.contact ? ` · ${c.contact}` : ""}
                      </Box>
                    ))}
                  </Paper>
                )}
              </Box>
              <TextField fullWidth label="Contact" placeholder="08012345678" value={meta.contact} onChange={(e) => setMetaField("contact", e.target.value)} />
            </Box>
            {showQuote ? (
              <Box sx={styles.quoteForm}>
                <TextField size="small" fullWidth label="Quote number" placeholder="e.g. QT-1234" value={quoteInput}
                  onChange={(e) => setQuoteInput(e.target.value.toUpperCase())} />
                <Button variant="outlined" disabled={quoteLoading} onClick={() => void loadQuote()}>Load</Button>
              </Box>
            ) : (
              <Box sx={styles.quoteRow}>
                <Typography variant="body2" color="text.secondary">Have a saved quote?</Typography>
                <Button size="small" onClick={() => setShowQuote(true)}>Load it</Button>
              </Box>
            )}
          </Paper>

          {loadedQuote && <Alert severity={loadedQuote.changed ? "warning" : "info"} action={
            <Button color="inherit" size="small" onClick={() => setAsk({ title: "Start a new order?", message: "This clears the quoted items.", yes: "Start a new order", run: () => { setCart([]); setLoadedQuote(null); setQuoteInput(""); } })}>Start a new order</Button>}>
            Quote {loadedQuote.number} loaded. {loadedQuote.changed ? "Prices have changed. Confirm the current total with the customer before saving." : "Review the items before saving."}
          </Alert>}

          {tabValue === 0 ? (<>
            <Paper variant="outlined" sx={styles.card}>
              <Typography variant="h6" component="h2">Add an item</Typography>

              <>
                <Box>
                  <MaterialSelector
                    materials={materials}
                    selectedMaterialId={selectedMaterialId}
                    onSelect={chooseMaterial}
                    loading={materialsLoading}
                  />
                  {selectedMaterial && <Typography sx={styles.stockLine}>
                    {parseNum(selectedMaterial["Total Remaining (ft)"]).toFixed(1)} ft left · list price {fmtCurrency(parseNum(selectedMaterial["Selling Price"]))} per sq ft
                  </Typography>}
                </Box>
                <TextField fullWidth label="What is it? (optional)" placeholder="Event banner, sticker label, window graphic" value={jobDesc} onChange={(e) => setJobDesc(e.target.value)} />
                <Box sx={styles.stageChips} role="group" aria-label="Size unit">
                  {(["ft", "in"] as const).map((u) => (
                    <Button key={u} size="small" variant={dimUnit === u ? "contained" : "outlined"} color={dimUnit === u ? "primary" : "inherit"} aria-pressed={dimUnit === u} onClick={() => setDimUnit(u)}>
                      {u === "ft" ? "Feet" : "Inches"}
                    </Button>
                  ))}
                </Box>
                <Box sx={styles.grid3}>
                  <TextField fullWidth required type="number" label={`Width (${dimUnit})`} placeholder={dimUnit === "ft" ? "4" : "48"} value={jobWidth}
                    error={formTouched && !jobWidth} onChange={(e) => { setJobWidth(e.target.value); setFormTouched(true); }} />
                  <TextField fullWidth required type="number" label={`Height (${dimUnit})`} placeholder={dimUnit === "ft" ? "8" : "96"} value={jobHeight}
                    error={formTouched && !jobHeight} onChange={(e) => { setJobHeight(e.target.value); setFormTouched(true); }} />
                  <TextField fullWidth type="number" label="Qty" value={qty} onChange={(e) => setQty(e.target.value)} slotProps={{ htmlInput: { min: 1 } }} />
                </Box>
                <MoneyField fullWidth label="Price per sq ft (₦)" placeholder="e.g. 200" value={costOverride} onChange={setCostOverride}
                  helperText={selectedMaterial ? "Filled in from the material’s list price." : undefined} />
                {listPricePerSqft > 0 && costPerSqft > 0 && costPerSqft !== listPricePerSqft && (
                  <Box sx={styles.noticeWarn}>
                    <Box sx={styles.noticeRow}>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>List price is {fmtCurrency(listPricePerSqft)} per sq ft</Typography>
                        <Typography variant="body2">{approvalRules && !isOwner && approvalRules.rules.some((r) => r.kind === "price" && r.enabled)
                          ? "A different price needs the owner’s approval when you review the sale."
                          : "You can save at your price. The owner will see this job in “Price changes to review”."}</Typography>
                      </Box>
                      <Button color="inherit" size="small" onClick={() => setCostOverride(String(listPricePerSqft))}>Use list price</Button>
                    </Box>
                  </Box>
                )}
                {selectedMaterial && jobWFt > 0 && jobHFt > 0 && isFlipped && (
                  <Box sx={styles.noticeWarn}>
                    <Typography variant="body2">The job will be rotated to fit: the {dimUnit === "in" ? `${parseFloat(jobHeight)} in` : `${jobHFt.toFixed(1)} ft`} side runs along the {rollWidth.toFixed(1)} ft roll width.</Typography>
                  </Box>
                )}
                {selectedMaterial && jobWFt > 0 && !widthCompatible && (
                  <Box sx={styles.noticeError}>
                    <Typography variant="body2">
                      {dimUnit === "in"
                        ? `Both sides (${parseFloat(jobWidth)} in × ${parseFloat(jobHeight)} in) are wider than the roll (${(rollWidth * 12).toFixed(0)} in). Choose a wider material.`
                        : `The job (${jobWFt.toFixed(1)} ft × ${jobHFt.toFixed(1)} ft) is wider than the roll (${rollWidth.toFixed(1)} ft) both ways. Choose a wider material.`}
                    </Typography>
                  </Box>
                )}
                {unitSqft > 0 && jobLengthFt > 0 && (
                  <Box sx={styles.totalTile}>
                    <Box>
                      <Typography variant="body2" color="text.secondary">{(unitSqft * qtyNum).toFixed(1)} sq ft · {qtyNum} piece{qtyNum === 1 ? "" : "s"}</Typography>
                      <Typography sx={styles.stockLine} color={stockOk ? undefined : "error"}>
                        {jobLengthFt.toFixed(1)} ft from the roll · {Math.max(0, remainingAfterJob).toFixed(1)} ft left after{stockOk ? "" : " (not enough stock)"}
                      </Typography>
                    </Box>
                    <Typography sx={styles.amount}>{fmtCurrency(totalAmount)}</Typography>
                  </Box>
                )}
                <Button fullWidth variant="contained" size="large" startIcon={<Plus size={20} />} onClick={handleAddToCart}
                  disabled={!selectedMaterialId || !jobWidth || !jobHeight || !widthCompatible}>
                  Add to order{totalAmount > 0 ? ` · ${fmtCurrency(totalAmount)}` : ""}
                </Button>
              </>
            </Paper>
            {postgres && catalog && !loadedQuote && <Paper variant="outlined" sx={styles.card}>
              <Box component="button" type="button" sx={styles.collapseHead} aria-expanded={showService} onClick={() => setShowService((open) => !open)}>
                <Box>
                  <Typography variant="h6" component="h2">Add a service</Typography>
                  <Typography variant="body2" color="text.secondary">Eyelets, design, fixing and other work that uses no roll.</Typography>
                </Box>
                {showService ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </Box>
              {showService && <ServiceOrderEntry services={catalog.services} onAdd={(item) => { setCart((previous) => [...previous, item]); }} />}
            </Paper>}
          </>) : (
            <Paper variant="outlined" sx={styles.card}>
              <Box>
                <Typography variant="h6" component="h2">Describe it</Typography>
                <Typography variant="body2" color="text.secondary">Write the job in plain words and the form fills itself in. Check it, pick the material, then add it.</Typography>
              </Box>
              <Box sx={styles.aiBox}>
                <TextField fullWidth multiline minRows={5} label="The job"
                  placeholder={`e.g. "John Doe ordered 3 SAV stickers, 4ft by 2ft each, paid ₦5,000 deposit"`}
                  value={nlText} onChange={(e) => setNlText(e.target.value)} />
                <Button fullWidth variant="contained" size="large" disabled={nlParsing || !nlText.trim()} onClick={handleNlSubmit}
                  startIcon={nlParsing ? <RefreshCw size={16} /> : <Sparkles size={16} />}>
                  {nlParsing ? "Reading…" : "Fill in the form"}
                </Button>
                {(jobWidth || jobHeight || jobDesc) && <>
                  <Box sx={styles.noticeWarn}><Typography variant="body2">Filled in. Now choose the material and add it to the order.</Typography></Box>
                  <MaterialSelector
                    materials={materials}
                    selectedMaterialId={selectedMaterialId}
                    onSelect={chooseMaterial}
                    loading={materialsLoading}
                  />
                  <Box sx={styles.grid2}>
                    <TextField fullWidth type="number" label={`Width (${dimUnit})`} value={jobWidth} onChange={(e) => setJobWidth(e.target.value)} />
                    <TextField fullWidth type="number" label={`Height (${dimUnit})`} value={jobHeight} onChange={(e) => setJobHeight(e.target.value)} />
                  </Box>
                  <Button fullWidth variant="contained" disabled={!selectedMaterialId || !jobWidth || !jobHeight} onClick={handleAddToCart}>
                    Add to order · {fmtCurrency(totalAmount)}
                  </Button>
                </>}
              </Box>
            </Paper>
          )}
        </Box>

        <OrderPanel cart={cart} total={grandTotal} client={meta.clientName} flagged={priceFlagged} onRemove={removeFromCart} onReview={handleReview} reviewDisabled={reviewDisabled} />
      </Box>

      <Dialog open={!!ask} onClose={() => setAsk(null)} aria-labelledby="ask-title">
        <DialogTitle id="ask-title">{ask?.title}</DialogTitle>
        <DialogContent><DialogContentText>{ask?.message}</DialogContentText></DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setAsk(null)}>Cancel</Button>
          <Button variant="contained" autoFocus onClick={() => { const run = ask?.run; setAsk(null); run?.(); }}>{ask?.yes}</Button>
        </DialogActions>
      </Dialog>

      <TotalBar count={cart.length} total={grandTotal} onReview={handleReview} disabled={reviewDisabled} />

      <ReviewSheet
        key={String(showConfirm)}
        open={showConfirm} onClose={() => setShowConfirm(false)} saving={saving}
        meta={meta} cart={cart} grandTotal={grandTotal} balance={balance} paymentStatus={paymentStatus}
        stages={JOB_STATUSES} onStage={(stage) => setMetaField("jobStatus", stage)} onPaid={(value) => setMetaField("initialPayment", value)} onContact={(value) => setMetaField("contact", value)}
        paidBy={paidBy} onPaidBy={setPaidBy} changes={reviewChanges} onSave={(reason) => void handleSave(reason)}
      />
    </Box>
  );
}

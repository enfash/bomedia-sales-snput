"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, CheckCircle2, Plus, Sparkles,
  Trash2, User, Ruler, Layers, Receipt, XCircle, RefreshCw,
  ArrowRight, Info, ChevronDown, ChevronUp,
} from "lucide-react";
import { useSyncStore } from "@/lib/store";
import { MaterialSelector } from "@/components/material-selector";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs from "dayjs";
import { JOB_STATUSES, STORAGE_KEYS } from "@/lib/constants";

import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import FormControl from "@mui/material/FormControl";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import Chip from "@mui/material/Chip";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Divider from "@mui/material/Divider";

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

interface CartItem {
  id: string;
  materialId: string;
  rollId?: string;
  rollLabel: string;
  itemName: string;
  widthFt: number;
  jobDescription: string;
  jobWidth: number;
  jobHeight: number;
  dimUnit: 'ft' | 'in';
  qty: number;
  costPerSqft: number;
  unitSqft: number;
  unitCost: number;
  totalAmount: number;
  jobLengthFt: number;
  remainingAfterJob: number;
  fromInventory: boolean;
  isFlipped: boolean;
}

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

// ─── TabPanel ────────────────────────────────────────────────────────────────

function TabPanel({ children, value, index }: { children: React.ReactNode; value: number; index: number }) {
  return <div hidden={value !== index}>{value === index && children}</div>;
}

// ─── StockBadge ──────────────────────────────────────────────────────────────

function StockBadge({ roll }: { roll: InventoryRoll }) {
  const remaining = parseNum(roll["Remaining Length (ft)"]);
  const status = roll.Status || "Active";
  if (status === "Out of Stock" || remaining <= 0)
    return <Chip label="Out of Stock" size="small" sx={{ bgcolor: "#fee2e2", color: "#dc2626", fontWeight: 700, fontSize: "0.6rem", height: 18 }} />;
  if (status === "Low Stock")
    return <Chip label={`Low · ${remaining.toFixed(0)}ft`} size="small" sx={{ bgcolor: "#fef3c7", color: "#d97706", fontWeight: 700, fontSize: "0.6rem", height: 18 }} />;
  return <Chip label={`${remaining.toFixed(0)}ft left`} size="small" sx={{ bgcolor: "#d1fae5", color: "#059669", fontWeight: 700, fontSize: "0.6rem", height: 18 }} />;
}

// ─── CartItemCard ─────────────────────────────────────────────────────────────

function CartItemCard({ item, onRemove }: { item: CartItem; onRemove: (id: string) => void }) {
  const stockOk = item.remainingAfterJob >= 0;
  return (
    <Paper
      variant="outlined"
      sx={{
        position: "relative",
        p: 2,
        borderRadius: 3,
        borderColor: stockOk ? "divider" : "error.light",
        bgcolor: stockOk ? "background.paper" : "rgba(192,57,43,0.03)",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 2, pr: 3 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 0.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 800 }} noWrap>
              {item.jobDescription || "Unnamed job"}
            </Typography>
            <Chip
              label={item.rollLabel}
              size="small"
              sx={{ bgcolor: "rgba(200,71,46,0.08)", color: "primary.main", fontWeight: 700, fontSize: "0.6rem", height: 18, border: "none" }}
            />
            {item.isFlipped && (
              <Chip label="↻ Auto-Rotated" size="small" sx={{ bgcolor: "#e0f2fe", color: "#0284c7", fontWeight: 700, fontSize: "0.6rem", height: 18 }} />
            )}
          </Box>
          <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 500 }}>
            {item.qty}× · {item.jobWidth}{item.dimUnit} × {item.jobHeight}{item.dimUnit} · {item.jobLengthFt.toFixed(1)}ft consumed
          </Typography>
          {!stockOk && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 1 }}>
              <AlertTriangle size={12} color="#dc2626" />
              <Typography variant="caption" sx={{ color: "error.main", fontWeight: 800 }}>
                Insufficient stock across all rolls of this material
              </Typography>
            </Box>
          )}
        </Box>
        <Box sx={{ textAlign: "right", flexShrink: 0 }}>
          <Typography variant="body1" sx={{ fontWeight: 800 }}>{fmtCurrency(item.totalAmount)}</Typography>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>₦{item.costPerSqft}/sqft</Typography>
        </Box>
      </Box>
      <IconButton
        size="small"
        onClick={() => onRemove(item.id)}
        aria-label="Remove"
        sx={{ position: "absolute", top: 8, right: 8, color: "text.disabled", "&:hover": { color: "error.main" } }}
      >
        <Trash2 size={14} />
      </IconButton>
    </Paper>
  );
}

// ─── SummaryBar ───────────────────────────────────────────────────────────────

function SummaryBar({
  cart, grandTotal, initialPayment, balance, paymentStatus, onSubmit, disabled,
}: {
  cart: CartItem[];
  grandTotal: number;
  initialPayment: number;
  balance: number;
  paymentStatus: string;
  onSubmit: () => void;
  disabled: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (cart.length === 0) return null;

  return (
    <Box sx={{ position: "fixed", bottom: 0, left: { xs: 0, md: 240 }, right: 0, zIndex: 50 }}>
      <Paper elevation={8} sx={{ borderRadius: 0, borderTop: "1px solid", borderColor: "divider" }}>
        {expanded && (
          <Box
            sx={{
              px: 2, pt: 2, pb: 1.5,
              display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2,
              borderBottom: "1px solid", borderColor: "divider",
            }}
          >
            {[
              { label: "Items", val: String(cart.length), sub: "in order" },
              { label: "Grand Total", val: fmtCurrency(grandTotal), sub: "before payment" },
              { label: "Balance Due", val: fmtCurrency(Math.max(0, balance)), sub: paymentStatus, accent: balance > 0 },
            ].map(({ label, val, sub, accent }) => (
              <Box key={label} sx={{ textAlign: "center" }}>
                <Typography variant="caption" sx={{ fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary", display: "block", mb: 0.25 }}>
                  {label}
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 800, lineHeight: 1.2, color: accent ? "error.main" : "text.primary" }}>
                  {val}
                </Typography>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>{sub}</Typography>
              </Box>
            ))}
          </Box>
        )}

        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 2, py: 1.5 }}>
          <Box
            component="button"
            type="button"
            onClick={() => setExpanded((v) => !v)}
            sx={{ display: "flex", alignItems: "center", gap: 1, flex: 1, minWidth: 0, bgcolor: "transparent", border: "none", cursor: "pointer", p: 0, textAlign: "left" }}
          >
            <Box sx={{ width: 32, height: 32, borderRadius: 2, bgcolor: "rgba(200,71,46,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Receipt size={16} color="#C8472E" />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="caption" sx={{ fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary", display: "block" }}>
                {cart.length} item{cart.length !== 1 ? "s" : ""} · tap to {expanded ? "collapse" : "expand"}
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 800, lineHeight: 1.2 }}>{fmtCurrency(grandTotal)}</Typography>
            </Box>
            <Box sx={{ ml: "auto", flexShrink: 0, color: "text.secondary", display: "flex" }}>
              {expanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </Box>
          </Box>

          <Button
            variant="contained"
            onClick={onSubmit}
            disabled={disabled}
            endIcon={<ArrowRight size={16} />}
            sx={{ height: 48, px: 3, borderRadius: 3, fontWeight: 800, flexShrink: 0 }}
          >
            Review
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}

// ─── Section label helper ─────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      variant="caption"
      sx={{ fontSize: "0.65rem", whiteSpace: "nowrap", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary", display: "block", mb: 0.75 }}
    >
      {children}
    </Typography>
  );
}

function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2.5 }}>
      <Box sx={{ width: 28, height: 28, borderRadius: 2, bgcolor: "rgba(200,71,46,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={14} color="#C8472E" />
      </Box>
      <Typography variant="caption" sx={{ fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "text.primary", fontSize: "0.75rem" }}>
        {title}
      </Typography>
    </Box>
  );
}

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
        setCachedData(json.data, cachedExpenses, cachedInventory, cachedPayments, cachedMaterials);
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
        setCachedData(cachedSales, cachedExpenses, cachedInventory, cachedPayments, json.data || []);
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
    date: new Date().toISOString().split("T")[0],
    clientName: "",
    contact: "",
    jobStatus: JOB_STATUSES[0],
    initialPayment: "0",
  });
  const setMetaField = (k: keyof BatchMeta, v: string) =>
    setMeta((prev) => ({ ...prev, [k]: v }));

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
    return uniqueClients.filter((c) => c.toLowerCase().includes(q)).slice(0, 6);
  }, [uniqueClients, meta.clientName]);

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

  useEffect(() => {
    if (selectedMaterial) {
      const price = parseNum(selectedMaterial["Selling Price"]);
      if (price > 0) setCostOverride(String(price));
    }
  }, [selectedMaterial]);

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
    setFormTouched(true);
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

    setCart((prev) => [...prev, newItem]);
    toast.success("Job added to order");
    setJobDesc(""); setJobWidth(""); setJobHeight(""); setQty("1"); setFormTouched(false);
  };

  // ── Load from Estimator Handoff ──────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem("estimatorCart");
    if (saved && materials.length > 0) {
      try {
        const data = JSON.parse(saved);
        if (data.clientName) setMetaField("clientName", data.clientName);
        if (data.items && Array.isArray(data.items)) {
          const newCartItems = data.items.map((it: any) => {
            const material = materials.find(m => m["Material ID"] === it.materialId);
            if (!material) return null;
            const wFt = it.dimUnit === "in" ? (parseFloat(it.width) || 0) / 12 : (parseFloat(it.width) || 0);
            const hFt = it.dimUnit === "in" ? (parseFloat(it.height) || 0) / 12 : (parseFloat(it.height) || 0);
            const qty = parseInt(it.qty) || 1;
            const costPerSqft = parseNum(material["Selling Price"]);
            const unitSqft = wFt * hFt;
            const rollWidth = parseNum(material["Width (ft)"]);
            const fitsNormal = wFt <= rollWidth;
            const fitsFlipped = hFt <= rollWidth;
            const isFlipped = !fitsNormal && fitsFlipped;
            const jobLengthFt = (isFlipped ? wFt : hFt) * qty;
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
          }).filter(Boolean);
          if (newCartItems.length > 0) {
            setCart(prev => [...prev, ...newCartItems]);
            toast.success("Loaded estimate from Calculator!");
          }
        }
      } catch { /* ignore */ }
      localStorage.removeItem("estimatorCart");
    }
  }, [materials]);

  // ── Totals ───────────────────────────────────────────────────────────────
  const grandTotal = useMemo(() => cart.reduce((s, i) => s + i.totalAmount, 0), [cart]);
  const initialPaymentNum = parseFloat(meta.initialPayment) || 0;
  const balance = grandTotal - initialPaymentNum;
  const paymentStatus = useMemo(() => {
    if (grandTotal === 0) return "Unpaid";
    if (balance <= 0) return "Paid";
    if (balance < grandTotal) return "Part-payment";
    return "Unpaid";
  }, [grandTotal, balance]);

  // ── AI / NL state ────────────────────────────────────────────────────────
  const [nlText, setNlText] = useState("");
  const [nlParsing, setNlParsing] = useState(false);

  const handleNlSubmit = async () => {
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
        if (d["CLIENT NAME"]) setMetaField("clientName", d["CLIENT NAME"]);
        if (d["CONTACT"]) setMetaField("contact", d["CONTACT"]);
        if (d["INITIAL PAYMENT (₦)"]) setMetaField("initialPayment", String(d["INITIAL PAYMENT (₦)"]));
        if (d["JOB DESCRIPTION"]) setJobDesc(d["JOB DESCRIPTION"]);
        if (d["COST PER SQRFT"]) setCostOverride(String(d["COST PER SQRFT"]));
        if (d["actualWidth"]) setJobWidth(String(d["actualWidth"]));
        if (d["actualHeight"]) setJobHeight(String(d["actualHeight"]));
        if (d["QTY"]) setQty(String(d["QTY"]));
        toast.success("Parsed! Review the details then add to order.");
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
    if (cart.length === 0) { toast.error("Add at least one job to the order"); return; }
    setShowConfirm(true);
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
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
      const colMap: Record<number, string> = { 3: "G", 4: "H", 5: "I", 6: "J", 8: "K", 10: "L" };
      const col = colMap[rollWidthFt] || "H";
      return [
        meta.date, meta.clientName,
        `${item.jobDescription} [${item.jobWidth}x${item.jobHeight}${item.dimUnit}]`,
        meta.contact, item.itemName, item.costPerSqft,
        col === "G" ? sizeFormula : "", col === "H" ? sizeFormula : "",
        col === "I" ? sizeFormula : "", col === "J" ? sizeFormula : "",
        col === "K" ? sizeFormula : "", col === "L" ? sizeFormula : "",
        item.qty,
        `=([COL_G_L][ROW]*F[ROW])`,
        paymentForRow,
        `=(M[ROW]*N[ROW])`,
        "", "",
        `=(P[ROW]-SUM(O[ROW],Q[ROW],R[ROW]))`,
        `=IF(P[ROW]=0,"Unpaid",IF(S[ROW]<=0,"Paid",IF(S[ROW]<P[ROW],"Part-payment","Unpaid")))`,
        meta.jobStatus, loggedBy, "",
      ];
    });

    try {
      useSyncStore.getState().addPendingEntry("sale", {
        batch: true,
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
      setMeta({ date: new Date().toISOString().split("T")[0], clientName: "", contact: "", jobStatus: JOB_STATUSES[0], initialPayment: "0" });
      setCart([]); setSelectedMaterialId(""); setJobDesc(""); setJobWidth("");
      setJobHeight(""); setQty("1"); setCostOverride(""); setNlText(""); setFormTouched(false);
    } catch {
      toast.error("Failed to save locally");
    } finally {
      setSaving(false);
    }
  };

  // ── Tab state ────────────────────────────────────────────────────────────
  const [tabValue, setTabValue] = useState(0);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <Box sx={{ pb: 16 }}>

      {/* ── Tab bar ───────────────────────────────────────────────────────── */}
      <Box sx={{ display: "flex", justifyContent: "center", mb: 4 }}>
        <Box
          sx={{
            display: "inline-flex",
            bgcolor: "grey.100",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 99,
            p: 0.5,
            gap: 0.5,
          }}
        >
          <Tabs
            value={tabValue}
            onChange={(_, v) => setTabValue(v)}
            sx={{
              minHeight: 0,
              "& .MuiTabs-indicator": { display: "none" },
              "& .MuiTabs-flexContainer": { gap: 0.5 },
            }}
          >
            <Tab
              label="✏️ Manual"
              sx={{
                borderRadius: 99, minHeight: 0, py: 1, px: 3,
                fontSize: "0.875rem", fontWeight: 800,
                "&.Mui-selected": { bgcolor: "primary.main", color: "primary.contrastText", boxShadow: "0 4px 14px rgba(200,71,46,.25)" },
                color: "text.secondary",
              }}
            />
            <Tab
              label="⚡ AI Log"
              sx={{
                borderRadius: 99, minHeight: 0, py: 1, px: 3,
                fontSize: "0.875rem", fontWeight: 800,
                "&.Mui-selected": { bgcolor: "primary.main", color: "primary.contrastText", boxShadow: "0 4px 14px rgba(200,71,46,.25)" },
                color: "text.secondary",
              }}
            />
          </Tabs>
        </Box>
      </Box>

      {/* ── MANUAL TAB ───────────────────────────────────────────────────── */}
      <TabPanel value={tabValue} index={0}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>

          {/* Section 1: Client Info */}
          <Card sx={{ overflow: "visible", zIndex: 12 }}>
            <CardContent sx={{ p: 3 }}>
              <SectionHeader icon={User} title="Client Info" />

              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 2 }}>
                <Box>
                  <FieldLabel>Date</FieldLabel>
                  <DatePicker
                    value={meta.date ? dayjs(meta.date) : null}
                    onChange={(val) => setMetaField("date", val?.format("YYYY-MM-DD") ?? "")}
                    slotProps={{ textField: { fullWidth: true } }}
                  />
                </Box>

                <Box sx={{ position: "relative" }}>
                  <FieldLabel>Client Name *</FieldLabel>
                  <TextField
                    fullWidth
                    placeholder="Sarah Jones"
                    value={meta.clientName}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 180)}
                    onChange={(e) => { setMetaField("clientName", e.target.value); setShowSuggestions(true); }}
                  />
                  {showSuggestions && filteredClients.length > 0 && (
                    <Paper
                      elevation={4}
                      sx={{ position: "absolute", zIndex: 50, top: "100%", left: 0, right: 0, mt: 0.5, borderRadius: 2, overflow: "hidden" }}
                    >
                      {filteredClients.map((c) => (
                        <Box
                          key={c}
                          component="button"
                          type="button"
                          onMouseDown={() => {
                            setMetaField("clientName", c);
                            setMetaField("contact", clientContacts[c] || meta.contact);
                            setShowSuggestions(false);
                          }}
                          sx={{
                            width: "100%", px: 2, py: 1.5, textAlign: "left", fontSize: "0.875rem",
                            fontWeight: 600, color: "text.primary", bgcolor: "transparent", border: "none",
                            borderBottom: "1px solid", borderColor: "divider", cursor: "pointer",
                            display: "block", "&:last-child": { borderBottom: "none" },
                            "&:hover": { bgcolor: "action.hover" },
                          }}
                        >
                          {c}
                        </Box>
                      ))}
                    </Paper>
                  )}
                </Box>

                <Box>
                  <FieldLabel>Contact</FieldLabel>
                  <TextField
                    fullWidth
                    placeholder="08012345678"
                    value={meta.contact}
                    onChange={(e) => setMetaField("contact", e.target.value)}
                  />
                </Box>
              </Box>

              {/* Load Saved Quote */}
              <Box sx={{ mt: 2.5, pt: 2.5, borderTop: "1px solid", borderColor: "divider" }}>
                <FieldLabel>Load Saved Quote</FieldLabel>
                <Box sx={{ display: "flex", gap: 1 }}>
                  <TextField
                    id="quoteInput"
                    placeholder="e.g. QT-1234"
                    size="small"
                    sx={{ flex: 1, "& input": { textTransform: "uppercase" } }}
                  />
                  <Button
                    variant="outlined"
                    onClick={async () => {
                      const input = document.getElementById("quoteInput") as HTMLInputElement;
                      const qId = input?.value.trim().toUpperCase();
                      if (!qId) return;
                      const toastId = toast.loading("Loading quote...");
                      try {
                        const res = await fetch(`/api/estimates?quoteId=${qId}`);
                        const json = await res.json();
                        if (res.ok && json.data) {
                          const estimate = json.data;
                          setMetaField("clientName", estimate["CLIENT NAME"]);
                          let cartData;
                          try { cartData = JSON.parse(estimate["CART DATA"]); }
                          catch { throw new Error("Invalid quote data"); }
                          localStorage.setItem("estimatorCart", JSON.stringify({ clientName: estimate["CLIENT NAME"], items: cartData }));
                          window.location.reload();
                        } else {
                          toast.error(json.error || "Quote not found", { id: toastId });
                        }
                      } catch {
                        toast.error("Failed to load quote", { id: toastId });
                      }
                    }}
                  >
                    Load
                  </Button>
                </Box>
              </Box>
            </CardContent>
          </Card>

          {/* Section 2: Roll & Material */}
          <Card sx={{ overflow: "visible", zIndex: 11 }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2.5 }}>
                <SectionHeader icon={Layers} title="Roll & Material" />
                <Button
                  size="small"
                  startIcon={<RefreshCw size={12} style={{ animation: materialsLoading ? "spin 1s linear infinite" : "none" }} />}
                  onClick={() => fetchMaterials()}
                  sx={{ color: "text.secondary", fontSize: "0.6875rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", minWidth: 0 }}
                >
                  Refresh
                </Button>
              </Box>

              <MaterialSelector
                materials={materials}
                selectedMaterialId={selectedMaterialId}
                onSelect={(mat) => setSelectedMaterialId(mat["Material ID"])}
                loading={materialsLoading}
              />

              {selectedMaterial && (
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(3, 1fr)" }, gap: 1.5, mt: 2 }}>
                  {[
                    {
                      label: "Remaining",
                      val: `${parseNum(selectedMaterial["Total Remaining (ft)"]).toFixed(1)}ft`,
                      accent: selectedMaterial.Status === "Low Stock" ? "amber" : selectedMaterial.Status === "Out of Stock" ? "rose" : "green",
                    },
                    {
                      label: "Selling Rate",
                      val: `₦${parseNum(selectedMaterial["Selling Price"]).toLocaleString()}/sqft`,
                      accent: "neutral",
                    },
                  ].map(({ label, val, accent }) => (
                    <Paper
                      key={label}
                      variant="outlined"
                      sx={{
                        p: 1.5, borderRadius: 2, textAlign: "center",
                        bgcolor: accent === "amber" ? "rgba(232,161,58,0.06)" : accent === "rose" ? "rgba(192,57,43,0.04)" : "grey.50",
                        borderColor: accent === "amber" ? "warning.light" : accent === "rose" ? "error.light" : "divider",
                      }}
                    >
                      <Typography variant="caption" sx={{ fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary", display: "block", mb: 0.25 }}>
                        {label}
                      </Typography>
                      <Typography variant="body2" sx={{
                        fontWeight: 800,
                        color: accent === "amber" ? "warning.dark" : accent === "rose" ? "error.main" : "text.primary",
                      }}>
                        {val}
                      </Typography>
                    </Paper>
                  ))}
                </Box>
              )}
            </CardContent>
          </Card>

          {/* Section 3: Job Dimensions & Pricing */}
          <Card sx={{ overflow: "visible", zIndex: 10 }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2.5 }}>
                <SectionHeader icon={Ruler} title="Job Dimensions & Pricing" />
                {/* Unit toggle */}
                <Box sx={{ display: "inline-flex", bgcolor: "grey.100", p: 0.25, borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
                  {(["ft", "in"] as const).map((u) => (
                    <Button
                      key={u}
                      size="small"
                      onClick={() => setDimUnit(u)}
                      disableElevation
                      sx={{
                        borderRadius: 1.5, px: 1.5, py: 0.5, minWidth: 0,
                        fontSize: "0.625rem", fontWeight: 800, textTransform: "uppercase",
                        bgcolor: dimUnit === u ? "primary.main" : "transparent",
                        color: dimUnit === u ? "primary.contrastText" : "text.secondary",
                        "&:hover": { bgcolor: dimUnit === u ? "primary.dark" : "action.hover" },
                        boxShadow: "none",
                      }}
                    >
                      {u === "ft" ? "Feet" : "Inches"}
                    </Button>
                  ))}
                </Box>
              </Box>

              {/* Description */}
              <Box sx={{ mb: 2 }}>
                <FieldLabel>Job Description</FieldLabel>
                <TextField
                  fullWidth
                  placeholder="e.g. Event banner, sticker label, window graphic…"
                  value={jobDesc}
                  onChange={(e) => setJobDesc(e.target.value)}
                />
              </Box>

              {/* Width × Height × Qty */}
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1.5, mb: 2 }}>
                <Box>
                  <FieldLabel>Width ({dimUnit}) *</FieldLabel>
                  <TextField
                    fullWidth type="number"
                    placeholder={dimUnit === "ft" ? "4" : "48"}
                    value={jobWidth}
                    error={formTouched && !jobWidth}
                    onChange={(e) => { setJobWidth(e.target.value); setFormTouched(true); }}
                    slotProps={{ htmlInput: { style: { fontWeight: 700 } } }}
                  />
                </Box>
                <Box>
                  <FieldLabel>Height ({dimUnit}) *</FieldLabel>
                  <TextField
                    fullWidth type="number"
                    placeholder={dimUnit === "ft" ? "8" : "96"}
                    value={jobHeight}
                    error={formTouched && !jobHeight}
                    onChange={(e) => { setJobHeight(e.target.value); setFormTouched(true); }}
                    slotProps={{ htmlInput: { style: { fontWeight: 700 } } }}
                  />
                </Box>
                <Box>
                  <FieldLabel>Qty</FieldLabel>
                  <TextField
                    fullWidth type="number"
                    slotProps={{ htmlInput: { min: 1, style: { fontWeight: 700 } } }}
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                  />
                </Box>
              </Box>

              {/* Cost per sqft */}
              <Box sx={{ mb: 2.5 }}>
                <FieldLabel>
                  Cost Per Sqft (₦){selectedMaterial && <span style={{ color: "#C8472E", fontWeight: 700, textTransform: "none", letterSpacing: 0 }}> · auto-filled from material</span>}
                </FieldLabel>
                <TextField
                  fullWidth type="number"
                  placeholder="e.g. 200"
                  value={costOverride}
                  onChange={(e) => setCostOverride(e.target.value)}
                  slotProps={{ htmlInput: { style: { fontWeight: 700, color: "#C8472E" } } }}
                />
              </Box>

              {/* Live calculation preview */}
              {unitSqft > 0 && jobLengthFt > 0 && (
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 1.5, mb: 2.5 }}>
                  {[
                    { label: "Job Area", val: `${unitSqft.toFixed(2)} sqft`, sub: "per piece" },
                    { label: "Length Used", val: `${jobLengthFt.toFixed(1)}ft`, sub: isFlipped ? "from roll (rotated)" : "from roll", warn: !stockOk },
                    { label: "After Deduction", val: `${Math.max(0, remainingAfterJob).toFixed(1)}ft`, sub: "roll remaining", warn: remainingAfterJob < 0, good: remainingAfterJob >= 0 && jobLengthFt > 0 },
                    { label: "Job Total", val: fmtCurrency(totalAmount), sub: `${qtyNum} × ${fmtCurrency(unitCost)}`, highlight: true },
                  ].map(({ label, val, sub, warn, good, highlight }) => (
                    <Paper
                      key={label}
                      variant="outlined"
                      sx={{
                        p: 1.5, borderRadius: 2, textAlign: "center",
                        bgcolor: highlight ? "primary.main" : warn ? "rgba(192,57,43,0.04)" : good ? "rgba(46,125,91,0.04)" : "grey.50",
                        borderColor: highlight ? "primary.main" : warn ? "error.light" : good ? "success.light" : "divider",
                      }}
                    >
                      <Typography variant="caption" sx={{ fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", display: "block", mb: 0.25, color: highlight ? "rgba(255,255,255,0.7)" : warn ? "error.main" : good ? "success.main" : "text.secondary" }}>
                        {label}
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 800, color: highlight ? "primary.contrastText" : warn ? "error.main" : good ? "success.main" : "text.primary" }}>
                        {val}
                      </Typography>
                      <Typography variant="caption" sx={{ color: highlight ? "rgba(255,255,255,0.6)" : "text.secondary" }}>{sub}</Typography>
                    </Paper>
                  ))}
                </Box>
              )}

              {/* Orientation hint */}
              {selectedMaterial && jobWFt > 0 && jobHFt > 0 && isFlipped && (
                <Paper variant="outlined" sx={{ display: "flex", alignItems: "center", gap: 1, p: 1.5, borderRadius: 2, bgcolor: "rgba(232,161,58,0.06)", borderColor: "warning.light", mb: 2 }}>
                  <XCircle size={16} color="#d97706" style={{ flexShrink: 0 }} />
                  <Typography variant="caption" sx={{ color: "warning.dark", fontWeight: 700 }}>
                    Job will be rotated to fit — {dimUnit === "in" ? `${parseFloat(jobHeight)}in` : `${jobHFt.toFixed(1)}ft`} side runs along the {rollWidth.toFixed(1)}ft roll width.
                  </Typography>
                </Paper>
              )}

              {/* Width compatibility error */}
              {selectedMaterial && jobWFt > 0 && !widthCompatible && (
                <Paper variant="outlined" sx={{ display: "flex", alignItems: "center", gap: 1, p: 1.5, borderRadius: 2, bgcolor: "rgba(192,57,43,0.04)", borderColor: "error.light", mb: 2 }}>
                  <XCircle size={16} color="#dc2626" style={{ flexShrink: 0 }} />
                  <Typography variant="caption" sx={{ color: "error.main", fontWeight: 700 }}>
                    {dimUnit === "in"
                      ? `Both dimensions (${parseFloat(jobWidth)}in × ${parseFloat(jobHeight)}in) exceed the roll width (${(rollWidth * 12).toFixed(0)}in). Choose a wider material.`
                      : `Job (${jobWFt.toFixed(1)}ft × ${jobHFt.toFixed(1)}ft) exceeds roll width (${rollWidth.toFixed(1)}ft) in both orientations. Choose a wider material.`}
                  </Typography>
                </Paper>
              )}

              {/* Add to Order */}
              <Button
                fullWidth
                variant="contained"
                color="secondary"
                size="large"
                startIcon={<Plus size={20} />}
                onClick={handleAddToCart}
                disabled={!selectedMaterialId || !jobWidth || !jobHeight || !widthCompatible}
                sx={{ height: 56, borderRadius: 3, fontWeight: 800, fontSize: "1rem" }}
              >
                Add to Order
                {totalAmount > 0 && (
                  <Box component="span" sx={{ ml: 1, opacity: 0.6, fontWeight: 700 }}>
                    · {fmtCurrency(totalAmount)}
                  </Box>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Section 4: Cart */}
          {cart.length > 0 && (
            <Card>
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2.5 }}>
                  <SectionHeader icon={Receipt} title="Current Order" />
                  <Chip
                    label={`${cart.length} item${cart.length !== 1 ? "s" : ""}`}
                    size="small"
                    sx={{ bgcolor: "rgba(200,71,46,0.08)", color: "primary.main", fontWeight: 700 }}
                  />
                </Box>

                <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, mb: 3 }}>
                  {cart.map((item) => (
                    <CartItemCard key={item.id} item={item} onRemove={(id) => setCart((prev) => prev.filter((i) => i.id !== id))} />
                  ))}
                </Box>

                {/* Payment inputs */}
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 2, pt: 2.5, borderTop: "1px solid", borderColor: "divider" }}>
                  <Box>
                    <FieldLabel>Initial Payment (₦)</FieldLabel>
                    <TextField
                      fullWidth type="number"
                      placeholder="0"
                      value={meta.initialPayment}
                      onChange={(e) => setMetaField("initialPayment", e.target.value)}
                      slotProps={{ htmlInput: { style: { fontWeight: 700 } } }}
                    />
                  </Box>
                  <Box>
                    <FieldLabel>Job Status</FieldLabel>
                    <FormControl fullWidth>
                      <Select
                        value={meta.jobStatus}
                        onChange={(e) => setMetaField("jobStatus", e.target.value)}
                        sx={{ fontWeight: 700 }}
                      >
                        {JOB_STATUSES.map((s) => (
                          <MenuItem key={s} value={s} sx={{ fontWeight: 600 }}>{s}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Box>
                  <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "flex-end" }}>
                    <Typography variant="caption" sx={{ fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary", mb: 0.25 }}>
                      Balance Due ·{" "}
                      <Box component="span" sx={{ color: paymentStatus === "Paid" ? "success.main" : "error.main" }}>
                        {paymentStatus.toUpperCase()}
                      </Box>
                    </Typography>
                    <Typography variant="h4" sx={{ fontWeight: 800 }}>
                      {fmtCurrency(Math.max(0, balance))}
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          )}
        </Box>
      </TabPanel>

      {/* ── AI TAB ───────────────────────────────────────────────────────── */}
      <TabPanel value={tabValue} index={1}>
        <Card>
          <CardContent sx={{ p: { xs: 3, md: 5 } }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 3 }}>
              <Box sx={{ width: 40, height: 40, borderRadius: 2.5, bgcolor: "rgba(200,71,46,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Sparkles size={20} color="#C8472E" />
              </Box>
              <Box>
                <Typography variant="h4" sx={{ fontWeight: 800 }}>AI Natural Language Entry</Typography>
                <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.25 }}>
                  Describe the job in plain English — Gemini fills the form for you
                </Typography>
              </Box>
            </Box>

            <TextField
              fullWidth multiline minRows={6}
              placeholder={`e.g. "John Doe ordered 3 SAV stickers, 4ft by 2ft each, paid ₦5,000 deposit…"`}
              value={nlText}
              onChange={(e) => setNlText(e.target.value)}
              sx={{ "& .MuiOutlinedInput-root": { bgcolor: "grey.50", fontSize: "1rem" } }}
            />
            <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 1 }}>
              Then select the matching roll from inventory before adding to order.
            </Typography>

            <Button
              fullWidth variant="contained" size="large"
              disabled={nlParsing || !nlText.trim()}
              onClick={handleNlSubmit}
              startIcon={nlParsing ? <RefreshCw size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Sparkles size={16} />}
              sx={{ height: 56, mt: 2.5, borderRadius: 3, fontWeight: 800, fontSize: "1rem" }}
            >
              {nlParsing ? "Parsing…" : "Extract & Fill Form"}
            </Button>

            {(jobWidth || jobHeight || jobDesc) && (
              <Box sx={{ mt: 3, pt: 3, borderTop: "1px solid", borderColor: "divider", display: "flex", flexDirection: "column", gap: 2 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <CheckCircle2 size={16} color="#2E7D5B" />
                  <Typography variant="body2" sx={{ fontWeight: 800, color: "text.primary" }}>
                    Parsed — now select a material and add to order
                  </Typography>
                </Box>

                <MaterialSelector
                  materials={materials}
                  selectedMaterialId={selectedMaterialId}
                  onSelect={(mat) => setSelectedMaterialId(mat["Material ID"])}
                  loading={materialsLoading}
                />

                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
                  <Box>
                    <FieldLabel>Width ({dimUnit})</FieldLabel>
                    <TextField fullWidth type="number" value={jobWidth} onChange={(e) => setJobWidth(e.target.value)} slotProps={{ htmlInput: { style: { fontWeight: 700 } } }} />
                  </Box>
                  <Box>
                    <FieldLabel>Height ({dimUnit})</FieldLabel>
                    <TextField fullWidth type="number" value={jobHeight} onChange={(e) => setJobHeight(e.target.value)} slotProps={{ htmlInput: { style: { fontWeight: 700 } } }} />
                  </Box>
                </Box>

                <Button
                  fullWidth variant="contained"
                  disabled={!selectedMaterialId || !jobWidth || !jobHeight}
                  onClick={handleAddToCart}
                  sx={{ borderRadius: 3, fontWeight: 800 }}
                >
                  Add Parsed Job to Order · {fmtCurrency(totalAmount)}
                </Button>
              </Box>
            )}
          </CardContent>
        </Card>
      </TabPanel>

      {/* ── Sticky summary bar ────────────────────────────────────────────── */}
      <SummaryBar
        cart={cart}
        grandTotal={grandTotal}
        initialPayment={initialPaymentNum}
        balance={balance}
        paymentStatus={paymentStatus}
        onSubmit={handleReview}
        disabled={cart.length === 0 || !meta.clientName.trim()}
      />

      {/* ── Confirm dialog ────────────────────────────────────────────────── */}
      <Dialog
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        maxWidth="sm"
        fullWidth
        slotProps={{ paper: { sx: { borderRadius: 3, overflow: "hidden" } } }}
      >
        <DialogTitle sx={{ bgcolor: "primary.main", color: "primary.contrastText", pb: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 800, color: "inherit" }}>Confirm Order</Typography>
          <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.75)", display: "block" }}>
            Review before pushing to Google Sheets
          </Typography>
        </DialogTitle>

        <DialogContent sx={{ p: 3 }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
            {/* Client */}
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: "grey.50" }}>
              <Typography variant="caption" sx={{ fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary", display: "block", mb: 0.5 }}>
                Client
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 800 }}>{meta.clientName}</Typography>
              {meta.contact && <Typography variant="body2" sx={{ color: "text.secondary" }}>{meta.contact}</Typography>}
            </Paper>

            {/* Line items */}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {cart.map((item, i) => (
                <Paper
                  key={item.id}
                  variant="outlined"
                  sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", p: 1.5, borderRadius: 2, bgcolor: "grey.50" }}
                >
                  <Box sx={{ minWidth: 0, flex: 1, pr: 2 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                      {i + 1}. {item.jobDescription}
                    </Typography>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      {item.rollLabel} · {item.qty}× {item.jobWidth}{item.dimUnit}×{item.jobHeight}{item.dimUnit}
                    </Typography>
                  </Box>
                  <Typography variant="body2" sx={{ fontWeight: 800, flexShrink: 0 }}>{fmtCurrency(item.totalAmount)}</Typography>
                </Paper>
              ))}
            </Box>

            {/* Totals */}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1, pt: 2, borderTop: "1px solid", borderColor: "divider" }}>
              {[
                { label: "Grand Total", val: fmtCurrency(grandTotal) },
                { label: "Initial Payment", val: fmtCurrency(initialPaymentNum), green: true },
                { label: "Balance Due", val: fmtCurrency(Math.max(0, balance)), red: balance > 0 },
              ].map(({ label, val, green, red }) => (
                <Box key={label} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Typography variant="body2" sx={{ color: "text.secondary", fontWeight: 600 }}>{label}</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 800, color: green ? "success.main" : red ? "error.main" : "text.primary" }}>{val}</Typography>
                </Box>
              ))}
            </Box>

            <Paper variant="outlined" sx={{ display: "flex", alignItems: "center", gap: 1, p: 1.5, borderRadius: 2, bgcolor: "rgba(200,71,46,0.04)", borderColor: "primary.light" }}>
              <Info size={16} color="#C8472E" style={{ flexShrink: 0 }} />
              <Typography variant="caption" sx={{ color: "primary.main", fontWeight: 700 }}>
                Roll stock will be decremented automatically when this syncs.
              </Typography>
            </Paper>
          </Box>
        </DialogContent>

        <DialogActions sx={{ p: 3, bgcolor: "grey.50", borderTop: "1px solid", borderColor: "divider", gap: 1.5 }}>
          <Button
            variant="outlined"
            fullWidth
            onClick={() => setShowConfirm(false)}
            sx={{ height: 48, borderRadius: 2, fontWeight: 700 }}
          >
            Back
          </Button>
          <Button
            variant="contained"
            fullWidth
            onClick={handleSave}
            disabled={saving}
            startIcon={saving ? <RefreshCw size={16} style={{ animation: "spin 1s linear infinite" }} /> : null}
            sx={{ height: 48, borderRadius: 2, fontWeight: 800 }}
          >
            {saving ? "Saving…" : "Confirm & Save"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

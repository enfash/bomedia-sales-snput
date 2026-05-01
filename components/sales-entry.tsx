"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Package,
  Plus,
  Sparkles,
  Trash2,
  User,
  Ruler,
  Layers,
  Receipt,
  XCircle,
  RefreshCw,
  ArrowRight,
  Info,
} from "lucide-react";
import { useSyncStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Drawer } from "vaul";

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
  rollId: string;          // exact Roll ID from inventory
  rollLabel: string;       // display label e.g. "Flex 4ft - Roll 001"
  itemName: string;        // material name e.g. "Flex"
  widthFt: number;         // roll width
  jobDescription: string;
  jobWidthFt: number;      // actual job width
  jobHeightFt: number;     // actual job height / length consumed from roll
  qty: number;
  costPerSqft: number;
  unitSqft: number;        // jobWidthFt × jobHeightFt
  unitCost: number;        // costPerSqft × unitSqft
  totalAmount: number;     // unitCost × qty
  jobLengthFt: number;     // = jobHeightFt × qty (total linear feet consumed)
  remainingAfterJob: number;  // roll remaining after this job
  fromInventory: boolean;
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
  parseFloat(String(v ?? "0").replace(/,/g, "")) || 0;

const fmtCurrency = (n: number) =>
  `₦${n.toLocaleString(undefined, { minimumFractionDigits: 0 })}`;

function StockBadge({ roll }: { roll: InventoryRoll }) {
  const remaining = parseNum(roll["Remaining Length (ft)"]);
  const status = roll.Status || "Active";
  if (status === "Out of Stock" || remaining <= 0)
    return (
      <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400">
        Out of Stock
      </span>
    );
  if (status === "Low Stock")
    return (
      <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
        Low · {remaining.toFixed(0)}ft
      </span>
    );
  return (
    <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
      {remaining.toFixed(0)}ft left
    </span>
  );
}

// ─── Roll Selector ────────────────────────────────────────────────────────────

function RollSelector({
  rolls,
  selectedRollId,
  onSelect,
  loading,
}: {
  rolls: InventoryRoll[];
  selectedRollId: string;
  onSelect: (roll: InventoryRoll) => void;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rolls.filter(
      (r) =>
        r["Roll ID"].toLowerCase().includes(q) ||
        r["Item Name"].toLowerCase().includes(q)
    );
  }, [rolls, search]);

  // Group by Item Name
  const grouped = useMemo(() => {
    const map: Record<string, InventoryRoll[]> = {};
    filtered.forEach((r) => {
      const key = r["Item Name"] || "Other";
      if (!map[key]) map[key] = [];
      map[key].push(r);
    });
    return map;
  }, [filtered]);

  const selected = rolls.find((r) => r["Roll ID"] === selectedRollId);

  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] uppercase font-black text-gray-500 dark:text-zinc-400 tracking-wider flex items-center gap-1.5">
        <Package className="w-3 h-3" />
        Select Roll from Inventory *
      </Label>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "w-full h-14 rounded-2xl border-2 px-4 flex items-center justify-between transition-all text-left",
          selectedRollId
            ? "border-brand-500 bg-brand-50/50 dark:bg-brand-900/20 dark:border-brand-700"
            : "border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-brand-300 dark:hover:border-brand-700"
        )}
      >
        {selected ? (
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center shrink-0">
              <Layers className="w-4 h-4 text-brand-600 dark:text-brand-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-black text-gray-900 dark:text-white truncate">
                {selected["Roll ID"]}
              </p>
              <p className="text-[10px] text-gray-500 dark:text-zinc-400 font-medium">
                {parseNum(selected["Width (ft)"])}ft wide · ₦{parseNum(selected["Price"]).toLocaleString()}/sqft
              </p>
            </div>
          </div>
        ) : (
          <span className="text-gray-400 dark:text-zinc-600 font-medium text-sm">
            {loading ? "Loading rolls…" : "Tap to choose a roll…"}
          </span>
        )}
        <ChevronDown className="w-4 h-4 text-gray-400 shrink-0 ml-2" />
      </button>

      {/* Roll picker bottom sheet / dialog */}
      <Drawer.Root open={open} onOpenChange={setOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm" />
          <Drawer.Content className="bg-white dark:bg-zinc-950 flex flex-col rounded-t-[2.5rem] fixed bottom-0 left-0 right-0 z-50 outline-none shadow-2xl border-t dark:border-zinc-800 max-h-[88vh]">
            <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-gray-200 dark:bg-zinc-800 mt-4" />

            <div className="px-5 pt-4 pb-2 border-b dark:border-zinc-800">
              <Drawer.Title className="text-lg font-black text-gray-900 dark:text-white mb-3">
                Choose a Roll
              </Drawer.Title>
              <Drawer.Description className="sr-only">
                Select an inventory roll for this job
              </Drawer.Description>
              <Input
                placeholder="Search by roll ID or material…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="rounded-xl bg-gray-50 dark:bg-zinc-900 border-gray-200 dark:border-zinc-700"
                autoFocus
              />
            </div>

            <div className="overflow-y-auto flex-1 p-4 space-y-5">
              {Object.entries(grouped).map(([material, materialRolls]) => (
                <div key={material}>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-zinc-500 mb-2 px-1">
                    {material}
                  </p>
                  <div className="space-y-2">
                    {materialRolls.map((roll) => {
                      const remaining = parseNum(roll["Remaining Length (ft)"]);
                      const total = parseNum(roll["Total Length (ft)"]);
                      const pct = total > 0 ? Math.min(100, (remaining / total) * 100) : 0;
                      const isOut = remaining <= 0 || roll.Status === "Out of Stock";

                      return (
                        <button
                          key={roll["Roll ID"]}
                          type="button"
                          disabled={isOut}
                          onClick={() => {
                            onSelect(roll);
                            setOpen(false);
                            setSearch("");
                          }}
                          className={cn(
                            "w-full p-4 rounded-2xl border-2 text-left transition-all",
                            roll["Roll ID"] === selectedRollId
                              ? "border-brand-500 bg-brand-50 dark:bg-brand-900/20"
                              : isOut
                              ? "border-gray-100 dark:border-zinc-800 opacity-40 cursor-not-allowed"
                              : "border-gray-100 dark:border-zinc-800 hover:border-brand-300 dark:hover:border-brand-700 bg-white dark:bg-zinc-900"
                          )}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <p className="text-sm font-black text-gray-900 dark:text-white">
                                {roll["Roll ID"]}
                              </p>
                              <p className="text-[10px] text-gray-500 dark:text-zinc-400 font-medium mt-0.5">
                                {parseNum(roll["Width (ft)"])}ft wide · ₦{parseNum(roll["Price"]).toLocaleString()}/sqft
                              </p>
                            </div>
                            <StockBadge roll={roll} />
                          </div>
                          {/* Progress bar */}
                          <div className="w-full h-1.5 rounded-full bg-gray-100 dark:bg-zinc-700 overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all",
                                roll.Status === "Low Stock"
                                  ? "bg-amber-500"
                                  : isOut
                                  ? "bg-rose-500"
                                  : "bg-emerald-500"
                              )}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {filtered.length === 0 && (
                <div className="text-center py-12 text-gray-400 dark:text-zinc-500">
                  <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm font-medium">No rolls found</p>
                </div>
              )}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </div>
  );
}

// ─── Cart Item Card ───────────────────────────────────────────────────────────

function CartItemCard({
  item,
  onRemove,
}: {
  item: CartItem;
  onRemove: (id: string) => void;
}) {
  const stockOk = item.remainingAfterJob >= 0;

  return (
    <div
      className={cn(
        "relative p-4 rounded-2xl border-2 transition-all",
        stockOk
          ? "border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900"
          : "border-rose-200 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-900/10"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <p className="text-sm font-black text-gray-900 dark:text-white truncate">
              {item.jobDescription || "Unnamed job"}
            </p>
            <Badge className="text-[9px] font-black border-none bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
              {item.rollLabel}
            </Badge>
          </div>
          <p className="text-[11px] text-gray-500 dark:text-zinc-400 font-medium">
            {item.qty}× · {item.jobWidthFt}ft × {item.jobHeightFt}ft ·{" "}
            {item.jobLengthFt.toFixed(1)}ft consumed
          </p>

          {!stockOk && (
            <p className="text-[10px] text-rose-600 dark:text-rose-400 font-black flex items-center gap-1 mt-1.5">
              <AlertTriangle className="w-3 h-3" />
              Exceeds roll stock — adjust quantity or height
            </p>
          )}
        </div>

        <div className="text-right shrink-0">
          <p className="text-base font-black text-gray-900 dark:text-white">
            {fmtCurrency(item.totalAmount)}
          </p>
          <p className="text-[10px] text-gray-400 dark:text-zinc-500">
            ₦{item.costPerSqft}/sqft
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onRemove(item.id)}
        className="absolute top-3 right-3 w-6 h-6 rounded-lg flex items-center justify-center text-gray-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all"
        aria-label="Remove"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─── Summary Bar ──────────────────────────────────────────────────────────────

function SummaryBar({
  cart,
  grandTotal,
  initialPayment,
  balance,
  paymentStatus,
  onSubmit,
  disabled,
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
    <div className="fixed bottom-0 left-0 right-0 md:left-60 z-40 pb-safe">
      <div className="bg-white/95 dark:bg-zinc-950/95 backdrop-blur-xl border-t border-gray-100 dark:border-zinc-800 shadow-2xl">
        {/* Expanded breakdown */}
        {expanded && (
          <div className="px-4 pt-4 pb-2 grid grid-cols-3 gap-3 border-b border-gray-100 dark:border-zinc-800">
            {[
              { label: "Items", val: String(cart.length), sub: "in order" },
              {
                label: "Grand Total",
                val: fmtCurrency(grandTotal),
                sub: "before payment",
              },
              {
                label: "Balance Due",
                val: fmtCurrency(Math.max(0, balance)),
                sub: paymentStatus,
                accent: balance > 0,
              },
            ].map(({ label, val, sub, accent }) => (
              <div key={label} className="text-center">
                <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-zinc-500 mb-0.5">
                  {label}
                </p>
                <p
                  className={cn(
                    "text-base font-black leading-tight",
                    accent
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-gray-900 dark:text-white"
                  )}
                >
                  {val}
                </p>
                <p className="text-[9px] text-gray-400 dark:text-zinc-500">{sub}</p>
              </div>
            ))}
          </div>
        )}

        {/* Collapsed bar */}
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-2 flex-1 min-w-0"
          >
            <div className="w-8 h-8 rounded-xl bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center shrink-0">
              <Receipt className="w-4 h-4 text-brand-700 dark:text-brand-400" />
            </div>
            <div className="text-left min-w-0">
              <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-zinc-500">
                {cart.length} item{cart.length !== 1 ? "s" : ""} · tap to{" "}
                {expanded ? "collapse" : "expand"}
              </p>
              <p className="text-base font-black text-gray-900 dark:text-white leading-tight">
                {fmtCurrency(grandTotal)}
              </p>
            </div>
            {expanded ? (
              <ChevronDown className="w-4 h-4 text-gray-400 ml-auto shrink-0" />
            ) : (
              <ChevronUp className="w-4 h-4 text-gray-400 ml-auto shrink-0" />
            )}
          </button>

          <Button
            onClick={onSubmit}
            disabled={disabled}
            className="h-12 px-6 rounded-2xl bg-brand-700 hover:bg-brand-800 text-white font-black shadow-lg shadow-brand-700/20 shrink-0 flex items-center gap-2"
          >
            Review
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main SalesEntry Component ────────────────────────────────────────────────

export function SalesEntry() {
  // ── Inventory state ──────────────────────────────────────────────────────
  const [inventory, setInventory] = useState<InventoryRoll[]>([]);
  const [invLoading, setInvLoading] = useState(true);

  const fetchInventory = useCallback(async () => {
    setInvLoading(true);
    try {
      const res = await fetch("/api/inventory");
      const json = await res.json();
      if (res.ok) setInventory(json.data || []);
    } catch {
      toast.error("Could not load inventory rolls");
    } finally {
      setInvLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  // ── Batch meta (client info) ─────────────────────────────────────────────
  const [meta, setMeta] = useState<BatchMeta>({
    date: new Date().toISOString().split("T")[0],
    clientName: "",
    contact: "",
    jobStatus: "Quoted",
    initialPayment: "0",
  });
  const setMetaField = (k: keyof BatchMeta, v: string) =>
    setMeta((prev) => ({ ...prev, [k]: v }));

  // ── Client suggestions ───────────────────────────────────────────────────
  const cachedSales = useSyncStore((s) => s.cachedSales);
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

  // ── Job form (single job being built) ───────────────────────────────────
  const [selectedRollId, setSelectedRollId] = useState("");
  const [jobDesc, setJobDesc] = useState("");
  const [jobWidthFt, setJobWidthFt] = useState("");
  const [jobHeightFt, setJobHeightFt] = useState("");
  const [qty, setQty] = useState("1");
  const [costOverride, setCostOverride] = useState("");
  const [dimUnit, setDimUnit] = useState<"ft" | "in">("ft");
  const [formTouched, setFormTouched] = useState(false);

  const selectedRoll = useMemo(
    () => inventory.find((r) => r["Roll ID"] === selectedRollId) || null,
    [inventory, selectedRollId]
  );

  // When a roll is selected, auto-fill cost per sqft
  useEffect(() => {
    if (selectedRoll) {
      const price = parseNum(selectedRoll["Price"]);
      if (price > 0) setCostOverride(String(price));
    }
  }, [selectedRoll]);

  // Live calculations
  const jobWFt = useMemo(() => {
    const w = parseFloat(jobWidthFt) || 0;
    return dimUnit === "in" ? w / 12 : w;
  }, [jobWidthFt, dimUnit]);

  const jobHFt = useMemo(() => {
    const h = parseFloat(jobHeightFt) || 0;
    return dimUnit === "in" ? h / 12 : h;
  }, [jobHeightFt, dimUnit]);

  const qtyNum = parseInt(qty) || 1;
  const costPerSqft = parseFloat(costOverride) || 0;
  const unitSqft = jobWFt * jobHFt;
  const unitCost = unitSqft * costPerSqft;
  const totalAmount = unitCost * qtyNum;
  const jobLengthFt = jobHFt * qtyNum; // linear feet consumed from roll

  const rollRemaining = selectedRoll
    ? parseNum(selectedRoll["Remaining Length (ft)"])
    : 0;
  const remainingAfterJob = rollRemaining - jobLengthFt;
  const stockOk = jobLengthFt === 0 || remainingAfterJob >= 0;

  // Width compatibility check
  const widthCompatible =
    !selectedRoll || jobWFt <= parseNum(selectedRoll["Width (ft)"]);

  // ── Cart ─────────────────────────────────────────────────────────────────
  const [cart, setCart] = useState<CartItem[]>([]);

  const handleAddToCart = () => {
    setFormTouched(true);

    if (!selectedRollId) {
      toast.error("Please select a roll from inventory");
      return;
    }
    if (!jobWidthFt || !jobHeightFt) {
      toast.error("Enter both job width and height");
      return;
    }
    if (!widthCompatible) {
      toast.error(
        `Job width (${jobWFt.toFixed(1)}ft) is wider than the selected roll (${parseNum(selectedRoll!["Width (ft)"]).toFixed(1)}ft)`
      );
      return;
    }
    if (!stockOk) {
      toast.error(
        `Not enough stock on ${selectedRollId}. Need ${jobLengthFt.toFixed(1)}ft but only ${rollRemaining.toFixed(1)}ft available.`
      );
      return;
    }

    const newItem: CartItem = {
      id: crypto.randomUUID(),
      rollId: selectedRollId,
      rollLabel: selectedRollId,
      itemName: selectedRoll!["Item Name"],
      widthFt: parseNum(selectedRoll!["Width (ft)"]),
      jobDescription: jobDesc.trim() || `${selectedRoll!["Item Name"]} print job`,
      jobWidthFt: jobWFt,
      jobHeightFt: jobHFt,
      qty: qtyNum,
      costPerSqft,
      unitSqft,
      unitCost,
      totalAmount,
      jobLengthFt,
      remainingAfterJob,
      fromInventory: true,
    };

    setCart((prev) => [...prev, newItem]);
    toast.success("Job added to order");

    // Reset job form but keep roll selected for quick multi-job entry
    setJobDesc("");
    setJobWidthFt("");
    setJobHeightFt("");
    setQty("1");
    setFormTouched(false);
  };

  // ── Grand total calculations ─────────────────────────────────────────────
  const grandTotal = useMemo(
    () => cart.reduce((s, i) => s + i.totalAmount, 0),
    [cart]
  );
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
        if (d["CLIENT NAME"])
          setMetaField("clientName", d["CLIENT NAME"]);
        if (d["CONTACT"]) setMetaField("contact", d["CONTACT"]);
        if (d["INITIAL PAYMENT (₦)"])
          setMetaField("initialPayment", String(d["INITIAL PAYMENT (₦)"]));
        if (d["JOB DESCRIPTION"]) setJobDesc(d["JOB DESCRIPTION"]);
        if (d["COST PER SQRFT"])
          setCostOverride(String(d["COST PER SQRFT"]));
        if (d["actualWidth"])
          setJobWidthFt(String(d["actualWidth"]));
        if (d["actualHeight"])
          setJobHeightFt(String(d["actualHeight"]));
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
    if (!meta.clientName.trim()) {
      toast.error("Client name is required");
      return;
    }
    if (cart.length === 0) {
      toast.error("Add at least one job to the order");
      return;
    }
    if (cart.some((i) => i.remainingAfterJob < 0)) {
      toast.error("One or more jobs exceed available roll stock");
      return;
    }
    setShowConfirm(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const loggedBy =
      typeof window !== "undefined"
        ? localStorage.getItem("userName") || "Unknown"
        : "Unknown";

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

      const needsInchDiv = dimUnit === "in";
      const wRaw = needsInchDiv ? item.jobWidthFt * 12 : item.jobWidthFt;
      const hRaw = needsInchDiv ? item.jobHeightFt * 12 : item.jobHeightFt;
      const sizeFormula = needsInchDiv
        ? `=(${wRaw}*${hRaw})/144`
        : `=(${wRaw}*${hRaw})`;

      const rollWidthFt = item.widthFt;
      const colMap: Record<number, string> = {
        3: "G", 4: "H", 5: "I", 6: "J", 8: "K", 10: "L",
      };
      const col = colMap[rollWidthFt] || "H";

      return [
        meta.date,           // A DATE
        meta.clientName,     // B CLIENT NAME
        `${item.jobDescription} [${item.jobWidthFt.toFixed(1)}x${item.jobHeightFt.toFixed(1)}ft]`, // C JOB DESCRIPTION
        meta.contact,        // D CONTACT
        item.itemName,       // E MATERIAL
        item.costPerSqft,    // F COST PER SQFT
        col === "G" ? sizeFormula : "", // G 3FT
        col === "H" ? sizeFormula : "", // H 4FT
        col === "I" ? sizeFormula : "", // I 5FT
        col === "J" ? sizeFormula : "", // J 6FT
        col === "K" ? sizeFormula : "", // K 8FT
        col === "L" ? sizeFormula : "", // L 10FT
        item.qty,            // M QTY
        `=([COL_G_L][ROW]*F[ROW])`, // N UNIT COST
        paymentForRow,       // O INITIAL PAYMENT
        `=(M[ROW]*N[ROW])`, // P TOTAL
        "",                  // Q ADD PAYMENT 1
        "",                  // R ADD PAYMENT 2
        `=(P[ROW]-SUM(O[ROW],Q[ROW],R[ROW]))`, // S BALANCE
        `=IF(P[ROW]=0,"Unpaid",IF(S[ROW]<=0,"Paid",IF(S[ROW]<P[ROW],"Part-payment","Unpaid")))`, // T STATUS
        meta.jobStatus,      // U JOB STATUS
        loggedBy,            // V LOGGED BY
        "",                  // W SALES ID (server-generated)
      ];
    });

    try {
      useSyncStore.getState().addPendingEntry("sale", {
        batch: true,
        items: rowArrays.map((row, i) => ({
          values: row,
          totalArea: cart[i].unitSqft * cart[i].qty,
          jobLengthFt: cart[i].jobLengthFt,
          canonicalItemName: cart[i].rollId, // Roll ID for inventory lookup
          jobDescription: cart[i].jobDescription,
          qty: cart[i].qty,
          rollId: cart[i].rollId,
          rollWidthFt: cart[i].widthFt,
        })),
      });

      toast.success("Order saved locally — syncing to Google Sheets…");
      setShowConfirm(false);

      // Reset everything
      setMeta({
        date: new Date().toISOString().split("T")[0],
        clientName: "",
        contact: "",
        jobStatus: "Quoted",
        initialPayment: "0",
      });
      setCart([]);
      setSelectedRollId("");
      setJobDesc("");
      setJobWidthFt("");
      setJobHeightFt("");
      setQty("1");
      setCostOverride("");
      setNlText("");
      setFormTouched(false);
    } catch {
      toast.error("Failed to save locally");
    } finally {
      setSaving(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="pb-32">
      <Tabs defaultValue="manual">
        {/* Tab switcher */}
        <div className="flex justify-center mb-8">
          <TabsList className="bg-gray-100 dark:bg-zinc-900 p-1 rounded-full border border-gray-200 dark:border-zinc-800 gap-1">
            <TabsTrigger
              value="manual"
              className="px-6 py-2 rounded-full text-sm font-black transition-all data-[state=active]:bg-brand-700 data-[state=active]:text-white data-[state=active]:shadow-lg dark:text-zinc-400"
            >
              ✏️ Manual
            </TabsTrigger>
            <TabsTrigger
              value="ai"
              className="px-6 py-2 rounded-full text-sm font-black transition-all data-[state=active]:bg-brand-700 data-[state=active]:text-white data-[state=active]:shadow-lg dark:text-zinc-400"
            >
              ⚡ AI Log
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ── MANUAL TAB ─────────────────────────────────────────────────── */}
        <TabsContent value="manual" className="space-y-4">

          {/* ── SECTION 1: Client Info ──────────────────────────────────── */}
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-gray-100 dark:border-zinc-800 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-7 h-7 rounded-xl bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center">
                <User className="w-3.5 h-3.5 text-brand-700 dark:text-brand-400" />
              </div>
              <h3 className="text-sm font-black uppercase tracking-widest text-gray-700 dark:text-zinc-300">
                Client Info
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Date */}
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider">
                  Date
                </Label>
                <Input
                  type="date"
                  value={meta.date}
                  onChange={(e) => setMetaField("date", e.target.value)}
                  className="h-12 rounded-xl border-gray-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>

              {/* Client name with autocomplete */}
              <div className="space-y-1.5 relative">
                <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider">
                  Client Name *
                </Label>
                <Input
                  placeholder="Sarah Jones"
                  value={meta.clientName}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() =>
                    setTimeout(() => setShowSuggestions(false), 180)
                  }
                  onChange={(e) => {
                    setMetaField("clientName", e.target.value);
                    setShowSuggestions(true);
                  }}
                  className="h-12 rounded-xl border-gray-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
                {showSuggestions && filteredClients.length > 0 && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-2xl shadow-xl overflow-hidden">
                    {filteredClients.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className="w-full px-4 py-3 text-sm font-bold text-left text-gray-700 dark:text-zinc-300 hover:bg-brand-50 dark:hover:bg-zinc-800 transition-colors border-b border-gray-50 dark:border-zinc-800 last:border-0"
                        onMouseDown={() => {
                          setMetaField("clientName", c);
                          setMetaField(
                            "contact",
                            clientContacts[c] || meta.contact
                          );
                          setShowSuggestions(false);
                        }}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Contact */}
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider">
                  Contact
                </Label>
                <Input
                  placeholder="08012345678"
                  value={meta.contact}
                  onChange={(e) => setMetaField("contact", e.target.value)}
                  className="h-12 rounded-xl border-gray-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
            </div>
          </div>

          {/* ── SECTION 2: Roll Selection ───────────────────────────────── */}
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-gray-100 dark:border-zinc-800 shadow-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center">
                  <Layers className="w-3.5 h-3.5 text-brand-700 dark:text-brand-400" />
                </div>
                <h3 className="text-sm font-black uppercase tracking-widest text-gray-700 dark:text-zinc-300">
                  Roll & Material
                </h3>
              </div>
              <button
                type="button"
                onClick={fetchInventory}
                className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-gray-400 hover:text-brand-600 dark:text-zinc-500 dark:hover:text-brand-400 transition-colors"
              >
                <RefreshCw
                  className={cn("w-3 h-3", invLoading && "animate-spin")}
                />
                Refresh
              </button>
            </div>

            <RollSelector
              rolls={inventory}
              selectedRollId={selectedRollId}
              onSelect={(roll) => setSelectedRollId(roll["Roll ID"])}
              loading={invLoading}
            />

            {/* Roll details strip when selected */}
            {selectedRoll && (
              <div className="mt-4 grid grid-cols-3 gap-3">
                {[
                  {
                    label: "Roll Width",
                    val: `${parseNum(selectedRoll["Width (ft)"])}ft`,
                  },
                  {
                    label: "Remaining",
                    val: `${parseNum(selectedRoll["Remaining Length (ft)"]).toFixed(1)}ft`,
                    accent:
                      selectedRoll.Status === "Low Stock"
                        ? "amber"
                        : selectedRoll.Status === "Out of Stock"
                        ? "rose"
                        : "green",
                  },
                  {
                    label: "Selling Rate",
                    val: `₦${parseNum(selectedRoll["Price"]).toLocaleString()}/sqft`,
                  },
                ].map(({ label, val, accent }) => (
                  <div
                    key={label}
                    className={cn(
                      "p-3 rounded-xl text-center",
                      accent === "amber"
                        ? "bg-amber-50 dark:bg-amber-900/20"
                        : accent === "rose"
                        ? "bg-rose-50 dark:bg-rose-900/20"
                        : "bg-gray-50 dark:bg-zinc-800/50"
                    )}
                  >
                    <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-zinc-500 mb-0.5">
                      {label}
                    </p>
                    <p
                      className={cn(
                        "text-sm font-black",
                        accent === "amber"
                          ? "text-amber-600 dark:text-amber-400"
                          : accent === "rose"
                          ? "text-rose-600 dark:text-rose-400"
                          : "text-gray-900 dark:text-white"
                      )}
                    >
                      {val}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── SECTION 3: Job Dimensions ───────────────────────────────── */}
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-gray-100 dark:border-zinc-800 shadow-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center">
                  <Ruler className="w-3.5 h-3.5 text-brand-700 dark:text-brand-400" />
                </div>
                <h3 className="text-sm font-black uppercase tracking-widest text-gray-700 dark:text-zinc-300">
                  Job Dimensions & Pricing
                </h3>
              </div>
              {/* Unit toggle */}
              <div className="flex bg-gray-100 dark:bg-zinc-800 p-0.5 rounded-xl border border-gray-200 dark:border-zinc-700">
                {(["ft", "in"] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setDimUnit(u)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all",
                      dimUnit === u
                        ? "bg-brand-700 text-white shadow-sm"
                        : "text-gray-500 dark:text-zinc-400"
                    )}
                  >
                    {u === "ft" ? "Feet" : "Inches"}
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5 mb-4">
              <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider">
                Job Description
              </Label>
              <Input
                placeholder="e.g. Event banner, sticker label, window graphic…"
                value={jobDesc}
                onChange={(e) => setJobDesc(e.target.value)}
                className="h-12 rounded-xl border-gray-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>

            {/* Width × Height × Qty */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider">
                  Width ({dimUnit}) *
                </Label>
                <Input
                  type="number"
                  placeholder={dimUnit === "ft" ? "4" : "48"}
                  value={jobWidthFt}
                  onChange={(e) => {
                    setJobWidthFt(e.target.value);
                    setFormTouched(true);
                  }}
                  className={cn(
                    "h-12 rounded-xl font-bold dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100",
                    formTouched &&
                      !jobWidthFt &&
                      "border-rose-400 dark:border-rose-700"
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider">
                  Height ({dimUnit}) *
                </Label>
                <Input
                  type="number"
                  placeholder={dimUnit === "ft" ? "8" : "96"}
                  value={jobHeightFt}
                  onChange={(e) => {
                    setJobHeightFt(e.target.value);
                    setFormTouched(true);
                  }}
                  className={cn(
                    "h-12 rounded-xl font-bold dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100",
                    formTouched &&
                      !jobHeightFt &&
                      "border-rose-400 dark:border-rose-700"
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider">
                  Qty
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

            {/* Cost per sqft override */}
            <div className="space-y-1.5 mb-5">
              <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider flex items-center gap-1.5">
                Cost Per Sqft (₦)
                {selectedRoll && (
                  <span className="text-[9px] text-brand-500 dark:text-brand-400 normal-case font-bold">
                    · auto-filled from roll
                  </span>
                )}
              </Label>
              <Input
                type="number"
                placeholder="e.g. 200"
                value={costOverride}
                onChange={(e) => setCostOverride(e.target.value)}
                className="h-12 rounded-xl font-bold text-brand-700 dark:text-brand-400 dark:bg-zinc-800 dark:border-zinc-700"
              />
            </div>

            {/* Live calculation preview */}
            {unitSqft > 0 && jobLengthFt > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                {[
                  {
                    label: "Job Area",
                    val: `${unitSqft.toFixed(2)} sqft`,
                    sub: "per piece",
                  },
                  {
                    label: "Length Used",
                    val: `${jobLengthFt.toFixed(1)}ft`,
                    sub: "from roll",
                    warn: !stockOk,
                  },
                  {
                    label: "After Deduction",
                    val: `${Math.max(0, remainingAfterJob).toFixed(1)}ft`,
                    sub: "roll remaining",
                    warn: remainingAfterJob < 0,
                    good: remainingAfterJob >= 0 && jobLengthFt > 0,
                  },
                  {
                    label: "Job Total",
                    val: fmtCurrency(totalAmount),
                    sub: `${qtyNum} × ${fmtCurrency(unitCost)}`,
                    highlight: true,
                  },
                ].map(({ label, val, sub, warn, good, highlight }) => (
                  <div
                    key={label}
                    className={cn(
                      "p-3 rounded-xl text-center border",
                      highlight
                        ? "bg-brand-700 border-brand-600 text-white"
                        : warn
                        ? "bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-900/50"
                        : good
                        ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-900/50"
                        : "bg-gray-50 dark:bg-zinc-800/50 border-gray-100 dark:border-zinc-700"
                    )}
                  >
                    <p
                      className={cn(
                        "text-[9px] font-black uppercase tracking-widest mb-0.5",
                        highlight
                          ? "text-white/70"
                          : warn
                          ? "text-rose-500"
                          : good
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-gray-400 dark:text-zinc-500"
                      )}
                    >
                      {label}
                    </p>
                    <p
                      className={cn(
                        "text-sm font-black",
                        highlight
                          ? "text-white"
                          : warn
                          ? "text-rose-600 dark:text-rose-400"
                          : good
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-gray-900 dark:text-white"
                      )}
                    >
                      {val}
                    </p>
                    <p
                      className={cn(
                        "text-[9px]",
                        highlight
                          ? "text-white/60"
                          : "text-gray-400 dark:text-zinc-500"
                      )}
                    >
                      {sub}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Width compatibility warning */}
            {selectedRoll && jobWFt > 0 && !widthCompatible && (
              <div className="flex items-center gap-2 p-3 bg-rose-50 dark:bg-rose-900/20 rounded-xl border border-rose-200 dark:border-rose-900/50 mb-4">
                <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                <p className="text-xs font-bold text-rose-600 dark:text-rose-400">
                  Job width ({jobWFt.toFixed(1)}ft) exceeds roll width (
                  {parseNum(selectedRoll["Width (ft)"]).toFixed(1)}ft). Choose a
                  wider roll.
                </p>
              </div>
            )}

            {/* Add to order CTA */}
            <Button
              onClick={handleAddToCart}
              disabled={!selectedRollId || !jobWidthFt || !jobHeightFt || !stockOk || !widthCompatible}
              className="w-full h-14 rounded-2xl bg-gray-900 dark:bg-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-100 text-white font-black text-base shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Add to Order
              {totalAmount > 0 && (
                <span className="text-white/70 dark:text-black/60 font-bold">
                  · {fmtCurrency(totalAmount)}
                </span>
              )}
            </Button>
          </div>

          {/* ── SECTION 4: Cart ─────────────────────────────────────────── */}
          {cart.length > 0 && (
            <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-gray-100 dark:border-zinc-800 shadow-sm p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center">
                    <Receipt className="w-3.5 h-3.5 text-brand-700 dark:text-brand-400" />
                  </div>
                  <h3 className="text-sm font-black uppercase tracking-widest text-gray-700 dark:text-zinc-300">
                    Current Order
                  </h3>
                </div>
                <Badge className="bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300 border-none font-black text-xs">
                  {cart.length} item{cart.length !== 1 ? "s" : ""}
                </Badge>
              </div>

              <div className="space-y-3 mb-6">
                {cart.map((item) => (
                  <CartItemCard
                    key={item.id}
                    item={item}
                    onRemove={(id) =>
                      setCart((prev) => prev.filter((i) => i.id !== id))
                    }
                  />
                ))}
              </div>

              {/* Payment inputs */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-5 border-t border-gray-100 dark:border-zinc-800">
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider">
                    Initial Payment (₦)
                  </Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={meta.initialPayment}
                    onChange={(e) =>
                      setMetaField("initialPayment", e.target.value)
                    }
                    className="h-12 rounded-xl font-bold dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider">
                    Job Status
                  </Label>
                  <Select
                    value={meta.jobStatus}
                    onValueChange={(v) => setMetaField("jobStatus", v)}
                  >
                    <SelectTrigger className="h-12 rounded-xl border-gray-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 font-bold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl dark:bg-zinc-900 dark:border-zinc-800">
                      {["Quoted", "Printing", "Finishing", "Ready", "Delivered"].map(
                        (s) => (
                          <SelectItem
                            key={s}
                            value={s}
                            className="font-bold dark:text-zinc-300"
                          >
                            {s}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col items-end justify-end gap-1">
                  <div className="text-right w-full">
                    <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-zinc-500 mb-0.5">
                      Balance Due ·{" "}
                      <span
                        className={cn(
                          "font-black",
                          paymentStatus === "Paid"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-rose-600 dark:text-rose-400"
                        )}
                      >
                        {paymentStatus.toUpperCase()}
                      </span>
                    </p>
                    <p className="text-2xl font-black text-gray-900 dark:text-white">
                      {fmtCurrency(Math.max(0, balance))}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── AI TAB ──────────────────────────────────────────────────────── */}
        <TabsContent value="ai">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-gray-100 dark:border-zinc-800 shadow-sm p-6 md:p-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-2xl bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-brand-700 dark:text-brand-400" />
              </div>
              <div>
                <h3 className="text-xl font-black text-gray-900 dark:text-white">
                  AI Natural Language Entry
                </h3>
                <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">
                  Describe the job in plain English — Gemini fills the form for you
                </p>
              </div>
            </div>

            <textarea
              className="w-full p-5 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-2xl min-h-[180px] focus:ring-2 focus:ring-brand-500 focus:bg-white dark:focus:bg-zinc-900 outline-none transition-all text-base placeholder:text-gray-300 dark:placeholder:text-zinc-700 dark:text-white font-medium resize-none"
              placeholder={`e.g. "John Doe ordered 3 SAV stickers, 4ft by 2ft each, paid ₦5,000 deposit…"`}
              value={nlText}
              onChange={(e) => setNlText(e.target.value)}
            />
            <p className="text-xs text-gray-400 dark:text-zinc-600 mt-2 font-medium">
              Then select the matching roll from inventory before adding to order.
            </p>

            <Button
              disabled={nlParsing || !nlText.trim()}
              onClick={handleNlSubmit}
              className="w-full h-14 mt-5 bg-brand-700 hover:bg-brand-800 text-white font-black text-base rounded-2xl shadow-xl shadow-brand-700/20 transition-all active:scale-[0.98]"
            >
              {nlParsing ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Parsing…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Extract & Fill Form
                </>
              )}
            </Button>

            {/* After AI parse, show the job form below */}
            {(jobWidthFt || jobHeightFt || jobDesc) && (
              <div className="mt-6 pt-6 border-t border-gray-100 dark:border-zinc-800 space-y-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <p className="text-sm font-black text-gray-700 dark:text-zinc-300">
                    Parsed — now select a roll and add to order
                  </p>
                </div>

                <RollSelector
                  rolls={inventory}
                  selectedRollId={selectedRollId}
                  onSelect={(roll) => setSelectedRollId(roll["Roll ID"])}
                  loading={invLoading}
                />

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase font-black text-gray-400 tracking-wider">
                      Width (ft)
                    </Label>
                    <Input
                      type="number"
                      value={jobWidthFt}
                      onChange={(e) => setJobWidthFt(e.target.value)}
                      className="h-12 rounded-xl dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100 font-bold"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase font-black text-gray-400 tracking-wider">
                      Height (ft)
                    </Label>
                    <Input
                      type="number"
                      value={jobHeightFt}
                      onChange={(e) => setJobHeightFt(e.target.value)}
                      className="h-12 rounded-xl dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100 font-bold"
                    />
                  </div>
                </div>

                <Button
                  onClick={handleAddToCart}
                  disabled={!selectedRollId || !jobWidthFt || !jobHeightFt}
                  className="w-full h-12 rounded-2xl bg-gray-900 dark:bg-white dark:text-black text-white font-black"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add to Order · {fmtCurrency(totalAmount)}
                </Button>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Sticky summary bar ─────────────────────────────────────────────── */}
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
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="max-w-lg bg-white dark:bg-zinc-950 rounded-3xl p-0 border-none shadow-2xl overflow-hidden">
          <DialogHeader className="p-6 bg-brand-700 text-white">
            <DialogTitle className="text-xl font-black text-white">
              Confirm Order
            </DialogTitle>
            <DialogDescription className="text-white/75 text-xs mt-1">
              Review before pushing to Google Sheets
            </DialogDescription>
          </DialogHeader>

          <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
            {/* Client */}
            <div className="p-4 bg-gray-50 dark:bg-zinc-900 rounded-2xl">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-zinc-500 mb-1">
                Client
              </p>
              <p className="font-black text-gray-900 dark:text-white">
                {meta.clientName}
              </p>
              {meta.contact && (
                <p className="text-sm text-gray-500 dark:text-zinc-400 font-medium">
                  {meta.contact}
                </p>
              )}
            </div>

            {/* Line items */}
            <div className="space-y-2">
              {cart.map((item, i) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-zinc-900 rounded-xl"
                >
                  <div className="min-w-0 flex-1 pr-3">
                    <p className="text-sm font-bold text-gray-800 dark:text-zinc-100 truncate">
                      {i + 1}. {item.jobDescription}
                    </p>
                    <p className="text-[10px] text-gray-500 dark:text-zinc-400 font-medium">
                      {item.rollId} · {item.qty}× {item.jobWidthFt.toFixed(1)}ft×
                      {item.jobHeightFt.toFixed(1)}ft
                    </p>
                  </div>
                  <p className="text-sm font-black text-gray-900 dark:text-white shrink-0">
                    {fmtCurrency(item.totalAmount)}
                  </p>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="space-y-2 pt-4 border-t border-gray-100 dark:border-zinc-800">
              {[
                { label: "Grand Total", val: fmtCurrency(grandTotal) },
                {
                  label: "Initial Payment",
                  val: fmtCurrency(initialPaymentNum),
                  green: true,
                },
                {
                  label: "Balance Due",
                  val: fmtCurrency(Math.max(0, balance)),
                  red: balance > 0,
                },
              ].map(({ label, val, green, red }) => (
                <div key={label} className="flex justify-between items-center">
                  <span className="text-sm font-bold text-gray-500 dark:text-zinc-400">
                    {label}
                  </span>
                  <span
                    className={cn(
                      "text-sm font-black",
                      green
                        ? "text-emerald-600 dark:text-emerald-400"
                        : red
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-gray-900 dark:text-white"
                    )}
                  >
                    {val}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 p-3 bg-brand-50 dark:bg-brand-900/20 rounded-xl">
              <Info className="w-4 h-4 text-brand-600 dark:text-brand-400 shrink-0" />
              <p className="text-[10px] text-brand-600 dark:text-brand-400 font-bold">
                Roll stock will be decremented automatically when this syncs.
              </p>
            </div>
          </div>

          <DialogFooter className="p-6 bg-gray-50 dark:bg-zinc-900/50 flex gap-3 border-t dark:border-zinc-800">
            <Button
              variant="outline"
              onClick={() => setShowConfirm(false)}
              className="flex-1 h-12 rounded-xl font-bold dark:bg-zinc-950 dark:border-zinc-800"
            >
              Back
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 h-12 rounded-xl bg-brand-700 hover:bg-brand-800 text-white font-black shadow-lg"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Saving…
                </>
              ) : (
                "Confirm & Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

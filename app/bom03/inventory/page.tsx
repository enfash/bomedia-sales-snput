"use client";
import { LoadingAnimation } from "@/components/loading-animation";

import { useEffect, useState, useMemo, Fragment } from "react";
import { useRouter } from "next/navigation";
import {
  Package, Plus, Search, RefreshCw, AlertTriangle, CheckCircle2,
  XCircle, Ruler, ChevronDown, ChevronUp, Info, Zap, ArrowLeft,
  CircleDollarSign, TrendingUp, Coins, Sparkles,
} from "lucide-react";
import { useTheme } from "@mui/material/styles";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import DialogActions from "@mui/material/DialogActions";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Grid from "@mui/material/Grid";
import Popover from "@mui/material/Popover";
import InputAdornment from "@mui/material/InputAdornment";
import Autocomplete from "@mui/material/Autocomplete";
import { useSyncStore } from "@/lib/store";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs from "dayjs";
import { toast } from "sonner";
import { PAYMENT_METHODS, MATERIAL_TYPES } from "@/lib/constants";
import { WasteLogModal, type InventoryRollForWaste } from "@/components/waste-log-modal";

type Roll = Record<string, any> & { _rowIndex: number; "Material ID"?: string };
type Material = Record<string, any> & { "Material ID": string };

const parseNum = (v: any) => parseFloat(String(v ?? "0").replace(/[^\d.-]/g, "")) || 0;
const METERS_TO_FEET = 3.28084;

function StatusPill({ status }: { status: string }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const colorMap: Record<string, { bgcolor: string; color: string }> = {
    Active:        { bgcolor: isDark ? "rgba(16, 185, 129, 0.15)" : "#d1fae5", color: isDark ? "#34d399" : "#065f46" },
    "Low Stock":   { bgcolor: isDark ? "rgba(245, 158, 11, 0.15)" : "#fef3c7", color: isDark ? "#fbbf24" : "#92400e" },
    "Out of Stock":{ bgcolor: isDark ? "rgba(239, 68, 68, 0.15)" : "#ffe4e6", color: isDark ? "#f87171" : "#9f1239" },
    Depleted:      { bgcolor: isDark ? "rgba(255, 255, 255, 0.05)" : "#f3f4f6", color: isDark ? "#9ca3af" : "#6b7280" },
  };
  const palette = colorMap[status] ?? colorMap["Active"];
  return (
    <Chip
      label={status}
      size="small"
      sx={{
        fontSize: "0.6rem",
        fontWeight: 900,
        height: 20,
        px: 0.5,
        bgcolor: palette.bgcolor,
        color: palette.color,
        border: "none",
        "& .MuiChip-label": { px: 1 },
      }}
    />
  );
}

// ─── Add Roll Dialog ──────────────────────────────────────────────────────────

function AddRollDialog({ onAdded }: { onAdded: () => void }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const { cachedExpenses } = useSyncStore();
  const uniqueVendors = useMemo(() => {
    const names = new Set<string>();
    cachedExpenses.forEach((e: any) => {
      const n = (e["PAID TO"] || "").trim();
      if (n) names.add(n);
    });
    return Array.from(names).sort();
  }, [cachedExpenses]);

  const [form, setForm] = useState({
    itemName: "",
    category: "Materials",
    widthFt: "",
    rawLength: "",
    lengthUnit: "m" as "m" | "ft",
    price: "",
    cost: "",
    lowStockThreshold: "20",
    quantity: "1",
    supplier: "",
    purchaseDate: new Date().toISOString().split("T")[0],
    poReference: "",
    paymentMethod: PAYMENT_METHODS[0],
  });

  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));

  const rawLengthFt = useMemo(() => {
    const raw = parseFloat(form.rawLength) || 0;
    return form.lengthUnit === "m" ? raw * METERS_TO_FEET : raw;
  }, [form.rawLength, form.lengthUnit]);

  const usableLength = Math.max(0, rawLengthFt - 10);
  const totalAreaSqft = (parseFloat(form.widthFt) || 0) * usableLength;
  const qty = Math.max(1, parseInt(form.quantity, 10) || 1);
  const costPerRoll = qty > 0 ? (parseFloat(form.cost) || 0) / qty : 0;
  const costPerSqft = totalAreaSqft > 0 ? costPerRoll / totalAreaSqft : 0;

  const handleSave = async () => {
    if (!form.itemName || !form.widthFt || !form.rawLength) {
      toast.error("Material name, width, and length are required.");
      return;
    }
    if (rawLengthFt <= 10) {
      toast.error("Roll length must exceed 10ft (the reserved waste factor). Usable stock would be zero or negative.");
      return;
    }
    setSaving(true);
    try {
      const loggedBy = typeof window !== "undefined" ? localStorage.getItem("userName") || "Unknown" : "Unknown";
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemName: form.itemName.trim(),
          category: form.category.trim(),
          widthFt: parseFloat(form.widthFt),
          rawLengthFt: rawLengthFt.toFixed(2),
          unit: form.lengthUnit,
          price: form.price,
          cost: form.cost,
          lowStockThreshold: form.lowStockThreshold,
          quantity: qty,
          supplier: form.supplier.trim() || undefined,
          purchaseDate: form.purchaseDate,
          poReference: form.poReference.trim() || undefined,
          paymentMethod: form.paymentMethod,
          loggedBy,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to add roll");
      const ids = json.rollIds ? json.rollIds.join(", ") : json.rollId;
      toast.success(`Roll(s) added — IDs: ${ids}`);
      setOpen(false);
      setForm({
        itemName: "",
        category: "Materials",
        widthFt: "",
        rawLength: "",
        lengthUnit: "m",
        price: "",
        cost: "",
        lowStockThreshold: "20",
        quantity: "1",
        supplier: "",
        purchaseDate: new Date().toISOString().split("T")[0],
        poReference: "",
        paymentMethod: PAYMENT_METHODS[0],
      });
      onAdded();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const widthOptions = ["3", "4", "5", "6", "8", "10"];

  return (
    <>
      <Button
        variant="contained"
        startIcon={<Plus size={18} />}
        onClick={() => setOpen(true)}
        sx={{
          bgcolor: "primary.main",
          color: "white",
          fontWeight: 900,
          borderRadius: 3,
          height: 48,
          px: 3,
          boxShadow: "0 4px 14px rgba(200,71,46,.25)",
          "&:hover": { bgcolor: "primary.dark" },
        }}
      >
        Add New Roll
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="sm"
        fullWidth
        slotProps={{ paper: { sx: { borderRadius: "16px", overflow: "hidden", p: 0 } } }}
      >
        {/* Header */}
        <Box sx={{ p: 3, bgcolor: "primary.main", color: "white" }}>
          <DialogTitle sx={{ p: 0, color: "white", fontWeight: 900, fontSize: "1.2rem" }}>
            Add Inventory Roll
          </DialogTitle>
          <Typography sx={{ color: "rgba(255,255,255,0.75)", fontSize: "0.7rem", mt: 0.5 }}>
            10ft reserved as upfront expected waste automatically.
          </Typography>
        </Box>

        <DialogContent sx={{ p: 3, maxHeight: "70vh", overflowY: "auto" }}>
          <Stack sx={{ gap: 2.5 }}>
            {/* Material Name */}
            <Box>
              <Typography variant="caption" sx={{ fontSize: "0.625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary", display: "block", mb: 0.75 }}>
                Material Name *
              </Typography>
              <Autocomplete
                freeSolo
                options={MATERIAL_TYPES}
                value={form.itemName}
                onInputChange={(_, newValue) => set("itemName", newValue)}
                onChange={(_, newValue) => set("itemName", (newValue as string) ?? "")}
                size="small"
                renderInput={(params) => (
                  <TextField
                    {...params}
                    placeholder="e.g. Flex, SAV, Clear Sticker"
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                  />
                )}
              />
            </Box>

            {/* Category / Quantity / Low Stock row */}
            <Grid container spacing={2}>
              <Grid size={4}>
                <Typography variant="caption" sx={{ fontSize: "0.625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary", display: "block", mb: 0.75 }}>
                  Category
                </Typography>
                <TextField
                  fullWidth
                  size="small"
                  value={form.category}
                  onChange={e => set("category", e.target.value)}
                  sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                />
              </Grid>
              <Grid size={4}>
                <Typography variant="caption" sx={{ fontSize: "0.625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary", display: "block", mb: 0.75 }}>
                  Quantity
                </Typography>
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  slotProps={{ htmlInput: { min: 1 } }}
                  value={form.quantity}
                  onChange={e => set("quantity", e.target.value)}
                  sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                />
              </Grid>
              <Grid size={4}>
                <Typography variant="caption" sx={{ fontSize: "0.625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary", display: "block", mb: 0.75 }}>
                  Low Stock Alert (ft)
                </Typography>
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  value={form.lowStockThreshold}
                  onChange={e => set("lowStockThreshold", e.target.value)}
                  sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                />
              </Grid>
            </Grid>

            {/* Roll Dimensions section */}
            <Box sx={{ p: 2, bgcolor: "rgba(200,71,46,0.04)", borderRadius: "16px", border: "1px solid rgba(200,71,46,0.12)" }}>
              <Typography sx={{ fontSize: "0.625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "primary.main", borderBottom: "1px solid rgba(200,71,46,0.1)", pb: 1, mb: 1.5 }}>
                Roll Dimensions
              </Typography>

              {/* Width buttons */}
              <Box sx={{ mb: 1.5 }}>
                <Typography variant="caption" sx={{ fontSize: "0.625rem", fontWeight: 700, textTransform: "uppercase", color: "primary.main", display: "block", mb: 0.75 }}>
                  Roll Width (feet) *
                </Typography>
                <Stack direction="row" sx={{ gap: 1 }}>
                  {widthOptions.map(w => (
                    <Box
                      key={w}
                      component="button"
                      type="button"
                      onClick={() => set("widthFt", w)}
                      sx={{
                        flex: 1,
                        height: 40,
                        borderRadius: 2,
                        fontSize: "0.75rem",
                        fontWeight: 900,
                        border: "2px solid",
                        cursor: "pointer",
                        transition: "all 0.15s ease-out",
                        "&:active": { transform: "scale(0.97)" },
                        borderColor: form.widthFt === w ? "primary.main" : "divider",
                        bgcolor: form.widthFt === w ? "primary.main" : "background.paper",
                        color: form.widthFt === w ? "primary.contrastText" : "text.secondary",
                      }}
                    >
                      {w}ft
                    </Box>
                  ))}
                </Stack>
              </Box>

              {/* Length input + unit toggle */}
              <Box sx={{ mb: 1 }}>
                <Typography variant="caption" sx={{ fontSize: "0.625rem", fontWeight: 700, textTransform: "uppercase", color: "primary.main", display: "block", mb: 0.75 }}>
                  Roll Length *
                </Typography>
                <Stack direction="row" sx={{ gap: 1 }}>
                  <TextField
                    size="small"
                    type="number"
                    placeholder={form.lengthUnit === "m" ? "e.g. 50" : "e.g. 164"}
                    value={form.rawLength}
                    onChange={e => set("rawLength", e.target.value)}
                    sx={{ flex: 1, "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                  />
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => set("lengthUnit", form.lengthUnit === "m" ? "ft" : "m")}
                    sx={{
                      px: 2,
                      fontWeight: 900,
                      fontSize: "0.7rem",
                      height: 40,
                      borderRadius: 2,
                      textTransform: "uppercase",
                      borderColor: "rgba(200,71,46,0.2)",
                      color: "primary.main",
                    }}
                  >
                    {form.lengthUnit}
                  </Button>
                </Stack>
              </Box>

              {/* Length preview */}
              {rawLengthFt > 0 && (
                <Grid container spacing={1} sx={{ textAlign: "center" }}>
                  {[
                    { label: "Full Length", value: `${rawLengthFt.toFixed(1)}ft`, variant: "neutral" },
                    { label: "−10ft Waste", value: "−10ft", variant: "accent" },
                    { label: "Usable Stock", value: `${usableLength.toFixed(1)}ft`, variant: "highlight" },
                  ].map(({ label, value, variant }) => (
                    <Grid size={4} key={label}>
                      <Box sx={{
                        p: 1, borderRadius: 2,
                        bgcolor: variant === "highlight"
                          ? "primary.main"
                          : variant === "accent"
                            ? (isDark ? "rgba(225, 29, 72, 0.15)" : "#fff1f2")
                            : "background.paper",
                        color: variant === "highlight"
                          ? "white"
                          : variant === "accent"
                            ? (isDark ? "#f43f5e" : "#e11d48")
                            : "text.primary",
                      }}>
                        <Typography sx={{ fontSize: "0.5625rem", fontWeight: 700, textTransform: "uppercase", opacity: variant === "highlight" ? 0.7 : 0.6 }}>
                          {label}
                        </Typography>
                        <Typography sx={{ fontSize: "0.875rem", fontWeight: 900, lineHeight: 1.2 }}>
                          {value}
                        </Typography>
                      </Box>
                    </Grid>
                  ))}
                </Grid>
              )}
            </Box>

            {/* Price / Cost */}
            <Grid container spacing={2}>
              <Grid size={6}>
                <Typography variant="caption" sx={{ fontSize: "0.625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary", display: "block", mb: 0.75 }}>
                  Selling Price (₦/sqft)
                </Typography>
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  placeholder="e.g. 200"
                  value={form.price}
                  onChange={e => set("price", e.target.value)}
                  sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                />
              </Grid>
              <Grid size={6}>
                <Typography variant="caption" sx={{ fontSize: "0.625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary", display: "block", mb: 0.75 }}>
                  Total Buy Cost (₦)
                </Typography>
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  placeholder="e.g. 60000"
                  value={form.cost}
                  onChange={e => set("cost", e.target.value)}
                  sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                />
              </Grid>
            </Grid>

            {/* Auditing section */}
            <Box sx={{ p: 2, bgcolor: "rgba(0,0,0,0.02)", borderRadius: "16px", border: "1px solid", borderColor: "grey.100" }}>
              <Typography sx={{ fontSize: "0.625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "text.secondary", borderBottom: "1px solid", borderColor: "grey.100", pb: 1, mb: 1.5 }}>
                Auditing & Purchase Details
              </Typography>
              <Stack sx={{ gap: 1.5 }}>
                <Box>
                  <Typography variant="caption" sx={{ fontSize: "0.625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary", display: "block", mb: 0.75 }}>
                    Supplier / Vendor
                  </Typography>
                  <Autocomplete
                    freeSolo
                    options={uniqueVendors}
                    value={form.supplier}
                    onInputChange={(_, newValue) => set("supplier", newValue)}
                    onChange={(_, newValue) => set("supplier", (newValue as string) ?? "")}
                    size="small"
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        placeholder="e.g. Star Graphics, Avery Supplier"
                        sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                      />
                    )}
                  />
                </Box>
                <Grid container spacing={2}>
                  <Grid size={6}>
                    <Typography variant="caption" sx={{ fontSize: "0.625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary", display: "block", mb: 0.75 }}>
                      PO / Invoice Reference
                    </Typography>
                    <TextField
                      fullWidth
                      size="small"
                      placeholder="e.g. PO-2026-001"
                      value={form.poReference}
                      onChange={e => set("poReference", e.target.value)}
                      sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                    />
                  </Grid>
                  <Grid size={6}>
                    <Typography variant="caption" sx={{ fontSize: "0.625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary", display: "block", mb: 0.75 }}>
                      Purchase Date
                    </Typography>
                    <DatePicker
                      value={dayjs(form.purchaseDate)}
                      onChange={(val) => set("purchaseDate", val?.format("YYYY-MM-DD") ?? new Date().toISOString().split("T")[0])}
                      slotProps={{ textField: { size: "small", fullWidth: true, sx: { "& .MuiOutlinedInput-root": { borderRadius: 2 } } } }}
                    />
                  </Grid>
                </Grid>
                <Box>
                  <Typography variant="caption" sx={{ fontSize: "0.625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary", display: "block", mb: 0.75 }}>
                    Payment Method
                  </Typography>
                  <Autocomplete
                    options={PAYMENT_METHODS}
                    value={form.paymentMethod}
                    onChange={(_, val) => set("paymentMethod", val || PAYMENT_METHODS[0])}
                    disableClearable
                    size="small"
                    renderInput={(params) => <TextField {...params} sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }} />}
                  />
                </Box>
              </Stack>
            </Box>

            {/* Cost insight */}
            {costPerSqft > 0 && (
              <Stack direction="row" sx={{ gap: 1, p: 1.5, bgcolor: "grey.50", borderRadius: 2, alignItems: "flex-start" }}>
                <Info size={16} style={{ color: "#9ca3af", flexShrink: 0, marginTop: 1 }} />
                <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
                  Cost per sqft: <strong>₦{costPerSqft.toFixed(2)}</strong> based on {totalAreaSqft.toFixed(0)} usable sqft per roll (unit cost: ₦{costPerRoll.toFixed(2)})
                </Typography>
              </Stack>
            )}
          </Stack>
        </DialogContent>

        <DialogActions sx={{ p: 3, pt: 2, bgcolor: "grey.50", borderTop: "1px solid", borderColor: "grey.100", gap: 1.5 }}>
          <Button
            variant="outlined"
            onClick={() => setOpen(false)}
            sx={{ flex: 1, height: 48, borderRadius: 2, fontWeight: 700, color: "text.secondary", borderColor: "grey.300" }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving}
            sx={{ flex: 1, height: 48, borderRadius: 2, fontWeight: 900, bgcolor: "primary.main", "&:hover": { bgcolor: "primary.dark" } }}
          >
            {saving ? "Adding Roll..." : "Add Roll & Reserve Waste"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

// ─── Adjust Dialog ────────────────────────────────────────────────────────────

function AdjustDialog({ roll, onClose, onDone }: { roll: Roll | null; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  if (!roll) return null;

  const adj = parseFloat(amount);
  const current = parseNum(roll["Remaining Length (ft)"]);
  const preview = isNaN(adj) ? null : Math.max(0, current + adj);
  const canSave = !isNaN(adj) && adj !== 0 && note.trim().length > 0;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const res = await fetch("/api/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowIndex: roll._rowIndex, adjustment: adj }),
      });
      if (!res.ok) { const j = await res.json(); toast.error(j.error || "Failed"); return; }

      // Write audit log to Expenses sheet
      const loggedBy = typeof window !== "undefined" ? localStorage.getItem("userName") || "Unknown" : "Unknown";
      await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          DATE: new Date().toISOString().split("T")[0],
          AMOUNT: "0",
          CATEGORY: "Inventory Adjustment",
          DESCRIPTION: `[ADJUST] ${roll["Roll ID"]} · ${adj > 0 ? "+" : ""}${adj.toFixed(1)}ft · ${note.trim()}`,
          "PAID TO": "—",
          "PAYMENT METHOD": "N/A",
          "RECEIPT URL": "",
          "Logged By": loggedBy,
          "JOB REF": "—",
          "ROLL ID": roll["Roll ID"],
          "ADJUST FT": adj.toFixed(2),
        }),
      });

      toast.success(`Stock adjusted — ${adj > 0 ? "+" : ""}${adj.toFixed(1)}ft on ${roll["Roll ID"]}`);
      setAmount(""); setNote(""); onDone();
    } catch { toast.error("Network error"); }
    finally { setSaving(false); }
  };

  return (
    <Dialog
      open={!!roll}
      onClose={() => onClose()}
      maxWidth="xs"
      fullWidth
      slotProps={{ paper: { sx: { borderRadius: "16px", overflow: "hidden", p: 0 } } }}
    >
      <Box sx={{ p: 3, bgcolor: "primary.main", color: "white" }}>
        <DialogTitle sx={{ p: 0, color: "white", fontWeight: 900, fontSize: "1.1rem" }}>
          Manual Adjustment
        </DialogTitle>
        <Typography sx={{ color: "rgba(255,255,255,0.75)", fontSize: "0.7rem", mt: 0.5 }}>
          {roll["Roll ID"]} — Current: <strong>{current.toFixed(1)}ft</strong>
        </Typography>
      </Box>

      <DialogContent sx={{ p: 3 }}>
        <Stack sx={{ gap: 2 }}>
          <Box>
            <Typography variant="caption" sx={{ fontSize: "0.625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary", display: "block", mb: 0.75 }}>
              Adjustment (ft)
            </Typography>
            <TextField
              fullWidth
              size="small"
              type="number"
              placeholder="e.g. −5 for damage, +10 for correction"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2, height: 48 } }}
            />
            {preview !== null && (
              <Typography sx={{ fontSize: "0.625rem", color: "text.secondary", fontWeight: 500, mt: 0.5 }}>
                After adjustment: <strong>{preview.toFixed(1)}ft remaining</strong>
              </Typography>
            )}
          </Box>
          <Box>
            <Typography variant="caption" sx={{ fontSize: "0.625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary", display: "block", mb: 0.75 }}>
              Reason (required for audit log) *
            </Typography>
            <TextField
              fullWidth
              size="small"
              placeholder="e.g. Measurement correction, damaged section removed"
              value={note}
              onChange={e => setNote(e.target.value)}
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2, height: 48 } }}
            />
          </Box>
          <Typography sx={{ fontSize: "0.5625rem", color: "text.secondary", fontStyle: "italic" }}>
            This adjustment will be logged to the Expenses sheet for audit purposes.
          </Typography>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ p: 3, pt: 0, gap: 1.5 }}>
        <Button
          variant="outlined"
          onClick={onClose}
          sx={{ flex: 1, height: 44, borderRadius: 2, fontWeight: 700, color: "text.secondary", borderColor: "grey.300" }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving || !canSave}
          sx={{ flex: 1, height: 44, borderRadius: 2, fontWeight: 900, bgcolor: "primary.main", "&:hover": { bgcolor: "primary.dark" } }}
        >
          {saving ? "Saving..." : "Apply"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Restock Dialog ───────────────────────────────────────────────────────────

function RestockDialog({ material, onClose, onDone }: { material: Material | null; onClose: () => void; onDone: () => void }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const [form, setForm] = useState({
    itemName: "",
    category: "General",
    widthFt: "",
    rawLength: "",
    lengthUnit: "m" as "m" | "ft",
    price: "",
    cost: "",
    lowStockThreshold: "20",
    quantity: "1",
    supplier: "",
    purchaseDate: new Date().toISOString().split("T")[0],
    poReference: "",
  });
  const [saving, setSaving] = useState(false);

  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    if (material) {
      setForm({
        itemName: material["Material Name"] || "",
        category: material["Category"] || "General",
        widthFt: String(parseNum(material["Width (ft)"]) || ""),
        rawLength: "",
        lengthUnit: "m",
        price: String(parseNum(material["Selling Price"]) || ""),
        cost: "",
        lowStockThreshold: String(parseNum(material["Low Stock Threshold (ft)"]) || "20"),
        quantity: "1",
        supplier: "",
        purchaseDate: new Date().toISOString().split("T")[0],
        poReference: "",
      });
    }
  }, [material]);

  const rawLengthFt = useMemo(() => {
    const raw = parseFloat(form.rawLength) || 0;
    return form.lengthUnit === "m" ? raw * METERS_TO_FEET : raw;
  }, [form.rawLength, form.lengthUnit]);

  const widthFt = parseFloat(form.widthFt) || 0;
  const usableLength = Math.max(0, rawLengthFt - 10);
  const totalAreaSqft = widthFt * usableLength;
  const qty = Math.max(1, parseInt(form.quantity, 10) || 1);
  const costPerRoll = qty > 0 ? (parseFloat(form.cost) || 0) / qty : 0;
  const costPerSqft = totalAreaSqft > 0 ? costPerRoll / totalAreaSqft : 0;

  const handleSave = async () => {
    if (!form.rawLength) {
      toast.error("Roll length is required.");
      return;
    }
    if (rawLengthFt <= 10) {
      toast.error("Roll length must exceed 10ft (the reserved waste factor). Usable stock would be zero or negative.");
      return;
    }
    setSaving(true);
    try {
      const loggedBy = typeof window !== "undefined" ? localStorage.getItem("userName") || "Unknown" : "Unknown";
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemName: form.itemName.trim(),
          category: form.category.trim(),
          widthFt: widthFt,
          rawLengthFt: rawLengthFt.toFixed(2),
          unit: form.lengthUnit,
          price: form.price,
          cost: form.cost,
          lowStockThreshold: form.lowStockThreshold,
          quantity: qty,
          supplier: form.supplier.trim() || undefined,
          purchaseDate: form.purchaseDate,
          poReference: form.poReference.trim() || undefined,
          loggedBy,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to add roll");
      const ids = json.rollIds ? json.rollIds.join(", ") : json.rollId;
      toast.success(`Restock complete — Roll ID(s): ${ids}`);
      onDone();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={!!material}
      onClose={() => onClose()}
      maxWidth="sm"
      fullWidth
      slotProps={{ paper: { sx: { borderRadius: "16px", overflow: "hidden", p: 0 } } }}
    >
      <Box sx={{ p: 3, bgcolor: "primary.main", color: "white" }}>
        <DialogTitle sx={{ p: 0, color: "white", fontWeight: 900, fontSize: "1.2rem" }}>
          Restock Material
        </DialogTitle>
        <Typography sx={{ color: "rgba(255,255,255,0.75)", fontSize: "0.7rem", mt: 0.5 }}>
          Creates new rolls inheriting parent material properties.
        </Typography>
      </Box>

      <DialogContent sx={{ p: 3, maxHeight: "70vh", overflowY: "auto" }}>
        <Stack sx={{ gap: 2.5 }}>
          {/* Inherited Properties */}
          <Box sx={{ p: 2, bgcolor: "rgba(0,0,0,0.02)", borderRadius: "16px", border: "1px solid", borderColor: "grey.100" }}>
            <Typography sx={{ fontSize: "0.625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "text.secondary", borderBottom: "1px solid", borderColor: "grey.100", pb: 1, mb: 1.5 }}>
              Inherited Profile Properties
            </Typography>
            <Stack sx={{ gap: 1.5 }}>
              <Box>
                <Typography variant="caption" sx={{ fontSize: "0.625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary", display: "block", mb: 0.75 }}>
                  Material Name
                </Typography>
                <TextField
                  fullWidth
                  size="small"
                  value={form.itemName}
                  disabled
                  sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2, bgcolor: "grey.50", opacity: 0.7 } }}
                />
              </Box>
              <Grid container spacing={2}>
                <Grid size={6}>
                  <Typography variant="caption" sx={{ fontSize: "0.625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary", display: "block", mb: 0.75 }}>
                    Category
                  </Typography>
                  <TextField
                    fullWidth
                    size="small"
                    value={form.category}
                    disabled
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2, bgcolor: "grey.50", opacity: 0.7 } }}
                  />
                </Grid>
                <Grid size={6}>
                  <Typography variant="caption" sx={{ fontSize: "0.625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary", display: "block", mb: 0.75 }}>
                    Width (ft)
                  </Typography>
                  <TextField
                    fullWidth
                    size="small"
                    value={form.widthFt ? `${form.widthFt} ft` : ""}
                    disabled
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2, bgcolor: "grey.50", opacity: 0.7 } }}
                  />
                </Grid>
                <Grid size={6}>
                  <Typography variant="caption" sx={{ fontSize: "0.625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary", display: "block", mb: 0.75 }}>
                    Selling Price (₦/sqft)
                  </Typography>
                  <TextField
                    fullWidth
                    size="small"
                    value={form.price ? `₦ ${parseFloat(form.price).toLocaleString()}` : ""}
                    disabled
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2, bgcolor: "grey.50", opacity: 0.7 } }}
                  />
                </Grid>
                <Grid size={6}>
                  <Typography variant="caption" sx={{ fontSize: "0.625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary", display: "block", mb: 0.75 }}>
                    Low Stock Threshold (ft)
                  </Typography>
                  <TextField
                    fullWidth
                    size="small"
                    value={form.lowStockThreshold ? `${form.lowStockThreshold} ft` : ""}
                    disabled
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2, bgcolor: "grey.50", opacity: 0.7 } }}
                  />
                </Grid>
              </Grid>
            </Stack>
          </Box>

          {/* New Roll Details */}
          <Box>
            <Typography sx={{ fontSize: "0.625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "primary.main", borderBottom: "1px solid rgba(200,71,46,0.1)", pb: 1, mb: 1.5 }}>
              New Roll Details
            </Typography>
            <Stack sx={{ gap: 1.5 }}>
              <Grid container spacing={2}>
                <Grid size={6}>
                  <Typography variant="caption" sx={{ fontSize: "0.625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary", display: "block", mb: 0.75 }}>
                    Quantity of Rolls *
                  </Typography>
                  <TextField
                    fullWidth
                    size="small"
                    type="number"
                    slotProps={{ htmlInput: { min: 1 } }}
                    value={form.quantity}
                    onChange={e => set("quantity", e.target.value)}
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                  />
                </Grid>
                <Grid size={6}>
                  <Typography variant="caption" sx={{ fontSize: "0.625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary", display: "block", mb: 0.75 }}>
                    Total Buy Cost (₦) *
                  </Typography>
                  <TextField
                    fullWidth
                    size="small"
                    type="number"
                    placeholder="e.g. 60000"
                    value={form.cost}
                    onChange={e => set("cost", e.target.value)}
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                  />
                </Grid>
              </Grid>

              {/* Length section */}
              <Box sx={{ p: 2, bgcolor: "rgba(200,71,46,0.04)", borderRadius: "16px", border: "1px solid rgba(200,71,46,0.12)" }}>
                <Box sx={{ mb: 1 }}>
                  <Typography variant="caption" sx={{ fontSize: "0.625rem", fontWeight: 700, textTransform: "uppercase", color: "primary.main", display: "block", mb: 0.75 }}>
                    Roll Length *
                  </Typography>
                  <Stack direction="row" sx={{ gap: 1 }}>
                    <TextField
                      size="small"
                      type="number"
                      placeholder={form.lengthUnit === "m" ? "e.g. 50" : "e.g. 164"}
                      value={form.rawLength}
                      onChange={e => set("rawLength", e.target.value)}
                      sx={{ flex: 1, "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                    />
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => set("lengthUnit", form.lengthUnit === "m" ? "ft" : "m")}
                      sx={{
                        px: 2,
                        fontWeight: 900,
                        fontSize: "0.7rem",
                        height: 40,
                        borderRadius: 2,
                        textTransform: "uppercase",
                        borderColor: "rgba(200,71,46,0.2)",
                        color: "primary.main",
                      }}
                    >
                      {form.lengthUnit}
                    </Button>
                  </Stack>
                </Box>

                {rawLengthFt > 0 && (
                  <Grid container spacing={1} sx={{ textAlign: "center" }}>
                    {[
                      { label: "Full Length", value: `${rawLengthFt.toFixed(1)}ft`, variant: "neutral" },
                      { label: "−10ft Waste", value: "−10ft", variant: "accent" },
                      { label: "Usable Stock", value: `${usableLength.toFixed(1)}ft`, variant: "highlight" },
                    ].map(({ label, value, variant }) => (
                      <Grid size={4} key={label}>
                        <Box sx={{
                          p: 1, borderRadius: 2,
                          bgcolor: variant === "highlight"
                            ? "primary.main"
                            : variant === "accent"
                              ? (isDark ? "rgba(225, 29, 72, 0.15)" : "#fff1f2")
                              : "background.paper",
                          color: variant === "highlight"
                            ? "white"
                            : variant === "accent"
                              ? (isDark ? "#f43f5e" : "#e11d48")
                              : "text.primary",
                        }}>
                          <Typography sx={{ fontSize: "0.5625rem", fontWeight: 700, textTransform: "uppercase", opacity: variant === "highlight" ? 0.7 : 0.6 }}>
                            {label}
                          </Typography>
                          <Typography sx={{ fontSize: "0.875rem", fontWeight: 900, lineHeight: 1.2 }}>
                            {value}
                          </Typography>
                        </Box>
                      </Grid>
                    ))}
                  </Grid>
                )}
              </Box>

              {/* Auditing section */}
              <Box sx={{ p: 2, bgcolor: "rgba(0,0,0,0.02)", borderRadius: "16px", border: "1px solid", borderColor: "grey.100" }}>
                <Typography sx={{ fontSize: "0.625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "text.secondary", borderBottom: "1px solid", borderColor: "grey.100", pb: 1, mb: 1.5 }}>
                  Auditing & Purchase Details
                </Typography>
                <Stack sx={{ gap: 1.5 }}>
                  <Box>
                    <Typography variant="caption" sx={{ fontSize: "0.625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary", display: "block", mb: 0.75 }}>
                      Supplier / Vendor
                    </Typography>
                    <TextField
                      fullWidth
                      size="small"
                      placeholder="e.g. Star Graphics, Avery Supplier"
                      value={form.supplier}
                      onChange={e => set("supplier", e.target.value)}
                      sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                    />
                  </Box>
                  <Grid container spacing={2}>
                    <Grid size={6}>
                      <Typography variant="caption" sx={{ fontSize: "0.625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary", display: "block", mb: 0.75 }}>
                        PO / Invoice Reference
                      </Typography>
                      <TextField
                        fullWidth
                        size="small"
                        placeholder="e.g. PO-2026-001"
                        value={form.poReference}
                        onChange={e => set("poReference", e.target.value)}
                        sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                      />
                    </Grid>
                    <Grid size={6}>
                      <Typography variant="caption" sx={{ fontSize: "0.625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary", display: "block", mb: 0.75 }}>
                        Purchase Date
                      </Typography>
                      <DatePicker
                        value={dayjs(form.purchaseDate)}
                        onChange={(val) => set("purchaseDate", val?.format("YYYY-MM-DD") ?? new Date().toISOString().split("T")[0])}
                        slotProps={{ textField: { size: "small", fullWidth: true, sx: { "& .MuiOutlinedInput-root": { borderRadius: 2 } } } }}
                      />
                    </Grid>
                  </Grid>
                </Stack>
              </Box>

              {costPerSqft > 0 && (
                <Stack direction="row" sx={{ gap: 1, p: 1.5, bgcolor: "grey.50", borderRadius: 2, alignItems: "flex-start" }}>
                  <Info size={16} style={{ color: "#9ca3af", flexShrink: 0, marginTop: 1 }} />
                  <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
                    Cost per sqft: <strong>₦{costPerSqft.toFixed(2)}</strong> based on {totalAreaSqft.toFixed(0)} usable sqft per roll (unit cost: ₦{costPerRoll.toFixed(2)})
                  </Typography>
                </Stack>
              )}
            </Stack>
          </Box>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ p: 3, pt: 2, bgcolor: "grey.50", borderTop: "1px solid", borderColor: "grey.100", gap: 1.5 }}>
        <Button
          variant="outlined"
          onClick={onClose}
          sx={{ flex: 1, height: 48, borderRadius: 2, fontWeight: 700, color: "text.secondary", borderColor: "grey.300" }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving}
          sx={{ flex: 1, height: 48, borderRadius: 2, fontWeight: 900, bgcolor: "primary.main", "&:hover": { bgcolor: "primary.dark" } }}
        >
          {saving ? "Adding Roll..." : "Confirm Restock"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const router = useRouter();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [inventory, setInventory] = useState<Roll[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [adjustTarget, setAdjustTarget] = useState<Roll | null>(null);
  const [wasteTarget, setWasteTarget] = useState<Roll | null>(null);
  const [restockTarget, setRestockTarget] = useState<Material | null>(null);
  const [expandedMaterialId, setExpandedMaterialId] = useState<string | null>(null);
  const [activeRollsAnchor, setActiveRollsAnchor] = useState<HTMLElement | null>(null);
  const [depletedAnchor, setDepletedAnchor] = useState<HTMLElement | null>(null);

  const fetchData = async () => {
    setRefreshing(true);
    try {
      const [invRes, matRes] = await Promise.all([
        fetch("/api/inventory"),
        fetch("/api/materials")
      ]);
      const invJson = await invRes.json();
      const matJson = await matRes.json();

      if (invRes.ok) setInventory(invJson.data || []);
      if (matRes.ok) setMaterials(matJson.data || []);

      if (!invRes.ok) toast.error(invJson.error || "Failed to load inventory");
      if (!matRes.ok) toast.error(matJson.error || "Failed to load materials");
    } catch {
      toast.error("Network error fetching inventory data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const filteredMaterials = useMemo(() => {
    const s = search.toLowerCase();
    return materials.filter(m =>
      m["Material ID"]?.toLowerCase().includes(s) ||
      m["Material Name"]?.toLowerCase().includes(s) ||
      m["Category"]?.toLowerCase().includes(s)
    );
  }, [materials, search]);

  const formatRollGroupKey = (width: any, itemName: string) => {
    const w = parseFloat(String(width)) || 0;
    const name = String(itemName || "").trim();
    const formattedName = name
      .toLowerCase()
      .split(" ")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
    return `${w}ft ${formattedName}`;
  };

  const activeRollGroups = useMemo(() => {
    const groups: Record<string, number> = {};
    inventory.forEach(roll => {
      const remaining = parseNum(roll["Remaining Length (ft)"]);
      if (remaining > 0.1) {
        const key = formatRollGroupKey(roll["Width (ft)"], roll["Item Name"]);
        groups[key] = (groups[key] || 0) + 1;
      }
    });
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  }, [inventory]);

  const depletedRollGroups = useMemo(() => {
    const groups: Record<string, number> = {};
    inventory.forEach(roll => {
      const remaining = parseNum(roll["Remaining Length (ft)"]);
      if (remaining <= 0.1) {
        const key = formatRollGroupKey(roll["Width (ft)"], roll["Item Name"]);
        groups[key] = (groups[key] || 0) + 1;
      }
    });
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  }, [inventory]);

  const totalActiveRollsCount = useMemo(() => {
    return inventory.filter(r => parseNum(r["Remaining Length (ft)"]) > 0.1).length;
  }, [inventory]);

  const totalDepletedRollsCount = useMemo(() => {
    return inventory.filter(r => parseNum(r["Remaining Length (ft)"]) <= 0.1).length;
  }, [inventory]);

  const stats = useMemo(() => {
    let active = 0;
    let lowStock = 0;
    let outOfStock = 0;
    let totalFt = 0;
    let totalSpent = 0;
    let totalRemainingAsset = 0;
    let totalRemainingRevenue = 0;
    let totalRealisedRevenue = 0;

    materials.forEach(m => {
      if (m.Status === "Active") active++;
      else if (m.Status === "Low Stock") lowStock++;
      else if (m.Status === "Out of Stock" || m.Status === "Depleted") outOfStock++;

      totalFt += parseNum(m["Total Remaining (ft)"]);
      totalSpent += parseNum(m["Total Spent"]);
      totalRemainingAsset += parseNum(m["Total Remaining Asset Value"]);
      totalRemainingRevenue += parseNum(m["Total Remaining Revenue"]);
      totalRealisedRevenue += parseNum(m["Total Realised Revenue"]);
    });

    return { active, lowStock, outOfStock, totalFt, totalSpent, totalRemainingAsset, totalRemainingRevenue, totalRealisedRevenue };
  }, [materials]);

  if (loading) {
    return (
      <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <LoadingAnimation text="Loading..." />
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, bgcolor: "background.default", minHeight: "100vh", pb: 16 }}>
      {/* Header */}
      <Stack
        direction={{ xs: "column", md: "row" }}
        sx={{ alignItems: { md: "center" }, justifyContent: "space-between", gap: 2, mb: 4 }}
      >
        <Box>
          <Stack direction="row" sx={{ alignItems: "center", gap: 1.5 }}>
            <IconButton
              onClick={() => router.back()}
              sx={{
                display: { md: "none" },
                borderRadius: 2,
                width: 36,
                height: 36,
                bgcolor: "background.paper",
                border: "1px solid",
                borderColor: "divider",
              }}
            >
              <ArrowLeft size={16} />
            </IconButton>
            <Typography variant="h4" sx={{ fontWeight: 900, color: "text.primary", letterSpacing: "-0.02em" }}>
              Inventory Management
            </Typography>
            {refreshing && <RefreshCw size={16} style={{ color: "#C8472E", animation: "spin 1s linear infinite" }} />}
          </Stack>
          <Typography sx={{ color: "text.secondary", fontSize: "0.875rem", mt: 0.5 }}>
            Linear length tracking per roll · 10ft waste reserved upfront
          </Typography>
        </Box>
        <AddRollDialog onAdded={fetchData} />
      </Stack>

      {/* Overview Analytics Banner */}
      <Stack sx={{ gap: 3, mb: 4 }}>
        {/* Top Row: Health & Assets */}
        <Grid container spacing={3}>
          {/* Warehouse Health Card */}
          <Grid size={{ xs: 12, md: 4 }}>
            <Card sx={{ border: "none", boxShadow: "0 1px 2px rgba(0,0,0,0.04)", height: "100%" }}>
              <CardContent sx={{ p: 2.5 }}>
                <Typography sx={{ fontSize: "0.625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "text.secondary", borderBottom: "1px solid", borderColor: "grey.100", pb: 1, mb: 1.5 }}>
                  Warehouse Health
                </Typography>
                <Grid container spacing={1} sx={{ textAlign: "center", mb: 2 }}>
                  {[
                    { label: "Active Mat", val: stats.active, bgcolor: isDark ? "rgba(16, 185, 129, 0.15)" : "#d1fae5", color: isDark ? "#34d399" : "#065f46" },
                    { label: "Low Stock", val: stats.lowStock, bgcolor: isDark ? "rgba(245, 158, 11, 0.15)" : "#fef3c7", color: isDark ? "#fbbf24" : "#92400e" },
                    { label: "Out of Stock", val: stats.outOfStock, bgcolor: isDark ? "rgba(239, 68, 68, 0.15)" : "#ffe4e6", color: isDark ? "#f87171" : "#9f1239" },
                  ].map(s => (
                    <Grid size={4} key={s.label}>
                      <Box sx={{ p: 1, borderRadius: 2, bgcolor: s.bgcolor, color: s.color }}>
                        <Typography sx={{ fontSize: "1.25rem", fontWeight: 900 }}>{s.val}</Typography>
                        <Typography sx={{ fontSize: "0.5rem", fontWeight: 900, textTransform: "uppercase", mt: 0.25, opacity: 0.8 }}>
                          {s.label}
                        </Typography>
                      </Box>
                    </Grid>
                  ))}
                </Grid>

                <Box sx={{ pt: 1.5, borderTop: "1px solid", borderColor: "grey.100" }}>
                  <Typography sx={{ fontSize: "0.5625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "text.secondary", mb: 1.5 }}>
                    Live Roll Analytics
                  </Typography>
                  <Grid container spacing={1.5}>
                    {/* Active Rolls Popover Button */}
                    <Grid size={6}>
                      <Box
                        component="button"
                        onClick={(e: React.MouseEvent<HTMLElement>) => setActiveRollsAnchor(e.currentTarget)}
                        sx={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          p: 1.5,
                          borderRadius: 3,
                          bgcolor: "#10b981",
                          color: "white",
                          width: "100%",
                          cursor: "pointer",
                          border: "none",
                          transition: "all 0.15s ease",
                          boxShadow: "0 4px 12px rgba(16,185,129,0.2)",
                          "&:hover": { bgcolor: "#059669" },
                          "&:active": { transform: "scale(0.97)" },
                        }}
                      >
                        <Typography sx={{ fontSize: "1.5rem", fontWeight: 900, lineHeight: 1 }}>{totalActiveRollsCount}</Typography>
                        <Stack direction="row" sx={{ alignItems: "center", gap: 0.5, mt: 0.5 }}>
                          <Typography sx={{ fontSize: "0.5625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.9 }}>
                            Active Rolls
                          </Typography>
                          <ChevronDown size={10} />
                        </Stack>
                      </Box>
                    </Grid>

                    {/* Depleted Rolls Popover Button */}
                    <Grid size={6}>
                      <Box
                        component="button"
                        onClick={(e: React.MouseEvent<HTMLElement>) => setDepletedAnchor(e.currentTarget)}
                        sx={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          p: 1.5,
                          borderRadius: 3,
                          bgcolor: "#6b7280",
                          color: "white",
                          width: "100%",
                          cursor: "pointer",
                          border: "none",
                          transition: "all 0.15s ease",
                          boxShadow: "0 4px 12px rgba(107,114,128,0.15)",
                          "&:hover": { bgcolor: "#4b5563" },
                          "&:active": { transform: "scale(0.97)" },
                        }}
                      >
                        <Typography sx={{ fontSize: "1.5rem", fontWeight: 900, lineHeight: 1 }}>{totalDepletedRollsCount}</Typography>
                        <Stack direction="row" sx={{ alignItems: "center", gap: 0.5, mt: 0.5 }}>
                          <Typography sx={{ fontSize: "0.5625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.9 }}>
                            Used Rolls
                          </Typography>
                          <ChevronDown size={10} />
                        </Stack>
                      </Box>
                    </Grid>
                  </Grid>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Capital Invested + Remaining Asset */}
          <Grid size={{ xs: 12, md: 8 }}>
            <Grid container spacing={3} sx={{ height: "100%" }}>
              {[
                {
                  title: "Capital Invested",
                  val: `₦${stats.totalSpent.toLocaleString()}`,
                  IconComp: Coins,
                  iconBg: isDark ? "rgba(37, 99, 235, 0.15)" : "#eff6ff",
                  iconColor: isDark ? "#60a5fa" : "#2563eb",
                  sub: "Total Spent on Roll Assets",
                },
                {
                  title: "Remaining Asset Cost",
                  val: `₦${stats.totalRemainingAsset.toLocaleString()}`,
                  IconComp: CircleDollarSign,
                  iconBg: isDark ? "rgba(124, 58, 237, 0.15)" : "#f5f3ff",
                  iconColor: isDark ? "#a78bfa" : "#7c3aed",
                  sub: `${Math.round(stats.totalFt).toLocaleString()} ft remaining`,
                },
              ].map(s => (
                <Grid size={{ xs: 12, sm: 6 }} key={s.title}>
                  <Card sx={{ border: "none", boxShadow: "0 1px 2px rgba(0,0,0,0.04)", height: "100%" }}>
                    <CardContent sx={{ p: 2.5, display: "flex", alignItems: "center", justifyContent: "space-between", height: "100%" }}>
                      <Box>
                        <Typography sx={{ fontSize: "0.625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "text.secondary", mb: 0.75 }}>
                          {s.title}
                        </Typography>
                        <Typography sx={{ fontSize: { xs: "1.25rem", sm: "1.5rem" }, fontWeight: 900, color: "text.primary", lineHeight: 1.1 }}>
                          {s.val}
                        </Typography>
                        <Typography sx={{ fontSize: "0.5625rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary", mt: 0.75 }}>
                          {s.sub}
                        </Typography>
                      </Box>
                      <Box sx={{ p: 1.5, borderRadius: 3, bgcolor: s.iconBg }}>
                        <s.IconComp size={20} style={{ color: s.iconColor }} />
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Grid>
        </Grid>

        {/* Bottom Row: Revenue */}
        <Grid container spacing={3}>
          {/* Realised + Expected revenue */}
          <Grid size={{ xs: 12, md: 8 }}>
            <Card sx={{ border: "none", boxShadow: "0 1px 2px rgba(0,0,0,0.04)", overflow: "hidden", height: "100%" }}>
              <CardContent sx={{ p: 0, height: "100%", display: "flex", flexDirection: { xs: "column", sm: "row" } }}>
                {[
                  {
                    title: "Realised Revenue",
                    val: `₦${stats.totalRealisedRevenue.toLocaleString()}`,
                    IconComp: CheckCircle2,
                    iconBg: isDark ? "rgba(2, 132, 199, 0.15)" : "#e0f2fe",
                    iconColor: isDark ? "#38bdf8" : "#0284c7",
                    sub: "Revenue from Used Stock",
                  },
                  {
                    title: "Expected Revenue",
                    val: `₦${stats.totalRemainingRevenue.toLocaleString()}`,
                    IconComp: TrendingUp,
                    iconBg: isDark ? "rgba(5, 150, 105, 0.15)" : "#d1fae5",
                    iconColor: isDark ? "#34d399" : "#059669",
                    sub: "Estimated Sales Potential",
                  },
                ].map((s, i) => (
                  <Box
                    key={s.title}
                    sx={{
                      flex: 1,
                      p: 2.5,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      borderRight: i === 0 ? { xs: "none", sm: "1px solid" } : "none",
                      borderBottom: i === 0 ? { xs: "1px solid", sm: "none" } : "none",
                      borderColor: "grey.100",
                      transition: "background 0.15s",
                      "&:hover": { bgcolor: "rgba(0,0,0,0.01)" },
                    }}
                  >
                    <Box>
                      <Typography sx={{ fontSize: "0.625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "text.secondary", mb: 0.75 }}>
                        {s.title}
                      </Typography>
                      <Typography sx={{ fontSize: { xs: "1.25rem", sm: "1.5rem" }, fontWeight: 900, color: "text.primary", lineHeight: 1.1 }}>
                        {s.val}
                      </Typography>
                      <Typography sx={{ fontSize: "0.5625rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary", mt: 0.75 }}>
                        {s.sub}
                      </Typography>
                    </Box>
                    <Box sx={{ p: 1.5, borderRadius: 3, bgcolor: s.iconBg }}>
                      <s.IconComp size={20} style={{ color: s.iconColor }} />
                    </Box>
                  </Box>
                ))}
              </CardContent>
            </Card>
          </Grid>

          {/* Total Est Revenue Hero Card */}
          <Grid size={{ xs: 12, md: 4 }}>
            <Card sx={{
              bgcolor: "primary.main",
              border: "none",
              boxShadow: "0 8px 24px rgba(200,71,46,0.25)",
              overflow: "hidden",
              height: "100%",
              position: "relative",
            }}>
              <Box sx={{ position: "absolute", top: -48, right: -48, width: 128, height: 128, bgcolor: "rgba(255,255,255,0.1)", borderRadius: "50%", filter: "blur(24px)", pointerEvents: "none" }} />
              <Box sx={{ position: "absolute", bottom: -40, left: -40, width: 96, height: 96, bgcolor: "rgba(0,0,0,0.1)", borderRadius: "50%", filter: "blur(16px)", pointerEvents: "none" }} />
              <CardContent sx={{ p: 3, height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", position: "relative", zIndex: 1 }}>
                <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
                  <Typography sx={{ fontSize: "0.625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.8)" }}>
                    Total Est. Revenue
                  </Typography>
                  <Box sx={{ p: 1, bgcolor: "rgba(255,255,255,0.15)", borderRadius: 2 }}>
                    <Sparkles size={16} style={{ color: "rgba(255,255,255,0.9)" }} />
                  </Box>
                </Stack>
                <Typography sx={{ fontSize: { xs: "1.75rem", lg: "2.25rem" }, fontWeight: 900, color: "white", lineHeight: 1.1, letterSpacing: "-0.02em", mb: 1 }}>
                  ₦{(stats.totalRealisedRevenue + stats.totalRemainingRevenue).toLocaleString()}
                </Typography>
                <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
                  <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "#34d399", animation: "pulse 2s infinite" }} />
                  <Typography sx={{ fontSize: "0.625rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.7)" }}>
                    Realised + Expected
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Stack>

      {/* Materials Table */}
      <Card sx={{ border: "1px solid", borderColor: "grey.100", boxShadow: "none", overflow: "hidden" }}>
        {/* Table toolbar */}
        <Box sx={{
          p: 3,
          borderBottom: "1px solid",
          borderColor: "grey.50",
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
          gap: 2,
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <TextField
            size="small"
            placeholder="Search materials by name or category..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            sx={{ width: { xs: "100%", md: 384 }, "& .MuiOutlinedInput-root": { borderRadius: 2, bgcolor: "grey.50", "& fieldset": { border: "none" } } }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Search size={16} style={{ color: "#9ca3af" }} />
                  </InputAdornment>
                ),
              },
            }}
          />
          <Button
            variant="text"
            size="small"
            startIcon={<RefreshCw size={16} />}
            onClick={fetchData}
            sx={{ fontWeight: 700, color: "text.secondary" }}
          >
            Refresh
          </Button>
        </Box>

        {/* Table */}
        <Box sx={{ overflowX: "auto" }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: "rgba(0,0,0,0.02)" }}>
                {[
                  { label: "Material Profile", align: "left" as const, pl: 3 },
                  { label: "Width", align: "left" as const },
                  { label: "Rolls", align: "center" as const },
                  { label: "Total Stock", align: "center" as const },
                  { label: "Status", align: "center" as const },
                ].map(h => (
                  <TableCell
                    key={h.label}
                    align={h.align}
                    sx={{
                      fontSize: "0.625rem",
                      fontWeight: 900,
                      textTransform: "uppercase",
                      color: "text.secondary",
                      letterSpacing: "0.08em",
                      py: 2,
                      pl: h.pl,
                      whiteSpace: "nowrap",
                      border: "none",
                    }}
                  >
                    {h.label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredMaterials.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} sx={{ textAlign: "center", py: 12, border: "none" }}>
                    <Stack sx={{ alignItems: "center", gap: 1, color: "text.disabled" }}>
                      <Package size={40} style={{ opacity: 0.3 }} />
                      <Typography sx={{ fontWeight: 700, color: "text.secondary", fontSize: "0.875rem" }}>
                        No materials found
                      </Typography>
                      <Typography sx={{ fontSize: "0.75rem", color: "text.disabled" }}>
                        {search ? "Try a different search term" : "Add your first roll using the button above"}
                      </Typography>
                    </Stack>
                  </TableCell>
                </TableRow>
              ) : filteredMaterials.map((mat, index) => {
                const matId = mat["Material ID"];
                const total = parseNum(mat["Total Capacity (ft)"]);
                const remaining = parseNum(mat["Total Remaining (ft)"]);
                const rollCount = parseNum(mat["Roll Count"]) || 0;
                const activeRollId = mat["Active Roll ID"] || "";
                const matchedRolls = inventory.filter(r => r["Material ID"] === matId);
                const displayRolls = matchedRolls.length > 0 ? matchedRolls : inventory.filter(r => (r["Roll ID"] || "").startsWith(mat["Material Name"] || "XXXXXX"));
                const pct = total > 0 ? Math.min(100, (remaining / total) * 100) : 0;
                const barColor = mat.Status === "Out of Stock" || mat.Status === "Depleted" ? "#ef4444" : mat.Status === "Low Stock" ? "#f59e0b" : "#10b981";
                const isExpanded = expandedMaterialId === matId;
                const rollCountDisplay = rollCount || displayRolls.length;
                const rowBg = index % 2 === 0
                  ? (theme.palette.mode === "dark" ? "background.paper" : "white")
                  : (theme.palette.mode === "dark" ? "rgba(255, 255, 255, 0.015)" : "rgba(248, 250, 252, 0.5)");

                return (
                  <Fragment key={matId}>
                    <TableRow
                      onClick={() => setExpandedMaterialId(isExpanded ? null : matId)}
                      sx={{
                        bgcolor: rowBg,
                        cursor: "pointer",
                        borderBottom: "1px solid",
                        borderColor: "grey.50",
                        "&:hover": { bgcolor: "action.hover" },
                      }}
                    >
                      <TableCell sx={{ fontWeight: 700, py: 2, pl: 3, border: "none" }}>
                        <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
                          {isExpanded
                            ? <ChevronUp size={14} style={{ color: "#9ca3af", flexShrink: 0 }} />
                            : <ChevronDown size={14} style={{ color: "#9ca3af", flexShrink: 0 }} />
                          }
                          <Box>
                            <Typography sx={{ fontSize: "0.875rem", fontWeight: 900, color: "text.primary" }}>
                              {mat["Material Name"]}
                            </Typography>
                            <Typography sx={{ fontSize: "0.625rem", color: "text.disabled", fontFamily: "monospace" }}>
                              {matId}
                            </Typography>
                          </Box>
                        </Stack>
                      </TableCell>
                      <TableCell sx={{ fontWeight: 900, color: "primary.main", whiteSpace: "nowrap", border: "none" }}>
                        {parseNum(mat["Width (ft)"])}ft
                      </TableCell>
                      <TableCell align="center" sx={{ border: "none" }}>
                        <Chip
                          label={`${rollCountDisplay} ${rollCountDisplay === 1 ? "Roll" : "Rolls"}`}
                          variant="outlined"
                          size="small"
                          sx={{ fontSize: "0.625rem", fontWeight: 700, borderColor: "grey.200" }}
                        />
                      </TableCell>
                      <TableCell align="center" sx={{ border: "none" }}>
                        <Stack sx={{ alignItems: "center", gap: 0.5 }}>
                          <Typography sx={{ fontWeight: 900, fontSize: "0.875rem", whiteSpace: "nowrap" }}>
                            {remaining.toFixed(1)}ft
                          </Typography>
                          <Box sx={{ width: 80, height: 6, borderRadius: 99, bgcolor: "grey.100", overflow: "hidden" }}>
                            <Box sx={{
                              height: "100%",
                              borderRadius: 99,
                              bgcolor: barColor,
                              width: `${pct.toFixed(1)}%`,
                              transition: "width 500ms ease-out",
                            }} />
                          </Box>
                          <Typography sx={{ fontSize: "0.5625rem", color: "text.disabled" }}>
                             {pct.toFixed(0)}% left
                          </Typography>
                        </Stack>
                      </TableCell>
                      <TableCell align="center" sx={{ border: "none" }}>
                        <StatusPill status={mat.Status || "Active"} />
                      </TableCell>
                    </TableRow>

                    {isExpanded && (
                      <TableRow sx={{ bgcolor: theme.palette.mode === "dark" ? "rgba(255, 255, 255, 0.01)" : "rgba(248,250,252,0.6)", borderBottom: "1px solid", borderColor: "grey.50" }}>
                        <TableCell colSpan={5} sx={{ p: 0, border: "none" }}>
                          <Box sx={{ p: { xs: 2, md: 3 } }}>
                            {/* Material Valuation Sub-Panel */}
                            <Grid container spacing={2} sx={{ mb: 3, p: 2, bgcolor: "grey.50", border: "1px solid", borderColor: "grey.100", borderRadius: 3 }}>
                              <Grid size={{ xs: 12, sm: 4 }}>
                                <Typography sx={{ fontSize: "0.5625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "text.secondary", display: "block", mb: 0.5 }}>
                                  Spent on Material
                                </Typography>
                                <Typography sx={{ fontWeight: 900, fontSize: "1rem", color: "text.primary" }}>
                                  ₦{parseNum(mat["Total Spent"]).toLocaleString()}
                                </Typography>
                              </Grid>
                              <Grid size={{ xs: 12, sm: 4 }}>
                                <Typography sx={{ fontSize: "0.5625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "text.secondary", display: "block", mb: 0.5 }}>
                                  Remaining Cost Value
                                </Typography>
                                <Typography sx={{ fontWeight: 900, fontSize: "1rem", color: "#7c3aed" }}>
                                  ₦{parseNum(mat["Total Remaining Asset Value"]).toLocaleString()}
                                </Typography>
                              </Grid>
                              <Grid size={{ xs: 12, sm: 4 }}>
                                <Typography sx={{ fontSize: "0.5625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "text.secondary", display: "block", mb: 0.5 }}>
                                  Expected Sales Revenue
                                </Typography>
                                <Typography sx={{ fontWeight: 900, fontSize: "1rem", color: "#059669" }}>
                                  ₦{parseNum(mat["Total Remaining Revenue"]).toLocaleString()}
                                </Typography>
                              </Grid>
                            </Grid>

                            {/* Roll Log header */}
                            <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 2 }}>
                              <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
                                <Package size={12} style={{ color: "#9ca3af" }} />
                                <Typography sx={{ fontSize: "0.625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "text.secondary" }}>
                                  Physical Roll Log
                                </Typography>
                              </Stack>
                              <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
                                {activeRollId && (
                                  <Stack direction="row" sx={{ alignItems: "center", gap: 0.5, fontSize: "0.5625rem", fontWeight: 900, color: "#059669", bgcolor: "#d1fae5", px: 1.5, py: 0.5, borderRadius: 99, border: "1px solid #a7f3d0" }}>
                                    <Zap size={10} />
                                    <Typography sx={{ fontSize: "0.5625rem", fontWeight: 900 }}>Active: {activeRollId}</Typography>
                                  </Stack>
                                )}
                                <Button
                                  variant="outlined"
                                  size="small"
                                  onClick={(e) => { e.stopPropagation(); setRestockTarget(mat); }}
                                  sx={{
                                    height: 28,
                                    borderRadius: 2,
                                    fontSize: "0.625rem",
                                    fontWeight: 900,
                                    borderColor: "#fcd34d",
                                    color: "#d97706",
                                    whiteSpace: "nowrap",
                                    "&:hover": { bgcolor: "#fffbeb" },
                                  }}
                                >
                                  Restock Material
                                </Button>
                              </Stack>
                            </Stack>

                            {/* Individual rolls */}
                            <Stack sx={{ gap: 1 }}>
                              {displayRolls.length === 0 ? (
                                <Typography sx={{ fontSize: "0.75rem", color: "text.disabled", fontStyle: "italic", py: 2, textAlign: "center" }}>
                                  No physical rolls linked to this profile yet.
                                </Typography>
                              ) : displayRolls.map(roll => {
                                const rTotal = parseNum(roll["Total Length (ft)"]);
                                const rRem = parseNum(roll["Remaining Length (ft)"]);
                                const rPct = rTotal > 0 ? Math.min(100, (rRem / rTotal) * 100) : 0;
                                const isActiveRoll = roll["Roll ID"] === activeRollId;
                                const rollBarColor = roll.Status === "Out of Stock" || rRem <= 0 ? "#ef4444" : roll.Status === "Low Stock" ? "#f59e0b" : "#C8472E";
                                const isFinished = roll.Status === "Depleted" || roll.Status === "Out of Stock";

                                return (
                                  <Box
                                    key={roll["Roll ID"]}
                                    sx={{
                                      p: 2,
                                      borderRadius: 2,
                                      border: "1px solid",
                                      boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                                      opacity: isFinished ? 0.6 : 1,
                                      bgcolor: isFinished
                                        ? "grey.50"
                                        : (theme.palette.mode === "dark" ? "rgba(255, 255, 255, 0.02)" : "white"),
                                      borderColor: isFinished
                                        ? "grey.100"
                                        : isActiveRoll
                                          ? (theme.palette.mode === "dark" ? "#10b981" : "#a7f3d0")
                                          : "grey.100",
                                      outline: isActiveRoll && !isFinished
                                        ? `1px solid ${theme.palette.mode === "dark" ? "#10b981" : "#a7f3d0"}`
                                        : "none",
                                    }}
                                  >
                                    {/* Roll header row */}
                                    <Stack direction="row" sx={{ flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 1.5, mb: 1.5 }}>
                                      <Stack direction="row" sx={{ alignItems: "center", gap: 1.5 }}>
                                        <Box sx={{
                                          width: 36, height: 36, borderRadius: 2,
                                          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                                          bgcolor: isFinished ? "grey.100" : isActiveRoll ? "#d1fae5" : "grey.50",
                                        }}>
                                          <Package size={16} style={{ color: isFinished ? "#d1d5db" : isActiveRoll ? "#10b981" : "#9ca3af" }} />
                                        </Box>
                                        <Box>
                                          <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
                                            <Typography sx={{ fontSize: "0.875rem", fontWeight: 900 }}>
                                              {roll["Roll ID"]}
                                            </Typography>
                                            {isActiveRoll && (
                                              <Typography sx={{ fontSize: "0.5rem", fontWeight: 900, color: "#059669", bgcolor: "#d1fae5", px: 1, py: 0.25, borderRadius: 99, border: "1px solid #a7f3d0", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                                Active
                                              </Typography>
                                            )}
                                          </Stack>
                                          <Typography sx={{ fontSize: "0.625rem", color: "text.disabled" }}>
                                            {roll["Date Added"] || "—"}
                                          </Typography>
                                        </Box>
                                      </Stack>
                                      <StatusPill status={roll.Status || "Active"} />
                                    </Stack>

                                    {/* Progress bar */}
                                    <Box sx={{ mb: 1.5 }}>
                                      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 0.5 }}>
                                        <Typography sx={{ fontSize: "0.5625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary" }}>
                                          Remaining
                                        </Typography>
                                        <Typography sx={{ fontSize: "0.625rem", fontWeight: 900, color: "text.primary" }}>
                                          {rRem.toFixed(1)}ft <Box component="span" sx={{ color: "text.disabled", fontWeight: 400 }}>of {rTotal.toFixed(0)}ft</Box>
                                        </Typography>
                                      </Stack>
                                      <Box sx={{ width: "100%", height: 8, borderRadius: 99, bgcolor: "grey.100", overflow: "hidden" }}>
                                        <Box sx={{
                                          height: "100%",
                                          borderRadius: 99,
                                          bgcolor: rollBarColor,
                                          width: `${rPct.toFixed(1)}%`,
                                          transition: "width 500ms ease-out",
                                        }} />
                                      </Box>
                                    </Box>

                                    {/* Actions */}
                                    <Stack direction="row" sx={{ alignItems: "center", justifyContent: "flex-end", gap: 1 }}>
                                      {isFinished ? (
                                        <Typography sx={{ fontSize: "0.5625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "text.disabled" }}>
                                          Roll Complete
                                        </Typography>
                                      ) : (
                                        <>
                                          <Button
                                            variant="outlined"
                                            size="small"
                                            onClick={(e) => { e.stopPropagation(); setWasteTarget(roll); }}
                                            sx={{ height: 32, borderRadius: 2, fontSize: "0.625rem", fontWeight: 900, borderColor: "#fecaca", color: "#dc2626", "&:hover": { bgcolor: "#fff1f2" } }}
                                          >
                                            Log Waste
                                          </Button>
                                          <Button
                                            variant="outlined"
                                            size="small"
                                            onClick={(e) => { e.stopPropagation(); setAdjustTarget(roll); }}
                                            sx={{ height: 32, borderRadius: 2, fontSize: "0.625rem", fontWeight: 900, borderColor: "grey.200", color: "text.primary", "&:hover": { bgcolor: "grey.50" } }}
                                          >
                                            Adjust Stock
                                          </Button>
                                        </>
                                      )}
                                    </Stack>
                                  </Box>
                                );
                              })}
                            </Stack>
                          </Box>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </Box>
      </Card>

      {/* Active Rolls Popover */}
      <Popover
        open={Boolean(activeRollsAnchor)}
        anchorEl={activeRollsAnchor}
        onClose={() => setActiveRollsAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        transformOrigin={{ vertical: "top", horizontal: "center" }}
        slotProps={{ paper: { sx: { borderRadius: 3, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", border: "1px solid", borderColor: "grey.100", mt: 1 } } }}
      >
        <Box sx={{ p: 2, width: 256 }}>
          <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid", borderColor: "grey.100", pb: 1, mb: 1.5 }}>
            <Typography sx={{ fontSize: "0.75rem", fontWeight: 900, textTransform: "uppercase", color: "text.secondary", letterSpacing: "0.08em" }}>
              Active Rolls
            </Typography>
            <Chip
              label={`${totalActiveRollsCount} total`}
              size="small"
              sx={{ fontSize: "0.625rem", fontWeight: 900, bgcolor: "#d1fae5", color: "#065f46", border: "none" }}
            />
          </Stack>
          <Box sx={{ maxHeight: 192, overflowY: "auto" }}>
            {activeRollGroups.length === 0 ? (
              <Typography sx={{ fontSize: "0.625rem", color: "text.disabled", fontStyle: "italic", py: 2, textAlign: "center" }}>
                No active rolls.
              </Typography>
            ) : activeRollGroups.map(([key, count]) => (
              <Stack key={key} direction="row" sx={{ alignItems: "center", justifyContent: "space-between", py: 0.75 }}>
                <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, color: "text.primary" }}>{key}</Typography>
                <Typography sx={{ fontSize: "0.75rem", fontWeight: 900, bgcolor: "grey.50", px: 1, py: 0.25, borderRadius: 1 }}>
                  {count} {count === 1 ? "roll" : "rolls"}
                </Typography>
              </Stack>
            ))}
          </Box>
        </Box>
      </Popover>

      {/* Depleted Rolls Popover */}
      <Popover
        open={Boolean(depletedAnchor)}
        anchorEl={depletedAnchor}
        onClose={() => setDepletedAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        transformOrigin={{ vertical: "top", horizontal: "center" }}
        slotProps={{ paper: { sx: { borderRadius: 3, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", border: "1px solid", borderColor: "grey.100", mt: 1 } } }}
      >
        <Box sx={{ p: 2, width: 256 }}>
          <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid", borderColor: "grey.100", pb: 1, mb: 1.5 }}>
            <Typography sx={{ fontSize: "0.75rem", fontWeight: 900, textTransform: "uppercase", color: "text.secondary", letterSpacing: "0.08em" }}>
              Used / Depleted
            </Typography>
            <Chip
              label={`${totalDepletedRollsCount} total`}
              size="small"
              sx={{ fontSize: "0.625rem", fontWeight: 900, bgcolor: "grey.100", color: "text.secondary", border: "none" }}
            />
          </Stack>
          <Box sx={{ maxHeight: 192, overflowY: "auto" }}>
            {depletedRollGroups.length === 0 ? (
              <Typography sx={{ fontSize: "0.625rem", color: "text.disabled", fontStyle: "italic", py: 2, textAlign: "center" }}>
                No depleted rolls.
              </Typography>
            ) : depletedRollGroups.map(([key, count]) => (
              <Stack key={key} direction="row" sx={{ alignItems: "center", justifyContent: "space-between", py: 0.75 }}>
                <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, color: "text.primary" }}>{key}</Typography>
                <Typography sx={{ fontSize: "0.75rem", fontWeight: 900, bgcolor: "grey.50", px: 1, py: 0.25, borderRadius: 1 }}>
                  {count} {count === 1 ? "roll" : "rolls"}
                </Typography>
              </Stack>
            ))}
          </Box>
        </Box>
      </Popover>

      <AdjustDialog roll={adjustTarget} onClose={() => setAdjustTarget(null)} onDone={() => { setAdjustTarget(null); fetchData(); }} />
      <RestockDialog material={restockTarget} onClose={() => setRestockTarget(null)} onDone={() => { setRestockTarget(null); fetchData(); }} />
      {wasteTarget && (
        <WasteLogModal
          roll={wasteTarget as InventoryRollForWaste}
          isOpen={!!wasteTarget}
          onClose={() => setWasteTarget(null)}
          onSaved={() => { setWasteTarget(null); fetchData(); }}
        />
      )}
    </Box>
  );
}

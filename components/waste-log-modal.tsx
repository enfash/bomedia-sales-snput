"use client";

import { useState } from "react";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Drawer from "@mui/material/Drawer";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs from "dayjs";
import { toast } from "sonner";
import { AlertTriangle, Scissors, FileText, CalendarDays } from "lucide-react";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { WASTE_REASONS, STORAGE_KEYS } from "@/lib/constants";
export interface InventoryRollForWaste {
  "Roll ID": string;
  "Item Name": string;
  "Width (ft)": string | number;
  "Remaining Length (ft)": string | number;
  "Waste Logged (ft)": string | number;
  _rowIndex: number;
}

interface WasteLogModalProps {
  roll: InventoryRollForWaste;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function ModalBody({
  roll,
  wasteLength,
  setWasteLength,
  reason,
  setReason,
  description,
  setDescription,
  jobRef,
  setJobRef,
  date,
  setDate,
}: {
  roll: InventoryRollForWaste;
  wasteLength: string;
  setWasteLength: (v: string) => void;
  reason: string;
  setReason: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  jobRef: string;
  setJobRef: (v: string) => void;
  date: string;
  setDate: (v: string) => void;
}) {
  const remaining = parseFloat(String(roll["Remaining Length (ft)"] || "0")) || 0;
  const wasteNum = parseFloat(wasteLength) || 0;
  const afterWaste = Math.max(0, remaining - wasteNum);
  const overrun = wasteNum > remaining;

  return (
    <Stack sx={{ gap: 2.5, p: 3 }}>
      <Stack
        direction="row"
        sx={{
          alignItems: "center",
          gap: 1.5,
          p: 2,
          bgcolor: "rgba(244,63,94,0.06)",
          borderRadius: 3,
          border: "1px solid rgba(244,63,94,0.15)",
        }}
      >
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 2.5,
            bgcolor: "rgba(244,63,94,0.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Scissors size={20} color="#e11d48" />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: "0.6rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: "#e11d48" }}>
            Logging waste against
          </Typography>
          <Typography sx={{ fontSize: "0.875rem", fontWeight: 900, color: "text.primary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {roll["Roll ID"]}
          </Typography>
          <Typography sx={{ fontSize: "0.6rem", color: "text.disabled", fontWeight: 500 }}>
            {parseFloat(String(roll["Width (ft)"] || "0"))}ft wide · {remaining.toFixed(1)}ft remaining
          </Typography>
        </Box>
        <Box sx={{ textAlign: "right", flexShrink: 0 }}>
          <Typography sx={{ fontSize: "0.55rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: "text.disabled" }}>
            Prev. waste
          </Typography>
          <Typography sx={{ fontSize: "0.875rem", fontWeight: 900, color: "#e11d48" }}>
            {(parseFloat(String(roll["Waste Logged (ft)"] || "0")) || 0).toFixed(1)}ft
          </Typography>
        </Box>
      </Stack>

      <DatePicker
        label={
          <Stack direction="row" sx={{ alignItems: "center", gap: 0.5 }}>
            <CalendarDays size={12} />
            <span>Date of Waste</span>
          </Stack>
        }
        value={date ? dayjs(date) : null}
        onChange={(newVal) => setDate(newVal ? newVal.format("YYYY-MM-DD") : "")}
        slotProps={{
          textField: {
            fullWidth: true,
            sx: { "& .MuiOutlinedInput-root": { borderRadius: 3, height: 44 } }
          }
        }}
      />

      <Box>
        <TextField
          label="Waste Length (ft) *"
          type="number"
          placeholder="e.g. 2.5"
          value={wasteLength}
          onChange={(e) => setWasteLength(e.target.value)}
          fullWidth
          error={overrun}
          slotProps={{ htmlInput: { style: { fontWeight: 700, fontSize: "1.125rem", height: 44 } } }}
          sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3 } }}
        />
        {wasteNum > 0 && (
          <Stack
            direction="row"
            sx={{
              alignItems: "center",
              justifyContent: "space-between",
              p: 1.5,
              mt: 1,
              borderRadius: 3,
              bgcolor: overrun ? "rgba(244,63,94,0.06)" : "grey.50",
              color: overrun ? "#e11d48" : "text.secondary",
              fontSize: "0.75rem",
              fontWeight: 700,
            }}
          >
            {overrun ? (
              <Stack direction="row" sx={{ alignItems: "center", gap: 0.75 }}>
                <AlertTriangle size={14} />
                <span>Waste ({wasteNum.toFixed(1)}ft) exceeds remaining stock!</span>
              </Stack>
            ) : (
              <>
                <span>After this log:</span>
                <Typography sx={{ fontWeight: 900, color: "text.primary", fontSize: "0.75rem" }}>
                  {afterWaste.toFixed(1)}ft remaining
                </Typography>
              </>
            )}
          </Stack>
        )}
      </Box>

      <FormControl fullWidth>
        <InputLabel>Waste Reason *</InputLabel>
        <Select
          value={reason}
          label="Waste Reason *"
          onChange={(e) => setReason(e.target.value)}
          sx={{ borderRadius: 3, "& .MuiSelect-select": { py: 1.75, fontWeight: 700 } }}
        >
          {WASTE_REASONS.map((r) => (
            <MenuItem key={r} value={r} sx={{ fontWeight: 700 }}>
              {r}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <TextField
        label={
          <Stack direction="row" sx={{ alignItems: "center", gap: 0.5 }}>
            <FileText size={12} />
            <span>Job / Sales Reference (optional)</span>
          </Stack>
        }
        placeholder="e.g. BOM-20260430-0042 or Client Name"
        value={jobRef}
        onChange={(e) => setJobRef(e.target.value)}
        fullWidth
        slotProps={{ htmlInput: { style: { height: 44 } } }}
        sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3 } }}
      />

      <TextField
        label="Description / Notes"
        placeholder="Explain what happened — e.g. 'Ink streaking on first 2ft, re-ran head clean then continued job'"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        fullWidth
        multiline
        rows={3}
        sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3 } }}
      />
    </Stack>
  );
}

export function WasteLogModal({ roll, isOpen, onClose, onSaved }: WasteLogModalProps) {
  const isMobile = useMediaQuery("(max-width: 768px)");

  const [wasteLength, setWasteLength] = useState("");
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [jobRef, setJobRef] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setWasteLength("");
    setReason("");
    setDescription("");
    setJobRef("");
    setDate(new Date().toISOString().split("T")[0]);
  };

  const handleClose = () => { resetForm(); onClose(); };

  const handleSave = async () => {
    if (!wasteLength || !reason) {
      toast.error("Waste length and reason are required.");
      return;
    }
    const waste = parseFloat(wasteLength);
    if (isNaN(waste) || waste <= 0) {
      toast.error("Enter a valid waste length greater than 0.");
      return;
    }
    const remaining = parseFloat(String(roll["Remaining Length (ft)"] || "0")) || 0;
    if (waste > remaining) {
      toast.error(`Waste (${waste.toFixed(1)}ft) exceeds remaining stock (${remaining.toFixed(1)}ft).`);
      return;
    }

    setSaving(true);
    try {
      const invRes = await fetch("/api/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowIndex: roll._rowIndex, wasteLength: waste }),
      });
      if (!invRes.ok) {
        const j = await invRes.json();
        throw new Error(j.error || "Failed to update inventory");
      }

      const loggedBy =
        typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEYS.USER_NAME) || "Unknown" : "Unknown";

      await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          DATE: date,
          AMOUNT: "0",
          CATEGORY: "Material Waste",
          DESCRIPTION: `[WASTE] ${roll["Roll ID"]} · ${waste.toFixed(1)}ft · ${reason}${description ? ` — ${description}` : ""}`,
          "PAID TO": "—",
          "PAYMENT METHOD": "N/A",
          "RECEIPT URL": "",
          "Logged By": loggedBy,
          "JOB REF": jobRef || "—",
          "ROLL ID": roll["Roll ID"],
          "WASTE FT": waste.toFixed(2),
        }),
      });

      toast.success(`Waste logged: ${waste.toFixed(1)}ft deducted from ${roll["Roll ID"]}`);
      resetForm();
      onSaved();
    } catch (err: any) {
      toast.error(err.message || "Failed to log waste");
    } finally {
      setSaving(false);
    }
  };

  const remaining = parseFloat(String(roll["Remaining Length (ft)"] || "0")) || 0;
  const wasteNum = parseFloat(wasteLength) || 0;
  const overrun = wasteNum > 0 && wasteNum > remaining;

  const bodyProps = { roll, wasteLength, setWasteLength, reason, setReason, description, setDescription, jobRef, setJobRef, date, setDate };

  const FooterButtons = ({ drawer = false }: { drawer?: boolean }) => (
    <Stack
      direction="row"
      sx={{
        gap: 1.5,
        ...(drawer
          ? { mt: 1, px: 3, pb: 5, flexDirection: "column" }
          : { p: 3, bgcolor: "grey.50", borderTop: "1px solid", borderColor: "divider" }),
      }}
    >
      <Button
        variant="outlined"
        onClick={handleClose}
        sx={{ flex: 1, height: 48, borderRadius: 3, fontWeight: 700 }}
      >
        Cancel
      </Button>
      <Button
        disabled={saving || !wasteLength || !reason || overrun}
        onClick={handleSave}
        sx={{
          flex: 1,
          height: 48,
          borderRadius: 3,
          bgcolor: "#dc2626",
          color: "white",
          fontWeight: 900,
          boxShadow: "0 4px 14px rgba(220,38,38,0.3)",
          "&:hover": { bgcolor: "#b91c1c" },
          "&:active": { transform: "scale(0.97)" },
          "&.Mui-disabled": { bgcolor: "action.disabledBackground", color: "action.disabled", boxShadow: "none" },
        }}
      >
        {saving ? "Logging..." : "Log Waste & Deduct"}
      </Button>
    </Stack>
  );

  if (isMobile) {
    return (
      <Drawer
        anchor="bottom"
        open={isOpen}
        onClose={handleClose}
        slotProps={{
          paper: {
            sx: {
              borderTopLeftRadius: 40,
              borderTopRightRadius: 40,
              maxHeight: "92vh",
              display: "flex",
              flexDirection: "column",
            },
          },
        }}
      >
        <Box
          sx={{
            width: 48,
            height: 6,
            borderRadius: 3,
            bgcolor: "grey.200",
            mx: "auto",
            mt: 2,
            mb: 1,
            flexShrink: 0,
          }}
        />
        <Box sx={{ overflowY: "auto", flex: 1 }}>
          <Box sx={{ px: 3, pb: 1, pt: 1 }}>
            <Typography sx={{ fontSize: "1.25rem", fontWeight: 900, color: "text.primary" }}>
              Log Waste Material
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary", mt: 0.25, display: "block" }}>
              Deducts wasted length from the roll's live balance.
            </Typography>
          </Box>
          <ModalBody {...bodyProps} />
        </Box>
        <FooterButtons drawer />
      </Drawer>
    );
  }

  return (
    <Dialog
      open={isOpen}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      slotProps={{ paper: { sx: { borderRadius: 4, overflow: "hidden" } } }}
    >
      <DialogTitle
        sx={{
          p: 3,
          bgcolor: "#dc2626",
          color: "white",
          "& .MuiDialogTitle-root": { p: 0 },
        }}
      >
        <Typography sx={{ fontSize: "1.25rem", fontWeight: 900, color: "white", letterSpacing: "-0.02em" }}>
          Log Waste Material
        </Typography>
        <Typography sx={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.8)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", mt: 0.5 }}>
          Deducts wasted length from the roll's live balance.
        </Typography>
      </DialogTitle>
      <DialogContent sx={{ p: 0, maxHeight: "65vh", overflowY: "auto" }}>
        <ModalBody {...bodyProps} />
      </DialogContent>
      <DialogActions sx={{ p: 0 }}>
        <FooterButtons />
      </DialogActions>
    </Dialog>
  );
}

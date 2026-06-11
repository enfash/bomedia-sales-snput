"use client";

import { type UnifiedRecord } from "@/components/manage-sale-action";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import { ChevronRight, Printer, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { ReceiptModal } from "./receipt-modal";
import { ManageBatchAction } from "./manage-batch-action";
import { RecordCard, RecordStatus } from "./record-card";
import { toast } from "sonner";

interface BatchCardProps {
  salesId: string;
  records: UnifiedRecord[];
  onUpdate: () => void;
}

export function BatchCard({ salesId, records, onUpdate }: BatchCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [localRecords, setLocalRecords] = useState<UnifiedRecord[]>(records);

  const firstItem = localRecords[0];
  const totalAmt = localRecords.reduce((s, i) => s + i.amount, 0);
  const totalBal = localRecords.reduce((s, i) => s + (i.balance || 0), 0);

  const groupStatus = (items: UnifiedRecord[]): RecordStatus => {
    if (items.some(i => i.status === "Syncing")) return "Syncing";
    if (items.every(i => i.status === "Settled")) return "Settled";
    if (items.some(i => i.status === "Part-payment" || i.status === "Settled")) return "Part-payment";
    return "In Progress";
  };

  const status = groupStatus(localRecords);

  const handleDeleteItem = (itemId: string) => {
    setLocalRecords(prev => prev.filter(r => r.id !== itemId));
    toast.success("Item removed from batch");
  };

  const statusChipSx: Record<RecordStatus, object> = {
    Settled: { bgcolor: "#d1fae5", color: "#065f46" },
    "Part-payment": { bgcolor: "#fef3c7", color: "#92400e" },
    "In Progress": { bgcolor: "#dbeafe", color: "#1e40af" },
    Syncing: { bgcolor: "primary.light", color: "primary.contrastText", animation: "pulse 1.5s infinite" },
  };

  const handleGenerateReceipt = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsReceiptModalOpen(true);
  };

  if (!firstItem) {
    return null;
  }

  return (
    <Paper
      variant="outlined"
      sx={{
        borderRadius: 3,
        mb: 1.25,
        overflow: "hidden",
        transition: "box-shadow 0.3s, border-color 0.3s",
        boxShadow: isExpanded ? "0 0 0 1px rgba(200,71,46,0.2)" : undefined,
        borderColor: isExpanded ? "primary.light" : "grey.100",
      }}
    >
      <Box
        onClick={() => setIsExpanded(!isExpanded)}
        sx={{ p: 2.5, cursor: "pointer", "&:hover": { bgcolor: "grey.50" } }}
      >
        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", mb: 1.5 }}>
          <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
            <Box
              sx={{
                p: 0.5,
                borderRadius: 1,
                bgcolor: "grey.100",
                color: "text.secondary",
                display: "flex",
                transition: "transform 0.2s",
                transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
              }}
            >
              <ChevronRight size={16} />
            </Box>
            <Box>
              <Typography variant="caption" sx={{ fontWeight: 900, color: "primary.main", textTransform: "uppercase", letterSpacing: 1 }}>
                {firstItem.date}
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 900, color: "text.primary", lineHeight: 1.2 }}>
                {firstItem.client}
              </Typography>
              <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 500 }}>
                {salesId}
              </Typography>
            </Box>
          </Stack>
          <Chip
            label={status}
            size="small"
            sx={{ fontSize: "0.6rem", fontWeight: 900, height: 20, borderRadius: 10, ...statusChipSx[status] }}
          />
        </Stack>

        <Stack direction="row" sx={{ gap: 2, pt: 1.5, borderTop: "1px solid", borderColor: "grey.50" }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, textTransform: "uppercase", color: "text.disabled", letterSpacing: 1, display: "block", mb: 0.25 }}>
              Total Amount
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 900, color: "text.primary", fontFamily: "monospace" }}>
              ₦{totalAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </Typography>
          </Box>
          <Box sx={{ textAlign: "right" }}>
            <Typography variant="caption" sx={{ fontWeight: 700, textTransform: "uppercase", color: "error.light", letterSpacing: 1, display: "block", mb: 0.25 }}>
              Total Balance
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 900, color: "error.main", fontFamily: "monospace" }}>
              ₦{totalBal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </Typography>
          </Box>
        </Stack>

        <Stack direction="row" sx={{ mt: 1.5, alignItems: "center", justifyContent: "space-between" }}>
          <Chip
            label={`${localRecords.length} ITEMS IN BATCH`}
            size="small"
            variant="outlined"
            sx={{ fontSize: "0.6rem", fontWeight: 900, height: 20, borderRadius: 10, color: "primary.main", borderColor: "primary.light", bgcolor: "primary.50" }}
          />
          <Stack direction="row" sx={{ gap: 0.5 }} onClick={(e) => e.stopPropagation()}>
            <IconButton
              size="small"
              onClick={handleGenerateReceipt}
              sx={{ width: 32, height: 32, color: "primary.main", border: "1px solid", borderColor: "primary.light" }}
            >
              <Printer size={16} />
            </IconButton>
            <ManageBatchAction records={localRecords} salesId={salesId} onUpdate={onUpdate} />
          </Stack>
        </Stack>
      </Box>

      {isExpanded && (
        <Box sx={{ bgcolor: "grey.50", p: 1.5, borderTop: "1px solid", borderColor: "grey.100" }}>
          <Stack sx={{ gap: 1 }}>
            {localRecords.map((r, idx) => (
              <Stack key={r.id || idx} direction="row" sx={{ alignItems: "flex-start", gap: 1 }}>
                <Box sx={{ flex: 1 }}>
                  <RecordCard
                    date={r.date}
                    type={r.type}
                    client={r.client}
                    description={r.description}
                    amount={`₦${r.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                    status={r.status}
                    isPending={r.isPending}
                    record={r}
                    onUpdate={onUpdate}
                    allSalesContext={localRecords}
                  />
                </Box>
                <IconButton
                  size="small"
                  onClick={() => handleDeleteItem(r.id)}
                  title="Remove from batch"
                  sx={{ width: 32, height: 32, color: "error.main", mt: 1, flexShrink: 0, "&:hover": { bgcolor: "error.50" } }}
                >
                  <Trash2 size={16} />
                </IconButton>
              </Stack>
            ))}
          </Stack>
        </Box>
      )}

      <ReceiptModal
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        records={localRecords}
        salesId={salesId}
      />
    </Paper>
  );
}

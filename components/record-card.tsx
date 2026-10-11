"use client";

import { accent, recordCardStyles as styles } from "@/app/theme";
import {
  ManageSaleAction,
  type UnifiedRecord,
} from "@/components/manage-sale-action";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import { MoreHorizontal, Printer } from "lucide-react";
import { MaterialBadge } from "./material-badge";
import { useState } from "react";
import { ReceiptModal } from "./receipt-modal";
import { WhatsAppReminder } from "./whatsapp-reminder";
import { useSyncStore } from "@/lib/store";
import { describeBalance } from "@/lib/balance-display";

export type RecordStatus =
  | "Settled"
  | "Part-payment"
  | "In Progress"
  | "Syncing";

interface RecordCardProps {
  date: string;
  type: string;
  client: string;
  description: string;
  amount: string;
  status: RecordStatus;
  isPending?: boolean;
  record?: UnifiedRecord;
  onUpdate?: () => void;
  allSalesContext?: UnifiedRecord[];
}

export function RecordCard({
  date,
  type,
  client,
  description,
  amount,
  status,
  isPending,
  record,
  onUpdate,
  allSalesContext,
}: RecordCardProps) {
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const { pendingQueue } = useSyncStore();
  const [batchRecords, setBatchRecords] = useState<UnifiedRecord[]>([]);

  const jobStatusChipSx = (jobStatus: string) => {
    if (jobStatus === "Printing") return styles.job.printing;
    if (jobStatus === "Finishing" || jobStatus === "In Progress") return styles.job.working;
    if (jobStatus === "Ready") return styles.job.ready;
    if (jobStatus === "Delivered" || jobStatus === "Completed") return styles.job.done;
    return styles.job.waiting;
  };

  const handleGenerateReceipt = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!record || record.type !== "Sale") return;

    const salesId = String(record.salesId || "").trim();

    if (salesId) {
      const fromContext = (allSalesContext || []).filter(
        (s) => String(s.salesId || "").trim() === salesId && s.type === "Sale"
      );

      const fromPending: UnifiedRecord[] = pendingQueue
        .filter((item) => item.type === "sale" && item.data?.[22] === salesId)
        .map((item) => {
          const v = item.data;
          return {
            id: `pending-${item.id}`,
            date: v[0] || record.date,
            type: "Sale" as const,
            client: v[1] || record.client,
            contact: v[3] || record.contact || "",
            description: v[2] || record.description,
            amount: parseFloat(v[14] || "0"),
            status: "Syncing" as RecordStatus,
            loggedBy: v[21] || record.loggedBy,
            isPending: true,
            balance: 0,
            salesId,
            material: v[4] || "",
            raw: { QTY: String(v[12] ?? "") },
          } as UnifiedRecord;
        });

      const contextIds = new Set(fromContext.map((r) => r.id));
      const merged = [
        ...fromContext,
        ...fromPending.filter((r) => !contextIds.has(r.id)),
      ];

      setBatchRecords(merged.length > 0 ? merged : [record]);
    } else {
      setBatchRecords([record]);
    }

    setIsReceiptModalOpen(true);
  };

  let rollSize = "";
  let sqft = 0;
  let qty = 0;

  if (record?.raw) {
    const sizes = ["3FT", "4FT", "5FT", "6FT", "7FT", "8FT", "10FT", "custom"];
    for (const size of sizes) {
      if (record.raw[size]) {
        const val = parseFloat(record.raw[size]);
        if (val > 0) {
          rollSize = size === "custom" ? "Custom" : size;
          sqft = val;
          break;
        }
      }
    }
    if (record.raw["QTY"]) {
      qty = parseFloat(record.raw["QTY"]) || 0;
    }
  }

  let displayDescription = description;
  let extractedDimension = "";

  if (description) {
    const dimMatch = description.match(/ \[(.*?)\]$/);
    if (dimMatch) {
      extractedDimension = dimMatch[1];
      displayDescription = description.substring(0, dimMatch.index).trim();
    }
  }

  const isExpense = type === "Expense";
  const edgeSx = isPending ? styles.edgePending : isExpense ? styles.edgeExpense : styles.edgeSale;

  return (
    <Paper
      variant="outlined"
      sx={[styles.card, isPending ? styles.cardPending : false, styles.edge, edgeSx]}
    >
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", mb: 1.5, pb: 1.5, borderBottom: "1px solid", borderColor: "grey.50" }}>
        <Box>
          <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary", display: "block", lineHeight: 1, mb: 1.5 }}>
            {date}
          </Typography>
          <Typography variant="caption" sx={{ fontWeight: 700, textTransform: "uppercase", color: "text.secondary", display: "block", lineHeight: 1, mb: 0.5, letterSpacing: 1 }}>
            Amount
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 900, color: "text.primary", lineHeight: 1, fontFamily: "monospace" }}>
            ₦{amount.replace("₦", "").trim()}
          </Typography>
        </Box>
        <Box sx={{ textAlign: "right" }}>
          <Typography variant="caption" sx={{ fontWeight: 700, textTransform: "uppercase", color: "text.secondary", display: "block", lineHeight: 1, mb: 0.5, letterSpacing: 1 }}>
            Difference
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 900, color: record?.type === "Sale" ? describeBalance(record.balance, false, !!record.raw?._jobId).color : "text.disabled", lineHeight: 1, fontFamily: "monospace" }}>
            {record?.type === "Sale" ? describeBalance(record.balance, false, !!record.raw?._jobId).label : "—"}
          </Typography>
        </Box>
      </Stack>

      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary", textTransform: "uppercase", letterSpacing: 1, display: "block", lineHeight: 1, mb: 0.25 }}>
              Client/Payee
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700, color: "text.primary" }}>
              {client}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>Description:</Box>{" "}
              {displayDescription}
            </Typography>
            {rollSize && sqft > 0 && (
              <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary", display: "block", mt: 0.5 }}>
                Roll: <Box component="span" sx={{ fontFamily: "monospace" }}>{rollSize}</Box> ({extractedDimension ? <Box component="span" sx={{ fontFamily: "monospace" }}>{extractedDimension}</Box> : <Box component="span" sx={{ fontFamily: "monospace" }}>{sqft} sqft</Box>}) • Qty: <Box component="span" sx={{ fontFamily: "monospace" }}>{qty}</Box>
              </Typography>
            )}
          </Box>
        </Box>

        <Stack sx={{ alignItems: "flex-end", gap: 1 }}>
          <Stack direction="row" sx={{ flexWrap: "wrap", justifyContent: "flex-end", gap: 0.5 }}>
            {record?.type === "Sale" && record?.material && (
              <MaterialBadge material={record.material} />
            )}
            {record?.type === "Sale" && record?.jobStatus && (
              <Chip
                label={record.jobStatus}
                size="small"
                sx={[styles.chip, jobStatusChipSx(record.jobStatus)]}
              />
            )}
            <Chip
              label={status}
              size="small"
              sx={[styles.chip, styles.status[status] ?? styles.job.waiting]}
            />
          </Stack>

          <Stack direction="row" sx={{ alignItems: "center", gap: 0.5 }}>
            {record?.type === "Sale" && (
              <WhatsAppReminder
                clientName={record.client || client}
                contact={record.contact || ""}
                balance={record.balance || 0}
                jobDescription={displayDescription}
                variant="full"
              />
            )}
            {record?.type === "Sale" && (
              <IconButton
                size="small"
                onClick={handleGenerateReceipt}
                title="Download PDF Receipt"
                sx={{ width: 32, height: 32, color: "text.secondary", border: "1px solid", borderColor: "grey.200", "&:hover": { color: accent } }}
              >
                <Printer size={16} />
              </IconButton>
            )}

            {record && onUpdate ? (
              <ManageSaleAction
                record={record}
                onUpdate={onUpdate}
                variant="button"
              />
            ) : (
              <IconButton
                size="small"
                sx={{ width: 32, height: 32, color: "text.disabled" }}
              >
                <MoreHorizontal size={16} />
              </IconButton>
            )}
          </Stack>
        </Stack>
      </Stack>
      <ReceiptModal
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        records={batchRecords.length > 0 ? batchRecords : record ? [record] : []}
        salesId={record?.salesId}
      />
    </Paper>
  );
}

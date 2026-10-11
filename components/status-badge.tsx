import Chip from "@mui/material/Chip";
import { CheckCircle2, Clock } from "lucide-react";
import { RECORD_STATUSES } from "@/lib/constants";
import { statusBadgeStyles as styles, toneNeutralPill } from "@/app/theme";

export type StatusBadgeVariant = "sales" | "expenses";

interface StatusBadgeProps {
  status: string;
  variant?: StatusBadgeVariant;
}

const SALE_TONE: Record<string, keyof typeof styles.tone> = {
  [RECORD_STATUSES.SETTLED]: "success",
  [RECORD_STATUSES.PART_PAYMENT]: "warning",
  [RECORD_STATUSES.IN_PROGRESS]: "info",
  [RECORD_STATUSES.SYNCING]: "error",
  // Fallback for raw "Paid"/"Unpaid" in sales context
  [RECORD_STATUSES.PAID]: "success",
  [RECORD_STATUSES.UNPAID]: "error",
};

export function StatusBadge({ status, variant = "sales" }: StatusBadgeProps) {
  if (variant === "expenses") {
    const isPaid = status === RECORD_STATUSES.PAID;
    return (
      <Chip
        icon={isPaid ? <CheckCircle2 size={12} /> : <Clock size={12} />}
        label={isPaid ? "Paid" : "Unpaid"}
        size="small"
        sx={[styles.expense, isPaid ? styles.tone.success : styles.tone.error]}
      />
    );
  }

  // Sales/Records style
  const tone = SALE_TONE[status];
  return (
    <Chip
      label={status}
      size="small"
      sx={[styles.sale, tone ? styles.tone[tone] : toneNeutralPill, status === RECORD_STATUSES.SYNCING && styles.pulse]}
    />
  );
}

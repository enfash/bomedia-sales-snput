import Chip from "@mui/material/Chip";
import { CheckCircle2, Clock } from "lucide-react";
import { RECORD_STATUSES } from "@/lib/constants";

export type StatusBadgeVariant = "sales" | "expenses";

interface StatusBadgeProps {
  status: string;
  variant?: StatusBadgeVariant;
}

export function StatusBadge({ status, variant = "sales" }: StatusBadgeProps) {
  if (variant === "expenses") {
    const isPaid = status === RECORD_STATUSES.PAID;
    return (
      <Chip
        icon={isPaid ? <CheckCircle2 size={12} /> : <Clock size={12} />}
        label={isPaid ? "Paid" : "Unpaid"}
        size="small"
        sx={{
          bgcolor: isPaid 
            ? (theme) => theme.palette.mode === "dark" ? "rgba(46, 125, 91, 0.2)" : "#d1fae5"
            : (theme) => theme.palette.mode === "dark" ? "rgba(192, 57, 43, 0.2)" : "#fee2e2",
          color: isPaid 
            ? (theme) => theme.palette.mode === "dark" ? "#6ee7b7" : "#065f46"
            : (theme) => theme.palette.mode === "dark" ? "#fca5a5" : "#991b1b",
          fontWeight: 800, fontSize: "0.6875rem", height: 22,
          "& .MuiChip-icon": { color: "inherit" },
        }}
      />
    );
  }

  // Sales/Records style
  const styles: Record<string, { bgcolor: string; color: string }> = {
    [RECORD_STATUSES.SETTLED]:      { bgcolor: "#d1fae5", color: "#065f46" },
    [RECORD_STATUSES.PART_PAYMENT]: { bgcolor: "#fef3c7", color: "#92400e" },
    [RECORD_STATUSES.IN_PROGRESS]:  { bgcolor: "#dbeafe", color: "#1e40af" },
    [RECORD_STATUSES.SYNCING]:      { bgcolor: "#fee2e2", color: "#991b1b" },
    // Fallback for raw "Paid"/"Unpaid" in sales context
    [RECORD_STATUSES.PAID]:         { bgcolor: "#d1fae5", color: "#065f46" },
    [RECORD_STATUSES.UNPAID]:       { bgcolor: "#fee2e2", color: "#991b1b" },
  };

  const s = styles[status] || { bgcolor: "#f3f4f6", color: "#374151" };
  
  return (
    <Chip
      label={status}
      size="small"
      sx={{
        bgcolor: s.bgcolor, color: s.color, fontWeight: 700,
        fontSize: "0.625rem", height: 20, borderRadius: 99,
        ...(status === RECORD_STATUSES.SYNCING && { animation: "pulse 2s infinite" }),
      }}
    />
  );
}

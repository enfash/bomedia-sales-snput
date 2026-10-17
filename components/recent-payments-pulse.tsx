import { useState } from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { formatDistanceToNow } from "date-fns";
import { Activity, ArrowRight, CircleDollarSign, User, TrendingDown, Layers, ChevronDown, ChevronUp } from "lucide-react";
import { parseAmount } from "@/lib/financial-utils";
import { avatarTone } from "@/lib/avatar-tone";
import { paymentTypeStyles, pulseStyles as styles } from "@/app/theme";

// Colours live in the theme (paymentTypeStyles); this only maps a payment type to a tone and a label.
const PAYMENT_TYPE_STYLES: Record<string, { tone: keyof typeof paymentTypeStyles; label: string }> = {
  "Initial Payment":      { tone: "initial", label: "Initial" },
  "Additional Payment 1": { tone: "addl1", label: "Addl. 1" },
  "Additional Payment 2": { tone: "addl2", label: "Addl. 2" },
  "Settlement":           { tone: "settlement", label: "Settlement" },
  "Rounding":             { tone: "rounding", label: "Rounding" },
  "Lump Sum":             { tone: "lumpSum", label: "Lump Sum" },
};

/**
 * A lump sum split across several jobs (or into a Settlement + Rounding pair
 * on one job) writes one Payments row per allocation, all sharing a BATCH ID.
 * Left ungrouped, that reads as several disconnected payments instead of the
 * one collection it actually was — merge each batch into a single entry for
 * the true total, keeping the individual rows for an expandable breakdown.
 */
function groupByBatch(payments: any[]): any[] {
  const batchGroups = new Map<string, any[]>();
  const merged: any[] = [];

  payments.forEach((p) => {
    const batchId = (p["BATCH ID"] || "").toString().trim();
    if (!batchId) {
      merged.push(p);
      return;
    }
    if (!batchGroups.has(batchId)) batchGroups.set(batchId, []);
    batchGroups.get(batchId)!.push(p);
  });

  batchGroups.forEach((group) => {
    if (group.length === 1) {
      merged.push(group[0]);
      return;
    }
    const batchTotal = parseAmount(group[0]["BATCH TOTAL"]) || group.reduce((s, p) => s + parseAmount(p["AMOUNT"]), 0);
    merged.push({
      ...group[0],
      AMOUNT: batchTotal,
      "PAYMENT TYPE": "Lump Sum",
      NOTES: "",
      _subPayments: group,
    });
  });

  return merged;
}

function getPaymentStyle(type: string) {
  const known = PAYMENT_TYPE_STYLES[type];
  return {
    sx: paymentTypeStyles[known?.tone ?? "settlement"],
    label: known?.label ?? (type || "Payment"),
  };
}

function getInitials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function RecentPaymentsPulse({ payments }: { payments: any[] }) {
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());
  const toggleBatch = (id: string) =>
    setExpandedBatches(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const sortedPayments = groupByBatch(payments).sort((a, b) => {
    const timeA = new Date(a.TIMESTAMP || a.Timestamp).getTime();
    const timeB = new Date(b.TIMESTAMP || b.Timestamp).getTime();
    return timeB - timeA;
  });

  const recent = sortedPayments.slice(0, 6);
  const hasData = recent.length > 0;

  return (
    <Card sx={styles.card}>
      <Box sx={styles.header}>
        <Box sx={styles.headerIcon}>
          <Activity size={16} />
        </Box>
        <Box>
          <Typography variant="h6" component="h3">Recent Payments Pulse</Typography>
          <Typography variant="overline" color="text.secondary" sx={styles.block}>Latest Incoming Cash</Typography>
        </Box>
      </Box>

      <CardContent sx={styles.content}>
        {!hasData ? (
          <Stack sx={styles.empty}>
            <Box sx={styles.emptyIcon}>
              <CircleDollarSign size={24} />
            </Box>
            <Typography variant="h6" component="p" color="text.secondary">
              No recent payments.
            </Typography>
            <Typography variant="caption" color="text.disabled" sx={styles.block}>
              Payments will appear here when logged.
            </Typography>
          </Stack>
        ) : (
          <Box>
            {recent.map((payment, idx) => {
              const amount        = parseAmount(payment.AMOUNT || payment.Amount);
              const balanceBefore = parseAmount(payment["BALANCE BEFORE"] || payment["Balance Before"]);
              const balanceAfter  = parseAmount(payment["BALANCE AFTER"]  || payment["Balance After"]);
              const clientName    = (payment["CLIENT NAME"] || payment["Client Name"] || "Unknown").trim();
              const collectedBy   = payment["COLLECTED BY"] || payment["Collected By"] || "";
              const notes         = payment["NOTES"] || payment["Notes"] || "";
              const salesId       = payment["SALES ID"] || payment["Sales Id"] || "";
              const type          = payment["PAYMENT TYPE"] || payment["Payment Type"] || "Payment";
              const dateStr       = payment.TIMESTAMP || payment.Timestamp;
              const date          = dateStr ? new Date(dateStr) : null;
              const timeAgo       = date ? formatDistanceToNow(date, { addSuffix: true }) : "Unknown time";
              const style         = getPaymentStyle(type);
              const debtDropped   = balanceBefore > 0 && balanceAfter < balanceBefore;
              const subPayments: any[] | undefined = payment._subPayments;
              const rowKey        = payment["PAYMENT ID"] || idx;

              return (
                <Box key={payment["PAYMENT ID"] || idx} sx={styles.row}>
                  <Box sx={styles.top}>
                    <Box sx={styles.who}>
                      <Box sx={[styles.avatar, { bgcolor: avatarTone(clientName) }]}>
                        {getInitials(clientName) || <User size={16} />}
                      </Box>
                      <Box sx={styles.minZero}>
                        <Typography variant="h6" component="p" noWrap>
                          {clientName}
                        </Typography>
                        <Box component="span" sx={[styles.typeChip, style.sx]}>
                          {style.label}
                        </Box>
                      </Box>
                    </Box>

                    <Typography variant="body2" sx={styles.amount}>
                      +₦{amount.toLocaleString()}
                    </Typography>
                  </Box>

                  {subPayments ? (
                    <Box sx={[styles.indent, { mt: 1 }]}>
                      <ButtonBase
                        onClick={() => toggleBatch(String(rowKey))}
                        aria-expanded={expandedBatches.has(String(rowKey))}
                        sx={styles.batchToggle}
                      >
                        <Layers size={12} />
                        <Typography variant="caption" component="span" sx={{ fontWeight: 700 }}>
                          {expandedBatches.has(String(rowKey)) ? "Hide" : "Show"} {subPayments.length} allocations
                        </Typography>
                        {expandedBatches.has(String(rowKey)) ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </ButtonBase>

                      {expandedBatches.has(String(rowKey)) && (
                        <Box sx={styles.subList}>
                          {subPayments.map((sub, subIdx) => {
                            const subAmount = parseAmount(sub["AMOUNT"]);
                            const subBefore = parseAmount(sub["BALANCE BEFORE"]);
                            const subAfter = parseAmount(sub["BALANCE AFTER"]);
                            const subType = sub["PAYMENT TYPE"] || "Payment";
                            const subSalesId = sub["SALES ID"] || "";
                            const subStyle = getPaymentStyle(subType);
                            return (
                              <Box key={sub["PAYMENT ID"] || subIdx} sx={styles.subRow}>
                                <Box sx={styles.who}>
                                  <Box component="span" sx={[styles.subChip, subStyle.sx]}>
                                    {subStyle.label}
                                  </Box>
                                  <Typography variant="caption" sx={styles.subText}>
                                    {subSalesId} · ₦{subBefore.toLocaleString()} → {subAfter <= 0 ? "Cleared" : `₦${subAfter.toLocaleString()}`}
                                  </Typography>
                                </Box>
                                <Typography variant="caption" sx={[styles.amount, { fontSize: "0.75rem" }]}>
                                  +₦{subAmount.toLocaleString()}
                                </Typography>
                              </Box>
                            );
                          })}
                        </Box>
                      )}
                    </Box>
                  ) : (balanceBefore > 0 || balanceAfter >= 0) && (
                    <Box sx={[styles.debtRow, styles.indent]}>
                      <Box component="span" sx={styles.iconMuted}><TrendingDown size={12} /></Box>
                      <Typography variant="caption" color="text.secondary">Debt:</Typography>
                      <Typography variant="caption" color="error.main" sx={[styles.mono, { fontWeight: 700 }]}>
                        ₦{balanceBefore.toLocaleString()}
                      </Typography>
                      <Box component="span" sx={styles.iconMuted}><ArrowRight size={10} /></Box>
                      <Typography variant="caption" color={balanceAfter <= 0 ? "success.main" : "warning.dark"} sx={[styles.mono, { fontWeight: 700 }]}>
                        {balanceAfter <= 0 ? "Cleared" : `₦${balanceAfter.toLocaleString()}`}
                      </Typography>
                    </Box>
                  )}

                  {notes && notes !== `Logged via Manage Sale Action` && (
                    <Typography variant="caption" sx={[styles.notes, styles.indent]} noWrap>
                      "{notes}"
                    </Typography>
                  )}

                  <Box sx={[styles.meta, styles.indent]}>
                    {collectedBy && (
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                        By {collectedBy}
                      </Typography>
                    )}
                    {collectedBy && (
                      <Typography variant="caption" color="text.disabled">·</Typography>
                    )}
                    <Typography variant="caption" color="text.secondary">{timeAgo}</Typography>
                    {!subPayments && salesId && (
                      <>
                        <Typography variant="caption" color="text.disabled">·</Typography>
                        <Typography variant="caption" color="text.disabled" sx={styles.mono}>{salesId}</Typography>
                      </>
                    )}
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

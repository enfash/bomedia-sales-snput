"use client";

import { useState, useMemo } from "react";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { Wallet, CheckCircle2 } from "lucide-react";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import DialogActions from "@mui/material/DialogActions";
import IconButton from "@mui/material/IconButton";
import { toast } from "sonner";
import { type UnifiedRecord } from "@/components/manage-sale-action";
import { computeWaterfall } from "@/lib/financial-utils";
import { useSyncStore } from "@/lib/store";

interface ManageBatchActionProps {
  records: UnifiedRecord[];
  salesId: string;
  onUpdate: () => void;
  variant?: "icon" | "button";
}

export function ManageBatchAction({ records, salesId, onUpdate, variant = "button" }: ManageBatchActionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentInput, setPaymentInput] = useState("");
  const isMobile = useMediaQuery("(max-width: 768px)");

  const grandTotal = records.reduce((s, r) => s + (r.amount ?? 0), 0);
  const totalBalance = records.reduce((s, r) => s + (r.balance ?? 0), 0);
  const totalPaid = grandTotal - totalBalance;

  const lumpSum = parseFloat(paymentInput) || 0;

  const preview = useMemo(
    () => (lumpSum > 0 ? computeWaterfall(records, lumpSum) : []),
    [records, lumpSum]
  );

  const handleSubmit = async () => {
    if (lumpSum <= 0) return;
    const steps = computeWaterfall(records, lumpSum);
    if (steps.length === 0) {
      toast.error("No eligible unpaid items to apply payment to.");
      return;
    }

    setIsSubmitting(true);
    let allOk = true;

    const isOnline = typeof window !== "undefined" ? navigator.onLine : true;

    if (isOnline) {
      for (const step of steps) {
        const payload: Record<string, any> = {
          rowIndex: step.record.rowIndex,
        };
        if (step.slot === 1) payload.additionalPayment1 = step.toApply;
        else if (step.slot === 2) payload.additionalPayment2 = step.toApply;

        try {
          const res = await fetch("/api/sales", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!res.ok) {
            const err = await res.json();
            toast.error(`Failed for ${step.record.client}: ${err.error || "Unknown error"}`);
            allOk = false;
            break;
          }

          try {
            const loggedBy = localStorage.getItem("userName") || "System";
            await fetch("/api/payments", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                salesId: step.record.salesId || step.record.id || '',
                clientName: step.record.client || '',
                amount: step.toApply,
                paymentType: step.slot === 1 ? 'Additional Payment 1' : 'Additional Payment 2',
                balanceBefore: step.record.balance || 0,
                balanceAfter: Math.max(0, (step.record.balance || 0) - step.toApply),
                collectedBy: loggedBy,
                notes: `Logged via Batch Payment distribution (${salesId})`
              })
            });
          } catch (e) {
            console.error("Failed to log payment event", e);
          }
        } catch {
          toast.error("Network error — some payments may not have been saved.");
          allOk = false;
          break;
        }
      }
    } else {
      const loggedBy = localStorage.getItem("userName") || "System";

      steps.forEach((step) => {
        const payload: Record<string, any> = {
          rowIndex: step.record.rowIndex,
        };
        if (step.slot === 1) payload.additionalPayment1 = step.toApply;
        else if (step.slot === 2) payload.additionalPayment2 = step.toApply;

        const paymentPayload = {
          salesId: step.record.salesId || step.record.id || '',
          clientName: step.record.client || '',
          amount: step.toApply,
          paymentType: step.slot === 1 ? 'Additional Payment 1' : 'Additional Payment 2',
          balanceBefore: step.record.balance || 0,
          balanceAfter: Math.max(0, (step.record.balance || 0) - step.toApply),
          collectedBy: loggedBy,
          notes: `Logged via Offline Batch Payment distribution (${salesId})`
        };

        useSyncStore.getState().addPendingEntry("payment", {
          salesUpdate: payload,
          paymentLog: paymentPayload,
        });
      });

      toast.success(`Batch payment of ₦${lumpSum.toLocaleString()} saved locally. Syncing will run in background.`);
    }

    setIsSubmitting(false);
    if (allOk) {
      if (isOnline) {
        toast.success(`Payment of ₦${lumpSum.toLocaleString()} distributed successfully!`);
      }
      setPaymentInput("");
      setIsOpen(false);
      onUpdate();
    }
  };

  const trigger = variant === "icon" ? (
    <IconButton
      size="small"
      onClick={() => setIsOpen(true)}
      title="Pay Batch"
      sx={{ color: "primary.main", "&:hover": { bgcolor: "primary.main", color: "white" } }}
    >
      <Wallet size={16} />
    </IconButton>
  ) : (
    <Button
      onClick={() => setIsOpen(true)}
      variant="outlined"
      size="small"
      sx={{
        height: 28,
        px: 1.5,
        borderRadius: 2,
        fontSize: "0.625rem",
        fontWeight: 900,
        letterSpacing: "0.08em",
        borderColor: "primary.main",
        color: "primary.main",
        whiteSpace: "nowrap",
        minWidth: "max-content",
        "&:hover": { bgcolor: "primary.main", color: "primary.contrastText" },
      }}
      startIcon={<Wallet style={{ width: 12, height: 12 }} />}
    >
      Pay Batch
    </Button>
  );

  const summaryCards = [
    { label: "Grand Total", value: grandTotal, color: "text.primary" },
    { label: "Paid", value: totalPaid, color: "success.main" },
    { label: "Remaining", value: totalBalance, color: "error.main" },
  ];

  const body = (
    <Box sx={{ p: 3, display: "flex", flexDirection: "column", gap: 2.5 }}>
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1.5 }}>
        {summaryCards.map((m) => (
          <Box key={m.label} sx={{ bgcolor: "grey.100", borderRadius: 2.5, p: 1.5 }}>
            <Typography sx={{ fontSize: "0.5625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "text.secondary", mb: 0.5 }}>
              {m.label}
            </Typography>
            <Typography sx={{ fontSize: "0.875rem", fontWeight: 900, color: m.color }}>
              ₦{m.value.toLocaleString(undefined, { minimumFractionDigits: 0 })}
            </Typography>
          </Box>
        ))}
      </Box>

      {totalBalance <= 0 ? (
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1, p: 2, bgcolor: "success.light", borderRadius: 2.5, border: "1px solid", borderColor: "success.light" }}>
          <CheckCircle2 style={{ width: 16, height: 16 }} />
          <Typography sx={{ fontSize: "0.875rem", fontWeight: 900, color: "success.dark", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            All items fully paid
          </Typography>
        </Box>
      ) : (
        <>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
            <Typography sx={{ fontSize: "0.625rem", textTransform: "uppercase", fontWeight: 900, color: "text.secondary", letterSpacing: "0.08em" }}>
              Lump-Sum Payment (₦)
            </Typography>
            <TextField
              type="number"
              placeholder="Enter total payment amount"
              value={paymentInput}
              onChange={(e) => setPaymentInput(e.target.value)}
              fullWidth
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3, fontWeight: 700 } }}
            />
            {lumpSum > totalBalance && (
              <Typography sx={{ fontSize: "0.625rem", color: "success.main", fontWeight: 700, display: "flex", alignItems: "center", gap: 0.5 }}>
                <CheckCircle2 style={{ width: 12, height: 12 }} />
                Overpayment of ₦{(lumpSum - totalBalance).toLocaleString()} will be applied as credit.
              </Typography>
            )}
          </Box>

          {preview.length > 0 && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <Typography sx={{ fontSize: "0.625rem", textTransform: "uppercase", fontWeight: 900, color: "text.secondary", letterSpacing: "0.08em" }}>
                Distribution Preview
              </Typography>
              <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2.5, overflow: "hidden" }}>
                {preview.map((step, idx) => (
                  <Box
                    key={step.record.id}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      px: 2,
                      py: 1.5,
                      bgcolor: "background.paper",
                      borderBottom: idx < preview.length - 1 ? "1px solid" : "none",
                      borderColor: "divider",
                    }}
                  >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
                      <Box
                        sx={{
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          bgcolor: "primary.main",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <Typography sx={{ fontSize: "0.5625rem", fontWeight: 900, color: "primary.contrastText" }}>
                          {idx + 1}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, color: "text.primary", lineHeight: 1 }}>
                          {step.record.description}
                        </Typography>
                        <Typography sx={{ fontSize: "0.625rem", color: "text.secondary", mt: 0.5 }}>
                          Slot {step.slot}
                        </Typography>
                      </Box>
                    </Box>
                    <Typography sx={{ fontSize: "0.875rem", fontWeight: 900, color: "success.main" }}>
                      +₦{step.toApply.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </>
      )}
    </Box>
  );

  const footer = (drawer?: boolean) => (
    <Box
      sx={
        drawer
          ? { display: "flex", flexDirection: "column", gap: 1.5, mt: 2, px: 3, pb: 3 }
          : { display: "flex", gap: 1.5, p: 3, bgcolor: "grey.50", borderTop: "1px solid", borderColor: "divider" }
      }
    >
      <Button
        variant="outlined"
        onClick={() => setIsOpen(false)}
        sx={{ flex: 1, height: 48, borderRadius: 3, fontWeight: 700 }}
      >
        Cancel
      </Button>
      <Button
        variant="contained"
        disabled={isSubmitting || (totalBalance <= 0 && lumpSum <= 0)}
        onClick={handleSubmit}
        sx={{ flex: 1, height: 48, borderRadius: 3, fontWeight: 900 }}
      >
        {isSubmitting ? "Processing…" : lumpSum > 0 ? "Apply Payment" : totalBalance <= 0 ? "All Paid" : "Review"}
      </Button>
    </Box>
  );

  if (isMobile) {
    return (
      <>
        {trigger}
        <Dialog
          fullScreen
          open={isOpen}
          onClose={() => setIsOpen(false)}

          slotProps={{
            paper: {
              sx: {
                mt: "10vh",
                borderTopLeftRadius: 32,
                borderTopRightRadius: 32,
                bgcolor: "background.default",
                display: "flex",
                flexDirection: "column",
              }
            }
          }}
          sx={{
            "& .MuiDialog-container": {
              alignItems: "flex-end",
            }
          }}
        >
          <Box sx={{ width: 48, height: 6, borderRadius: 3, bgcolor: "divider", mx: "auto", mt: 2, mb: 2, flexShrink: 0 }} />
          <Box sx={{ flex: 1, overflowY: "auto" }}>
            <Box sx={{ px: 3, pb: 1 }}>
              <Typography sx={{ fontSize: "1.125rem", fontWeight: 900, color: "text.primary" }}>
                Batch Payment
              </Typography>
              <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mt: 0.5 }}>
                {salesId}
              </Typography>
            </Box>
            {body}
          </Box>
          {footer(true)}
        </Dialog>
      </>
    );
  }

  return (
    <>
      {trigger}
      <Dialog
      open={isOpen}
      onClose={() => setIsOpen(false)}
      slotProps={{ paper: { sx: { borderRadius: 4, maxWidth: 448, width: "100%", p: 0 } } }}
    >
      <DialogTitle sx={{ bgcolor: "primary.main", color: "primary.contrastText", borderRadius: "16px 16px 0 0", pb: 2 }}>
        <Typography sx={{ fontSize: "1.25rem", fontWeight: 900, color: "primary.contrastText" }}>
          Batch Payment
        </Typography>
        <Typography sx={{ fontSize: "0.75rem", color: "primary.contrastText", opacity: 0.7, mt: 0.5 }}>
          {salesId} · {records.length} item{records.length !== 1 ? "s" : ""}
        </Typography>
      </DialogTitle>
      <DialogContent sx={{ p: 0 }}>
        {body}
      </DialogContent>
      <DialogActions sx={{ p: 0 }}>
        {footer()}
      </DialogActions>
    </Dialog>
    </>
  );
}

"use client";

import { useState, useMemo } from "react";
import { useSyncStore } from "@/lib/store";
import { parseAmount, computeWaterfall } from "@/lib/financial-utils";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { Wallet, ChevronRight, CheckCircle2, AlertCircle, User, Loader2 } from "lucide-react";
import { toast } from "sonner";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import { type UnifiedRecord } from "@/components/manage-sale-action";

interface DebtorPaymentModalProps {
  clientName: string | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
  theme?: "brand" | "amber";
}

const mapSale = (r: any): UnifiedRecord => {
  const amount      = parseAmount(r["AMOUNT (₦)"]          || r["Amount (₦)"]);
  const initialPay  = parseAmount(r["INITIAL PAYMENT (₦)"] || r["Initial Payment (₦)"]);
  const addl1       = parseAmount(r["ADDITIONAL PAYMENT 1"] || r["Additional Payment 1"]);
  const addl2       = parseAmount(r["ADDITIONAL PAYMENT 2"] || r["Additional Payment 2"]);
  const balance     = Math.max(0, amount - initialPay - addl1 - addl2);
  return {
    id: `sale-${r.DATE}-${r["CLIENT NAME"]}-${r._rowIndex}`,
    date: r.DATE || r.Date || "N/A",
    type: "Sale",
    client: r["CLIENT NAME"] || r["Client Name"] || "N/A",
    description: r["JOB DESCRIPTION"] || r["Job Description"] || "—",
    amount,
    status: balance <= 0 ? "Settled" : "Part-payment",
    loggedBy: r["Logged By"] || "Unknown",
    isPending: false,
    rowIndex: r._rowIndex ? parseInt(r._rowIndex.toString()) : undefined,
    jobStatus: r["JOB STATUS"] || r["Job Status"] || "Quoted",
    material: r["Material"] || r["MATERIAL"] || r["material"] || "",
    balance,
    additionalPayment1: addl1,
    additionalPayment2: addl2,
    salesId: r["SALES ID"] || r["Sales ID"] || "",
    raw: r
  };
};

export function DebtorPaymentModal({ clientName, isOpen, onClose, onUpdate, theme = "brand" }: DebtorPaymentModalProps) {
  const { cachedSales, pendingQueue } = useSyncStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentInput, setPaymentInput] = useState("");
  const isMobile = useMediaQuery("(max-width: 768px)");

  const primaryColor = theme === "brand" ? "#3b56c8" : "#C0392B";

  const clientRecords = useMemo(() => {
    if (!clientName) return [];

    const sales = (cachedSales || []).map(mapSale);
    const pending = pendingQueue
      .filter(item => item.type === "sale" && (item.data[1] || "").trim() === clientName.trim())
      .map(item => ({
        id: `pending-${Math.random()}`,
        client: item.data[1],
        description: item.data[2],
        balance: parseAmount(item.data[11]),
        isPending: true,
      } as unknown as UnifiedRecord));

    return [...sales, ...pending].filter(r =>
      r.client.trim() === clientName.trim() &&
      !r.isPending &&
      ((r.balance || 0) > 0 || (r.additionalPayment1 === 0 || r.additionalPayment2 === 0))
    );
  }, [clientName, cachedSales, pendingQueue]);

  const totalBalance = clientRecords.reduce((s, r) => s + (r.balance || 0), 0);
  const lumpSum = parseFloat(paymentInput) || 0;

  const preview = useMemo(
    () => (lumpSum > 0 ? computeWaterfall(clientRecords, lumpSum) : []),
    [clientRecords, lumpSum]
  );

  const handleSubmit = async () => {
    if (lumpSum <= 0) {
      toast.error("Please enter a valid payment amount.");
      return;
    }
    const steps = computeWaterfall(clientRecords, lumpSum);
    if (steps.length === 0) {
      toast.error("No eligible unpaid items found for this client.");
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
            allOk = false;
            break;
          }

          try {
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
                collectedBy: localStorage.getItem("userName") || "System",
                notes: `Auto-distributed lump sum`
              })
            });
          } catch (e) {
            console.error("Failed to log payment event", e);
          }

        } catch {
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
          notes: `Auto-distributed lump sum (Offline)`
        };

        useSyncStore.getState().addPendingEntry("payment", {
          salesUpdate: payload,
          paymentLog: paymentPayload,
        });
      });

      toast.success(`₦${lumpSum.toLocaleString()} applied to ${clientName}'s account locally (offline). Syncing in background.`);
    }

    setIsSubmitting(false);
    if (allOk) {
      if (isOnline) {
        toast.success(`₦${lumpSum.toLocaleString()} applied to ${clientName}'s account.`);
      }
      setPaymentInput("");
      onUpdate();
      onClose();
    } else {
      toast.error("Failed to apply some payments. Please check your connection.");
    }
  };

  const body = (
    <Box sx={{ p: 3 }}>
      <Stack sx={{ gap: 2.5 }}>
        <Box sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          p: 2,
          bgcolor: "grey.50",
          borderRadius: 3,
          border: "1px solid",
          borderColor: "grey.100",
        }}>
          <Box sx={{
            width: 40,
            height: 40,
            borderRadius: 2,
            bgcolor: primaryColor,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}>
            <User size={20} color="#fff" />
          </Box>
          <Box>
            <Typography sx={{ fontSize: "0.625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: "text.secondary" }}>
              Selected Client
            </Typography>
            <Typography sx={{ fontSize: "0.875rem", fontWeight: 900, color: "text.primary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>
              {clientName}
            </Typography>
          </Box>
          <Box sx={{ ml: "auto", textAlign: "right" }}>
            <Typography sx={{ fontSize: "0.625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: "error.main" }}>
              Total Debt
            </Typography>
            <Typography sx={{ fontSize: "0.875rem", fontWeight: 900, color: "error.main" }}>
              ₦{totalBalance.toLocaleString()}
            </Typography>
          </Box>
        </Box>

        {clientRecords.length === 0 ? (
          <Box sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 1,
            p: 3,
            bgcolor: "#f0fdf4",
            borderRadius: 3,
            border: "1px solid #bbf7d0",
          }}>
            <CheckCircle2 size={20} color="#16a34a" />
            <Typography sx={{ fontSize: "0.875rem", fontWeight: 900, color: "#15803d", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              No payment slots available
            </Typography>
          </Box>
        ) : (
          <>
            <Box>
              <Typography component="label" sx={{ display: "block", fontSize: "0.625rem", textTransform: "uppercase", fontWeight: 900, color: "text.secondary", letterSpacing: "0.12em", mb: 0.75 }}>
                Apply Payment (₦)
              </Typography>
              <TextField
                type="number"
                placeholder="Enter amount to pay off"
                value={paymentInput}
                onChange={(e) => setPaymentInput(e.target.value)}
                fullWidth
                slotProps={{ htmlInput: { style: { fontWeight: 700, fontSize: "1.125rem" } } }}
                sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3 } }}
              />
            </Box>

            {preview.length > 0 && (
              <Box>
                <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                  <Typography sx={{ fontSize: "0.625rem", textTransform: "uppercase", fontWeight: 900, color: "text.secondary", letterSpacing: "0.12em" }}>
                    Auto-Distribution Preview
                  </Typography>
                  <Typography sx={{ fontSize: "0.625rem", fontWeight: 700, color: "text.secondary" }}>
                    {preview.length} item{preview.length !== 1 ? "s" : ""}
                  </Typography>
                </Stack>
                <Box sx={{
                  maxHeight: 200,
                  overflowY: "auto",
                  border: "1px solid",
                  borderColor: "grey.100",
                  borderRadius: 3,
                }}>
                  {preview.map((step, idx) => (
                    <Box key={step.record.id} sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      px: 2,
                      py: 1.5,
                      bgcolor: "background.paper",
                      borderBottom: "1px solid",
                      borderColor: "grey.50",
                      "&:last-child": { borderBottom: "none" },
                    }}>
                      <Stack direction="row" sx={{ alignItems: "center", gap: 1.25 }}>
                        <Box sx={{
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          bgcolor: `${primaryColor}18`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}>
                          <Typography sx={{ fontSize: "0.5625rem", fontWeight: 900, color: primaryColor }}>
                            {idx + 1}
                          </Typography>
                        </Box>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, color: "text.primary", lineHeight: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {step.record.description}
                          </Typography>
                          <Typography sx={{ fontSize: "0.5625rem", color: "text.secondary", mt: 0.5, textTransform: "uppercase", fontWeight: 700 }}>
                            {step.record.date?.split(',')[0]}
                          </Typography>
                        </Box>
                      </Stack>
                      <Box sx={{ textAlign: "right", ml: 1, flexShrink: 0 }}>
                        <Typography sx={{ fontSize: "0.75rem", fontWeight: 900, color: "success.main" }}>
                          +₦{step.toApply.toLocaleString()}
                        </Typography>
                      </Box>
                    </Box>
                  ))}
                </Box>
                {lumpSum > totalBalance && totalBalance > 0 && (
                  <Stack direction="row" sx={{ alignItems: "center", gap: 0.5, mt: 1 }}>
                    <CheckCircle2 size={12} color="#16a34a" />
                    <Typography sx={{ fontSize: "0.625rem", color: "success.main", fontWeight: 700 }}>
                      Overpayment of ₦{(lumpSum - totalBalance).toLocaleString()} will be applied as credit.
                    </Typography>
                  </Stack>
                )}
                {totalBalance <= 0 && lumpSum > 0 && (
                  <Stack direction="row" sx={{ alignItems: "center", gap: 0.5, mt: 1 }}>
                    <CheckCircle2 size={12} color="#16a34a" />
                    <Typography sx={{ fontSize: "0.625rem", color: "success.main", fontWeight: 700 }}>
                      ₦{lumpSum.toLocaleString()} will be applied as credit.
                    </Typography>
                  </Stack>
                )}
              </Box>
            )}
          </>
        )}
      </Stack>
    </Box>
  );

  const footer = (drawer?: boolean) => (
    <Box sx={drawer
      ? { display: "flex", flexDirection: "column", gap: 1.5, mt: 2, px: 3, pb: 4 }
      : { p: 3, bgcolor: "grey.50", display: "flex", gap: 1.5, borderTop: "1px solid", borderColor: "grey.100" }
    }>
      <Button
        variant="outlined"
        onClick={onClose}
        sx={{ flex: 1, height: 48, borderRadius: 3, fontWeight: 700 }}
      >
        Close
      </Button>
      {totalBalance > 0 && (
        <Button
          variant="contained"
          disabled={isSubmitting || lumpSum <= 0 || preview.length === 0}
          onClick={handleSubmit}
          sx={{
            flex: 1,
            height: 48,
            borderRadius: 3,
            bgcolor: primaryColor,
            fontWeight: 900,
            "&:hover": { bgcolor: theme === "brand" ? "#2e45b0" : "#8b2a1f" },
            "&:active": { transform: "scale(0.97)" },
          }}
        >
          {isSubmitting ? (
            <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
              <Box sx={{ animation: "spin 1s linear infinite", display: "flex", "@keyframes spin": { "100%": { transform: "rotate(360deg)" } } }}>
                <Loader2 size={16} />
              </Box>
              Processing...
            </Stack>
          ) : "Apply Payment"}
        </Button>
      )}
    </Box>
  );

  if (isMobile) {
    return (
      <Dialog
        fullScreen
        open={isOpen}
        onClose={onClose}

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
          <Box sx={{ px: 3, py: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 900, color: "text.primary", letterSpacing: "-0.02em" }}>Client Payment</Typography>
          </Box>
          {body}
        </Box>
        {footer(true)}
      </Dialog>
    );
  }

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      slotProps={{ paper: { sx: { borderRadius: 4, overflow: "hidden" } } }}
    >
      <DialogTitle sx={{
        bgcolor: primaryColor,
        color: "#fff",
        pt: 3,
        pb: 2,
        px: 3,
      }}>
        <Typography sx={{ fontSize: "1.25rem", fontWeight: 900, color: "#fff", lineHeight: 1.2 }}>
          Client Account Overlook
        </Typography>
        <Typography sx={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.8)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", mt: 0.5 }}>
          Lump-sum Debt Recovery for {clientName}
        </Typography>
      </DialogTitle>
      <DialogContent sx={{ p: 0 }}>
        {body}
      </DialogContent>
      <DialogActions sx={{ p: 0 }}>
        {footer()}
      </DialogActions>
    </Dialog>
  );
}

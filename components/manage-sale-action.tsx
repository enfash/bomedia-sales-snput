"use client";

import { useState, useMemo } from "react";
import { usePathname } from "next/navigation";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { MoreHorizontal, MessageCircle, Lock } from "lucide-react";
import { toast } from "sonner";
import { useSyncStore } from "@/lib/store";
import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Typography,
  Box,
  Stack,
  IconButton,
} from "@mui/material";
import { RecordStatus } from "@/components/record-card";
import { JOB_STATUSES, STORAGE_KEYS } from "@/lib/constants";

export interface UnifiedRecord {
  id: string;
  date: string;
  type: "Sale" | "Expense";
  client: string;
  contact?: string;
  description: string;
  amount: number;
  status: RecordStatus;
  loggedBy: string;
  isPending: boolean;
  rowIndex?: number;
  timestamp?: number;
  additionalPayment1?: number;
  additionalPayment2?: number;
  jobStatus?: string;
  material?: string;
  balance?: number;
  salesId?: string;
  raw: Record<string, string>;
}

interface ManageSaleActionProps {
  record: UnifiedRecord;
  onUpdate: () => void;
  variant?: "icon" | "button";
}

export function ManageSaleAction({
  record,
  onUpdate,
  variant = "icon",
}: ManageSaleActionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [addl1, setAddl1] = useState(record?.additionalPayment1 ? String(record.additionalPayment1) : "");
  const [addl2, setAddl2] = useState(record?.additionalPayment2 ? String(record.additionalPayment2) : "");
  const [status, setStatus] = useState(record?.jobStatus ?? JOB_STATUSES[0]);
  const isMobile = useMediaQuery("(max-width: 768px)");
  const pathname = usePathname();

  const isLocked = useMemo(() => {
    if (!pathname?.includes('/cashier')) return false;
    const rawDateStr = record.raw?.DATE || record.raw?.Date;
    const tsMs = record.timestamp ?? (rawDateStr ? new Date(rawDateStr).getTime() : NaN);
    if (isNaN(tsMs)) return false;
    return (Date.now() - tsMs) > 24 * 60 * 60 * 1000;
  }, [pathname, record.raw, record.timestamp]);

  if (!record || record.type === "Expense" || record.isPending || isLocked) {
    return variant === "icon" ? (
      <IconButton
        disabled
        size="small"
        title={isLocked ? "Cannot edit records older than 24 hours" : ""}
        sx={{ color: "grey.300" }}
      >
        {isLocked ? <Lock size={12} /> : <MoreHorizontal size={16} />}
      </IconButton>
    ) : null;
  }

  const handleUpdate = async () => {
    setIsSubmitting(true);
    try {
      const payload: Record<string, any> = {
        rowIndex: record.rowIndex,
        jobStatus: status,
      };

      const hasAddl1 = (record.additionalPayment1 ?? 0) > 0;
      const hasAddl2 = (record.additionalPayment2 ?? 0) > 0;

      let newPaymentAmount = 0;
      let newPaymentType = "";

      if (!hasAddl1 && addl1 !== "") {
        payload.additionalPayment1 = parseFloat(addl1) || 0;
        newPaymentAmount = payload.additionalPayment1;
        newPaymentType = "Additional Payment 1";
      } else if (!hasAddl2 && addl2 !== "") {
        payload.additionalPayment2 = parseFloat(addl2) || 0;
        newPaymentAmount = payload.additionalPayment2;
        newPaymentType = "Additional Payment 2";
      }

      const isOnline = typeof window !== "undefined" ? navigator.onLine : true;

      if (isOnline) {
        const res = await fetch("/api/sales", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          if (newPaymentAmount > 0) {
            try {
              const loggedBy = localStorage.getItem(STORAGE_KEYS.USER_NAME) || "System";
              await fetch("/api/payments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  salesId: record.salesId || record.id || '',
                  clientName: record.client || '',
                  amount: newPaymentAmount,
                  paymentType: newPaymentType,
                  balanceBefore: record.balance || 0,
                  balanceAfter: Math.max(0, (record.balance || 0) - newPaymentAmount),
                  collectedBy: loggedBy,
                  notes: `Logged via Manage Sale Action`
                })
              });
            } catch (e) {
              console.error("Failed to log payment event", e);
            }
          }

          toast.success("Record updated successfully!");
          setIsOpen(false);
          onUpdate();
        } else {
          const error = await res.json();
          toast.error(error.error || "Failed to update record");
        }
      } else {
        const loggedBy = localStorage.getItem("userName") || "System";
        const paymentPayload = {
          salesId: record.salesId || record.id || '',
          clientName: record.client || '',
          amount: newPaymentAmount,
          paymentType: newPaymentType,
          balanceBefore: record.balance || 0,
          balanceAfter: Math.max(0, (record.balance || 0) - newPaymentAmount),
          collectedBy: loggedBy,
          notes: `Logged via Manage Sale Action (Offline)`
        };

        useSyncStore.getState().addPendingEntry("payment", {
          salesUpdate: payload,
          paymentLog: paymentPayload,
        });

        toast.success("Record update saved locally (offline). It will sync automatically.");
        setIsOpen(false);
        onUpdate();
      }
    } catch (err) {
      toast.error("Network error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const triggerButton =
    variant === "icon" ? (
      <IconButton
        size="small"
        onClick={() => setIsOpen(true)}
        sx={{ color: "primary.main", "&:hover": { bgcolor: "primary.main", color: "white" } }}
      >
        <MoreHorizontal size={16} />
      </IconButton>
    ) : (
      <Button
        variant="outlined"
        size="small"
        onClick={() => setIsOpen(true)}
        sx={{ borderRadius: 2, fontSize: "0.625rem", fontWeight: 900, letterSpacing: "0.05em" }}
      >
        Manage
      </Button>
    );

  const contentProps = {
    record,
    addl1,
    setAddl1,
    addl2,
    setAddl2,
    status,
    setStatus,
    isSubmitting,
    handleUpdate,
    setIsOpen,
  };

  if (isMobile) {
    return (
      <>
        {triggerButton}
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
          <Box sx={{ width: 48, height: 6, borderRadius: 3, bgcolor: "divider", mx: "auto", mt: 2, mb: 1, flexShrink: 0 }} />
          <Box sx={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
            <Box sx={{ px: 3, pt: 1, pb: 0 }}>
              <Typography variant="h6" sx={{ fontWeight: 900, color: "text.primary" }}>
                Manage Sale Record
              </Typography>
            </Box>
            <ContentBody {...contentProps} />
          </Box>
          <Box sx={{ px: 3 }}>
            <ContentFooter {...contentProps} drawer />
          </Box>
        </Dialog>
      </>
    );
  }

  return (
    <>
      {triggerButton}
      <Dialog
      open={isOpen}
      onClose={() => setIsOpen(false)}
      maxWidth="sm"
      fullWidth
      slotProps={{ paper: { sx: { borderRadius: 4, overflow: "hidden" } } }}
    >
      <HeaderContent {...contentProps} />
      <ContentBody {...contentProps} />
      <ContentFooter {...contentProps} />
    </Dialog>
    </>
  );
}

function HeaderContent({ record }: any) {
  return (
    <Box sx={{ p: 3, bgcolor: "primary.main", color: "primary.contrastText" }}>
      <DialogTitle
        sx={{
          p: 0,
          mb: 1,
          color: "inherit",
          fontWeight: 900,
          fontSize: "1.25rem",
        }}
      >
        Manage Sale Record
      </DialogTitle>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <Typography sx={{ fontWeight: 500, color: "inherit" }}>
          Update payments and job progress for {record.client}
        </Typography>
        <Box sx={{ textAlign: "right" }}>
          <Typography
            sx={{
              fontSize: "0.625rem",
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "rgba(255,255,255,0.9)",
              lineHeight: 1,
              mb: 0.25,
            }}
          >
            Current Balance
          </Typography>
          <Typography sx={{ fontSize: "0.875rem", fontWeight: 900, color: "inherit", lineHeight: 1 }}>
            ₦{(record.balance || 0).toLocaleString()}
          </Typography>

          {(record.balance || 0) > 0 && record.contact && (
            <Button
              size="small"
              onClick={() => {
                if (!record.contact) return;
                const balance = (record.balance || 0).toLocaleString();
                const message = `Hello *${record.client}*, this is a payment reminder from *BOMedia*.\n\nRegarding your order: *${record.description}*\nOutstanding Balance: *₦${balance}*\n\nKindly make payment to our designated bank account.\n\nThank you for your business!`;
                const encoded = encodeURIComponent(message);
                const phone = record.contact.replace(/\D/g, "");
                const formattedPhone = phone.startsWith("0")
                  ? "234" + phone.substring(1)
                  : phone;
                window.open(
                  `https://wa.me/${formattedPhone}?text=${encoded}`,
                  "_blank",
                );
              }}
              startIcon={<MessageCircle size={12} />}
              sx={{
                mt: 1,
                height: 28,
                px: 1,
                borderRadius: 2,
                bgcolor: "rgba(255,255,255,0.2)",
                color: "white",
                fontSize: "0.625rem",
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                "&:hover": { bgcolor: "rgba(255,255,255,0.3)" },
              }}
            >
              WhatsApp Reminder
            </Button>
          )}
        </Box>
      </Stack>
    </Box>
  );
}

function ContentBody({
  record,
  addl1,
  setAddl1,
  addl2,
  setAddl2,
  status,
  setStatus,
}: any) {
  const hasAddl1 = (record.additionalPayment1 ?? 0) > 0;
  const hasAddl2 = (record.additionalPayment2 ?? 0) > 0;
  const isFullyPaid = (record.balance ?? 0) <= 0 || record.status === "Paid";
  const maxSlotsReached = hasAddl1 && hasAddl2 && (record.balance ?? 0) > 0;

  return (
    <DialogContent sx={{ p: 3 }}>
      <Stack sx={{ gap: 3 }}>
        <Stack
          direction="row"
          sx={{
            gap: 2,
            pb: 2,
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Box sx={{ flex: 1 }}>
            <Typography
              sx={{
                fontSize: "0.625rem",
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "text.secondary",
                mb: 0.5,
                display: "block",
              }}
            >
              Total Amount
            </Typography>
            <Typography sx={{ fontSize: "1.125rem", fontWeight: 900, color: "text.primary" }}>
              ₦{record.amount.toLocaleString()}
            </Typography>
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography
              sx={{
                fontSize: "0.625rem",
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "text.secondary",
                mb: 0.5,
                display: "block",
              }}
            >
              Current Status
            </Typography>
            <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, color: "primary.main" }}>
              {record.status}
            </Typography>
          </Box>
        </Stack>

        <Stack sx={{ gap: 2 }}>
          {isFullyPaid && (
            <Box
              sx={{
                p: 2,
                bgcolor: "success.light",
                borderRadius: 3,
                border: "1px solid",
                borderColor: "success.main",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Typography
                sx={{
                  fontSize: "0.75rem",
                  fontWeight: 900,
                  color: "success.dark",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Paid Completed
              </Typography>
            </Box>
          )}

          {maxSlotsReached && !isFullyPaid && (
            <Box
              sx={{
                p: 2,
                bgcolor: "warning.light",
                borderRadius: 3,
                border: "1px solid",
                borderColor: "warning.main",
              }}
            >
              <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, color: "warning.dark" }}>
                Maximum payment slots reached. Contact Admin to add more payments.
              </Typography>
            </Box>
          )}

          <Box>
            <Typography
              sx={{
                fontSize: "0.625rem",
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "text.secondary",
                mb: 0.75,
                display: "block",
              }}
            >
              Additional Payment 1 (₦)
            </Typography>
            <TextField
              type="number"
              placeholder="Enter amount"
              value={addl1}
              onChange={(e) => setAddl1(e.target.value)}
              disabled={hasAddl1 || isFullyPaid || maxSlotsReached}
              fullWidth
              size="medium"
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3, fontWeight: 700 } }}
            />
          </Box>

          <Box>
            <Typography
              sx={{
                fontSize: "0.625rem",
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "text.secondary",
                mb: 0.75,
                display: "block",
              }}
            >
              Additional Payment 2 (₦)
            </Typography>
            <TextField
              type="number"
              placeholder="Enter amount"
              value={addl2}
              onChange={(e) => setAddl2(e.target.value)}
              disabled={!hasAddl1 || hasAddl2 || isFullyPaid || maxSlotsReached}
              fullWidth
              size="medium"
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3, fontWeight: 700 } }}
            />
          </Box>

          <FormControl fullWidth size="medium">
            <InputLabel
              sx={{
                fontSize: "0.625rem",
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Job Status
            </InputLabel>
            <Select
              value={status}
              label="Job Status"
              onChange={(e) => setStatus(e.target.value)}
              sx={{ borderRadius: 3, fontWeight: 700 }}
            >
              {JOB_STATUSES.map((s) => (
                <MenuItem key={s} value={s} sx={{ fontWeight: 700 }}>{s}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
      </Stack>
    </DialogContent>
  );
}

function ContentFooter({ isSubmitting, handleUpdate, setIsOpen, drawer }: any) {
  if (drawer) {
    return (
      <Stack sx={{ gap: 1.5, mt: 4 }}>
        <Button
          variant="contained"
          disabled={isSubmitting}
          onClick={handleUpdate}
          fullWidth
          sx={{ height: 48, borderRadius: 3, fontWeight: 900 }}
        >
          {isSubmitting ? "Updating..." : "Save Changes"}
        </Button>
        <Button
          variant="outlined"
          onClick={() => setIsOpen(false)}
          fullWidth
          sx={{ height: 48, borderRadius: 3, fontWeight: 700 }}
        >
          Cancel
        </Button>
      </Stack>
    );
  }

  return (
    <DialogActions
      sx={{
        p: 3,
        bgcolor: "grey.50",
        borderTop: "1px solid",
        borderColor: "divider",
        gap: 1.5,
      }}
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
        disabled={isSubmitting}
        onClick={handleUpdate}
        sx={{ flex: 1, height: 48, borderRadius: 3, fontWeight: 900 }}
      >
        {isSubmitting ? "Updating..." : "Save Changes"}
      </Button>
    </DialogActions>
  );
}

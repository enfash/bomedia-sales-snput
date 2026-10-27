"use client";

import { manageSaleStyles as styles } from "@/app/theme";
import { ResponsiveSheet } from "@/components/responsive-sheet";

import { useState, useMemo, useRef, useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { MoreHorizontal, MessageCircle, Lock } from "lucide-react";
import { toast } from "sonner";
import { useSyncStore } from "@/lib/store";
import {
  Button,
  DialogContent,
  DialogActions,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Typography,
  Box,
  Stack,
  IconButton,
} from "@mui/material";
import type { RecordStatus } from "@/lib/records-view";
import { JOB_STATUSES, STORAGE_KEYS } from "@/lib/constants";
import { paymentContext, savePostgresPayment } from '@/lib/payment-outbox';
import { paymentKobo } from '@/lib/payment-contract';
import { MoneyField } from "@/components/money-field";
import { PaidBy } from "@/components/paid-by";
import type { PaymentMethod } from "@/lib/payment-methods";

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
  /** Draws the button that opens the dialog, in place of the default icon or "Manage" button. */
  trigger?: (open: () => void) => ReactNode;
}

export function ManageSaleAction({
  record,
  onUpdate,
  variant = "icon",
  trigger,
}: ManageSaleActionProps) {
  const submitting = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [addl1, setAddl1] = useState(!record.raw?._jobId && record?.additionalPayment1 ? String(record.additionalPayment1) : "");
  const [addl2, setAddl2] = useState(record?.additionalPayment2 ? String(record.additionalPayment2) : "");
  const [status, setStatus] = useState(record?.jobStatus ?? JOB_STATUSES[0]);
  const [paidBy, setPaidBy] = useState<PaymentMethod | "">("");
  const pathname = usePathname();
  // The clock is state, refreshed each minute, so a record locks at 24 hours without a reload.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const isLocked = useMemo(() => {
    if (!pathname?.includes('/cashier')) return false;
    const rawDateStr = record.raw?.DATE || record.raw?.Date;
    const tsMs = record.timestamp ?? (rawDateStr ? new Date(rawDateStr).getTime() : NaN);
    if (isNaN(tsMs)) return false;
    return (now - tsMs) > 24 * 60 * 60 * 1000;
  }, [pathname, record.raw, record.timestamp, now]);

  if (!record || record.type === "Expense" || record.isPending || isLocked) {
    return variant === "icon" ? (
      <IconButton
        disabled
        size="small"
        title={isLocked ? "Cannot edit records older than 24 hours" : ""}
        sx={styles.lockedTrigger}
      >
        {isLocked ? <Lock size={12} /> : <MoreHorizontal size={16} />}
      </IconButton>
    ) : null;
  }

  const handleUpdate = async () => {
    if (submitting.current) return;
    submitting.current = true;
    setIsSubmitting(true);
    try {
      const payload: Record<string, any> = {
        rowIndex: record.rowIndex,
        jobStatus: status,
      };

      const hasAddl1 = !record.raw?._jobId && (record.additionalPayment1 ?? 0) > 0;
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

      if (newPaymentAmount > 0) {
        // The books keep cash, transfer and POS apart; the ID stops a retry paying twice.
        if (!paidBy) { toast.error("Choose how the customer paid: Cash, Transfer or POS"); return; }
        payload.paymentMethod = paidBy;
        payload.requestId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `pay-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      }

      if (newPaymentAmount > 0) {
        const context = await paymentContext();
        if (context.backend === 'postgres') {
          if (!record.raw?._jobId) throw new Error('Refresh this record before recording a PostgreSQL payment.');
          await savePostgresPayment(context, {
            jobIds: [record.raw._jobId], amountKobo: paymentKobo(!hasAddl1 && addl1 !== '' ? addl1 : addl2),
            paymentMethod: paidBy as PaymentMethod, jobStatus: status,
          }, `Payment for ${record.client}`);
          toast.success('Payment saved on this device. Confirmation will appear after syncing.');
          setAddl1(''); setPaidBy('');
          setIsOpen(false);
          onUpdate();
          return;
        }
        if (record.raw?._jobId) throw new Error('These records belong to PostgreSQL. Refresh before recording a payment.');
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
      toast.error(err instanceof Error ? err.message : "Network error");
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  };

  const triggerButton = trigger ? trigger(() => setIsOpen(true)) :
    variant === "icon" ? (
      <IconButton
        size="small"
        onClick={() => setIsOpen(true)}
        sx={styles.iconTrigger}
      >
        <MoreHorizontal size={16} />
      </IconButton>
    ) : (
      <Button
        variant="outlined"
        size="small"
        onClick={() => setIsOpen(true)}
        sx={styles.manageButton}
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
    paidBy,
    setPaidBy,
    isSubmitting,
    handleUpdate,
    setIsOpen,
  };

  return <>
    {triggerButton}
    <ResponsiveSheet open={isOpen} onClose={() => setIsOpen(false)} busy={isSubmitting}
      title="Manage Sale Record" description={`${record.client} · Balance ₦${(record.balance || 0).toLocaleString()}`}
      footer={<ContentFooter {...contentProps} />}>
      <ContentBody {...contentProps} />
    </ResponsiveSheet>
  </>;
}

function ContentBody({
  record,
  addl1,
  setAddl1,
  addl2,
  setAddl2,
  status,
  setStatus,
  paidBy,
  setPaidBy,
  isSubmitting,
}: any) {
  const hasAddl1 = (record.additionalPayment1 ?? 0) > 0;
  const hasAddl2 = (record.additionalPayment2 ?? 0) > 0;
  const isFullyPaid = (record.balance ?? 0) <= 0 || record.status === "Paid";
  const maxSlotsReached = hasAddl1 && hasAddl2 && (record.balance ?? 0) > 0;

  return (
    <DialogContent sx={styles.body}>
      <Stack sx={styles.stack}>
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
              sx={styles.whatsapp}
            >
              WhatsApp Reminder
            </Button>
          )}
        <Stack direction="row" sx={styles.summary}>
          <Box sx={styles.summaryCell}>
            <Typography sx={styles.label}>
              Total Amount
            </Typography>
            <Typography sx={styles.totalValue}>
              ₦{record.amount.toLocaleString()}
            </Typography>
          </Box>
          <Box sx={styles.summaryCell}>
            <Typography sx={styles.label}>
              Current Status
            </Typography>
            <Typography sx={styles.statusValue}>
              {record.status}
            </Typography>
          </Box>
        </Stack>

        <Stack sx={styles.fields}>
          {Number(record.raw?.['EXTRA INCOME (₦)']) > 0 && <Typography variant="body2">
            Extra payment income recorded: ₦{Number(record.raw['EXTRA INCOME (₦)']).toLocaleString()} · non-refundable
          </Typography>}
          {isFullyPaid && (
            <Box sx={styles.paidBanner}>
              <Typography sx={styles.paidText}>
                Paid Completed
              </Typography>
            </Box>
          )}

          {maxSlotsReached && !isFullyPaid && !record.raw?._jobId && (
            <Box sx={styles.maxBanner}>
              <Typography sx={styles.maxText}>
                Maximum payment slots reached. Contact Admin to add more payments.
              </Typography>
            </Box>
          )}

          {record.raw?._jobId ? <Box>
            <MoneyField label="Payment received (₦)" value={addl1} onChange={setAddl1} disabled={isSubmitting} fullWidth
              helperText="Any amount above the remaining balance is recorded as non-refundable extra income." />
            <PaidBy value={paidBy} onChange={setPaidBy} disabled={isSubmitting} required={Number(addl1)>0} />
          </Box> : <>
          <Box>
            <Typography sx={styles.labelField}>
              Additional Payment 1 (₦)
            </Typography>
            <MoneyField
              placeholder="Enter amount"
              value={addl1}
              onChange={setAddl1}
              disabled={hasAddl1 || isFullyPaid || maxSlotsReached}
              fullWidth
              size="medium"
              sx={styles.moneyField}
              helperText={record.raw?._jobId ? 'Any excess is recorded as non-refundable extra income.' : undefined}
            />
          </Box>

          <Box>
            <Typography sx={styles.labelField}>
              Additional Payment 2 (₦)
            </Typography>
            <MoneyField
              placeholder="Enter amount"
              value={addl2}
              onChange={setAddl2}
              disabled={!hasAddl1 || hasAddl2 || isFullyPaid || maxSlotsReached}
              fullWidth
              size="medium"
              sx={styles.moneyField}
              helperText={record.raw?._jobId ? 'Any excess is recorded as non-refundable extra income.' : undefined}
            />
          </Box>

          {!isFullyPaid && !maxSlotsReached && (
            <PaidBy value={paidBy} onChange={setPaidBy} disabled={isSubmitting}
              required={Number(hasAddl1 ? addl2 : addl1) > 0} />
          )}
          </>}

          <FormControl fullWidth size="medium">
            <InputLabel sx={styles.statusLabel}>
              Job Status
            </InputLabel>
            <Select
              value={status}
              label="Job Status"
              onChange={(e) => setStatus(e.target.value)}
              sx={styles.statusSelect}
            >
              {JOB_STATUSES.map((s) => (
                <MenuItem key={s} value={s} sx={styles.statusItem}>{s}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
      </Stack>
    </DialogContent>
  );
}

function ContentFooter({ isSubmitting, handleUpdate, setIsOpen }: any) {
  return (
    <DialogActions sx={styles.footer}>
      <Button
        variant="outlined"
        onClick={() => setIsOpen(false)}
        disabled={isSubmitting}
        sx={styles.cancel}
      >
        Cancel
      </Button>
      <Button
        variant="contained"
        disabled={isSubmitting}
        onClick={handleUpdate}
        sx={styles.save}
      >
        {isSubmitting ? "Updating..." : "Save Changes"}
      </Button>
    </DialogActions>
  );
}

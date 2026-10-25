"use client";

import { manageBatchStyles as styles } from "@/app/theme";
import { ResponsiveSheet } from "@/components/responsive-sheet";

import { useState, useMemo, useRef, type ReactNode } from "react";
import { Wallet, CheckCircle2 } from "lucide-react";
import Button from "@mui/material/Button";
import { MoneyField } from "@/components/money-field";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import { toast } from "sonner";
import { type UnifiedRecord } from "@/components/manage-sale-action";
import { computeWaterfall } from "@/lib/financial-utils";
import { useSyncStore } from "@/lib/store";

import { paymentContext, savePostgresPayment } from '@/lib/payment-outbox';
import { paymentKobo, rowDebtKobo } from '@/lib/payment-contract';
import { PaidBy } from './paid-by';
import type { PaymentMethod } from '@/lib/payment-methods';

interface ManageBatchActionProps {
  records: UnifiedRecord[];
  salesId: string;
  onUpdate: () => void;
  variant?: "icon" | "button";
  /** Draws the button that opens the dialog, in place of the default icon or "Pay Batch" button. */
  trigger?: (open: () => void) => ReactNode;
}

export function ManageBatchAction({ records, salesId, onUpdate, variant = "button", trigger: customTrigger }: ManageBatchActionProps) {
  const submitting = useRef(false);
  const [paidBy, setPaidBy] = useState<PaymentMethod | "">("");
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentInput, setPaymentInput] = useState("");

  const grandTotal = records.reduce((s, r) => s + (r.amount ?? 0), 0);
  const totalBalance = records.reduce((s, r) => s + (r.balance ?? 0), 0);
  const totalPaid = grandTotal - totalBalance;

  const lumpSum = parseFloat(paymentInput) || 0;

  const preview = useMemo(
    () => (lumpSum > 0 ? computeWaterfall(records, lumpSum) : []),
    [records, lumpSum]
  );

  const submit = async () => {
    if (lumpSum <= 0) return;
    if (!paidBy) throw new Error('Choose how the customer paid: Cash, Transfer or POS.');
    const context = await paymentContext();
    if (context.backend === 'postgres') {
      const jobs = records.filter(r => r.raw?._jobId ? rowDebtKobo(r.raw) > BigInt(0) : (r.balance || 0) > 0);
      if (!jobs.length || jobs.some(r => !r.raw?._jobId)) throw new Error('Refresh the jobs before recording this payment.');
      if (BigInt(paymentKobo(paymentInput)) > jobs.reduce((sum, r) => sum + rowDebtKobo(r.raw), BigInt(0))) throw new Error('The amount exceeds the selected debt. Ask the owner to review any excess.');
      await savePostgresPayment(context, { jobIds: jobs.map(r => r.raw._jobId), amountKobo: paymentKobo(paymentInput),
        paymentMethod: paidBy, notes: 'Batch payment' }, `Payment for ${records[0]?.client || 'customer'}`);
      toast.success('Payment saved on this device. Confirmation will appear after syncing.');
      setPaymentInput(''); setPaidBy(''); setIsOpen(false); onUpdate(); return;
    }
    if (records.some(r => r.raw?._jobId)) throw new Error('These records belong to PostgreSQL. Refresh before recording a payment.');
    const steps = computeWaterfall(records, lumpSum);
    if (steps.length === 0) {
      toast.error("No eligible unpaid items to apply payment to.");
      return;
    }

    if (steps.some((step) => !step.record.rowIndex)) {
      toast.error("Some sales are still syncing. Please refresh and try again.");
      return;
    }

    setIsSubmitting(true);

    // One id for the whole distribution, reused on every retry so the server
    // can recognise a replay. Required because a step whose payment slots are
    // both full appends to the cell rather than replacing it.
    const transactionId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : "pay-" + Date.now() + "-" + Math.random().toString(36).slice(2, 11);

    const payload = {
      transactionId,
      clientName: records[0]?.client || "",
      collectedBy: localStorage.getItem("userName") || "System",
      notes: `Logged via Batch Payment distribution (${salesId})`,
      lumpSum,
      paymentMethod: paidBy,
      steps: steps.map((step) => ({
        rowIndex: step.record.rowIndex,
        salesId: step.record.salesId || "",
        slot: step.slot,
        mode: step.mode,
        toApply: step.toApply,
        balanceBefore: step.record.balance ?? 0,
        overpayment: step.overpayment,
      })),
    };

    const finish = () => {
      setPaymentInput("");
      setPaidBy("");
      setIsOpen(false);
      onUpdate();
    };

    const queueForBackground = (reason: string) => {
      useSyncStore.getState().addPendingEntry("payment_batch", payload);
      toast.success(`Payment of ₦${lumpSum.toLocaleString()} queued. ${reason}`);
      finish();
    };

    const isOnline = typeof window !== "undefined" ? navigator.onLine : true;
    if (!isOnline) {
      queueForBackground("It will sync when you are back online.");
      setIsSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/payments/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json: any = await res.json().catch(() => ({}));

      if (res.ok) {
        toast.success(
          json.alreadyApplied
            ? "This payment was already recorded."
            : `Payment of ₦${lumpSum.toLocaleString()} distributed successfully!`
        );
        finish();
      } else if (json?.needsReconciliation) {
        // Recorded but not applied — a retry would refuse, so a person must fix it.
        toast.error(json.error, { duration: 20000 });
        finish();
      } else if (res.status === 429 || res.status >= 500) {
        queueForBackground("Google Sheets is busy; it will retry automatically.");
      } else {
        toast.error(json.error || "Failed to distribute payment.");
      }
    } catch {
      queueForBackground("You appear to be offline; it will retry automatically.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (submitting.current) return;
    submitting.current = true; setIsSubmitting(true);
    try { await submit(); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Payment could not be saved.'); }
    finally { submitting.current = false; setIsSubmitting(false); }
  };

  const trigger = customTrigger ? customTrigger(() => setIsOpen(true)) : variant === "icon" ? (
    <IconButton
      size="small"
      onClick={() => setIsOpen(true)}
      title="Pay Batch"
      sx={styles.iconTrigger}
    >
      <Wallet size={16} />
    </IconButton>
  ) : (
    <Button
      onClick={() => setIsOpen(true)}
      variant="outlined"
      size="small"
      sx={styles.payButton}
      startIcon={<Wallet size={12} />}
    >
      Pay Batch
    </Button>
  );

  const summaryCards = [
    { label: "Grand Total", value: grandTotal, tone: styles.summaryTotal },
    { label: "Paid", value: totalPaid, tone: styles.summaryPaid },
    { label: "Remaining", value: totalBalance, tone: styles.summaryRemaining },
  ];

  const body = (
    <Box sx={styles.body}>
      <Box sx={styles.summaryGrid}>
        {summaryCards.map((m) => (
          <Box key={m.label} sx={styles.summaryCard}>
            <Typography sx={styles.summaryLabel}>
              {m.label}
            </Typography>
            <Typography sx={[styles.summaryValue, m.tone]}>
              ₦{m.value.toLocaleString(undefined, { minimumFractionDigits: 0 })}
            </Typography>
          </Box>
        ))}
      </Box>

      {totalBalance <= 0 ? (
        <Box sx={styles.allPaid}>
          <CheckCircle2 size={16} />
          <Typography sx={styles.allPaidText}>
            All items fully paid
          </Typography>
        </Box>
      ) : (
        <>
          <Box sx={styles.field}>
            <Typography sx={styles.fieldLabel}>
              Lump-Sum Payment (₦)
            </Typography>
            <MoneyField
              placeholder="Enter total payment amount"
              value={paymentInput}
              onChange={setPaymentInput}
              fullWidth
              sx={styles.moneyField}
            />
            {lumpSum > totalBalance && (
              <Typography sx={styles.overpay}>
                <CheckCircle2 size={12} />
                Overpayment of ₦{(lumpSum - totalBalance).toLocaleString()} will be applied as credit.
              </Typography>
            )}
          </Box>

          <PaidBy value={paidBy} onChange={setPaidBy} disabled={isSubmitting} />

          {preview.length > 0 && (
            <Box sx={styles.preview}>
              <Typography sx={styles.fieldLabel}>
                Distribution Preview
              </Typography>
              <Box sx={styles.previewList}>
                {preview.map((step, idx) => (
                  <Box
                    key={step.record.id}
                    sx={[styles.previewRow, idx === preview.length - 1 && styles.previewRowLast]}
                  >
                    <Box sx={styles.previewLeft}>
                      <Box sx={styles.previewNumber}>
                        <Typography sx={styles.previewNumberText}>
                          {idx + 1}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography sx={styles.previewTitle}>
                          {step.record.description}
                        </Typography>
                        <Typography sx={styles.previewSlot}>
                          Slot {step.slot}{step.mode === "append" ? " · added to existing" : ""}
                        </Typography>
                      </Box>
                    </Box>
                    <Typography sx={styles.previewAmount}>
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

  const footer = (
    <Box sx={styles.footer}>
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
        disabled={isSubmitting || (totalBalance <= 0 && lumpSum <= 0)}
        onClick={handleSubmit}
        sx={styles.apply}
      >
        {isSubmitting ? "Processing…" : lumpSum > 0 ? "Apply Payment" : totalBalance <= 0 ? "All Paid" : "Review"}
      </Button>
    </Box>
  );

  return <>
    {trigger}
    <ResponsiveSheet open={isOpen} onClose={() => setIsOpen(false)} busy={isSubmitting}
      title="Batch Payment" description={`${salesId} · ${records.length} items`} footer={footer}>
      {body}
    </ResponsiveSheet>
  </>;
}

"use client";

import { ResponsiveSheet } from "@/components/responsive-sheet";
import { debtorModalStyles as styles, responsiveSheetStyles } from "@/app/theme";

import { useState, useMemo, useRef } from "react";
import { useSyncStore } from "@/lib/store";
import { parseAmount, computeWaterfall } from "@/lib/financial-utils";
import { collectableAmount } from "@/lib/balance-display";
import { Wallet, ChevronRight, CheckCircle2, AlertCircle, User } from "lucide-react";
import { toast } from "sonner";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import { type UnifiedRecord } from "@/components/manage-sale-action";
import { paymentContext, savePostgresPayment } from '@/lib/payment-outbox';
import { paymentKobo, rowDebtKobo } from '@/lib/payment-contract';
import { PaidBy } from "@/components/paid-by";
import type { PaymentMethod } from "@/lib/payment-methods";

interface DebtorPaymentModalProps {
  clientName: string | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
  /** Kept so existing callers compile. The active MUI theme now decides the accent (indigo for admin, orange for cashier). */
  theme?: "brand" | "amber";
}

const mapSale = (r: any): UnifiedRecord => {
  const amount      = parseAmount(r["AMOUNT (₦)"]          || r["Amount (₦)"]);
  const initialPay  = parseAmount(r["INITIAL PAYMENT (₦)"] || r["Initial Payment (₦)"]);
  const addl1       = parseAmount(r["ADDITIONAL PAYMENT 1"] || r["Additional Payment 1"]);
  const addl2       = parseAmount(r["ADDITIONAL PAYMENT 2"] || r["Additional Payment 2"]);
  // Not clamped at zero, so an overpaid row stays visible as such rather than
  // reading as exactly settled. It is surfaced for information only — see
  // collectableAmount for why it never reduces what is owed elsewhere.
  const balance     = amount - initialPay - addl1 - addl2;
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

export function DebtorPaymentModal({ clientName, isOpen, onClose, onUpdate }: DebtorPaymentModalProps) {
  const submitting = useRef(false);
  const { cachedSales, pendingQueue } = useSyncStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, { amount: string; method: PaymentMethod | "" }>>({});
  const draftKey = clientName ?? "";
  const paymentInput = drafts[draftKey]?.amount ?? "";
  const paidBy = drafts[draftKey]?.method ?? "";
  const setPaymentInput = (amount: string) => setDrafts(previous => ({ ...previous,
    [draftKey]: { amount, method: previous[draftKey]?.method ?? "" } }));
  const setPaidBy = (method: PaymentMethod | "") => setDrafts(previous => ({ ...previous,
    [draftKey]: { amount: previous[draftKey]?.amount ?? "", method } }));

  const clientRecords = useMemo(() => {
    if (!clientName) return [];

    const sales = (cachedSales || []).map(mapSale);
    const pending = pendingQueue
      .filter(item => item.type === "sale" && (item.data[1] || "").trim() === clientName.trim())
      .map((item, index) => ({
        id: `pending-${index}`,
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

  // Sums only what is still collectable. An earlier overpayment is margin
  // from rounding the customer up, not credit held against future work, so
  // it must not reduce what they owe on a later job.
  const totalBalance = clientRecords.reduce((s, r) => s + collectableAmount(r.balance, !!r.raw?._jobId), 0);
  const lumpSum = parseFloat(paymentInput) || 0;

  const preview = useMemo(
    () => (lumpSum > 0 ? computeWaterfall(clientRecords, lumpSum) : []),
    [clientRecords, lumpSum]
  );

  const submit = async () => {
    if (lumpSum <= 0) {
      toast.error("Please enter a valid payment amount.");
      return;
    }
    if (!paidBy) {
      toast.error("Choose how the customer paid: Cash, Transfer or POS");
      return;
    }
    const context = await paymentContext();
    if (context.backend === 'postgres') {
      const jobs = clientRecords.filter(r => r.raw?._jobId ? rowDebtKobo(r.raw) > BigInt(0) : (r.balance || 0) > 0);
      if (!jobs.length || jobs.some(r => !r.raw?._jobId)) throw new Error('Refresh the customer records before recording this payment.');
      if (BigInt(paymentKobo(paymentInput)) > jobs.reduce((sum, r) => sum + rowDebtKobo(r.raw), BigInt(0))) throw new Error('The amount exceeds this customer’s selected debt. Keep any excess for owner review.');
      await savePostgresPayment(context, { jobIds: jobs.map(r => r.raw._jobId), amountKobo: paymentKobo(paymentInput),
        paymentMethod: paidBy, notes: 'Customer debt collection' }, `Payment for ${clientName}`);
      toast.success('Payment saved on this device. Confirmation will appear after syncing.');
      setPaymentInput(''); setPaidBy(''); onUpdate(); onClose();
      return;
    }
    if (clientRecords.some(r => r.raw?._jobId)) throw new Error('These records belong to PostgreSQL. Refresh before recording a payment.');
    const steps = computeWaterfall(clientRecords, lumpSum);
    if (steps.length === 0) {
      toast.error("No eligible unpaid items found for this client.");
      return;
    }

    // Every step is applied by sheet row number. A record that has not finished
    // syncing has no row yet, so bail out rather than send an unusable batch.
    if (steps.some((step) => !step.record.rowIndex)) {
      toast.error("Some sales are still syncing. Please refresh and try again.");
      return;
    }

    setIsSubmitting(true);

    // One id for the whole submission, generated before the first attempt and
    // reused by every retry. The server keys the payment rows off it, so a
    // replay is recognised and refused instead of paying the client twice.
    // This is essential: slots that are already full are *appended* to, and a
    // blind retry of an append would double-count the money.
    const transactionId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : "pay-" + Date.now() + "-" + Math.random().toString(36).slice(2, 11);

    const payload = {
      transactionId,
      clientName: clientName ?? "",
      collectedBy: localStorage.getItem("userName") || "System",
      notes: "Auto-distributed lump sum",
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
      onUpdate();
      onClose();
    };

    // Hand the batch to the offline queue, which sync-manager drains and
    // retries. The queue is persisted to localStorage, so this survives the
    // browser being closed.
    const queueForBackground = (reason: string) => {
      useSyncStore.getState().addPendingEntry("payment_batch", payload);
      toast.success(
        `₦${lumpSum.toLocaleString()} queued for ${clientName}. ${reason}`
      );
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
            : `₦${lumpSum.toLocaleString()} applied to ${clientName}'s account.`
        );
        finish();
      } else if (json?.needsReconciliation) {
        // The payment is on record but the balances did not update. Retrying
        // would correctly refuse (the claim already exists) and change nothing,
        // so this needs a person rather than another attempt.
        toast.error(json.error, { duration: 20000 });
        finish();
      } else if (res.status === 429 || res.status >= 500) {
        // Rate limit or a server hiccup — both are worth retrying, so queue
        // rather than showing a dead end.
        queueForBackground("Google Sheets is busy; it will retry automatically.");
      } else {
        // 400/403 are permanent (bad data, or the 24-hour cashier rule).
        // Retrying would loop forever, so surface the reason instead.
        toast.error(json.error || "Failed to apply payment.");
      }
    } catch {
      queueForBackground("You appear to be offline; it will retry automatically.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (submitting.current) return;
    submitting.current = true;
    setIsSubmitting(true);
    try { await submit(); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Payment could not be saved.'); }
    finally { submitting.current = false; setIsSubmitting(false); }
  };

  const body = (
    <Box sx={styles.body}>
      <Stack sx={{ gap: 2.5 }}>
        <Box sx={responsiveSheetStyles.customerSummary}>
          <Box sx={styles.clientIcon}>
            <User size={20} />
          </Box>
          <Box sx={styles.clientText}>
            <Typography variant="overline" color="text.secondary" sx={{ display: "block" }}>
              Selected Client
            </Typography>
            <Typography variant="h6" component="p" sx={styles.wrapName}>
              {clientName}
            </Typography>
          </Box>
          <Box sx={styles.debtBlock}>
            <Typography variant="overline" color="error.main" sx={{ display: "block" }}>
              Total Debt
            </Typography>
            <Typography variant="h6" component="p" color="error.main">
              ₦{totalBalance.toLocaleString()}
            </Typography>
          </Box>
        </Box>

        {clientRecords.length === 0 ? (
          <Box sx={styles.cleared}>
            <CheckCircle2 size={20} />
            <Typography variant="h6" component="p">
              No payment slots available
            </Typography>
          </Box>
        ) : (
          <>
            <Box>
              <Typography variant="overline" component="label" htmlFor="debtor-payment-amount" sx={styles.label}>
                Apply Payment (₦)
              </Typography>
              <TextField
                id="debtor-payment-amount"
                type="number"
                placeholder="Enter amount to pay off"
                value={paymentInput}
                onChange={(e) => setPaymentInput(e.target.value)}
                fullWidth
                sx={styles.amountInput}
              />
            </Box>
            <PaidBy value={paidBy} onChange={setPaidBy} disabled={isSubmitting} />

            {preview.length > 0 && (
              <Box>
                <Box sx={styles.previewHead}>
                  <Typography variant="overline" color="text.secondary">
                    Auto-Distribution Preview
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                    {preview.length} item{preview.length !== 1 ? "s" : ""}
                  </Typography>
                </Box>
                <Box sx={styles.previewList}>
                  {preview.map((step, idx) => (
                    <Box key={step.record.id} sx={styles.previewRow}>
                      <Box sx={styles.previewLead}>
                        <Box sx={styles.badge}>{idx + 1}</Box>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="body2" sx={[styles.ellipsis, { fontWeight: 700 }]}>
                            {step.record.description}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {step.record.date?.split(',')[0]}
                            {step.mode === "append" ? " · added to existing payment" : ""}
                          </Typography>
                        </Box>
                      </Box>
                      <Box sx={styles.previewAmount}>
                        <Typography variant="body2" color="success.main" sx={{ fontWeight: 700 }}>
                          +₦{step.toApply.toLocaleString()}
                        </Typography>
                      </Box>
                    </Box>
                  ))}
                </Box>
                {lumpSum > totalBalance && totalBalance > 0 && (
                  <Box sx={styles.note}>
                    <CheckCircle2 size={12} />
                    <Typography variant="caption" sx={{ fontWeight: 700 }}>
                      Extra of ₦{(lumpSum - totalBalance).toLocaleString()} will be recorded against the last item.
                    </Typography>
                  </Box>
                )}
                {totalBalance <= 0 && lumpSum > 0 && (
                  <Box sx={styles.note}>
                    <CheckCircle2 size={12} />
                    <Typography variant="caption" sx={{ fontWeight: 700 }}>
                      ₦{lumpSum.toLocaleString()} will be recorded against the last item.
                    </Typography>
                  </Box>
                )}
              </Box>
            )}
          </>
        )}
      </Stack>
    </Box>
  );

  const footer = (
    <Box sx={styles.footer}>
      <Button
        variant="outlined"
        color="inherit"
        onClick={onClose}
        disabled={isSubmitting}
      >
        Close
      </Button>
      {totalBalance > 0 && (
        <Button
          variant="contained"
          disabled={isSubmitting || lumpSum <= 0 || preview.length === 0}
          onClick={handleSubmit}
          startIcon={isSubmitting ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {isSubmitting ? "Processing..." : "Apply Payment"}
        </Button>
      )}
    </Box>
  );

  return (
    <ResponsiveSheet open={isOpen} onClose={onClose} busy={isSubmitting}
      title="Client Payment" description={`Payment for ${clientName ?? 'customer'}`}
      footer={footer}>
      {body}
    </ResponsiveSheet>
  );
}

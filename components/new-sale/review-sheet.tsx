"use client";

import { Box, Button, TextField, Typography } from "@mui/material";
import { RefreshCw } from "lucide-react";
import { useState } from "react";

import { newSaleStyles as styles } from "@/app/theme";
import { MoneyField } from "@/components/money-field";
import { PaidBy } from "@/components/paid-by";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { changeText, changeTitle, type EntryChange } from "@/lib/approvals-view";
import { phoneProblem } from "@/lib/new-sale";
import type { OrderCartRow } from "@/lib/order-cart";
import type { PaymentMethod } from "@/lib/payment-methods";

const money = (n: number) => `₦${n.toLocaleString(undefined, { minimumFractionDigits: 0 })}`;
const MAX = 500;

/** The last look before saving: totals, what was paid and how, the job stage, and, when the owner must approve, why. */
export function ReviewSheet({ open, onClose, saving, meta, cart, grandTotal, balance, paymentStatus, stages, onStage, onPaid, onContact, paidBy, onPaidBy, changes, onSave }: {
  open: boolean; onClose: () => void; saving: boolean;
  meta: { clientName: string; contact: string; date: string; initialPayment: string; jobStatus: string };
  cart: OrderCartRow[]; grandTotal: number; balance: number; paymentStatus: string;
  stages: readonly string[]; onStage: (stage: string) => void; onPaid: (value: string) => void; onContact: (value: string) => void;
  paidBy: PaymentMethod | ""; onPaidBy: (method: PaymentMethod | "") => void;
  changes: EntryChange[]; onSave: (reason?: string) => void;
}) {
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();
  const needsApproval = changes.length > 0;
  const paid = parseFloat(meta.initialPayment) || 0;
  // Money still owed means we must be able to reach the customer.
  const contactProblem = phoneProblem(meta.contact, Math.round(balance * 100));
  return <ResponsiveSheet open={open} onClose={onClose} busy={saving} title="Review and save"
    footer={<Box sx={styles.reviewFooter}>
      <Button variant="contained" size="large" disabled={saving || Boolean(contactProblem) || (needsApproval && !trimmed)}
        startIcon={saving ? <RefreshCw size={16} /> : undefined} onClick={() => onSave(needsApproval ? trimmed : undefined)}>
        {saving ? "Saving…" : needsApproval ? "Send for approval" : "Save sale"}
      </Button>
      <Button color="inherit" variant="outlined" disabled={saving} onClick={onClose}>Back to the order</Button>
    </Box>}>
    <Box sx={styles.reviewBody}>
      <Box sx={styles.reviewSummary}>
        <Box sx={styles.reviewLine}><Typography color="text.secondary">Customer</Typography><Typography sx={{ fontWeight: 700 }}>{meta.clientName}</Typography></Box>
        {meta.contact && <Box sx={styles.reviewLine}><Typography color="text.secondary">Contact</Typography><Typography>{meta.contact}</Typography></Box>}
        <Box sx={styles.reviewLine}><Typography color="text.secondary">Date</Typography><Typography sx={{ fontWeight: 700 }}>{meta.date}</Typography></Box>
        <Box sx={styles.reviewLine}><Typography color="text.secondary">Items</Typography><Typography sx={{ fontWeight: 700 }}>{cart.length}</Typography></Box>
        <Box sx={[styles.reviewLine, styles.reviewTotal]}><Typography color="text.secondary">Total</Typography><Typography sx={styles.amount}>{money(grandTotal)}</Typography></Box>
      </Box>

      {/* The saved value is "0" when nothing was paid, but the box starts empty so the cashier never has to delete a zero first. */}
      <MoneyField label="Paid now (₦)" value={meta.initialPayment === "0" ? "" : meta.initialPayment} onChange={onPaid}
        helperText={`${paymentStatus} · balance left ${money(Math.max(0, balance))}`} slotProps={{ htmlInput: { placeholder: "0" } }} />
      {balance > 0 && <TextField label="Customer phone number" required type="tel" value={meta.contact} onChange={(event) => onContact(event.target.value)}
        error={Boolean(contactProblem)} helperText={contactProblem || "Needed because a balance is left. We use it to remind them."} />}
      <PaidBy value={paidBy} onChange={onPaidBy} required={paid > 0} />
      <Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Job stage</Typography>
        <Box sx={styles.stageChips}>
          {stages.map((stage) => <Button key={stage} variant={meta.jobStatus === stage ? "contained" : "outlined"} color={meta.jobStatus === stage ? "primary" : "inherit"}
            aria-pressed={meta.jobStatus === stage} onClick={() => onStage(stage)}>{stage}</Button>)}
        </Box>
      </Box>

      {needsApproval && <Box sx={styles.noticeWarn}>
        <Typography sx={{ fontWeight: 700, mb: 0.5 }}>Needs the owner’s approval</Typography>
        {changes.map((change, index) => <Typography key={index} variant="body2"><strong>{changeTitle(change)}</strong> · {changeText(change)}</Typography>)}
        <TextField label="Why? (required)" multiline minRows={3} fullWidth value={reason} disabled={saving} sx={{ mt: 1.5 }}
          onChange={(event) => setReason(event.target.value.slice(0, MAX))} helperText={`It is not recorded until the owner approves. ${reason.length} / ${MAX}`} />
      </Box>}
    </Box>
  </ResponsiveSheet>;
}

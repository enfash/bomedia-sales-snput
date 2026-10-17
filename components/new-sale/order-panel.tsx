"use client";

import { Box, Button, IconButton, Paper, Typography } from "@mui/material";
import { Layers, Trash2, Wrench } from "lucide-react";

import { newSaleStyles as styles } from "@/app/theme";
import type { OrderCartRow } from "@/lib/order-cart";

const money = (n: number) => `₦${n.toLocaleString(undefined, { minimumFractionDigits: 0 })}`;

function OrderRow({ item, flagged, onRemove }: { item: OrderCartRow; flagged: boolean; onRemove: (id: string) => void }) {
  const service = item.orderItem?.kind === "service";
  const stockOk = item.remainingAfterJob >= 0;
  return <Box sx={styles.orderRow}>
    <Box sx={[styles.orderTile, ...(service ? [styles.orderTileService] : [])]}>{service ? <Wrench size={20} /> : <Layers size={20} />}</Box>
    <Box sx={styles.orderMain}>
      <Typography sx={styles.orderName}>{item.jobDescription || "Unnamed job"}</Typography>
      <Typography variant="body2" color="text.secondary">
        {service ? `${item.rollLabel} · ${item.qty} × ${money(item.unitCost)} · uses no roll` : `${item.rollLabel} · ${item.qty}× ${item.jobWidth}${item.dimUnit} × ${item.jobHeight}${item.dimUnit} · ₦${item.costPerSqft} per sq ft${item.isFlipped ? " · rotated" : ""}`}
      </Typography>
      {!service && !stockOk && <Typography variant="body2" color="error">Not enough stock across all rolls of this material.</Typography>}
      {flagged && <Box component="span" sx={styles.orderFlag}>Price needs owner approval</Box>}
    </Box>
    <Box sx={styles.orderEnd}>
      <Typography sx={styles.amount}>{money(item.totalAmount)}</Typography>
      <IconButton size="small" aria-label={`Remove ${item.jobDescription || "item"}`} onClick={() => onRemove(item.id)}><Trash2 size={16} /></IconButton>
    </Box>
  </Box>;
}

/** The order so far. On a phone it sits under the form; on a wide screen it stays beside it. */
export function OrderPanel({ cart, total, client, flagged, onRemove, onReview, reviewDisabled }: {
  cart: OrderCartRow[]; total: number; client: string; flagged: (item: OrderCartRow) => boolean;
  onRemove: (id: string) => void; onReview: () => void; reviewDisabled: boolean;
}) {
  return <Paper variant="outlined" sx={[styles.card, styles.side]}>
    <Box sx={styles.cardHead}>
      <Typography variant="h6" component="h2">{client.trim() ? `Order for ${client.trim()}` : "Order"}</Typography>
      <Typography variant="body2" color="text.secondary">{cart.length} item{cart.length === 1 ? "" : "s"}</Typography>
    </Box>
    {cart.length === 0
      ? <Typography color="text.secondary">Nothing added yet. Items you add appear here.</Typography>
      : <Box>{cart.map((item) => <OrderRow key={item.id} item={item} flagged={flagged(item)} onRemove={onRemove} />)}</Box>}
    {cart.length > 0 && <Box sx={styles.orderFooter}>
      <Typography color="text.secondary">Total</Typography>
      <Typography sx={styles.orderTotal}>{money(total)}</Typography>
    </Box>}
    <Button variant="contained" size="large" disabled={reviewDisabled} onClick={onReview} sx={styles.reviewButtonDesktop}>Review sale</Button>
  </Paper>;
}

/** Phone only: the total and Review stay in reach while the form scrolls. */
export function TotalBar({ count, total, onReview, disabled }: { count: number; total: number; onReview: () => void; disabled: boolean }) {
  if (!count) return null;
  return <Paper variant="outlined" sx={styles.bar}>
    <Box sx={styles.barMain}>
      <Typography variant="caption" color="text.secondary">Total · {count} item{count === 1 ? "" : "s"}</Typography>
      <Typography sx={styles.orderTotal}>{money(total)}</Typography>
    </Box>
    <Button variant="contained" size="large" disabled={disabled} onClick={onReview}>Review sale</Button>
  </Paper>;
}

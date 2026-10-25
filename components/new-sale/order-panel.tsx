"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Box, Button, ButtonBase, IconButton, Paper, Typography } from "@mui/material";
import { ChevronDown, Layers, Pencil, Trash2, Wrench } from "lucide-react";

import { newSaleStyles as styles, splitColors, splitStyles } from "@/app/theme";
import type { OrderCartRow } from "@/lib/order-cart";
import { groupCart } from "@/lib/split-job";

const money = (n: number) => `₦${n.toLocaleString(undefined, { minimumFractionDigits: 0 })}`;

function OrderRow({ item, flagged, onRemove, onEdit }: { item: OrderCartRow; flagged: boolean; onRemove: (id: string) => void; onEdit: (item: OrderCartRow) => void }) {
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
      <Box sx={styles.orderActions}>
        <IconButton size="small" aria-label={`Edit ${item.jobDescription || "item"}`} onClick={() => onEdit(item)}><Pencil size={16} /></IconButton>
        <IconButton size="small" aria-label={`Remove ${item.jobDescription || "item"}`} onClick={() => onRemove(item.id)}><Trash2 size={16} /></IconButton>
      </Box>
    </Box>
  </Box>;
}

/** One job split across materials: a single line with its materials as a bar; open it to see each material. Edit puts the whole job back in the form. */
function JobRow({ job, flagged, onRemove, onEdit, onEditJob, onRemoveJob }: {
  job: Extract<ReturnType<typeof groupCart<OrderCartRow>>[number], { kind: "job" }>; flagged: (item: OrderCartRow) => boolean;
  onRemove: (id: string) => void; onEdit: (item: OrderCartRow) => void; onEditJob: (id: string) => void; onRemoveJob: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const title = job.spec.description || job.items[0].itemName;
  const widths = job.items.map((i) => i.widthFt).join(", ");
  return <Box sx={splitStyles.job}>
    <Box sx={splitStyles.jobHead}>
      <Box sx={styles.orderMain}>
        <Typography sx={styles.orderName}>{title} · {job.pieces.toLocaleString()} pieces</Typography>
        <Typography variant="body2" color="text.secondary">{job.items.length} material{job.items.length === 1 ? "" : "s"}: {widths} ft</Typography>
      </Box>
      <Typography sx={styles.amount}>{money(job.total)}</Typography>
    </Box>
    <Box sx={[splitStyles.bar, splitStyles.barSmall]} aria-hidden="true">
      {job.items.map((item, index) => <Box key={item.id} sx={{ width: `${(item.qty / job.pieces) * 100}%`, bgcolor: splitColors[index % splitColors.length] }} />)}
    </Box>
    <Box sx={splitStyles.jobActions}>
      <Button variant="outlined" color="inherit" startIcon={<Pencil size={16} />} onClick={() => onEditJob(job.id)} aria-label={`Edit ${title}`}>Edit</Button>
      <Button variant="outlined" color="inherit" startIcon={<Trash2 size={16} />} onClick={() => onRemoveJob(job.id)} aria-label={`Remove ${title}`}>Remove</Button>
    </Box>
    <ButtonBase sx={splitStyles.jobToggle} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      {open ? "Hide" : "Show"} the {job.items.length} materials <Box component="span" sx={[splitStyles.jobChevron, open && splitStyles.jobChevronOpen]} aria-hidden="true"><ChevronDown size={16} /></Box>
    </ButtonBase>
    {open && <Box sx={splitStyles.jobLines}>{job.items.map((item) => <OrderRow key={item.id} item={item} flagged={flagged(item)} onRemove={onRemove} onEdit={onEdit} />)}</Box>}
  </Box>;
}

/** The order so far. On a phone it sits under the form; on a wide screen it stays beside it. */
export function OrderPanel({ cart, total, client, flagged, onRemove, onEdit, onEditJob, onRemoveJob, onReview, reviewDisabled }: {
  cart: OrderCartRow[]; total: number; client: string; flagged: (item: OrderCartRow) => boolean;
  onRemove: (id: string) => void; onEdit: (item: OrderCartRow) => void; onEditJob: (id: string) => void; onRemoveJob: (id: string) => void; onReview: () => void; reviewDisabled: boolean;
}) {
  return <Paper variant="outlined" sx={[styles.card, styles.side]}>
    <Box sx={styles.cardHead}>
      <Typography variant="h6" component="h2">{client.trim() ? `Order for ${client.trim()}` : "Order"}</Typography>
      <Typography variant="body2" color="text.secondary">{groupCart(cart).length} item{groupCart(cart).length === 1 ? "" : "s"}</Typography>
    </Box>
    {cart.length === 0
      ? <Typography color="text.secondary">Nothing added yet. Items you add appear here.</Typography>
      : <Box>{groupCart(cart).map((entry) => entry.kind === "job"
        ? <JobRow key={entry.id} job={entry} flagged={flagged} onRemove={onRemove} onEdit={onEdit} onEditJob={onEditJob} onRemoveJob={onRemoveJob} />
        : <OrderRow key={entry.item.id} item={entry.item} flagged={flagged(entry.item)} onRemove={onRemove} onEdit={onEdit} />)}</Box>}
    {cart.length > 0 && <Box sx={styles.orderFooter}>
      <Typography color="text.secondary">Total</Typography>
      <Typography sx={styles.orderTotal}>{money(total)}</Typography>
    </Box>}
    <Button variant="contained" size="large" disabled={reviewDisabled} onClick={onReview} sx={styles.reviewButtonDesktop}>Review sale</Button>
  </Paper>;
}

/** Below the wide layout: the total and Review stay in reach while the form scrolls, over the page area (not under the side menu). */
export function TotalBar({ count, total, onReview, disabled }: { count: number; total: number; onReview: () => void; disabled: boolean }) {
  const bar = useRef<HTMLDivElement>(null);
  // Follow the page area: it starts after the side menu, which can be open, folded, or absent on a phone.
  useLayoutEffect(() => {
    const page = document.getElementById("main-content");
    if (!page || !count) return;
    const place = () => {
      const box = page.getBoundingClientRect();
      bar.current?.style.setProperty("--bar-left", `${Math.max(0, box.left)}px`);
      bar.current?.style.setProperty("--bar-right", `${Math.max(0, window.innerWidth - box.right)}px`);
    };
    place();
    const watch = new ResizeObserver(place);
    watch.observe(page);
    window.addEventListener("resize", place);
    return () => { watch.disconnect(); window.removeEventListener("resize", place); };
  }, [count]);
  if (!count) return null;
  return <Paper ref={bar} variant="outlined" sx={styles.bar}>
    <Box sx={styles.barMain}>
      <Typography variant="caption" color="text.secondary">Total · {count} item{count === 1 ? "" : "s"}</Typography>
      <Typography sx={styles.orderTotal}>{money(total)}</Typography>
    </Box>
    <Button variant="contained" size="large" disabled={disabled} onClick={onReview}>Review sale</Button>
  </Paper>;
}

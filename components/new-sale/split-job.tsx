"use client";

import { useMemo, useState } from "react";
import { Box, Button, ButtonBase, IconButton, TextField, Typography } from "@mui/material";
import { Check, Minus, Plus } from "lucide-react";
import { toast } from "sonner";

import { newSaleStyles, splitColors, splitStyles as styles } from "@/app/theme";
import { SegmentedControl } from "@/components/segmented-control";
import { nairaToKobo } from "@/lib/accounting-entry";
import { cartOrderItem, type OrderCartRow } from "@/lib/order-cart";
import { orderItemTotal, type OrderCatalog } from "@/lib/order-contract";
import { fitLength, planSplit, shareFigures, type SplitMaterial, type SplitSpec, type Strategy } from "@/lib/split-job";

type MaterialRow = Record<string, string | number | undefined>;
const parseNum = (v: string | number | undefined) => parseFloat(String(v ?? "0").replace(/[^\d.-]/g, "")) || 0;
const money = (n: number) => `₦${Math.round(n).toLocaleString()}`;
const feet = (n: number) => `${(Math.round(n * 10) / 10).toLocaleString()} ft`;
const STRATEGIES = [{ value: "least-waste", label: "Least waste" }, { value: "most-stock", label: "Most stock first" }, { value: "even", label: "Even share" }] as const;

/** What the admin typed before, to put a whole job back into the form. */
export type SplitEdit = { key: number; spec: SplitSpec; shares: { id: string; pieces: number }[] };

/**
 * One job printed on several materials (admin New Sale only). The admin ticks the materials that may be used, the app suggests a split,
 * and every number can be changed. "Use this plan" adds one ordinary item per material, so each has its own roll, stock check and price.
 */
export function SplitJob({ materials, catalog, postgres, initial, onUse }: {
  materials: MaterialRow[]; catalog: OrderCatalog | null; postgres: boolean; initial?: SplitEdit; onUse: (items: OrderCartRow[]) => void;
}) {
  const [spec, setSpec] = useState<SplitSpec>(initial?.spec ?? { description: "", width: "", height: "", unit: "ft", totalPieces: "", price: "" });
  const [shares, setShares] = useState<Record<string, string>>(() => Object.fromEntries((initial?.shares ?? []).map((s) => [s.id, String(s.pieces)])));
  const [allowed, setAllowed] = useState<string[]>(() => (initial?.shares ?? []).map((s) => s.id));
  const [strategy, setStrategy] = useState<Strategy>("least-waste");
  const set = (patch: Partial<SplitSpec>) => setSpec((previous) => ({ ...previous, ...patch }));

  const all = useMemo(() => materials.map((m) => ({
    id: String(m["Material ID"]), name: String(m["Material Name"] ?? m["Material ID"]), widthFt: parseNum(m["Width (ft)"]), stockFt: parseNum(m["Total Remaining (ft)"]), price: parseNum(m["Selling Price"]),
  })).filter((m) => m.id && m.widthFt > 0).sort((a, b) => a.name.localeCompare(b.name) || b.widthFt - a.widthFt), [materials]);

  const scale = spec.unit === "in" ? 1 / 12 : 1;
  const jobW = (parseFloat(spec.width) || 0) * scale, jobH = (parseFloat(spec.height) || 0) * scale;
  const total = /^[1-9][0-9]{0,4}$/.test(spec.totalPieces) ? Number(spec.totalPieces) : 0;
  const price = parseFloat(spec.price) || 0;
  const chosen = all.filter((m) => allowed.includes(m.id));
  const piecesOf = (id: string) => Math.max(0, Math.floor(Number(shares[id] ?? "0")) || 0);
  const placed = chosen.reduce((sum, m) => sum + piecesOf(m.id), 0);
  const left = total - placed;
  const sqft = jobW * jobH;

  const toggle = (material: (typeof all)[number]) => {
    setAllowed((previous) => previous.includes(material.id) ? previous.filter((id) => id !== material.id) : [...previous, material.id]);
    if (!spec.price && material.price > 0) set({ price: String(material.price) });
  };
  const makePlan = () => {
    if (!chosen.length) { toast.error("Tick at least one material first."); return; }
    if (!jobW || !jobH || !total) { toast.error("Enter the size and the total pieces first."); return; }
    const plan = planSplit({ jobW, jobH, pieces: total, materials: chosen as SplitMaterial[], strategy });
    setShares(Object.fromEntries(plan.shares.map((s) => [s.id, String(s.pieces)])));
    if (plan.unplaced > 0) toast.warning(`The stock of these materials holds ${total - plan.unplaced} of ${total} pieces. Tick more materials or restock.`);
  };
  const step = (id: string, delta: number) => setShares((previous) => ({ ...previous, [id]: String(Math.max(0, piecesOf(id) + delta)) }));

  const rows = chosen.map((m, index) => ({ m, index, pieces: piecesOf(m.id), ...shareFigures(jobW, jobH, m, piecesOf(m.id)) }));
  const problem = !jobW || !jobH ? "Enter the size." : !total ? "Enter the total pieces (1 to 99,999)." : !(price > 0) || !nairaToKobo(spec.price) ? "Enter the price per sq ft."
    : !chosen.length ? "Tick the materials to use." : rows.some((r) => r.pieces > 0 && !r.fits) ? "A piece is wider than one of the rolls in both directions."
    : rows.some((r) => !r.enough) ? "A material does not have enough roll for its pieces." : left > 0 ? `${left.toLocaleString()} pieces still to place.`
    : left < 0 ? `${(-left).toLocaleString()} pieces too many.` : "";

  const use = () => {
    if (problem) { toast.error(problem); return; }
    const groupId = crypto.randomUUID(), description = spec.description.trim();
    try {
      const items = rows.filter((r) => r.pieces > 0).map((r) => {
        const line: OrderCartRow = {
          id: crypto.randomUUID(), materialId: r.m.id, rollLabel: r.m.id, itemName: r.m.name, widthFt: r.m.widthFt,
          jobDescription: `${description || `${r.m.name} print job`} (${r.m.widthFt} ft roll)`, jobWidth: parseFloat(spec.width), jobHeight: parseFloat(spec.height), dimUnit: spec.unit,
          qty: r.pieces, costPerSqft: price, unitSqft: sqft, unitCost: sqft * price, totalAmount: sqft * price * r.pieces, jobLengthFt: r.lengthFt, remainingAfterJob: r.leftFt,
          fromInventory: true, isFlipped: r.turned, group: { id: groupId, spec: { ...spec, description } },
        };
        if (postgres) {
          line.orderItem = cartOrderItem(line, catalog);
          line.totalAmount = Number(orderItemTotal(line.orderItem)) / 100;
          line.unitCost = line.totalAmount / line.qty;
        }
        return line;
      });
      onUse(items);
    } catch (error) { toast.error((error as Error).message); }
  };

  return <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
    <TextField fullWidth label="What is it? (optional)" placeholder="Flex 2 × 3 ft" value={spec.description} onChange={(e) => set({ description: e.target.value })} />
    <SegmentedControl label="Size unit" value={spec.unit} options={[{ value: "ft", label: "Feet" }, { value: "in", label: "Inches" }]} onChange={(unit) => set({ unit })} />
    <Box sx={newSaleStyles.grid3}>
      <TextField type="number" label={`Width (${spec.unit})`} value={spec.width} onChange={(e) => set({ width: e.target.value })} />
      <TextField type="number" label={`Height (${spec.unit})`} value={spec.height} onChange={(e) => set({ height: e.target.value })} />
      <TextField label="Total pieces" value={spec.totalPieces} onChange={(e) => set({ totalPieces: e.target.value.replace(/\D/g, "").slice(0, 5) })} slotProps={{ htmlInput: { inputMode: "numeric" } }} />
    </Box>
    <TextField label="Price per sq ft (₦), all materials" type="number" value={spec.price} onChange={(e) => set({ price: e.target.value })}
      helperText={sqft > 0 && total > 0 && price > 0 ? `${Math.round(sqft * total).toLocaleString()} sq ft in all · each piece ${money(sqft * price)}` : "Filled in from the first material you tick."} />

    <Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Which materials can be used?</Typography>
      <Typography variant="body2" color="text.secondary">Tick every width you are happy to use. Stock left is shown on each.</Typography>
    </Box>
    <Box sx={styles.chips}>
      {all.map((m) => {
        const on = allowed.includes(m.id), narrow = jobW > 0 && jobH > 0 && !fitLength(jobW, jobH, m.widthFt, 1).fits;
        return <ButtonBase key={m.id} role="checkbox" aria-checked={on} onClick={() => toggle(m)} sx={[styles.chip, on && styles.chipOn, narrow && styles.chipNarrow]}>
          <Box component="span" sx={[styles.chipBox, on && styles.chipBoxOn]}>{on && <Check size={12} strokeWidth={3} />}</Box>
          <Box component="span" sx={{ fontWeight: 600 }}>{m.name} {m.widthFt} ft</Box>
          <Box component="span" sx={{ color: "text.secondary" }}>{narrow ? "too narrow" : `${Math.round(m.stockFt).toLocaleString()} ft left`}</Box>
        </ButtonBase>;
      })}
    </Box>
    <Box sx={styles.planBar}>
      <Typography variant="body2" sx={{ fontWeight: 600 }} color="text.secondary">Plan by</Typography>
      <Box sx={{ minWidth: { xs: "100%", sm: 380 } }}><SegmentedControl label="Plan by" value={strategy} options={STRATEGIES} onChange={setStrategy} /></Box>
      <Button variant="contained" onClick={makePlan}>Make a plan</Button>
    </Box>

    {chosen.length > 0 && <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 1, flexWrap: "wrap" }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Plan</Typography>
        <Typography variant="body2" color="text.secondary">Change any number. The total and the roll used update.</Typography>
      </Box>
      <Box sx={styles.bar} aria-hidden="true">
        {rows.map((r) => r.pieces > 0 && total > 0 ? <Box key={r.m.id} sx={{ width: `${(r.pieces / Math.max(total, placed)) * 100}%`, bgcolor: splitColors[r.index % splitColors.length] }} /> : null)}
      </Box>
      <Box>
        <Box sx={styles.planHead}><span>Material</span><span>Pieces</span><span>Roll used</span><span>Left after</span><Box component="span" sx={{ textAlign: "right" }}>Amount</Box></Box>
        {rows.map((r) => <Box key={r.m.id} sx={styles.planRow}>
          <Box sx={styles.material}><Box component="span" sx={[styles.swatch, { bgcolor: splitColors[r.index % splitColors.length] }]} />{r.m.name} {r.m.widthFt} ft</Box>
          <Box sx={styles.stepper}>
            <IconButton sx={styles.stepButton} aria-label={`Fewer on ${r.m.name} ${r.m.widthFt} ft`} onClick={() => step(r.m.id, -1)}><Minus size={16} /></IconButton>
            <TextField size="small" sx={styles.piecesInput} value={shares[r.m.id] ?? "0"}
              onChange={(e) => setShares((previous) => ({ ...previous, [r.m.id]: e.target.value.replace(/\D/g, "").slice(0, 5) }))}
              slotProps={{ htmlInput: { inputMode: "numeric", "aria-label": `Pieces on ${r.m.name} ${r.m.widthFt} ft` } }} />
            <IconButton sx={styles.stepButton} aria-label={`More on ${r.m.name} ${r.m.widthFt} ft`} onClick={() => step(r.m.id, 1)}><Plus size={16} /></IconButton>
          </Box>
          <Box sx={styles.figures}>
            <Typography sx={styles.figure}>{r.pieces > 0 ? (r.fits ? feet(r.lengthFt) : "Does not fit") : "—"}</Typography>
            <Typography sx={[styles.figure, !r.enough && styles.figureShort]}>{r.pieces > 0 && r.fits ? (r.enough ? feet(r.leftFt) : `Short by ${feet(-r.leftFt)}`) : `${feet(r.m.stockFt)} in stock`}</Typography>
            <Typography sx={{ fontWeight: 600, textAlign: { md: "right" } }}>{r.pieces > 0 ? money(r.pieces * sqft * price) : "—"}</Typography>
          </Box>
        </Box>)}
      </Box>
      <Box sx={styles.summary}>
        <Typography component="span" sx={{ fontWeight: 700 }}>{placed.toLocaleString()} of {total.toLocaleString()} pieces placed</Typography>
        <Typography component="span" sx={[{ fontWeight: 700 }, problem ? styles.short : styles.ok]}>{problem || "Plan covers the job"}</Typography>
      </Box>
    </Box>}
    <Button fullWidth variant="contained" size="large" disabled={Boolean(problem)} onClick={use}>
      Use this plan{!problem && total > 0 ? ` · ${money(total * sqft * price)}` : ""}
    </Button>
  </Box>;
}

// One job printed on several materials (admin New Sale). Pure sums: how a piece fits a roll, how many pieces a stock of roll will hold,
// and a suggested split. The roll-length rule is the same one the single-material form uses (including turning the piece to fit).
const TOLERANCE = 0.01;

export type SplitMaterial = { id: string; name: string; widthFt: number; stockFt: number };
export type Strategy = 'least-waste' | 'most-stock' | 'even';

/** How many pieces go across the roll and how long one row is, for each way round the piece can lie. */
function orientations(jobW: number, jobH: number, rollW: number) {
  const options: { perRow: number; rowFt: number; turned: boolean }[] = [];
  if (jobW > 0 && jobW <= rollW + TOLERANCE) options.push({ perRow: Math.floor((rollW + TOLERANCE) / jobW), rowFt: jobH, turned: false });
  if (jobH > 0 && jobH <= rollW + TOLERANCE) options.push({ perRow: Math.floor((rollW + TOLERANCE) / jobH), rowFt: jobW, turned: true });
  return options;
}

/** The roll length `pieces` need, the way the single-material form works it out: the piece is turned only when that is strictly shorter. */
export function fitLength(jobW: number, jobH: number, rollW: number, pieces: number): { fits: boolean; lengthFt: number; turned: boolean; perRow: number; rowFt: number } {
  const options = orientations(jobW, jobH, rollW).map((o) => ({ ...o, lengthFt: Math.ceil(pieces / o.perRow) * o.rowFt }));
  if (!options.length) return { fits: false, lengthFt: 0, turned: false, perRow: 0, rowFt: 0 };
  const normal = options.find((o) => !o.turned), turned = options.find((o) => o.turned);
  const best = normal && turned ? (turned.lengthFt < normal.lengthFt ? turned : normal) : (normal ?? turned)!;
  return { fits: true, lengthFt: best.lengthFt, turned: best.turned, perRow: best.perRow, rowFt: best.rowFt };
}

/** The most pieces `stockFt` of this roll width will hold (whole rows only). */
export function capacity(jobW: number, jobH: number, rollW: number, stockFt: number): number {
  return orientations(jobW, jobH, rollW).reduce((best, o) => Math.max(best, o.perRow * Math.floor((stockFt + 0.0001) / o.rowFt)), 0);
}

/** Roll area left unused, in sq ft, for `pieces` on this width. */
export function wasteSqft(jobW: number, jobH: number, rollW: number, pieces: number): number {
  const fit = fitLength(jobW, jobH, rollW, pieces);
  return fit.fits ? Math.max(0, Math.round((rollW * fit.lengthFt - pieces * jobW * jobH) * 100) / 100) : 0;
}

export type PlanInput = { jobW: number; jobH: number; pieces: number; materials: SplitMaterial[]; strategy: Strategy };
export type Plan = { shares: { id: string; pieces: number }[]; unplaced: number };

/** A suggested split. Every number can be changed by hand afterwards. */
export function planSplit({ jobW, jobH, pieces, materials, strategy }: PlanInput): Plan {
  const caps = materials.map((m) => ({ m, cap: capacity(jobW, jobH, m.widthFt, m.stockFt) }));
  const share = new Map<string, number>(materials.map((m) => [m.id, 0]));
  if (strategy === 'even') {
    const total = caps.reduce((sum, c) => sum + c.cap, 0);
    if (total > 0) {
      const goal = Math.min(pieces, total);
      const raw = caps.map((c) => ({ ...c, exact: (goal * c.cap) / total }));
      raw.forEach((r) => share.set(r.m.id, Math.min(r.cap, Math.floor(r.exact))));
      let left = goal - [...share.values()].reduce((a, b) => a + b, 0);
      for (const r of [...raw].sort((a, b) => (b.exact - Math.floor(b.exact)) - (a.exact - Math.floor(a.exact)) || b.m.stockFt - a.m.stockFt)) {
        if (left <= 0) break;
        if ((share.get(r.m.id) ?? 0) < r.cap) { share.set(r.m.id, (share.get(r.m.id) ?? 0) + 1); left -= 1; }
      }
      // A rounding step can leave a few pieces; give them to whoever still has room.
      for (const r of [...caps].sort((a, b) => b.cap - a.cap)) {
        while (left > 0 && (share.get(r.m.id) ?? 0) < r.cap) { share.set(r.m.id, (share.get(r.m.id) ?? 0) + 1); left -= 1; }
      }
    }
  } else {
    const wasteFraction = (c: { m: SplitMaterial; cap: number }) => {
      const area = c.m.widthFt * fitLength(jobW, jobH, c.m.widthFt, Math.max(1, c.cap)).lengthFt;
      return area > 0 ? Math.max(0, area - Math.max(1, c.cap) * jobW * jobH) / area : 1;
    };
    const order = [...caps].filter((c) => c.cap > 0).sort(strategy === 'least-waste'
      ? (a, b) => wasteFraction(a) - wasteFraction(b) || b.m.widthFt - a.m.widthFt
      : (a, b) => b.m.stockFt - a.m.stockFt || b.m.widthFt - a.m.widthFt);
    let left = pieces;
    for (const c of order) { const take = Math.min(left, c.cap); share.set(c.m.id, take); left -= take; }
  }
  const placed = [...share.values()].reduce((a, b) => a + b, 0);
  return { shares: materials.map((m) => ({ id: m.id, pieces: share.get(m.id) ?? 0 })), unplaced: Math.max(0, pieces - placed) };
}

/** What one share of the job needs from its roll, and whether the stock covers it. */
export function shareFigures(jobW: number, jobH: number, material: SplitMaterial, pieces: number) {
  const fit = fitLength(jobW, jobH, material.widthFt, pieces);
  const lengthFt = pieces > 0 && fit.fits ? fit.lengthFt : 0;
  return { ...fit, lengthFt, leftFt: material.stockFt - lengthFt, enough: pieces === 0 || (fit.fits && material.stockFt - lengthFt >= -0.0001) };
}

/** What was typed for a split job, kept on each of its lines so the whole job can be put back into the form. */
export type SplitSpec = { description: string; width: string; height: string; unit: 'ft' | 'in'; totalPieces: string; price: string };

type GroupedLine = { id: string; group?: { id: string; spec: SplitSpec }; qty: number; totalAmount: number };
export type CartEntry<T extends GroupedLine> = { kind: 'item'; item: T } | { kind: 'job'; id: string; spec: SplitSpec; items: T[]; pieces: number; total: number };

/** The order list as the screen draws it: single items as they are, and the lines of one split job together under it, in the order first added. */
export function groupCart<T extends GroupedLine>(cart: T[]): CartEntry<T>[] {
  const entries: CartEntry<T>[] = [];
  const jobs = new Map<string, Extract<CartEntry<T>, { kind: 'job' }>>();
  for (const item of cart) {
    if (!item.group) { entries.push({ kind: 'item', item }); continue; }
    let job = jobs.get(item.group.id);
    if (!job) { job = { kind: 'job', id: item.group.id, spec: item.group.spec, items: [], pieces: 0, total: 0 }; jobs.set(job.id, job); entries.push(job); }
    job.items.push(item); job.pieces += item.qty; job.total += item.totalAmount;
  }
  return entries;
}

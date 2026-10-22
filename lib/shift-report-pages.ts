// How a Shift Report PDF is split over A4 pages (794 x 1123 px). Every row has a fixed height, so the split is exact and nothing is ever cut off.

export const PAGE = { height: 1123, top: 44, bottom: 36, footer: 34 } as const;
export const ROW = { job: 44, line: 34, sectionHead: 52, gap: 20, signoff: 70 } as const;
/** Height used up by the logo header, the headline figures and the summary on the first page, and by the small header on later pages. */
export const HEAD = { first: 360, next: 58 } as const;

const BUDGET = PAGE.height - PAGE.top - PAGE.bottom - PAGE.footer;

export type SegmentKind = "jobs" | "materials" | "expenses" | "signoff";
export type Segment = { kind: SegmentKind; from: number; to: number; continued: boolean };
export type PdfPage = { segments: Segment[]; used: number };

/** Splits jobs, materials and expenses over as many pages as needed. Sections keep their heading with at least one row, and a table heading repeats when it continues on a new page. */
export function paginateShiftReport(counts: { jobs: number; materials: number; expenses: number }): PdfPage[] {
  const pages: PdfPage[] = [{ segments: [], used: HEAD.first }];
  const page = () => pages[pages.length - 1];
  const newPage = () => { pages.push({ segments: [], used: HEAD.next }); };

  const place = (kind: "jobs" | "materials" | "expenses", total: number, rowHeight: number) => {
    if (total === 0) return;
    let next = 0;
    while (next < total) {
      const gap = page().segments.length > 0 && next === 0 ? ROW.gap : 0;
      if (page().used + gap + ROW.sectionHead + rowHeight > BUDGET) { newPage(); continue; }
      page().used += gap + ROW.sectionHead;
      const room = Math.floor((BUDGET - page().used) / rowHeight);
      const take = Math.min(total - next, room);
      page().segments.push({ kind, from: next, to: next + take, continued: next > 0 });
      page().used += take * rowHeight;
      next += take;
      if (next < total) newPage();
    }
  };

  place("jobs", counts.jobs, ROW.job);
  place("materials", counts.materials, ROW.line);
  place("expenses", counts.expenses, ROW.line);

  const gap = page().segments.length > 0 ? ROW.gap : 0;
  if (page().used + gap + ROW.signoff > BUDGET) newPage();
  page().used += (page().segments.length > 0 ? ROW.gap : 0) + ROW.signoff;
  page().segments.push({ kind: "signoff", from: 0, to: 0, continued: false });
  return pages;
}

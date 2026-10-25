import { describe, expect, it } from "vitest";

import { PAGE, paginateShiftReport, type Segment } from "./shift-report-pages";

const BUDGET = PAGE.height - PAGE.top - PAGE.bottom - PAGE.footer;
const rowsOf = (pages: ReturnType<typeof paginateShiftReport>, kind: Segment["kind"]) =>
  pages.flatMap((p) => p.segments).filter((s) => s.kind === kind).flatMap((s) => Array.from({ length: s.to - s.from }, (_, i) => s.from + i));

describe("Shift Report page split", () => {
  it("keeps a short report on one page with the signature block", () => {
    const pages = paginateShiftReport({ jobs: 4, materials: 1, expenses: 1 });
    expect(pages).toHaveLength(1);
    expect(pages[0].segments.map((s) => s.kind)).toEqual(["jobs", "materials", "expenses", "signoff"]);
  });

  it("shows every job, material and expense exactly once, in order, however long the report is", () => {
    for (const counts of [{ jobs: 40, materials: 7, expenses: 25 }, { jobs: 200, materials: 30, expenses: 120 }, { jobs: 0, materials: 0, expenses: 60 }, { jobs: 13, materials: 0, expenses: 0 }]) {
      const pages = paginateShiftReport(counts);
      expect(rowsOf(pages, "jobs")).toEqual(Array.from({ length: counts.jobs }, (_, i) => i));
      expect(rowsOf(pages, "materials")).toEqual(Array.from({ length: counts.materials }, (_, i) => i));
      expect(rowsOf(pages, "expenses")).toEqual(Array.from({ length: counts.expenses }, (_, i) => i));
    }
  });

  it("never fills a page beyond its height, so nothing is cut off", () => {
    for (const jobs of [1, 11, 12, 13, 24, 25, 26, 57, 300]) {
      for (const page of paginateShiftReport({ jobs, materials: 3, expenses: 5 })) expect(page.used).toBeLessThanOrEqual(BUDGET);
    }
  });

  it("marks a table that carries on from the page before, and puts the signature block on the last page only", () => {
    const pages = paginateShiftReport({ jobs: 60, materials: 2, expenses: 2 });
    expect(pages.length).toBeGreaterThan(2);
    expect(pages[0].segments[0].continued).toBe(false);
    expect(pages[1].segments[0]).toMatchObject({ kind: "jobs", continued: true });
    const signoffs = pages.filter((p) => p.segments.some((s) => s.kind === "signoff"));
    expect(signoffs).toEqual([pages[pages.length - 1]]);
  });

  it("gives an empty day one page with just the signature block", () => {
    const pages = paginateShiftReport({ jobs: 0, materials: 0, expenses: 0 });
    expect(pages).toHaveLength(1);
    expect(pages[0].segments.map((s) => s.kind)).toEqual(["signoff"]);
  });
});

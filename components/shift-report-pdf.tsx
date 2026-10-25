"use client";

import { Fragment, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Box from "@mui/material/Box";
import type { SxProps, Theme } from "@mui/material/styles";

import { shiftReportPdfStyles as pdf } from "@/app/theme";
import { RECEIPT_LOGO_ASPECT, RECEIPT_LOGO_DATA_URI } from "@/lib/receipt-logo";
import { paginateShiftReport, type PdfPage, type Segment } from "@/lib/shift-report-pages";

export type PdfReport = {
  dateLabel: string;
  cashierLabel: string;
  printedAt: string;
  collected: string;
  net: string;
  netNote: string;
  /** Receipts by payment method, with the share of the bar each takes. Absent for the older Sheets report. */
  split: { label: string; value: string; percent: number; color: string }[] | null;
  facts: { label: string; value: string; danger?: boolean }[];
  jobs: { client: string; desc: string; by: string; amount: string; paid: string; status: string }[];
  materials: { name: string; count: number; revenue: string }[];
  expenses: { category: string; desc: string; amount: string }[];
};

const STATUS_TAG: Record<string, { tag: SxProps<Theme>; label: string }> = {
  Paid: { tag: pdf.tagPaid, label: "Paid" },
  "Part-payment": { tag: pdf.tagPart, label: "Part paid" },
  Unpaid: { tag: pdf.tagUnpaid, label: "Unpaid" },
};

function Logo({ small }: { small?: boolean }) {
  const height = small ? 28 : 46;
  return <Box component="img" src={RECEIPT_LOGO_DATA_URI} alt="BOMedia" width={Math.round(height * RECEIPT_LOGO_ASPECT)} height={height} sx={small ? pdf.logoSmall : pdf.logo} />;
}

function FirstHead({ report }: { report: PdfReport }) {
  return (
    <>
      <Box sx={pdf.head}>
        <Logo />
        <Box sx={pdf.headRight}>
          <Box component="p" sx={pdf.kicker}>SHIFT REPORT</Box>
          <Box component="p" sx={pdf.date}>{report.dateLabel}</Box>
          <Box component="p" sx={pdf.who}>{report.cashierLabel}</Box>
        </Box>
      </Box>
      <Box sx={pdf.hero}>
        <Box sx={[pdf.heroCell, pdf.heroCellLeft]}>
          <Box component="p" sx={pdf.heroLabel}>COLLECTED TODAY</Box>
          <Box component="p" sx={[pdf.heroValue, { color: "#2e388d" }]}>{report.collected}</Box>
          <Box component="p" sx={pdf.heroNote}>All payment methods, by payment date</Box>
        </Box>
        <Box sx={[pdf.heroCell, pdf.heroCellRight]}>
          <Box component="p" sx={pdf.heroLabel}>NET CASH IN HAND</Box>
          <Box component="p" sx={[pdf.heroValue, { color: "#1f5a40" }]}>{report.net}</Box>
          <Box component="p" sx={pdf.heroNote}>{report.netNote}</Box>
        </Box>
      </Box>
      <Box sx={pdf.split}>
        {report.split && (
          <>
            <Box sx={pdf.splitBar}>
              {report.split.filter((part) => part.percent > 0).map((part, i) => (
                <Box key={part.label} sx={{ width: `${part.percent}%`, bgcolor: part.color, borderLeft: i > 0 ? "2px solid #ffffff" : 0 }} />
              ))}
            </Box>
            <Box sx={pdf.legend}>
              {report.split.map((part) => (
                <Box key={part.label} sx={pdf.legendItem}>
                  <Box component="span" sx={[pdf.dot, { bgcolor: part.color }]} />
                  <Box component="span" sx={pdf.muted}>{part.label}</Box>
                  <Box component="strong">{part.value}</Box>
                </Box>
              ))}
            </Box>
          </>
        )}
      </Box>
      <Box sx={pdf.facts}>
        {report.facts.map((fact) => (
          <Box key={fact.label} sx={pdf.fact}>
            <Box component="p" sx={pdf.factLabel}>{fact.label.toUpperCase()}</Box>
            <Box component="p" sx={[pdf.factValue, fact.danger ? pdf.danger : {}]}>{fact.value}</Box>
          </Box>
        ))}
      </Box>
    </>
  );
}

function NextHead({ report }: { report: PdfReport }) {
  return (
    <Box sx={pdf.headNext}>
      <Logo small />
      <Box sx={pdf.headRight}>
        <Box component="p" sx={pdf.dateSmall}>Shift Report · {report.dateLabel}</Box>
        <Box component="p" sx={pdf.who}>{report.cashierLabel}</Box>
      </Box>
    </Box>
  );
}

function SegmentView({ report, segment, first }: { report: PdfReport; segment: Segment; first: boolean }) {
  const gap = first ? pdf.section : [pdf.section, pdf.sectionGap];
  if (segment.kind === "signoff") {
    return (
      <Box sx={pdf.signoff}>
        <Box sx={pdf.signLine}>Cashier signature</Box>
        <Box sx={pdf.signLine}>Owner signature</Box>
      </Box>
    );
  }
  const cont = segment.continued ? " (continued)" : "";
  if (segment.kind === "jobs") {
    return (
      <Box sx={gap}>
        <Box sx={pdf.sectionTitle}>
          <Box component="h2" sx={pdf.sectionName}>JOBS{cont}</Box>
          <Box component="p" sx={pdf.sectionNote}>{report.jobs.length} job{report.jobs.length === 1 ? "" : "s"}</Box>
        </Box>
        <Box sx={pdf.tableHead}>
          <Box>#</Box><Box>CLIENT</Box><Box>JOB</Box><Box>BY</Box><Box sx={pdf.right}>AMOUNT</Box><Box sx={pdf.right}>PAID</Box><Box sx={pdf.center}>STATUS</Box>
        </Box>
        {report.jobs.slice(segment.from, segment.to).map((job, i) => {
          const status = STATUS_TAG[job.status] ?? { tag: pdf.tagOther, label: job.status };
          return (
            <Box key={segment.from + i} sx={pdf.jobRow}>
              <Box sx={pdf.muted}>{segment.from + i + 1}</Box>
              <Box sx={[pdf.strong, pdf.clip]}>{job.client}</Box>
              <Box sx={pdf.clip}>{job.desc}</Box>
              <Box sx={pdf.clip}>{job.by}</Box>
              <Box sx={[pdf.right, pdf.strong]}>{job.amount}</Box>
              <Box sx={pdf.right}>{job.paid}</Box>
              <Box sx={pdf.center}><Box component="span" sx={status.tag}>{status.label}</Box></Box>
            </Box>
          );
        })}
      </Box>
    );
  }
  if (segment.kind === "materials") {
    return (
      <Box sx={gap}>
        <Box sx={pdf.sectionTitle}><Box component="h2" sx={pdf.sectionName}>MATERIALS{cont}</Box></Box>
        <Box sx={pdf.pairHead}><Box>MATERIAL</Box><Box>REVENUE</Box></Box>
        {report.materials.slice(segment.from, segment.to).map((m) => (
          <Box key={m.name} sx={pdf.line}>
            <Box sx={pdf.lineMain}><Box component="strong">{m.name}</Box> <Box component="span" sx={pdf.muted}>· {m.count} job{m.count === 1 ? "" : "s"}</Box></Box>
            <Box component="strong">{m.revenue}</Box>
          </Box>
        ))}
      </Box>
    );
  }
  return (
    <Box sx={gap}>
      <Box sx={pdf.sectionTitle}><Box component="h2" sx={pdf.sectionName}>EXPENSES PAID{cont}</Box></Box>
      <Box sx={pdf.pairHead}><Box>CATEGORY AND NOTE</Box><Box>AMOUNT</Box></Box>
      {report.expenses.slice(segment.from, segment.to).map((e, i) => (
        <Box key={segment.from + i} sx={pdf.line}>
          <Box sx={pdf.lineMain}><Box component="strong">{e.category}</Box> <Box component="span" sx={pdf.muted}>· {e.desc}</Box></Box>
          <Box sx={pdf.negative}>−{e.amount}</Box>
        </Box>
      ))}
    </Box>
  );
}

function PageView({ report, page, index, total }: { report: PdfReport; page: PdfPage; index: number; total: number }) {
  return (
    <Box data-pdf-page sx={pdf.page}>
      {index === 0 ? <FirstHead report={report} /> : <NextHead report={report} />}
      {page.segments.map((segment, i) => (
        <Fragment key={`${segment.kind}-${segment.from}`}>
          <SegmentView report={report} segment={segment} first={i === 0} />
        </Fragment>
      ))}
      {index === 0 && report.jobs.length === 0 && report.expenses.length === 0 && <Box sx={pdf.empty}>No activity on this date.</Box>}
      <Box sx={pdf.foot}>
        <Box>Printed {report.printedAt} · BOMedia Sales System</Box>
        <Box>Page {index + 1} of {total}</Box>
      </Box>
    </Box>
  );
}

/** The pages the PDF is made from. They sit beside the app, never shown on screen; the download captures each one. */
export function ShiftReportPdfPages({ report, hostRef }: { report: PdfReport; hostRef: React.RefObject<HTMLDivElement | null> }) {
  // Nothing on the server or during hydration; the pages are only needed in the browser.
  const inBrowser = useSyncExternalStore(() => () => undefined, () => true, () => false);
  if (!inBrowser) return null;
  const pages = paginateShiftReport({ jobs: report.jobs.length, materials: report.materials.length, expenses: report.expenses.length });
  return createPortal(
    <Box ref={hostRef} sx={pdf.host}>
      {pages.map((page, i) => <PageView key={i} report={report} page={page} index={i} total={pages.length} />)}
    </Box>,
    document.body,
  );
}

"use client";

import { fetchShiftData, shiftTotals, formatKobo, type ShiftData } from "@/lib/shift-report";
import { paymentContext } from "@/lib/payment-outbox";
import { lagosBusinessDate } from "@/lib/accounting-entry";
import { useState, useMemo, useEffect, useRef } from "react";
import {
  FileText,
  Share2,
  Download,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Receipt,
  Users,
  Package,
  Loader2,
  Calendar,
  ChevronDown,
} from "lucide-react";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs from "dayjs";
import { format, isSameDay } from "date-fns";
import { toast } from "sonner";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { ShiftReportPdfPages, type PdfReport } from "@/components/shift-report-pdf";
import { dashboardStyles, shiftReportStyles as styles } from "@/app/theme";

interface ShiftReportProps {
  isOpen: boolean;
  onClose: () => void;
}

const parseAmt = (v: any) =>
  parseFloat(String(v ?? "0").replace(/[₦,\s]/g, "")) || 0;

const fmtMoney = (n: number) =>
  `₦${n.toLocaleString(undefined, { minimumFractionDigits: 0 })}`;

const PILL_STYLES: Record<string, typeof styles.pillPaid> = {
  Paid: styles.pillPaid,
  "Part-payment": styles.pillPart,
  Unpaid: styles.pillUnpaid,
};

function StatusPill({ status }: { status: string }) {
  return (
    <Box component="span" sx={[styles.pill, PILL_STYLES[status] ?? styles.pillNeutral]}>
      {status}
    </Box>
  );
}

function SectionHeader({ icon: Icon, label, count }: { icon: any; label: string; count?: number }) {
  return (
    <Box sx={styles.section}>
      <Box sx={styles.sectionIcon}>
        <Icon size={14} />
      </Box>
      <Typography variant="overline" component="h3" color="text.primary">
        {label}
      </Typography>
      {count !== undefined && <Chip label={count} size="small" sx={styles.countChip} />}
    </Box>
  );
}

export function ShiftReportModal({ isOpen, onClose }: ShiftReportProps) {
  const [loading, setLoading] = useState(true);
  const [reportDate, setReportDate] = useState(
    lagosBusinessDate()
  );
  const [report, setReport] = useState<ShiftData | null>(null);
  const [loadError, setLoadError] = useState("");
  const fetchSequence = useRef(0);
  const [loadedDate, setLoadedDate] = useState("");
  const [sales, setSales] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [cashierFilter, setCashierFilter] = useState("All");
  const pdfHostRef = useRef<HTMLDivElement>(null);
  const [making, setMaking] = useState(false);

  const fetchData = async () => {
    const sequence = ++fetchSequence.current;
    setLoading(true); setLoadError("");
    try {
      const context = await paymentContext();
      if (context.backend === 'postgres') {
        const data = await fetchShiftData(reportDate);
        if (sequence !== fetchSequence.current) return;
        setReport(data); setSales(data.sales); setExpenses(data.expenses); setPayments(data.payments);
        setCashierFilter(current=>current==='All' || data.staff.some(s=>s.id===current) ? current : 'All');
      } else {
        const responses = await Promise.all(['/api/sales','/api/expenses','/api/payments'].map(url=>fetch(url)));
        const data = await Promise.all(responses.map(async response => {
          const body = await response.json();
          if (!response.ok || !Array.isArray(body.data)) throw new Error('Incomplete report');
          return body.data;
        }));
        if (sequence !== fetchSequence.current) return;
        setReport(null); setSales(data[0]); setExpenses(data[1]); setPayments(data[2]);
      }
      setLoadedDate(reportDate);
    } catch {
      if (sequence !== fetchSequence.current) return;
      setLoadError('The report could not be loaded completely. Retry before exporting.');
      setReport(null); setSales([]); setExpenses([]); setPayments([]); setLoadedDate('');
    } finally { if (sequence === fetchSequence.current) setLoading(false); }
  };

  useEffect(() => {
    if (isOpen) void Promise.resolve().then(fetchData);
    return () => { fetchSequence.current += 1; };
  }, [isOpen, reportDate]);
  const complete = !loading && !loadError && loadedDate === reportDate;
  const exact = report ? shiftTotals(report,cashierFilter) : null;

  const selectedDate = new Date(reportDate + "T12:00:00");

  const daySales = useMemo(
    () =>
      sales.filter((s) => {
        const d = new Date(s.DATE || s.Date || "");
        return !isNaN(d.getTime()) && isSameDay(d, selectedDate);
      }),
     
    [sales, reportDate]
  );

  const dayExpenses = useMemo(
    () =>
      expenses.filter((e) => {
        const d = new Date(e.DATE || e.Date || "");
        return !isNaN(d.getTime()) && isSameDay(d, selectedDate) && (!report || cashierFilter === "All" || e._staffId === cashierFilter);
      }),
     
    [expenses, reportDate, cashierFilter, report]
  );

  const dayPayments = useMemo(
    () =>
      payments.filter((p) => {
        const d = new Date(p.DATE || "");
        return !isNaN(d.getTime()) && isSameDay(d, selectedDate) && (!report || cashierFilter === "All" || p._staffId === cashierFilter);
      }),
     
    [payments, reportDate, cashierFilter, report]
  );

  const cashiers = useMemo(() => {
    if (report) return ["All",...report.staff.map(s=>s.id)];
    const names = new Set<string>(
      daySales
        .map((s) => s["LOGGED BY"] || s["Logged By"] || "Unknown")
        .filter(Boolean)
    );
    return ["All", ...Array.from(names)];
  }, [daySales, report]);

  const filteredSales = useMemo(
    () =>
      cashierFilter === "All"
        ? daySales
        : daySales.filter(
            (s) =>
              (report ? s._staffId : (s["LOGGED BY"] || s["Logged By"])) === cashierFilter
          ),
    [daySales, cashierFilter, report]
  );

  const totalRevenue = filteredSales.reduce(
    (s, r) => s + parseAmt(r["AMOUNT (₦)"] || r["Amount (₦)"]),
    0
  );
  const totalCollected = report ? 0 : filteredSales.reduce(
    (s, r) =>
      s +
      parseAmt(r["INITIAL PAYMENT (₦)"] || r["INITIAL PAYMENT"] || r["Initial Payment"]),
    0
  );
  const totalDebt = filteredSales.reduce(
    (s, r) =>
      s + Math.max(0, parseAmt(r["AMOUNT DIFFERENCES"] || r["Amount Differences"])),
    0
  );
  const totalExpenses = dayExpenses.reduce(
    (s, e) => s + parseAmt(e.AMOUNT || e.Amount),
    0
  );
  const totalPaymentsIn = dayPayments.reduce(
    (s, p) => s + parseAmt(p.AMOUNT),
    0
  );
  const netCash = totalCollected + totalPaymentsIn - totalExpenses;
  const display = {
    revenue: exact ? formatKobo(exact.revenue) : fmtMoney(totalRevenue),
    collected: exact ? formatKobo(exact.receipts) : fmtMoney(totalCollected + totalPaymentsIn),
    debt: exact ? formatKobo(exact.debt) : fmtMoney(totalDebt),
    expenses: exact ? formatKobo(exact.spent) : fmtMoney(totalExpenses),
    net: exact ? formatKobo(exact.netCash) : fmtMoney(netCash),
  };
  const cashierName = report?.staff.find(s=>s.id===cashierFilter)?.name ?? cashierFilter;

  const materialBreakdown = useMemo(() => {
    const map: Record<string, { count: number; revenue: number }> = {};
    filteredSales.forEach((s) => {
      const mat = s.MATERIAL || s.Material || "Other";
      if (!map[mat]) map[mat] = { count: 0, revenue: 0 };
      map[mat].count++;
      map[mat].revenue += parseAmt(s["AMOUNT (₦)"] || s["Amount (₦)"]);
    });
    return Object.entries(map).sort((a, b) => b[1].revenue - a[1].revenue);
  }, [filteredSales]);

  const handleWhatsAppShare = () => {
    if (!complete) return;
    const dateLabel = format(selectedDate, "EEEE, MMM d yyyy");
    const cashierLabel =
      cashierFilter === "All" ? "All Staff" : cashierName;

    const lines = [
      `📊 *BOMedia Shift Report — ${dateLabel}*`,
      `👤 ${cashierLabel}`,
      ``,
      `━━━━━━━━━━━━━━━`,
      `📦 *Jobs Logged:* ${filteredSales.length}`,
      `💰 *Total Revenue:* ${display.revenue}`,
      `✅ *Collections (all methods):* ${display.collected}`,
      `🔴 *Current debt on these sales:* ${display.debt}`,
      `📉 *Expenses:* ${display.expenses}`,
      `━━━━━━━━━━━━━━━`,
      `💵 *Net Cash Handled:* ${display.net}`,
      ...(exact ? [`Cash: ${formatKobo(exact.cash)} · Transfer: ${formatKobo(exact.transfer)} · POS: ${formatKobo(exact.pos)}`, `Net all methods: ${formatKobo(exact.net)}`] : []),
      ``,
    ];

    if (materialBreakdown.length > 0) {
      lines.push(`🎨 *Material Breakdown:*`);
      materialBreakdown.forEach(([mat, { count, revenue }]) => {
        lines.push(`  • ${mat}: ${count} job${count !== 1 ? "s" : ""} — ${fmtMoney(revenue)}`);
      });
      lines.push(``);
    }

    if (filteredSales.length > 0) {
      lines.push(`📋 *Jobs:*`);
      filteredSales.slice(0, 10).forEach((s, i) => {
        const client = s["CLIENT NAME"] || s["Client Name"] || "—";
        const amt = fmtMoney(parseAmt(s["AMOUNT (₦)"] || s["Amount (₦)"]));
        const status = s["PAYMENT STATUS"] || "Unpaid";
        lines.push(`  ${i + 1}. ${client} — ${amt} [${status}]`);
      });
      if (filteredSales.length > 10) {
        lines.push(`  … and ${filteredSales.length - 10} more`);
      }
    }

    lines.push(``, `_Generated by BOMedia Sales System_`);

    const msg = lines.join("\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  if (!isOpen) return null;

  const spinning = (on: boolean) => [dashboardStyles.iconSpan, on && dashboardStyles.refreshing];

  const stats = [
    { label: "Jobs Logged", val: String(filteredSales.length), icon: Package, tone: styles.tone.info, highlight: false },
    { label: "Total Revenue", val: display.revenue, icon: TrendingUp, tone: styles.tone.primary, highlight: false },
    { label: "Collections (all methods)", val: display.collected, icon: CheckCircle2, tone: styles.tone.success, highlight: false },
    { label: "Current debt on these sales", val: display.debt, icon: AlertTriangle, tone: totalDebt > 0 ? styles.tone.error : styles.tone.neutral, highlight: false },
    { label: "Paid expenses less recoveries", val: display.expenses, icon: Receipt, tone: styles.tone.warning, highlight: false },
    { label: "Net Cash", val: display.net, icon: TrendingUp, tone: netCash >= 0 ? styles.tone.success : styles.tone.error, highlight: true },
  ];

  const dateLabel = format(selectedDate, "EEEE, d MMMM yyyy");
  const share = (part: bigint, total: bigint) => (total > BigInt(0) ? Number((part * BigInt(10000)) / total) / 100 : 0);
  const pdfReport: PdfReport = {
    dateLabel,
    cashierLabel: cashierFilter === "All" ? "All staff" : cashierName,
    printedAt: format(new Date(), "d MMM yyyy, h:mm a"),
    collected: display.collected,
    net: display.net,
    netNote: exact ? `Cash received ${formatKobo(exact.cash)} less cash expenses ${formatKobo(exact.cash - exact.netCash)}` : "Collected less expenses",
    split: exact ? (() => {
      const total = exact.cash + exact.transfer + exact.pos;
      return [
        { label: "Cash", value: formatKobo(exact.cash), percent: share(exact.cash, total), color: "#2e388d" },
        { label: "Transfer", value: formatKobo(exact.transfer), percent: share(exact.transfer, total), color: "#4a56b0" },
        { label: "POS", value: formatKobo(exact.pos), percent: share(exact.pos, total), color: "#CBD5E1" },
      ];
    })() : null,
    facts: [
      { label: "Jobs logged", value: String(filteredSales.length) },
      { label: "Total revenue", value: display.revenue },
      { label: "Paid expenses", value: display.expenses },
      { label: "Still owed on these", value: display.debt, danger: totalDebt > 0 },
    ],
    jobs: filteredSales.map((s) => ({
      client: s["CLIENT NAME"] || s["Client Name"] || "—",
      desc: s["JOB DESCRIPTION"] || s["Job Description"] || "—",
      by: s["LOGGED BY"] || s["Logged By"] || "—",
      amount: fmtMoney(parseAmt(s["AMOUNT (₦)"] || s["Amount (₦)"])),
      paid: fmtMoney(parseAmt(s["INITIAL PAYMENT (₦)"] || s["INITIAL PAYMENT"] || s["Initial Payment"])),
      status: s["PAYMENT STATUS"] || "Unpaid",
    })),
    materials: materialBreakdown.map(([name, { count, revenue }]) => ({ name, count, revenue: fmtMoney(revenue) })),
    expenses: dayExpenses.map((e) => ({
      category: e.CATEGORY || e.Category || "General",
      desc: e.DESCRIPTION || e.Description || "—",
      amount: fmtMoney(parseAmt(e.AMOUNT || e.Amount)),
    })),
  };

  // Same way the invoice does it: photograph each A4 page, put them in a PDF and save the file. A long report simply gets more pages.
  const downloadPdf = async () => {
    const host = pdfHostRef.current;
    if (!host || making || !complete) return;
    setMaking(true);
    const holder = document.createElement("div");
    holder.style.cssText = "position:fixed;top:0;left:0;width:794px;background:#ffffff;z-index:-9999;pointer-events:none";
    document.body.appendChild(holder);
    try {
      if ("fonts" in document) await document.fonts.ready;
      const [{ default: html2canvas }, { default: JsPdf }] = await Promise.all([import("html2canvas"), import("jspdf")]);
      const pages = Array.from(host.querySelectorAll<HTMLElement>("[data-pdf-page]"));
      if (pages.length === 0) throw new Error("The report has no pages.");
      const pdf = new JsPdf({ orientation: "portrait", unit: "px", format: [794, 1123] });
      for (let i = 0; i < pages.length; i++) {
        holder.replaceChildren(pages[i].cloneNode(true));
        const canvas = await html2canvas(holder, { scale: 2, useCORS: true, logging: false, backgroundColor: "#ffffff", width: 794, height: 1123, windowWidth: 794 });
        if (canvas.width === 0 || canvas.height === 0) throw new Error("A report page is empty.");
        if (i > 0) pdf.addPage([794, 1123], "portrait");
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, 794, 1123);
      }
      pdf.save(`Shift_Report_${reportDate}.pdf`);
    } catch {
      toast.error("Could not make the PDF. Try again.");
    } finally {
      document.body.removeChild(holder);
      setMaking(false);
    }
  };

  const footer = (
    <Box sx={styles.footer}>
      <Button
        variant="contained"
        color="success"
        size="large"
        onClick={handleWhatsAppShare}
        disabled={!complete}
        startIcon={<Share2 size={16} />}
        sx={styles.share}
      >
        Share via WhatsApp
      </Button>
      <Button
        variant="outlined"
        color="inherit"
        size="large"
        onClick={downloadPdf}
        disabled={making || !complete}
        startIcon={making ? <Loader2 size={16} /> : <Download size={16} />}
      >
        {making ? "Making PDF..." : "PDF"}
      </Button>
    </Box>
  );

  return (
    <>
      <ResponsiveSheet open={isOpen} onClose={onClose} title="Shift Report" description="Money in and out, by payment date" maxWidth="md" footer={footer}>
      <Box sx={styles.controls}>
        <Box sx={styles.dateRow}>
          <Box sx={styles.muted}><Calendar size={16} /></Box>
          <DatePicker
            value={reportDate ? dayjs(reportDate) : null}
            onChange={(newVal) => setReportDate(newVal ? newVal.format("YYYY-MM-DD") : "")}
            slotProps={{ textField: { size: "small", sx: styles.datePicker } }}
          />
        </Box>

        {cashiers.length > 2 && (
          <Box sx={styles.selectWrap}>
            <Box
              component="select"
              aria-label="Filter by cashier"
              value={cashierFilter}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCashierFilter(e.target.value)}
              sx={styles.select}
            >
              {cashiers.map((c) => (
                <option key={c} value={c}>{report?.staff.find(s=>s.id===c)?.name ?? c}</option>
              ))}
            </Box>
            <Box sx={styles.selectChevron}>
              <ChevronDown size={14} />
            </Box>
          </Box>
        )}

        <IconButton size="small" onClick={fetchData} disabled={loading} aria-label="Refresh report" color="inherit">
          <Box component="span" sx={spinning(loading)}>
            <RefreshCw size={14} />
          </Box>
        </IconButton>
      </Box>

      <Box sx={styles.body}>
        {loading ? (
          <Box sx={styles.loading}>
            <Box component="span" sx={spinning(true)}>
              <RefreshCw size={24} />
            </Box>
          </Box>
        ) : loadError ? <Typography role="alert" color="error">{loadError}</Typography> : (
          <Stack sx={{ gap: 2.5 }}>
            {exact && complete && <Typography variant="body2" color="text.secondary">Cash {formatKobo(exact.cash)} · Transfer {formatKobo(exact.transfer)} · POS {formatKobo(exact.pos)} · Net {formatKobo(exact.net)}</Typography>}
            <Box sx={styles.statGrid}>
              {stats.map(({ label, val, icon: Icon, tone, highlight }) => (
                <Paper key={label} variant="outlined" sx={[styles.statCard, highlight && styles.statCardHighlight]}>
                  <Box sx={[styles.statIcon, tone]}>
                    <Icon size={14} />
                  </Box>
                  <Typography variant="overline" sx={styles.statLabel}>{label}</Typography>
                  <Typography variant="h5" component="p" color={highlight ? "primary.main" : "text.primary"}>
                    {val}
                  </Typography>
                </Paper>
              ))}
            </Box>

            {materialBreakdown.length > 0 && (
              <Box>
                <SectionHeader icon={Package} label="Material Breakdown" />
                <Box sx={styles.list}>
                  {materialBreakdown.map(([mat, { count, revenue }]) => (
                    <Box key={mat} sx={styles.materialRow}>
                      <Box sx={styles.materialName}>
                        <Box sx={styles.dot} />
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{mat}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {count} job{count !== 1 ? "s" : ""}
                        </Typography>
                      </Box>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{fmtMoney(revenue)}</Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}

            {filteredSales.length > 0 && (
              <Box>
                <SectionHeader icon={FileText} label="Jobs" count={filteredSales.length} />
                <Box sx={styles.list}>
                  {filteredSales.map((s, i) => {
                    const client = s["CLIENT NAME"] || s["Client Name"] || "—";
                    const desc = s["JOB DESCRIPTION"] || s["Job Description"] || "—";
                    const amt = parseAmt(s["AMOUNT (₦)"] || s["Amount (₦)"]);
                    const paid = parseAmt(
                      s["INITIAL PAYMENT (₦)"] ||
                        s["INITIAL PAYMENT"] ||
                        s["Initial Payment"]
                    );
                    const status = s["PAYMENT STATUS"] || "Unpaid";
                    const loggedBy = s["LOGGED BY"] || s["Logged By"] || "—";

                    return (
                      <Paper key={i} variant="outlined" sx={styles.jobRow}>
                        <Box sx={styles.jobLead}>
                          <Box sx={styles.jobNumber}>{i + 1}</Box>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="h6" component="p" sx={styles.ellipsis}>{client}</Typography>
                            <Typography variant="caption" color="text.secondary" sx={[styles.ellipsis, { display: "block" }]}>{desc}</Typography>
                            <Typography variant="caption" color="text.secondary">via {loggedBy}</Typography>
                          </Box>
                        </Box>
                        <Box sx={styles.right}>
                          <Typography variant="h6" component="p">{fmtMoney(amt)}</Typography>
                          <Typography variant="caption" color="success.main" sx={{ display: "block", fontWeight: 700 }}>
                            +{fmtMoney(paid)}
                          </Typography>
                          <StatusPill status={status} />
                        </Box>
                      </Paper>
                    );
                  })}
                </Box>
              </Box>
            )}

            {dayExpenses.length > 0 && (
              <Box>
                <SectionHeader icon={Receipt} label="Expenses" count={dayExpenses.length} />
                <Box sx={styles.list}>
                  {dayExpenses.map((e, i) => (
                    <Paper key={i} variant="outlined" sx={styles.expenseRow}>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {e.CATEGORY || e.Category || "General"}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {e.DESCRIPTION || e.Description || "—"}
                        </Typography>
                      </Box>
                      <Typography variant="h6" component="p" color="error.main">
                        −{fmtMoney(parseAmt(e.AMOUNT || e.Amount))}
                      </Typography>
                    </Paper>
                  ))}
                </Box>
              </Box>
            )}

            {filteredSales.length === 0 && dayExpenses.length === 0 && (
              <Stack sx={styles.empty}>
                <FileText size={40} />
                <Typography variant="h6" component="p">No activity on this date</Typography>
                <Typography variant="body2">Try selecting a different date</Typography>
              </Stack>
            )}
          </Stack>
        )}
      </Box>
      </ResponsiveSheet>
      <ShiftReportPdfPages report={pdfReport} hostRef={pdfHostRef} />
    </>
  );
}

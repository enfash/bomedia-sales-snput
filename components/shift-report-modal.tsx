"use client";

import { useState, useMemo, useRef, useEffect } from "react";
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
  Printer,
  X,
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
    new Date().toISOString().split("T")[0]
  );
  const [sales, setSales] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [cashierFilter, setCashierFilter] = useState("All");
  const reportRef = useRef<HTMLDivElement>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [sRes, eRes, pRes] = await Promise.all([
        fetch("/api/sales"),
        fetch("/api/expenses"),
        fetch("/api/payments"),
      ]);
      const [sJson, eJson, pJson] = await Promise.all([
        sRes.json(),
        eRes.json(),
        pRes.json(),
      ]);
      setSales(sJson.data || []);
      setExpenses(eJson.data || []);
      setPayments(pJson.data || []);
    } catch {
      toast.error("Failed to load report data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Deferred one tick so the loading flag is not set synchronously inside the effect.
    if (isOpen) void Promise.resolve().then(fetchData);
  }, [isOpen]);

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
        return !isNaN(d.getTime()) && isSameDay(d, selectedDate);
      }),
     
    [expenses, reportDate]
  );

  const dayPayments = useMemo(
    () =>
      payments.filter((p) => {
        const d = new Date(p.DATE || "");
        return !isNaN(d.getTime()) && isSameDay(d, selectedDate);
      }),
     
    [payments, reportDate]
  );

  const cashiers = useMemo(() => {
    const names = new Set<string>(
      daySales
        .map((s) => s["LOGGED BY"] || s["Logged By"] || "Unknown")
        .filter(Boolean)
    );
    return ["All", ...Array.from(names)];
  }, [daySales]);

  const filteredSales = useMemo(
    () =>
      cashierFilter === "All"
        ? daySales
        : daySales.filter(
            (s) =>
              (s["LOGGED BY"] || s["Logged By"]) === cashierFilter
          ),
    [daySales, cashierFilter]
  );

  const totalRevenue = filteredSales.reduce(
    (s, r) => s + parseAmt(r["AMOUNT (₦)"] || r["Amount (₦)"]),
    0
  );
  const totalCollected = filteredSales.reduce(
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
    const dateLabel = format(selectedDate, "EEEE, MMM d yyyy");
    const cashierLabel =
      cashierFilter === "All" ? "All Staff" : cashierFilter;

    const lines = [
      `📊 *BOMedia Shift Report — ${dateLabel}*`,
      `👤 ${cashierLabel}`,
      ``,
      `━━━━━━━━━━━━━━━`,
      `📦 *Jobs Logged:* ${filteredSales.length}`,
      `💰 *Total Revenue:* ${fmtMoney(totalRevenue)}`,
      `✅ *Cash Collected:* ${fmtMoney(totalCollected + totalPaymentsIn)}`,
      `🔴 *Outstanding Debt:* ${fmtMoney(totalDebt)}`,
      `📉 *Expenses:* ${fmtMoney(totalExpenses)}`,
      `━━━━━━━━━━━━━━━`,
      `💵 *Net Cash Handled:* ${fmtMoney(netCash)}`,
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
    { label: "Total Revenue", val: fmtMoney(totalRevenue), icon: TrendingUp, tone: styles.tone.primary, highlight: false },
    { label: "Cash Collected", val: fmtMoney(totalCollected + totalPaymentsIn), icon: CheckCircle2, tone: styles.tone.success, highlight: false },
    { label: "Outstanding", val: fmtMoney(totalDebt), icon: AlertTriangle, tone: totalDebt > 0 ? styles.tone.error : styles.tone.neutral, highlight: false },
    { label: "Expenses", val: fmtMoney(totalExpenses), icon: Receipt, tone: styles.tone.warning, highlight: false },
    { label: "Net Cash", val: fmtMoney(netCash), icon: TrendingUp, tone: netCash >= 0 ? styles.tone.success : styles.tone.error, highlight: true },
  ];

  return (
    <Box sx={styles.root}>
      <Box sx={styles.backdrop} onClick={onClose} />

      <Box sx={styles.sheet}>
        <Box sx={styles.header}>
          <Box sx={styles.headerLead}>
            <Box sx={styles.headerIcon}>
              <FileText size={16} />
            </Box>
            <Box>
              <Typography variant="h5" component="h2">Shift Report</Typography>
              <Typography variant="caption" color="text.secondary">Daily summary</Typography>
            </Box>
          </Box>
          <IconButton size="small" onClick={onClose} aria-label="Close shift report" sx={styles.closeButton}>
            <X size={16} />
          </IconButton>
        </Box>

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
                  <option key={c} value={c}>{c}</option>
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

        <Box sx={styles.body} ref={reportRef}>
          {loading ? (
            <Box sx={styles.loading}>
              <Box component="span" sx={spinning(true)}>
                <RefreshCw size={24} />
              </Box>
            </Box>
          ) : (
            <Stack sx={{ gap: 2.5 }}>
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

        <Box sx={styles.footer}>
          <Button
            variant="contained"
            color="success"
            size="large"
            onClick={handleWhatsAppShare}
            disabled={filteredSales.length === 0 && dayExpenses.length === 0}
            startIcon={<Share2 size={16} />}
            sx={styles.share}
          >
            Share via WhatsApp
          </Button>
          <Button variant="outlined" color="inherit" size="large" onClick={() => window.print()} aria-label="Print report">
            <Printer size={16} />
          </Button>
        </Box>
      </Box>
    </Box>
  );
}

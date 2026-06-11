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
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs from "dayjs";
import { format, isSameDay } from "date-fns";
import { toast } from "sonner";

interface ShiftReportProps {
  isOpen: boolean;
  onClose: () => void;
}

const parseAmt = (v: any) =>
  parseFloat(String(v ?? "0").replace(/[₦,\s]/g, "")) || 0;

const fmtMoney = (n: number) =>
  `₦${n.toLocaleString(undefined, { minimumFractionDigits: 0 })}`;

function StatusPill({ status }: { status: string }) {
  const colorMap: Record<string, { bgcolor: string; color: string }> = {
    Paid: { bgcolor: "#d1fae5", color: "#065f46" },
    "Part-payment": { bgcolor: "#fef3c7", color: "#92400e" },
    Unpaid: { bgcolor: "#fee2e2", color: "#991b1b" },
  };
  const colors = colorMap[status] || { bgcolor: "#f3f4f6", color: "#6b7280" };
  return (
    <Box component="span" sx={{
      fontSize: "0.5625rem",
      fontWeight: 900,
      px: 0.75,
      py: 0.25,
      borderRadius: 1,
      textTransform: "uppercase",
      bgcolor: colors.bgcolor,
      color: colors.color,
      display: "inline-block",
    }}>
      {status}
    </Box>
  );
}

function SectionHeader({ icon: Icon, label, count }: { icon: any; label: string; count?: number }) {
  return (
    <Stack direction="row" sx={{ alignItems: "center", gap: 1, mb: 1.5 }}>
      <Box sx={{
        width: 24,
        height: 24,
        borderRadius: 1.5,
        bgcolor: "#eff6ff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <Icon size={14} color="#1d4ed8" />
      </Box>
      <Typography sx={{ fontSize: "0.75rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "text.primary" }}>
        {label}
      </Typography>
      {count !== undefined && (
        <Chip
          label={count}
          size="small"
          sx={{
            ml: "auto",
            bgcolor: "#eff6ff",
            color: "#1d4ed8",
            fontSize: "0.5625rem",
            fontWeight: 900,
            height: 20,
          }}
        />
      )}
    </Stack>
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
    if (isOpen) fetchData();
  }, [isOpen]);

  const selectedDate = new Date(reportDate + "T12:00:00");

  const daySales = useMemo(
    () =>
      sales.filter((s) => {
        const d = new Date(s.DATE || s.Date || "");
        return !isNaN(d.getTime()) && isSameDay(d, selectedDate);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sales, reportDate]
  );

  const dayExpenses = useMemo(
    () =>
      expenses.filter((e) => {
        const d = new Date(e.DATE || e.Date || "");
        return !isNaN(d.getTime()) && isSameDay(d, selectedDate);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [expenses, reportDate]
  );

  const dayPayments = useMemo(
    () =>
      payments.filter((p) => {
        const d = new Date(p.DATE || "");
        return !isNaN(d.getTime()) && isSameDay(d, selectedDate);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  return (
    <Box sx={{
      position: "fixed",
      inset: 0,
      zIndex: 200,
      display: "flex",
      alignItems: { xs: "flex-end", md: "center" },
      justifyContent: "center",
    }}>
      <Box
        sx={{ position: "absolute", inset: 0, bgcolor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
        onClick={onClose}
      />

      <Box sx={{
        position: "relative",
        width: "100%",
        maxWidth: { md: "42rem" },
        bgcolor: "background.paper",
        borderRadius: { xs: "2.5rem 2.5rem 0 0", md: 4 },
        boxShadow: "0 25px 50px rgba(0,0,0,0.25)",
        border: { xs: "1px solid", md: "1px solid" },
        borderColor: "grey.100",
        display: "flex",
        flexDirection: "column",
        maxHeight: { xs: "92vh", md: "85vh" },
        zIndex: 201,
      }}>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", p: 2.5, borderBottom: "1px solid", borderColor: "grey.100", flexShrink: 0 }}>
          <Stack direction="row" sx={{ alignItems: "center", gap: 1.5 }}>
            <Box sx={{ width: 36, height: 36, borderRadius: 2, bgcolor: "primary.main", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <FileText size={16} color="#fff" />
            </Box>
            <Box>
              <Typography sx={{ fontSize: "1rem", fontWeight: 900, color: "text.primary" }}>
                Shift Report
              </Typography>
              <Typography sx={{ fontSize: "0.625rem", color: "text.secondary", fontWeight: 500 }}>
                Daily summary
              </Typography>
            </Box>
          </Stack>
          <Box
            component="button"
            onClick={onClose}
            sx={{
              width: 32,
              height: 32,
              borderRadius: 2,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "text.disabled",
              border: "none",
              bgcolor: "transparent",
              cursor: "pointer",
              "&:hover": { bgcolor: "grey.100", color: "text.primary" },
              transition: "background-color 0.15s, color 0.15s",
            }}
          >
            <X size={16} />
          </Box>
        </Stack>

        <Stack direction="row" sx={{ p: 2, borderBottom: "1px solid", borderColor: "grey.50", flexShrink: 0, flexWrap: "wrap", gap: 1.5, alignItems: "center" }}>
          <Stack direction="row" sx={{ alignItems: "center", gap: 1, flex: 1, minWidth: 180 }}>
            <Calendar size={16} color="#9ca3af" />
            <DatePicker
              value={reportDate ? dayjs(reportDate) : null}
              onChange={(newVal) => setReportDate(newVal ? newVal.format("YYYY-MM-DD") : "")}
              slotProps={{
                textField: {
                  size: "small",
                  sx: {
                    flex: 1,
                    "& .MuiInputBase-root": {
                      height: 36,
                      borderRadius: 2,
                      bgcolor: "grey.50",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                    }
                  }
                }
              }}
            />
          </Stack>

          {cashiers.length > 2 && (
            <Box sx={{ position: "relative" }}>
              <Box
                component="select"
                value={cashierFilter}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCashierFilter(e.target.value)}
                sx={{
                  height: 36,
                  pl: 1.5,
                  pr: 4,
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: "grey.200",
                  bgcolor: "grey.50",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  appearance: "none",
                  outline: "none",
                  fontFamily: "inherit",
                  cursor: "pointer",
                }}
              >
                {cashiers.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Box>
              <Box sx={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
                <ChevronDown size={14} color="#9ca3af" />
              </Box>
            </Box>
          )}

          <Button
            variant="text"
            size="small"
            onClick={fetchData}
            disabled={loading}
            sx={{ height: 36, px: 1.5, fontSize: "0.75rem", fontWeight: 900, color: "text.secondary", minWidth: 0 }}
          >
            <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
          </Button>
        </Stack>

        <Box sx={{ overflowY: "auto", flex: 1, p: 2.5 }} ref={reportRef}>
          {loading ? (
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: 128 }}>
              <RefreshCw size={24} color="#93c5fd" style={{ animation: "spin 1s linear infinite" }} />
            </Box>
          ) : (
            <Stack sx={{ gap: 2.5 }}>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "1fr 1fr 1fr" }, gap: 1.5 }}>
                {[
                  {
                    label: "Jobs Logged",
                    val: String(filteredSales.length),
                    icon: Package,
                    iconBg: "#dbeafe",
                    iconColor: "#2563eb",
                    highlight: false,
                  },
                  {
                    label: "Total Revenue",
                    val: fmtMoney(totalRevenue),
                    icon: TrendingUp,
                    iconBg: "#fee2e2",
                    iconColor: "#c8472e",
                    highlight: false,
                  },
                  {
                    label: "Cash Collected",
                    val: fmtMoney(totalCollected + totalPaymentsIn),
                    icon: CheckCircle2,
                    iconBg: "#d1fae5",
                    iconColor: "#16a34a",
                    highlight: false,
                  },
                  {
                    label: "Outstanding",
                    val: fmtMoney(totalDebt),
                    icon: AlertTriangle,
                    iconBg: totalDebt > 0 ? "#fee2e2" : "#f3f4f6",
                    iconColor: totalDebt > 0 ? "#dc2626" : "#9ca3af",
                    highlight: false,
                  },
                  {
                    label: "Expenses",
                    val: fmtMoney(totalExpenses),
                    icon: Receipt,
                    iconBg: "#fef3c7",
                    iconColor: "#d97706",
                    highlight: false,
                  },
                  {
                    label: "Net Cash",
                    val: fmtMoney(netCash),
                    icon: TrendingUp,
                    iconBg: netCash >= 0 ? "#d1fae5" : "#fee2e2",
                    iconColor: netCash >= 0 ? "#16a34a" : "#dc2626",
                    highlight: true,
                  },
                ].map(({ label, val, icon: Icon, iconBg, iconColor, highlight }) => (
                  <Box key={label} sx={{
                    p: 1.5,
                    borderRadius: 3,
                    border: "1px solid",
                    borderColor: highlight ? "#fecaca" : "grey.100",
                    bgcolor: highlight ? "#fff1f2" : "background.paper",
                  }}>
                    <Box sx={{ width: 24, height: 24, borderRadius: 1.5, bgcolor: iconBg, display: "flex", alignItems: "center", justifyContent: "center", mb: 1 }}>
                      <Icon size={14} color={iconColor} />
                    </Box>
                    <Typography sx={{ fontSize: "0.5625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: "text.disabled", mb: 0.25 }}>
                      {label}
                    </Typography>
                    <Typography sx={{ fontSize: "1rem", fontWeight: 900, color: highlight ? "primary.main" : "text.primary" }}>
                      {val}
                    </Typography>
                  </Box>
                ))}
              </Box>

              {materialBreakdown.length > 0 && (
                <Box>
                  <SectionHeader icon={Package} label="Material Breakdown" />
                  <Stack sx={{ gap: 1 }}>
                    {materialBreakdown.map(([mat, { count, revenue }]) => (
                      <Stack key={mat} direction="row" sx={{ alignItems: "center", justifyContent: "space-between", p: 1.5, bgcolor: "grey.50", borderRadius: 2 }}>
                        <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
                          <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "primary.main" }} />
                          <Typography sx={{ fontSize: "0.875rem", fontWeight: 700, color: "text.primary" }}>
                            {mat}
                          </Typography>
                          <Typography sx={{ fontSize: "0.625rem", color: "text.secondary" }}>
                            {count} job{count !== 1 ? "s" : ""}
                          </Typography>
                        </Stack>
                        <Typography sx={{ fontSize: "0.875rem", fontWeight: 900, color: "text.primary" }}>
                          {fmtMoney(revenue)}
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>
                </Box>
              )}

              {filteredSales.length > 0 && (
                <Box>
                  <SectionHeader icon={FileText} label="Jobs" count={filteredSales.length} />
                  <Stack sx={{ gap: 0.75 }}>
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
                        <Stack key={i} direction="row" sx={{ alignItems: "flex-start", justifyContent: "space-between", p: 1.5, bgcolor: "background.paper", border: "1px solid", borderColor: "grey.100", borderRadius: 2, gap: 1.5 }}>
                          <Stack direction="row" sx={{ alignItems: "flex-start", gap: 1.5, minWidth: 0 }}>
                            <Box sx={{
                              width: 24,
                              height: 24,
                              borderRadius: "50%",
                              bgcolor: "#dbeafe",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                              mt: 0.25,
                            }}>
                              <Typography sx={{ fontSize: "0.625rem", fontWeight: 900, color: "#1d4ed8" }}>
                                {i + 1}
                              </Typography>
                            </Box>
                            <Box sx={{ minWidth: 0 }}>
                              <Typography sx={{ fontSize: "0.875rem", fontWeight: 900, color: "text.primary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {client}
                              </Typography>
                              <Typography sx={{ fontSize: "0.625rem", color: "text.secondary", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {desc}
                              </Typography>
                              <Typography sx={{ fontSize: "0.5625rem", color: "text.disabled", mt: 0.25 }}>
                                via {loggedBy}
                              </Typography>
                            </Box>
                          </Stack>
                          <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                            <Typography sx={{ fontSize: "0.875rem", fontWeight: 900, color: "text.primary" }}>
                              {fmtMoney(amt)}
                            </Typography>
                            <Typography sx={{ fontSize: "0.625rem", fontWeight: 700, color: "success.main" }}>
                              +{fmtMoney(paid)}
                            </Typography>
                            <StatusPill status={status} />
                          </Box>
                        </Stack>
                      );
                    })}
                  </Stack>
                </Box>
              )}

              {dayExpenses.length > 0 && (
                <Box>
                  <SectionHeader icon={Receipt} label="Expenses" count={dayExpenses.length} />
                  <Stack sx={{ gap: 0.75 }}>
                    {dayExpenses.map((e, i) => (
                      <Stack key={i} direction="row" sx={{ alignItems: "center", justifyContent: "space-between", p: 1.5, bgcolor: "background.paper", border: "1px solid", borderColor: "grey.100", borderRadius: 2 }}>
                        <Box>
                          <Typography sx={{ fontSize: "0.875rem", fontWeight: 700, color: "text.primary" }}>
                            {e.CATEGORY || e.Category || "General"}
                          </Typography>
                          <Typography sx={{ fontSize: "0.625rem", color: "text.secondary" }}>
                            {e.DESCRIPTION || e.Description || "—"}
                          </Typography>
                        </Box>
                        <Typography sx={{ fontSize: "0.875rem", fontWeight: 900, color: "error.main" }}>
                          −{fmtMoney(parseAmt(e.AMOUNT || e.Amount))}
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>
                </Box>
              )}

              {filteredSales.length === 0 && dayExpenses.length === 0 && (
                <Stack sx={{ alignItems: "center", justifyContent: "center", py: 8, color: "text.disabled", gap: 1 }}>
                  <FileText size={40} />
                  <Typography sx={{ fontSize: "0.875rem", fontWeight: 700 }}>No activity on this date</Typography>
                  <Typography sx={{ fontSize: "0.75rem" }}>Try selecting a different date</Typography>
                </Stack>
              )}
            </Stack>
          )}
        </Box>

        <Stack direction="row" sx={{ p: 2, borderTop: "1px solid", borderColor: "grey.100", gap: 1.5, flexShrink: 0, bgcolor: "background.paper" }}>
          <Button
            variant="contained"
            onClick={handleWhatsAppShare}
            disabled={filteredSales.length === 0 && dayExpenses.length === 0}
            sx={{
              flex: 1,
              height: 48,
              borderRadius: 3,
              bgcolor: "#22c55e",
              fontWeight: 900,
              boxShadow: "0 4px 14px rgba(34,197,94,0.2)",
              "&:hover": { bgcolor: "#16a34a" },
              gap: 1,
            }}
          >
            <Share2 size={16} />
            Share via WhatsApp
          </Button>
          <Button
            variant="outlined"
            onClick={() => window.print()}
            sx={{ height: 48, px: 2, borderRadius: 3, fontWeight: 900 }}
          >
            <Printer size={16} />
          </Button>
        </Stack>
      </Box>
    </Box>
  );
}

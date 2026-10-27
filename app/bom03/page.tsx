"use client";
import { ScreenLoading } from "@/components/screen-loading";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Zap, RefreshCw, Receipt, BarChart3, Package, Volume2, VolumeX, FileText, Users, Calculator, Bell } from "lucide-react";
import { motion } from "framer-motion";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import { dashboardLayoutStyles as layout, dashboardStyles as styles } from "@/app/theme";
import Paper from "@mui/material/Paper";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import { DateRangeFields } from "@/components/date-range-fields";
import { PeriodSelector } from "@/components/period-selector";
import { QuickActionGroup } from "@/components/quick-action-group";

import { useSyncStore } from "@/lib/store";
import { DashboardMetrics } from "@/components/dashboard-metrics";
import { SalesExpenseChart, OutstandingDebtChart, PaymentStatusWidget, TopClientsWidget } from "@/components/dashboard-charts";
import { RecentPaymentsPulse } from "@/components/recent-payments-pulse";
import { DebtorPaymentModal } from "@/components/debtor-payment-modal";
import { processDebtData } from "@/lib/financial-utils";
import { debtWindows } from "@/lib/debt-windows";
import { TodayBanner } from "@/components/today-banner";
import { ApprovalsWaitingCard } from "@/components/approvals-waiting-card";
import { ShiftReportModal } from "@/components/shift-report-modal";
import { ProfitabilityWidget } from "@/components/profitability-widget";
import { dashboardExtraIncomeRows, dashboardTradingRows, extraIncomeNaira, readDashboardReporting, type DashboardReporting } from "@/lib/dashboard-reporting";
import Alert from "@mui/material/Alert";

import {
  format,
  subDays,
  startOfDay,
  eachDayOfInterval,
  isSameDay,
  isWithinInterval,
} from "date-fns";
import { toast } from "sonner";

const sectionVariants = {
  hidden: { opacity: 0, y: 16 },
  show: (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, delay, ease: [0.16, 1, 0.3, 1] as const },
  }),
};

const parseAmount = (val: any): number => {
  if (val === undefined || val === null) return 0;
  const str = val.toString().replace(/[₦,\s]/g, "");
  return parseFloat(str) || 0;
};

const parseSheetDate = (dateStr: any): Date | null => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
};

type Row = Record<string, string>;

export default function DashboardPage() {
  const { pendingQueue, cachedSales, cachedExpenses, cachedInventory, cachedMaterials, cachedPayments, setCachedData } = useSyncStore();

  const [loading, setLoading] = useState(cachedSales.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [timeRange, setTimeRange] = useState<"all" | "today" | "7d" | "30d" | "custom">("30d");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [selectedDebtor, setSelectedDebtor] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [reporting, setReporting] = useState<DashboardReporting | null>(null);

  const lastSalesIndex = useRef<number>(0);
  const lastExpensesIndex = useRef<number>(0);
  const isInitialLoad = useRef<boolean>(true);

  const fetchData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else if (cachedSales.length === 0) setLoading(true);

    try {
      const [salesRes, expensesRes, inventoryRes, paymentsRes, materialsRes] = await Promise.all([
        fetch("/api/sales?dashboard=1"),
        fetch("/api/expenses"),
        fetch("/api/inventory"),
        fetch("/api/payments"),
        fetch("/api/materials"),
      ]);

      if (!salesRes.ok || !expensesRes.ok || !inventoryRes.ok || !paymentsRes.ok) {
        throw new Error("Fetch failed");
      }

      const salesJson = await salesRes.json();
      const nextReporting = readDashboardReporting(salesJson.reporting);
      if (!nextReporting) throw new Error("Dashboard reporting period is unavailable");
      const expensesJson = await expensesRes.json();
      const inventoryJson = await inventoryRes.json();
      const paymentsJson = await paymentsRes.json();
      const materialsJson = materialsRes.ok ? await materialsRes.json() : { data: [] };

      const newSales = salesJson.data ?? [];
      const newExpenses = expensesJson.data ?? [];
      const newInventory = inventoryJson.data ?? [];
      const newPayments = paymentsJson.data ?? [];
      const newMaterials = materialsJson.data ?? [];

      setCachedData(newSales, newExpenses, newInventory, newPayments, newMaterials);
      setReporting(nextReporting);
    } catch (error) {
      setReporting(null);
      console.error("Failed to fetch dashboard data:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    // Deferred one tick so the loading flags are not set synchronously inside the effect.
    void Promise.resolve().then(() => fetchData());

    const handleOnline = () => { fetchData(true); };
    window.addEventListener("online", handleOnline);
    window.addEventListener("bomedia-data-changed", handleOnline);
    return () => { window.removeEventListener("online", handleOnline); window.removeEventListener("bomedia-data-changed", handleOnline); };
  }, []);

  // ── Data assembly ──────────────────────────────────────────────────────────
  const pendingSales: Row[] = pendingQueue
    .filter((item) => item.type === "sale")
    .map((item) => {
      const v = item.data;
      return {
        DATE: v[0],
        "AMOUNT (₦)": "0",
        "INITIAL PAYMENT (₦)": v[14] || "0",
        "AMOUNT DIFFERENCES": "0",
        "PAYMENT STATUS": v[19] || "Unpaid",
        "CLIENT NAME": v[1],
        __isPending: "true",
      };
    });

  const pendingExpenses: Row[] = pendingQueue
    .filter((item) => item.type === "expense")
    .map((item) => ({ ...item.data, __isPending: "true" }));

  const allSales = [...pendingSales, ...cachedSales];
  const allExpenses = [...pendingExpenses, ...cachedExpenses];
  const trading = dashboardTradingRows(allSales, allExpenses, reporting);

  const now = new Date();

  // ── Dynamic Time Windows ───────────────────────────────────────────────────
  let startDate: Date;
  let prevStartDate: Date;

  if (timeRange === "today") {
    startDate = startOfDay(now);
    prevStartDate = startOfDay(subDays(now, 1));
  } else if (timeRange === "7d") {
    startDate = subDays(now, 7);
    prevStartDate = subDays(now, 14);
  } else if (timeRange === "30d") {
    startDate = subDays(now, 30);
    prevStartDate = subDays(now, 60);
  } else if (timeRange === "custom" && customStart && customEnd) {
    startDate = startOfDay(new Date(customStart));
    const endDate = new Date(customEnd);
    const rangeDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000));
    prevStartDate = subDays(startDate, rangeDays);
  } else {
    startDate = new Date("2020-01-01");
    prevStartDate = new Date("2019-01-01");
  }

  const effectiveEnd =
    timeRange === "custom" && customEnd ? new Date(customEnd + "T23:59:59") : now;

  const filterByInterval = (data: Row[], start: Date, end: Date) =>
    data.filter((row) => {
      const d = parseSheetDate(row.DATE || row.Date);
      return d ? isWithinInterval(d, { start, end }) : false;
    });

  const currentSales = filterByInterval(trading.sales, startDate, effectiveEnd);
  const prevSales = filterByInterval(trading.sales, prevStartDate, startDate);
  const currentExpenses = filterByInterval(trading.expenses, startDate, effectiveEnd);
  const prevExpenses = filterByInterval(trading.expenses, prevStartDate, startDate);
  const extraPayments = dashboardExtraIncomeRows(cachedPayments, reporting);
  const extraIncome = extraIncomeNaira(filterByInterval(extraPayments,startDate,effectiveEnd));
  const previousExtraIncome = extraIncomeNaira(filterByInterval(extraPayments,prevStartDate,startDate));

  const sumKey = (data: Row[], keys: string[]) =>
    data.reduce((acc, r) => {
      const key = keys.find((k) => r[k] !== undefined);
      return acc + (key ? parseAmount(r[key]) : 0);
    }, 0);

  // ── Metric values ──────────────────────────────────────────────────────────
  const totalSalesVal = sumKey(currentSales, ["AMOUNT (₦)", "Amount (₦)"]);
  const prevSalesVal = sumKey(prevSales, ["AMOUNT (₦)", "Amount (₦)"]);
  const totalExpensesVal = sumKey(currentExpenses, ["Amount (₦)", "AMOUNT", "Amount"]);
  const prevExpensesVal = sumKey(prevExpenses, ["Amount (₦)", "AMOUNT", "Amount"]);
  const netProfitVal = totalSalesVal + extraIncome - totalExpensesVal;
  const prevProfitVal = prevSalesVal + previousExtraIncome - prevExpensesVal;

  const grossMarginPct = totalSalesVal > 0 ? (netProfitVal / totalSalesVal) * 100 : 0;
  const prevGrossMarginPct = prevSalesVal > 0 ? (prevProfitVal / prevSalesVal) * 100 : 0;

  // ── Payment status breakdown ───────────────────────────────────────────────
  const paymentStats = currentSales.reduce(
    (acc, r) => {
      const status = (r["PAYMENT STATUS"] || r["Payment Status"] || "Unpaid").trim();
      const amount = parseAmount(r["AMOUNT (₦)"] || r["Amount (₦)"]);
      if (status === "Paid") { acc.paid++; acc.paidAmt += amount; }
      else if (status.startsWith("Part")) { acc.partPaid++; acc.partPaidAmt += amount; }
      else { acc.unpaid++; acc.unpaidAmt += amount; }
      return acc;
    },
    { paid: 0, paidAmt: 0, partPaid: 0, partPaidAmt: 0, unpaid: 0, unpaidAmt: 0 }
  );

  // ── Top clients by revenue ─────────────────────────────────────────────────
  const clientRevenueMap: Record<string, number> = {};
  currentSales.forEach((r) => {
    const client = (r["CLIENT NAME"] || r["Client Name"] || "Unknown").trim();
    const amount = parseAmount(r["AMOUNT (₦)"] || r["Amount (₦)"]);
    if (client && amount > 0) clientRevenueMap[client] = (clientRevenueMap[client] || 0) + amount;
  });
  const topClients = Object.entries(clientRevenueMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, revenue]) => ({ name, revenue }));

  // ── Debt age map ───────────────────────────────────────────────────────────
  const debtAgeMap: Record<string, number> = {};
  allSales.forEach((r) => {
    const total      = parseAmount(r["AMOUNT (₦)"] || r["Amount (₦)"]);
    const initialPay = parseAmount(r["INITIAL PAYMENT (₦)"] || r["Initial Payment (₦)"]);
    const addl1      = parseAmount(r["ADDITIONAL PAYMENT 1"] || r["Additional Payment 1"]);
    const addl2      = parseAmount(r["ADDITIONAL PAYMENT 2"] || r["Additional Payment 2"]);
    const balance    = total - initialPay - addl1 - addl2;
    if (balance <= (r._jobId ? 0.005 : 1)) return;
    const client = (r["CLIENT NAME"] || r["Client Name"] || "").trim();
    const d = parseSheetDate(r.DATE || r.Date);
    if (!client || !d) return;
    const daysAgo = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (!debtAgeMap[client] || daysAgo > debtAgeMap[client]) debtAgeMap[client] = daysAgo;
  });

  // ── Outstanding debt ───────────────────────────────────────────────────────
  const debtNow = debtWindows(allSales);
  const { chartData: outstandingDebtChart, totalDebt: outstandingDebtTotal, count: unpaidCount } = processDebtData(allSales);

  // ── Summary sentence ───────────────────────────────────────────────────────
  const trendDir = totalSalesVal >= prevSalesVal ? "up" : "down";
  const changeAmt = Math.abs(totalSalesVal - prevSalesVal);
  const summaryText = totalSalesVal === 0
    ? "No sales recorded in this period — try expanding the date range."
    : `Revenue is ${trendDir} ₦${changeAmt >= 1000 ? (changeAmt / 1000).toFixed(0) + "k" : changeAmt.toLocaleString()} vs the previous period. ${outstandingDebtTotal > 0 ? `Outstanding debt stands at ₦${outstandingDebtTotal >= 1000 ? (outstandingDebtTotal / 1000).toFixed(0) + "k" : outstandingDebtTotal.toLocaleString()}.` : "All balances are cleared."} ${grossMarginPct > 0 ? `Margin: ${grossMarginPct.toFixed(0)}%.` : ""}`;

  // ── Today at a glance ──────────────────────────────────────────────────────
  const startOfToday = startOfDay(now);
  const todaySalesItems = trading.sales.filter(r => {
    const d = parseSheetDate(r.DATE || r.Date);
    return d ? isSameDay(d, startOfToday) : false;
  });
  const todayJobCount = todaySalesItems.length;
  const todayRevenue = sumKey(todaySalesItems, ["AMOUNT (₦)", "Amount (₦)"]);

  // ── Chart data ─────────────────────────────────────────────────────────────
  const chartStartDate = (() => {
    if (timeRange !== "all" && !(timeRange === "custom" && !customStart)) {
      return startDate;
    }
    const allDates = [...trading.sales, ...trading.expenses]
      .map((r) => parseSheetDate(r.DATE || r.Date))
      .filter(Boolean) as Date[];
    if (allDates.length === 0) return startOfDay(now);
    const earliest = new Date(Math.min(...allDates.map((d) => d.getTime())));
    return earliest < subDays(now, 365) ? subDays(now, 365) : earliest;
  })();
  const rangeInterval = eachDayOfInterval({ start: chartStartDate, end: effectiveEnd });
  const chartData = rangeInterval.map((day) => {
    const daySales = trading.sales.filter((r) => {
      const d = parseSheetDate(r.DATE || r.Date);
      return d ? isSameDay(d, day) : false;
    });
    const dayExpenses = trading.expenses.filter((r) => {
      const d = parseSheetDate(r.DATE || r.Date);
      return d ? isSameDay(d, day) : false;
    });
    return {
      date: format(day, timeRange === "today" ? "HH:00" : "MMM dd"),
      sales: sumKey(daySales, ["AMOUNT (₦)", "Amount (₦)"]),
      expenses: sumKey(dayExpenses, ["Amount (₦)", "AMOUNT", "Amount"]),
    };
  });

  // ── Expense categories ─────────────────────────────────────────────────────
  const categories: Record<string, number> = {};
  currentExpenses.forEach((r) => {
    const cat = r.CATEGORY || r.Category || "Other";
    const amount = parseAmount(r["Amount (₦)"] || r.AMOUNT || r.Amount);
    categories[cat] = (categories[cat] || 0) + amount;
  });
  const categoryData = Object.entries(categories)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, value]) => ({ name, value, color: "" }));

  const calculateChange = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? "100%" : "0%";
    return `${Math.abs(Math.round(((current - previous) / previous) * 100))}%`;
  };

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return <ScreenLoading screen="dashboard" role="admin" label="Loading the dashboard" />;
  }

  return (
    <Box sx={layout.page}>

      <ApprovalsWaitingCard />

      {/* Today Banner */}
      {reporting && <motion.div variants={sectionVariants} custom={0} initial="hidden" animate="show">
        <TodayBanner jobCount={todayJobCount} revenue={todayRevenue} salesCount={todayJobCount} />
      </motion.div>}

      {/* Mobile Time Range Selector */}
      <Box sx={layout.mobileControls}>
        <PeriodSelector value={timeRange} onChange={setTimeRange} fullWidth />
        {timeRange === "custom" && (
          <Box sx={layout.below}>
            <DateRangeFields start={customStart} end={customEnd} onStartChange={setCustomStart} onEndChange={setCustomEnd} />
          </Box>
        )}
        <Button
          variant="outlined"
          size="small"
          fullWidth
          onClick={() => setShowReport(true)}
          startIcon={<FileText size={14} />}
          sx={layout.below}
        >
          Shift Report
        </Button>
      </Box>

      {/* Desktop Time Range + Controls */}
      <Box sx={layout.desktopBar}>
        <Stack direction="row" sx={layout.desktopLeft}>
          <PeriodSelector value={timeRange} onChange={setTimeRange} />
          {timeRange === "custom" && (
            <DateRangeFields start={customStart} end={customEnd} onStartChange={setCustomStart} onEndChange={setCustomEnd} />
          )}

          <Button
            variant="outlined"
            size="small"
            onClick={() => setIsMuted(!isMuted)}
            startIcon={isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          >
            {isMuted ? "Muted" : "Sound On"}
          </Button>
        </Stack>

        <Stack direction="row" sx={layout.desktopRight}>
          <Button
            variant="outlined"
            size="small"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            startIcon={<Box component="span" sx={[styles.iconSpan, refreshing && styles.refreshing]}><RefreshCw size={14} /></Box>}
          >
            {refreshing ? "Updating..." : "Refresh"}
          </Button>
          <Button
            variant="outlined"
            size="small"
            onClick={() => setShowReport(true)}
            startIcon={<FileText size={14} />}
          >
            Shift Report
          </Button>
        </Stack>
      </Box>

      {/* Summary sentence */}
      {!reporting && <Alert severity="warning">Sales and expense reports are unavailable. Reconnect and refresh to load the bookkeeping period.</Alert>}
      {reporting?.backend === 'postgres' && <Alert severity="info">
        Sales and expense reports cover the new books from {format(new Date(`${reporting.startsOn}T12:00:00`), 'd MMM yyyy')}.
        {' '}Opening debts remain in outstanding balances. Earlier sales are in Customers → Before the new app.
      </Alert>}
      {totalSalesVal > 0 && (
        <Paper sx={styles.summaryBanner}>
          <Box component="span" sx={styles.summaryEmoji}>📊</Box>
          <Typography variant="body2" sx={styles.summaryText}>
            {summaryText}
          </Typography>
        </Paper>
      )}

      {/* Metric cards */}
      {reporting && extraIncome > 0 && <Alert severity="info">Extra payment income: ₦{extraIncome.toLocaleString('en-NG',{minimumFractionDigits:2})}. Included in net profit and shown separately from sales.</Alert>}
      {reporting && <motion.div variants={sectionVariants} custom={0.08} initial="hidden" animate="show">
        <DashboardMetrics
          totalSales={totalSalesVal}
          totalExpenses={totalExpensesVal}
          netProfit={netProfitVal}
          outstandingDebt={outstandingDebtTotal}
          unpaidCount={unpaidCount}
          salesChange={calculateChange(totalSalesVal, prevSalesVal)}
          expensesChange={calculateChange(totalExpensesVal, prevExpensesVal)}
          profitChange={calculateChange(netProfitVal, prevProfitVal)}
          isSalesUp={totalSalesVal >= prevSalesVal}
          isExpensesDown={totalExpensesVal <= prevExpensesVal}
          isProfitUp={netProfitVal >= prevProfitVal}
          grossMarginPct={grossMarginPct}
          prevGrossMarginPct={prevGrossMarginPct}
          sparkData={chartData.slice(-7).map(d => d.sales)}
          owedToday={{ amount: debtNow.today, customers: debtNow.todayCount }}
          owedWeek={{ amount: debtNow.week, customers: debtNow.weekCount }}
        />
      </motion.div>}

      {/* Inventory Alerts + Quick Actions */}
      <motion.div variants={sectionVariants} custom={0.16} initial="hidden" animate="show">
        <Box sx={styles.alertsAndShortcuts}>

          {/* Inventory Alerts Widget */}
          {(() => {
            const severityRank = (s: string) => s === "Critical" ? 0 : s === "Low" ? 1 : 2;
            const sortedMaterials = [...cachedMaterials]
              .map((item: any) => {
                const remaining = parseFloat(item["Total Remaining (ft)"]?.toString() || "0") || 0;
                const total     = parseFloat(item["Total Capacity (ft)"]?.toString() || "0") || 0;
                const threshold = parseFloat(item["Low Stock Threshold (ft)"]?.toString() || "20") || 20;
                const pct       = total > 0 ? Math.min(100, (remaining / total) * 100) : 0;
                const sheetStatus = item["Status"] || "";
                const status: "Good" | "Low" | "Critical" =
                  sheetStatus === "Out of Stock" || sheetStatus === "Depleted" || remaining <= 0 ? "Critical"
                  : sheetStatus === "Low Stock" || remaining <= threshold ? "Low"
                  : "Good";
                return { item, remaining, total, pct, status };
              })
              .sort((a, b) => severityRank(a.status) - severityRank(b.status));

            const alertCount = sortedMaterials.filter(m => m.status !== "Good").length;

            return (
              <Card sx={styles.alertCard}>
                {/* Header */}
                <Box sx={styles.alertHeader}>
                  <Stack direction="row" sx={layout.alertTitleRow}>
                    <Box sx={styles.alertIcon}>
                      <Package size={16} />
                    </Box>
                    <Box>
                      <Typography variant="h6" component="p">Inventory Reorder Alerts</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {cachedMaterials.length === 0
                          ? "No materials tracked"
                          : alertCount === 0
                          ? "All stock levels healthy"
                          : `${alertCount} material${alertCount !== 1 ? "s" : ""} need attention`}
                      </Typography>
                    </Box>
                  </Stack>
                  <Stack direction="row" sx={layout.alertActions}>
                    {alertCount > 0 && (
                      <Chip
                        label={`${alertCount} alert${alertCount !== 1 ? "s" : ""}`}
                        size="small"
                        color="error"
                      />
                    )}
                    <Button component={Link} href="/bom03/inventory" variant="outlined" size="small">
                      View All
                    </Button>
                  </Stack>
                </Box>

                {/* Scrollable list */}
                <Box sx={styles.alertList}>
                  {cachedMaterials.length === 0 ? (
                    <Stack sx={styles.emptyState}>
                      <Box sx={styles.emptyIcon}><Package size={32} /></Box>
                      <Typography variant="caption" color="text.secondary" sx={styles.bold}>No inventory data yet</Typography>
                      <Typography variant="caption" component={Link} href="/bom03/inventory" sx={styles.emptyLink}>
                        Add your first material →
                      </Typography>
                    </Stack>
                  ) : alertCount === 0 ? (
                    <Stack sx={styles.emptyState}>
                      <Box sx={styles.healthyIcon}>
                        <Package size={20} />
                      </Box>
                      <Typography variant="caption" color="text.secondary" sx={styles.bold}>All stock levels are healthy</Typography>
                      <Typography variant="caption" color="text.disabled">{cachedMaterials.length} material{cachedMaterials.length !== 1 ? "s" : ""} tracked</Typography>
                    </Stack>
                  ) : (
                    <Stack sx={layout.materialList}>
                      {sortedMaterials.filter(m => m.status !== "Good").map(({ item, remaining, total, pct, status }) => {
                        const barColor = status === "Critical" ? "error" : status === "Low" ? "warning" : "success";
                        const materialName = item["Material Name"] || item["Material ID"] || "Unknown";
                        const width = parseFloat(item["Width (ft)"]?.toString() || "0") || 0;
                        const rollCount = item["Roll Count"] || "";

                        return (
                          <Paper
                            key={item["Material ID"] || materialName}
                            variant="outlined"
                            sx={styles.materialRow}
                          >
                            <Box sx={layout.materialHead}>
                              <Box sx={layout.materialMain}>
                                <Stack direction="row" sx={layout.materialTitleRow}>
                                  <Typography variant="h6" component="p" noWrap>{materialName}</Typography>
                                  {width > 0 && (
                                    <Typography variant="caption" color="text.disabled">{width}ft wide</Typography>
                                  )}
                                  <Chip
                                    label={status === "Critical" ? "Out of Stock" : status}
                                    size="small"
                                    color={status === "Critical" ? "error" : "warning"}
                                  />
                                </Stack>
                                <Typography variant="caption" color="text.secondary">
                                  {remaining.toFixed(1)}ft left{total > 0 ? ` of ${total.toFixed(0)}ft` : ""}
                                  {rollCount ? ` · ${rollCount} roll${Number(rollCount) !== 1 ? "s" : ""}` : ""}
                                </Typography>
                              </Box>
                              <Button component={Link} href="/bom03/inventory" variant="outlined" size="small" sx={styles.restock}>
                                Restock
                              </Button>
                            </Box>
                            <LinearProgress
                              variant="determinate"
                              value={pct}
                              color={barColor as any}
                              sx={styles.stockBar}
                            />
                          </Paper>
                        );
                      })}
                    </Stack>
                  )}
                </Box>
              </Card>
            );
          })()}

          {/* Quick Action Shortcuts */}
          <Box sx={styles.quickRow}>
            {[
              { href: "/bom03/inventory", label: "Inventory Control", title: "Stock", desc: "Materials & logs", icon: <Package size={24} /> },
              { href: "/bom03/quick-check", label: "Verification", title: "Quick-Check", desc: "Test a roll", icon: <Zap size={24} /> },
              { href: "/bom03/settings", label: "Admin Only", title: "Settings", desc: "Services & staff", icon: <Users size={24} /> },
            ].map(({ href, title, desc, icon }) => (
              <Paper key={href} component={Link} href={href} variant="outlined" sx={styles.quickCard}>
                <Box sx={styles.quickHead}>
                  <Box sx={styles.quickIcon}>{icon}</Box>
                  <Typography component="p" noWrap sx={styles.quickTitle}>{title}</Typography>
                </Box>
                <Typography variant="caption" color="text.secondary" noWrap sx={styles.quickDesc}>{desc}</Typography>
              </Paper>
            ))}
          </Box>
        </Box>
      </motion.div>

      {/* Quick Actions Banner */}
      <motion.div variants={sectionVariants} custom={0.22} initial="hidden" animate="show">
        <Paper sx={styles.voiceBanner}>
          <Stack direction="row" sx={layout.voiceRow}>
            <Box sx={styles.voiceIcon}>
              <Zap size={20} />
            </Box>
            <Box>
              <Typography variant="body1" sx={styles.voiceTitle}>Quick Actions</Typography>
              <Typography variant="caption" sx={styles.voiceHint}>
                Say: <Box component="em" sx={styles.voiceExample}>"Logged ₦12k sale..."</Box> — Fast mobile entry.
              </Typography>
            </Box>
          </Stack>

          <QuickActionGroup actions={[
            { href: "/bom03/expenses", icon: <Receipt size={14} />, label: "Log Expense" },
            { href: "/bom03/records", icon: <BarChart3 size={14} />, label: "Records" },
            { href: "/estimator", icon: <Calculator size={14} />, label: "Estimator" },
            { icon: <Bell size={14} />, label: "Daily Digest", onClick: async () => {
              try {
                const res = await fetch("/api/digest");
                const json = await res.json();
                if (json.whatsappUrl) window.open(json.whatsappUrl, "_blank");
              } catch { toast.error("Could not load digest"); }
            } },
          ]} />
        </Paper>
      </motion.div>

      {/* Charts Row 1: Sales vs Expenses + Recent Payments Pulse */}
      <motion.div variants={sectionVariants} custom={0.28} initial="hidden" animate="show">
        <Box sx={layout.chartsWide}>
          {reporting && <SalesExpenseChart data={chartData} />}
          <RecentPaymentsPulse payments={cachedPayments} />
        </Box>
      </motion.div>

      {/* Charts Row 2: Outstanding Debt */}
      <motion.div variants={sectionVariants} custom={0.34} initial="hidden" animate="show">
        <Box sx={layout.section}>
          <OutstandingDebtChart data={outstandingDebtChart} onClientClick={setSelectedDebtor} ageMap={debtAgeMap} />
        </Box>
      </motion.div>

      {/* Charts Row 3: Payment Status + Top Clients */}
      {reporting && <motion.div variants={sectionVariants} custom={0.38} initial="hidden" animate="show">
        <Box sx={layout.chartsEven}>
          <PaymentStatusWidget
            paid={paymentStats.paid}
            partPaid={paymentStats.partPaid}
            unpaid={paymentStats.unpaid}
            paidAmt={paymentStats.paidAmt}
            partPaidAmt={paymentStats.partPaidAmt}
            unpaidAmt={paymentStats.unpaidAmt}
            total={currentSales.length}
          />
          <TopClientsWidget clients={topClients} />
        </Box>
      </motion.div>}

      {/* Material Profitability Widget */}
      {reporting && <motion.div variants={sectionVariants} custom={0.42} initial="hidden" animate="show">
        <Box sx={layout.section}>
          <ProfitabilityWidget sales={currentSales} inventory={cachedInventory} />
        </Box>
      </motion.div>}

      <DebtorPaymentModal
        clientName={selectedDebtor}
        isOpen={!!selectedDebtor}
        onClose={() => setSelectedDebtor(null)}
        onUpdate={() => fetchData(true)}
        theme="brand"
      />
      <ShiftReportModal isOpen={showReport} onClose={() => setShowReport(false)} />
    </Box>
  );
}

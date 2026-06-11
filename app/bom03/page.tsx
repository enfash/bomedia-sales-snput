"use client";
import { LoadingAnimation } from "@/components/loading-animation";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Zap, RefreshCw, Receipt, BarChart3, Package, Volume2, VolumeX, CalendarRange, FileText, Users, Calculator, Bell } from "lucide-react";
import { motion } from "framer-motion";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import { useTheme } from "@mui/material/styles";
import Paper from "@mui/material/Paper";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Skeleton from "@mui/material/Skeleton";
import Chip from "@mui/material/Chip";
import LinearProgress from "@mui/material/LinearProgress";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import ToggleButton from "@mui/material/ToggleButton";
import Stack from "@mui/material/Stack";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs from "dayjs";

import { useSyncStore } from "@/lib/store";
import { DashboardMetrics } from "@/components/dashboard-metrics";
import { SalesExpenseChart, OutstandingDebtChart, PaymentStatusWidget, TopClientsWidget } from "@/components/dashboard-charts";
import { RecentPaymentsPulse } from "@/components/recent-payments-pulse";
import { DebtorPaymentModal } from "@/components/debtor-payment-modal";
import { processDebtData } from "@/lib/financial-utils";
import { TodayBanner } from "@/components/today-banner";
import { ShiftReportModal } from "@/components/shift-report-modal";
import { ProfitabilityWidget } from "@/components/profitability-widget";

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
  const theme = useTheme();
  const { pendingQueue, cachedSales, cachedExpenses, cachedInventory, cachedMaterials, cachedPayments, setCachedData } = useSyncStore();

  const [loading, setLoading] = useState(cachedSales.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [timeRange, setTimeRange] = useState<"all" | "today" | "7d" | "30d" | "custom">("30d");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [selectedDebtor, setSelectedDebtor] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);

  const lastSalesIndex = useRef<number>(0);
  const lastExpensesIndex = useRef<number>(0);
  const isInitialLoad = useRef<boolean>(true);

  const fetchData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else if (cachedSales.length === 0) setLoading(true);

    try {
      const [salesRes, expensesRes, inventoryRes, paymentsRes, materialsRes] = await Promise.all([
        fetch("/api/sales"),
        fetch("/api/expenses"),
        fetch("/api/inventory"),
        fetch("/api/payments"),
        fetch("/api/materials"),
      ]);

      if (!salesRes.ok || !expensesRes.ok || !inventoryRes.ok || !paymentsRes.ok) {
        throw new Error("Fetch failed");
      }

      const salesJson = await salesRes.json();
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
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();

    const handleOnline = () => { fetchData(true); };
    window.addEventListener("online", handleOnline);
    return () => { window.removeEventListener("online", handleOnline); };
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

  const currentSales = filterByInterval(allSales, startDate, effectiveEnd);
  const prevSales = filterByInterval(allSales, prevStartDate, startDate);
  const currentExpenses = filterByInterval(allExpenses, startDate, effectiveEnd);
  const prevExpenses = filterByInterval(allExpenses, prevStartDate, startDate);

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
  const netProfitVal = totalSalesVal - totalExpensesVal;
  const prevProfitVal = prevSalesVal - prevExpensesVal;

  const grossMarginPct = totalSalesVal > 0 ? (netProfitVal / totalSalesVal) * 100 : 0;
  const prevGrossMarginPct = prevSalesVal > 0 ? ((prevSalesVal - prevExpensesVal) / prevSalesVal) * 100 : 0;

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
    if (balance <= 1) return;
    const client = (r["CLIENT NAME"] || r["Client Name"] || "").trim();
    const d = parseSheetDate(r.DATE || r.Date);
    if (!client || !d) return;
    const daysAgo = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (!debtAgeMap[client] || daysAgo > debtAgeMap[client]) debtAgeMap[client] = daysAgo;
  });

  // ── Outstanding debt ───────────────────────────────────────────────────────
  const { chartData: outstandingDebtChart, totalDebt: outstandingDebtTotal, count: unpaidCount } = processDebtData(allSales);

  // ── Summary sentence ───────────────────────────────────────────────────────
  const trendDir = totalSalesVal >= prevSalesVal ? "up" : "down";
  const changeAmt = Math.abs(totalSalesVal - prevSalesVal);
  const summaryText = totalSalesVal === 0
    ? "No sales recorded in this period — try expanding the date range."
    : `Revenue is ${trendDir} ₦${changeAmt >= 1000 ? (changeAmt / 1000).toFixed(0) + "k" : changeAmt.toLocaleString()} vs the previous period. ${outstandingDebtTotal > 0 ? `Outstanding debt stands at ₦${outstandingDebtTotal >= 1000 ? (outstandingDebtTotal / 1000).toFixed(0) + "k" : outstandingDebtTotal.toLocaleString()}.` : "All balances are cleared."} ${grossMarginPct > 0 ? `Margin: ${grossMarginPct.toFixed(0)}%.` : ""}`;

  // ── Today at a glance ──────────────────────────────────────────────────────
  const startOfToday = startOfDay(now);
  const todaySalesItems = allSales.filter(r => {
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
    const allDates = [...allSales, ...allExpenses]
      .map((r) => parseSheetDate(r.DATE || r.Date))
      .filter(Boolean) as Date[];
    if (allDates.length === 0) return startOfDay(now);
    const earliest = new Date(Math.min(...allDates.map((d) => d.getTime())));
    return earliest < subDays(now, 365) ? subDays(now, 365) : earliest;
  })();
  const rangeInterval = eachDayOfInterval({ start: chartStartDate, end: effectiveEnd });
  const chartData = rangeInterval.map((day) => {
    const daySales = allSales.filter((r) => {
      const d = parseSheetDate(r.DATE || r.Date);
      return d ? isSameDay(d, day) : false;
    });
    const dayExpenses = allExpenses.filter((r) => {
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
  allExpenses.forEach((r) => {
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
    return (
      <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <LoadingAnimation text="Loading..." />
      </Box>
    );
  }

  const timeRangeOptions = [
    { val: "all",    label: "All" },
    { val: "today",  label: "Today" },
    { val: "7d",     label: "7D" },
    { val: "30d",    label: "30D" },
    { val: "custom", label: "Custom" },
  ] as const;

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, minHeight: "100vh", bgcolor: "background.default", pb: 12 }}>

      {/* Today Banner */}
      <motion.div variants={sectionVariants} custom={0} initial="hidden" animate="show">
        <TodayBanner jobCount={todayJobCount} revenue={todayRevenue} salesCount={todayJobCount} />
      </motion.div>

      {/* Mobile Time Range Selector */}
      <Box sx={{ display: { xs: "block", md: "none" }, mt: 2 }}>
        <ToggleButtonGroup
          value={timeRange}
          exclusive
          onChange={(_, val) => val && setTimeRange(val)}
          fullWidth
          size="small"
          sx={{
            bgcolor: "grey.100",
            borderRadius: 3,
            p: 0.5,
            "& .MuiToggleButton-root": {
              border: "none",
              borderRadius: "8px !important",
              fontSize: "0.7rem",
              fontWeight: 700,
              py: 0.75,
              "&.Mui-selected": {
                bgcolor: "background.paper",
                color: "primary.main",
                boxShadow: "0 1px 4px rgba(0,0,0,0.10)",
              },
            },
          }}
        >
          {timeRangeOptions.map(({ val, label }) => (
            <ToggleButton key={val} value={val} disableRipple>
              {val === "custom" ? <CalendarRange size={14} /> : label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        {timeRange === "custom" && (
          <Stack direction="row" sx={{ gap: 1.5, mt: 1.5, alignItems: "center" }}>
            <Box sx={{ flex: 1 }}>
              <DatePicker
                value={customStart ? dayjs(customStart) : null}
                maxDate={customEnd ? dayjs(customEnd) : undefined}
                onChange={(val) => setCustomStart(val?.format("YYYY-MM-DD") ?? "")}
                label="From"
                slotProps={{ textField: { size: "small", fullWidth: true } }}
              />
            </Box>
            <Typography sx={{ color: "text.disabled" }}>→</Typography>
            <Box sx={{ flex: 1 }}>
              <DatePicker
                value={customEnd ? dayjs(customEnd) : null}
                minDate={customStart ? dayjs(customStart) : undefined}
                onChange={(val) => setCustomEnd(val?.format("YYYY-MM-DD") ?? "")}
                label="To"
                slotProps={{ textField: { size: "small", fullWidth: true } }}
              />
            </Box>
          </Stack>
        )}
      </Box>

      {/* Desktop Time Range + Controls */}
      <Box sx={{ display: { xs: "none", md: "flex" }, alignItems: "center", justifyContent: "space-between", gap: 2, mt: 2, flexWrap: "wrap" }}>
        <Stack direction="row" sx={{ alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
          <ToggleButtonGroup
            value={timeRange}
            exclusive
            onChange={(_, val) => val && setTimeRange(val)}
            size="small"
            sx={{
              bgcolor: "grey.100",
              borderRadius: 2,
              p: 0.5,
              "& .MuiToggleButton-root": {
                border: "none",
                borderRadius: "6px !important",
                fontSize: "0.7rem",
                fontWeight: 700,
                px: 1.5,
                py: 0.5,
                "&.Mui-selected": {
                  bgcolor: "background.paper",
                  color: "primary.main",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.10)",
                },
              },
            }}
          >
            {timeRangeOptions.map(({ val, label }) => (
              <ToggleButton key={val} value={val} disableRipple>
                {val === "custom" ? (
                  <Box component="span" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    <CalendarRange size={12} />
                    <span>{label}</span>
                  </Box>
                ) : label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          {timeRange === "custom" && (
            <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
              <Box>
                <DatePicker
                  value={customStart ? dayjs(customStart) : null}
                  maxDate={customEnd ? dayjs(customEnd) : undefined}
                  onChange={(val) => setCustomStart(val?.format("YYYY-MM-DD") ?? "")}
                  label="From"
                  slotProps={{ textField: { size: "small", sx: { width: 130 } } }}
                />
              </Box>
              <Typography sx={{ color: "text.disabled" }}>→</Typography>
              <Box>
                <DatePicker
                  value={customEnd ? dayjs(customEnd) : null}
                  minDate={customStart ? dayjs(customStart) : undefined}
                  onChange={(val) => setCustomEnd(val?.format("YYYY-MM-DD") ?? "")}
                  label="To"
                  slotProps={{ textField: { size: "small", sx: { width: 130 } } }}
                />
              </Box>
            </Stack>
          )}

          <Button
            variant="outlined"
            size="small"
            onClick={() => setIsMuted(!isMuted)}
            startIcon={isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            sx={{ fontSize: "0.7rem", fontWeight: 700, borderRadius: 100, height: 32 }}
          >
            {isMuted ? "Muted" : "Sound On"}
          </Button>
        </Stack>

        <Stack direction="row" sx={{ gap: 1 }}>
          <Button
            variant="outlined"
            size="small"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            startIcon={<RefreshCw size={14} style={refreshing ? { animation: "spin 1s linear infinite" } : undefined} />}
            sx={{ fontSize: "0.75rem", fontWeight: 700, borderRadius: 100, height: 36 }}
          >
            {refreshing ? "Updating..." : "Refresh"}
          </Button>
          <Button
            variant="outlined"
            size="small"
            onClick={() => setShowReport(true)}
            startIcon={<FileText size={14} />}
            sx={{ fontSize: "0.75rem", fontWeight: 700, borderRadius: 100, height: 36 }}
          >
            Shift Report
          </Button>
        </Stack>
      </Box>

      {/* Summary sentence */}
      {totalSalesVal > 0 && (
        <Paper
          sx={{
            mt: 2,
            mb: 3,
            px: 2.5,
            py: 1.5,
            borderRadius: "16px",
            bgcolor: "primary.main",
            backgroundImage: "none",
            display: "flex",
            alignItems: "flex-start",
            gap: 1.5,
          }}
        >
          <span style={{ fontSize: "1rem", marginTop: 2 }}>📊</span>
          <Typography variant="body2" sx={{ fontWeight: 600, color: "primary.contrastText", lineHeight: 1.6 }}>
            {summaryText}
          </Typography>
        </Paper>
      )}

      {/* Metric cards */}
      <motion.div variants={sectionVariants} custom={0.08} initial="hidden" animate="show">
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
        />
      </motion.div>

      {/* Inventory Alerts + Quick Actions */}
      <motion.div variants={sectionVariants} custom={0.16} initial="hidden" animate="show">
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1fr" }, gap: 2, mt: 2 }}>

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
              <Card sx={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                {/* Header */}
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2.5, py: 2, borderBottom: "1px solid", borderColor: "divider" }}>
                  <Stack direction="row" sx={{ alignItems: "center", gap: 1.5 }}>
                    <Box sx={{ width: 32, height: 32, borderRadius: 2, bgcolor: "primary.main", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.12, position: "absolute" }} />
                    <Box sx={{ width: 32, height: 32, borderRadius: 2, bgcolor: "primary.main", display: "flex", alignItems: "center", justifyContent: "center", opacity: 1, position: "relative" }}>
                      <Package size={16} color="white" />
                    </Box>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 800 }}>Inventory Reorder Alerts</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {cachedMaterials.length === 0
                          ? "No materials tracked"
                          : alertCount === 0
                          ? "All stock levels healthy"
                          : `${alertCount} material${alertCount !== 1 ? "s" : ""} need attention`}
                      </Typography>
                    </Box>
                  </Stack>
                  <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
                    {alertCount > 0 && (
                      <Chip
                        label={`${alertCount} alert${alertCount !== 1 ? "s" : ""}`}
                        size="small"
                        sx={{ fontSize: "0.65rem", fontWeight: 800, bgcolor: "error.light", color: "error.dark", height: 20 }}
                      />
                    )}
                    <Link href="/bom03/inventory">
                      <Button variant="outlined" size="small" sx={{ fontSize: "0.7rem", fontWeight: 700, height: 28, borderRadius: 100, px: 1.5 }}>
                        View All
                      </Button>
                    </Link>
                  </Stack>
                </Box>

                {/* Scrollable list */}
                <Box sx={{ overflowY: "auto", maxHeight: 260, p: 2 }}>
                  {cachedMaterials.length === 0 ? (
                    <Stack sx={{ alignItems: "center", justifyContent: "center", py: 4, color: "text.disabled" }}>
                      <Package size={32} style={{ opacity: 0.4, marginBottom: 8 }} />
                      <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>No inventory data yet</Typography>
                      <Link href="/bom03/inventory">
                        <Typography variant="caption" sx={{ fontWeight: 700, color: "primary.main", mt: 0.5, cursor: "pointer", "&:hover": { textDecoration: "underline" } }}>
                          Add your first material →
                        </Typography>
                      </Link>
                    </Stack>
                  ) : alertCount === 0 ? (
                    <Stack sx={{ alignItems: "center", justifyContent: "center", py: 4 }}>
                      <Box sx={{ width: 40, height: 40, borderRadius: "50%", bgcolor: "success.light", display: "flex", alignItems: "center", justifyContent: "center", mb: 1, opacity: 0.7 }}>
                        <Package size={20} color="#2E7D5B" />
                      </Box>
                      <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>All stock levels are healthy</Typography>
                      <Typography variant="caption" color="text.disabled">{cachedMaterials.length} material{cachedMaterials.length !== 1 ? "s" : ""} tracked</Typography>
                    </Stack>
                  ) : (
                    <Stack sx={{ gap: 1 }}>
                      {sortedMaterials.filter(m => m.status !== "Good").map(({ item, remaining, total, pct, status }) => {
                        const barColor = status === "Critical" ? "error" : status === "Low" ? "warning" : "success";
                        const chipColor = status === "Critical"
                          ? { bgcolor: "#fef2f2", color: "#be123c" }
                          : { bgcolor: "#fffbeb", color: "#b45309" };
                        const materialName = item["Material Name"] || item["Material ID"] || "Unknown";
                        const width = parseFloat(item["Width (ft)"]?.toString() || "0") || 0;
                        const rollCount = item["Roll Count"] || "";

                        return (
                          <Paper
                            key={item["Material ID"] || materialName}
                            variant="outlined"
                            sx={{ p: 1.5, borderRadius: 2, bgcolor: "action.hover", "&:hover": { bgcolor: "action.selected" }, transition: "background-color .15s" }}
                          >
                            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
                              <Box sx={{ minWidth: 0, flex: 1 }}>
                                <Stack direction="row" sx={{ alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                                  <Typography variant="body2" sx={{ fontWeight: 800 }} noWrap>{materialName}</Typography>
                                  {width > 0 && (
                                    <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.65rem" }}>{width}ft wide</Typography>
                                  )}
                                  <Chip
                                    label={status === "Critical" ? "Out of Stock" : status}
                                    size="small"
                                    sx={{ fontSize: "0.6rem", fontWeight: 800, height: 18, textTransform: "uppercase", letterSpacing: "0.04em", ...chipColor }}
                                  />
                                </Stack>
                                <Typography variant="caption" color="text.secondary">
                                  {remaining.toFixed(1)}ft left{total > 0 ? ` of ${total.toFixed(0)}ft` : ""}
                                  {rollCount ? ` · ${rollCount} roll${Number(rollCount) !== 1 ? "s" : ""}` : ""}
                                </Typography>
                              </Box>
                              <Link href="/bom03/inventory" style={{ marginLeft: 12, flexShrink: 0 }}>
                                <Button variant="outlined" size="small" sx={{ fontSize: "0.7rem", fontWeight: 700, height: 28, borderRadius: 100, px: 1.5 }}>
                                  Restock
                                </Button>
                              </Link>
                            </Box>
                            <LinearProgress
                              variant="determinate"
                              value={pct}
                              color={barColor as any}
                              sx={{ height: 6, borderRadius: 3, bgcolor: "grey.200" }}
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
          <Stack sx={{ gap: 1.5 }}>
            {[
              {
                href: "/bom03/inventory",
                label: "Inventory Control",
                title: "Full Stock Sheet",
                desc: "Add materials & logs",
                icon: <Package size={24} />,
                color: { bg: "#eff6ff", border: "#bfdbfe", icon: "#2e388d", label: "#2e388d" },
              },
              {
                href: "/quick-check",
                label: "Verification",
                title: "Material Quick-Check",
                desc: "Test viability before job",
                icon: <Zap size={24} />,
                color: { bg: "#eff6ff", border: "#bfdbfe", icon: "#2e388d", label: "#2e388d" },
              },
              {
                href: "/bom03/staff",
                label: "Admin Only",
                title: "Staff Performance",
                desc: "Revenue & collection rates",
                icon: <Users size={24} />,
                color: { bg: "#eff6ff", border: "#bfdbfe", icon: "#2e388d", label: "#2e388d" },
              },
            ].map(({ href, label, title, desc, icon, color }) => (
              <Link key={href} href={href} style={{ textDecoration: "none", flex: 1, display: "flex" }}>
                <Paper
                  variant="outlined"
                  sx={{
                    flex: 1,
                    p: 2,
                    borderRadius: "16px",
                    bgcolor: theme.palette.mode === "dark" ? "rgba(255,255,255,0.05)" : color.bg,
                    borderColor: theme.palette.mode === "dark" ? "rgba(255,255,255,0.1)" : color.border,
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                    cursor: "pointer",
                    transition: "transform .15s, background-color .15s",
                    "&:hover": { bgcolor: theme.palette.mode === "dark" ? "rgba(255,255,255,0.1)" : color.border },
                    "&:active": { transform: "scale(0.97)" },
                  }}
                >
                  <Box sx={{ p: 1.25, borderRadius: 2, bgcolor: theme.palette.mode === "dark" ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.7)", color: color.icon, display: "flex" }}>
                    {icon}
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: theme.palette.mode === "dark" ? color.icon : color.label }}>
                      {label}
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: "text.primary", lineHeight: 1.3 }}>{title}</Typography>
                    <Typography variant="caption" color="text.secondary">{desc}</Typography>
                  </Box>
                </Paper>
              </Link>
            ))}
          </Stack>
        </Box>
      </motion.div>

      {/* Quick Actions Banner */}
      <motion.div variants={sectionVariants} custom={0.22} initial="hidden" animate="show">
        <Paper
          sx={{
            mt: 2,
            p: 2.5,
            borderRadius: "16px",
            background: "linear-gradient(135deg, #4A56C4 0%, #2E388D 100%)",
            boxShadow: "0 8px 24px rgba(46,56,141,0.35)",
            display: "flex",
            flexDirection: { xs: "column", md: "row" },
            alignItems: { md: "center" },
            justifyContent: "space-between",
            gap: 3,
          }}
        >
          <Stack direction="row" sx={{ alignItems: "center", gap: 2 }}>
            <Box sx={{ width: 44, height: 44, borderRadius: 2.5, bgcolor: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Zap size={20} color="white" />
            </Box>
            <Box>
              <Typography variant="body1" sx={{ fontWeight: 700, color: "white", lineHeight: 1.3 }}>Quick Actions</Typography>
              <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.8)" }}>
                Say: <em style={{ fontStyle: "normal", fontWeight: 600 }}>"Logged ₦12k sale..."</em> — Fast mobile entry.
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1, width: { xs: "100%", md: "auto" } }}>
            {[
              { href: "/bom03/expenses", icon: <Receipt size={14} />, label: "Log Expense" },
              { href: "/bom03/records",  icon: <BarChart3 size={14} />, label: "Records" },
              { href: "/estimator",      icon: <Calculator size={14} />, label: "Estimator" },
            ].map(({ href, icon, label }) => (
              <Link key={href} href={href} style={{ flex: 1, minWidth: "fit-content" }}>
                <Button
                  variant="outlined"
                  startIcon={icon}
                  fullWidth
                  sx={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    height: 40,
                    borderColor: "rgba(255,255,255,0.35)",
                    color: "white",
                    bgcolor: "rgba(255,255,255,0.1)",
                    borderRadius: 100,
                    "&:hover": { bgcolor: "rgba(255,255,255,0.2)", borderColor: "rgba(255,255,255,0.5)" },
                  }}
                >
                  {label}
                </Button>
              </Link>
            ))}
            <Button
              variant="outlined"
              startIcon={<Bell size={14} />}
              onClick={async () => {
                try {
                  const res = await fetch("/api/digest");
                  const json = await res.json();
                  if (json.whatsappUrl) window.open(json.whatsappUrl, "_blank");
                } catch { toast.error("Could not load digest"); }
              }}
              sx={{
                flex: 1,
                fontSize: "0.75rem",
                fontWeight: 700,
                height: 40,
                borderColor: "rgba(255,255,255,0.35)",
                color: "white",
                bgcolor: "rgba(255,255,255,0.1)",
                borderRadius: 100,
                "&:hover": { bgcolor: "rgba(255,255,255,0.2)", borderColor: "rgba(255,255,255,0.5)" },
              }}
            >
              Daily Digest
            </Button>
          </Stack>
        </Paper>
      </motion.div>

      {/* Charts Row 1: Sales vs Expenses + Recent Payments Pulse */}
      <motion.div variants={sectionVariants} custom={0.28} initial="hidden" animate="show">
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "2fr 1fr" }, gap: 2.5, mt: 2 }}>
          <SalesExpenseChart data={chartData} />
          <RecentPaymentsPulse payments={cachedPayments} />
        </Box>
      </motion.div>

      {/* Charts Row 2: Outstanding Debt */}
      <motion.div variants={sectionVariants} custom={0.34} initial="hidden" animate="show">
        <Box sx={{ mt: 2 }}>
          <OutstandingDebtChart data={outstandingDebtChart} onClientClick={setSelectedDebtor} ageMap={debtAgeMap} />
        </Box>
      </motion.div>

      {/* Charts Row 3: Payment Status + Top Clients */}
      <motion.div variants={sectionVariants} custom={0.38} initial="hidden" animate="show">
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 2.5, mt: 2 }}>
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
      </motion.div>

      {/* Material Profitability Widget */}
      <motion.div variants={sectionVariants} custom={0.42} initial="hidden" animate="show">
        <Box sx={{ mt: 2 }}>
          <ProfitabilityWidget sales={allSales} inventory={cachedInventory} />
        </Box>
      </motion.div>

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

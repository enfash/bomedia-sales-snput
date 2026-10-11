"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Button, MenuItem, Paper, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { AlertTriangle, BarChart3, RefreshCw, TrendingUp, UserCheck, Users, Wallet } from 'lucide-react';
import { subDays, isWithinInterval, isSameDay } from "date-fns";
import { toast } from "sonner";
import { settingsStyles, staffManagerStyles as styles } from "@/app/theme";
import { LoadingAnimation } from "@/components/loading-animation";
import { ManageUsers } from "./staff/manage-users";
import { StaffCard } from "./staff/staff-card";
import { compactMoney, fmtMoney, isReallyOnline, isStaffView, parseAmt, STAFF_VIEWS, staffInView, type Cashier, type StaffStats, type StaffView } from "./staff/staff-utils";
import { BackLink } from '@/components/back-link';

const VIEW_KEY = "bomedia-staff-view";

export function StaffManager() {
  const [sales, setSales] = useState<any[]>([]);
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dateRange, setDateRange] = useState<"all" | "7d" | "30d">("30d");
  const [tab, setTab] = useState<"performance" | "manage">("performance");
  const [view, setView] = useState<StaffView>("active");
  const [removedPeople, setRemovedPeople] = useState<string[]>([]);
  const [hiddenPeople, setHiddenPeople] = useState<string[]>([]);

  const chooseView = (next: StaffView) => {
    setView(next);
    try { localStorage.setItem(VIEW_KEY, next); } catch { /* the choice is only a convenience */ }
  };

  const fetchData = async () => {
    setRefreshing(true);
    try {
      const [sRes, cRes, aRes] = await Promise.all([fetch("/api/sales"), fetch("/api/cashiers"), fetch("/api/cashiers/access", { cache: "no-store" }).catch(() => null)]);
      const sJson = await sRes.json();
      const cJson = await cRes.json();
      setSales(sJson.data || []);
      setCashiers(cJson.data || []);
      // Removed staff only exist on the Postgres sign-in backend; elsewhere nobody counts as removed.
      const aJson = aRes?.ok ? await aRes.json().catch(() => null) : null;
      setRemovedPeople(((aJson?.data?.removed ?? []) as { Name: string }[]).map((p) => p.Name.trim()));
      setHiddenPeople(((aJson?.data?.staff ?? []) as { Name: string; Hidden?: boolean }[]).filter((p) => p.Hidden).map((p) => p.Name.trim().toLowerCase()));
    } catch {
      toast.error("Could not load staff data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      try { const saved = localStorage.getItem(VIEW_KEY); if (isStaffView(saved)) setView(saved); } catch { /* ignore */ }
      void fetchData();
    });
    return () => {
      active = false;
    };
  }, []);

  const now = new Date();

  const allStats: StaffStats[] = useMemo(() => {
    const startDate =
      dateRange === "7d" ? subDays(now, 7) : dateRange === "30d" ? subDays(now, 30) : new Date("2020-01-01");

    const namesFromSales = new Set<string>(
      sales.map((s) => (s["LOGGED BY"] || s["Logged By"] || "").trim()).filter(Boolean)
    );
    cashiers.forEach((c) => {
      if (c.Name) namesFromSales.add(c.Name.trim());
    });
    removedPeople.forEach((name) => namesFromSales.add(name));

    return Array.from(namesFromSales)
      .filter((n) => n && n !== "Unknown")
      .map((name) => {
        const cashierSales = sales.filter((s) => {
          const n = (s["LOGGED BY"] || s["Logged By"] || "").trim();
          if (n !== name) return false;
          const d = new Date(s.DATE || s.Date || "");
          if (isNaN(d.getTime())) return true;
          return isWithinInterval(d, { start: startDate, end: now });
        });
        const todaySales = cashierSales.filter((s) => {
          const d = new Date(s.DATE || s.Date || "");
          return !isNaN(d.getTime()) && isSameDay(d, now);
        });
        const totalRevenue = cashierSales.reduce((s, r) => s + parseAmt(r["AMOUNT (₦)"] || r["Amount (₦)"]), 0);
        const totalCollected = cashierSales.reduce(
          (s, r) => s + parseAmt(r["INITIAL PAYMENT (₦)"] || r["INITIAL PAYMENT"] || r["Initial Payment"]),
          0
        );
        const totalDebt = cashierSales.reduce(
          (s, r) => s + Math.max(0, parseAmt(r["AMOUNT DIFFERENCES"] || r["Amount Differences"])),
          0
        );
        const collectionRate = totalRevenue > 0 ? (totalCollected / totalRevenue) * 100 : 0;
        const matMap: Record<string, number> = {};
        cashierSales.forEach((s) => {
          const mat = s.MATERIAL || s.Material || "Other";
          matMap[mat] = (matMap[mat] || 0) + 1;
        });
        const topMaterial = Object.entries(matMap).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
        const cashierRecord = cashiers.find((c) => c.Name?.trim() === name);
        return {
          name,
          totalJobs: cashierSales.length,
          totalRevenue,
          totalCollected,
          totalDebt,
          collectionRate,
          jobsToday: todaySales.length,
          revenueToday: todaySales.reduce((s, r) => s + parseAmt(r["AMOUNT (₦)"] || r["Amount (₦)"]), 0),
          topMaterial,
          recentJobs: [...cashierSales]
            .sort((a, b) => new Date(b.DATE || b.Date || "").getTime() - new Date(a.DATE || a.Date || "").getTime())
            .slice(0, 5),
          isOnline: cashierRecord ? isReallyOnline(cashierRecord) : false,
          lastLogin: cashierRecord?.["Last Login"] || "",
        };
      })
      .sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [sales, cashiers, removedPeople, dateRange]);

  const removedNames = useMemo(() => removedPeople.map((name) => name.toLowerCase()), [removedPeople]);

  const viewState = useCallback(
    (s: StaffStats) => {
      const key = s.name.trim().toLowerCase();
      return { removed: removedNames.includes(key), hidden: hiddenPeople.includes(key), online: s.isOnline };
    },
    [removedNames, hiddenPeople]
  );

  const viewCounts = useMemo(() => {
    const inView = (view: StaffView) => allStats.filter((s) => staffInView(view, viewState(s))).length;
    return Object.fromEntries(STAFF_VIEWS.map((v) => [v.value, inView(v.value)])) as Record<StaffView, number>;
  }, [allStats, viewState]);

  const staffStats = useMemo(() => allStats.filter((s) => staffInView(view, viewState(s))), [allStats, viewState, view]);

  const totals = useMemo(() => {
    const rev = staffStats.reduce((s, c) => s + c.totalRevenue, 0);
    const col = staffStats.reduce((s, c) => s + c.totalCollected, 0);
    const dbt = staffStats.reduce((s, c) => s + c.totalDebt, 0);
    return { rev, col, dbt, avgCollection: rev > 0 ? (col / rev) * 100 : 0 };
  }, [staffStats]);

  if (loading) {
    return (
      <Box sx={styles.loading}>
        <LoadingAnimation text="Loading..." />
      </Box>
    );
  }

  const summaryCards = [
    { label: "Staff Shown", val: String(staffStats.length), sub: `${cashiers.filter((c) => isReallyOnline(c)).length} online now`, icon: Users, tone: styles.tone.primary },
    { label: "Team Revenue", val: compactMoney(totals.rev), sub: fmtMoney(totals.rev), icon: TrendingUp, tone: styles.tone.success },
    { label: "Cash Collected", val: compactMoney(totals.col), sub: `${totals.avgCollection.toFixed(0)}% collection rate`, icon: Wallet, tone: styles.tone.info },
    { label: "Team Debt", val: compactMoney(totals.dbt), sub: "outstanding across all", icon: AlertTriangle, tone: totals.dbt > 0 ? styles.tone.error : styles.tone.neutral },
  ];

  return (
    <Box sx={settingsStyles.page}>
      <BackLink href="/bom03/settings" label="Settings" />

      <Stack spacing={1} sx={settingsStyles.heading}>
        <Typography variant="h3" component="h1">Staff Manager</Typography>
        <Typography color="text.secondary">Performance, access and user management.</Typography>
      </Stack>

      <Box sx={styles.toolbar}>
        <ToggleButtonGroup value={tab} exclusive onChange={(_, val) => val && setTab(val)} size="small" sx={styles.periods}>
          <ToggleButton value="performance">
            <Box sx={styles.toggleContent}><BarChart3 size={14} />Performance</Box>
          </ToggleButton>
          <ToggleButton value="manage">
            <Box sx={styles.toggleContent}><UserCheck size={14} />Manage Users</Box>
          </ToggleButton>
        </ToggleButtonGroup>
        <Button
          color="inherit"
          variant="outlined"
          size="small"
          onClick={fetchData}
          disabled={refreshing}
          startIcon={
            <Box component="span" sx={[styles.iconSpan, refreshing && styles.refreshing]}>
              <RefreshCw size={14} />
            </Box>
          }
        >
          Refresh
        </Button>
      </Box>

      <TextField
        select
        size="small"
        label="Show"
        value={view}
        onChange={(event) => chooseView(event.target.value as StaffView)}
        sx={styles.viewFilter}
      >
        {STAFF_VIEWS.map(({ value, label }) => (
          <MenuItem key={value} value={value}>
            {tab === "performance" ? `${label} (${viewCounts[value]})` : label}
          </MenuItem>
        ))}
      </TextField>

      {tab === "performance" && (
        <>
          <Box sx={styles.tabs}>
            <ToggleButtonGroup value={dateRange} exclusive onChange={(_, val) => val && setDateRange(val)} size="small" sx={styles.periods}>
              {(["7d", "30d", "all"] as const).map((r) => (
                <ToggleButton key={r} value={r}>
                  {r === "all" ? "All Time" : r}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>

          <Box sx={styles.summaryGrid}>
            {summaryCards.map(({ label, val, sub, icon: Icon, tone }) => (
              <Paper key={label} variant="outlined" sx={styles.summaryCard}>
                <Box sx={[styles.summaryIcon, tone]}><Icon size={16} /></Box>
                <Typography variant="overline" color="text.secondary" sx={styles.block}>{label}</Typography>
                <Typography variant="h4" component="p">{val}</Typography>
                <Typography variant="caption" color="text.secondary">{sub}</Typography>
              </Paper>
            ))}
          </Box>

          {staffStats.length === 0 ? (
            <Paper variant="outlined" sx={styles.empty}>
              <Box sx={styles.emptyIcon}><Users size={40} /></Box>
              <Typography variant="h6" color="text.secondary">No staff to show for this period and filter</Typography>
            </Paper>
          ) : (
            <Box sx={styles.list}>
              {staffStats.map((stats) => (
                <StaffCard key={`${stats.name}-${dateRange}`} stats={stats} />
              ))}
            </Box>
          )}
        </>
      )}

      {tab === "manage" && <ManageUsers cashiers={cashiers} view={view} onRefresh={fetchData} />}
    </Box>
  );
}

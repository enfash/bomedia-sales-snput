"use client";
import { LoadingAnimation } from "@/components/loading-animation";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { Plus, Receipt, RefreshCw, Ruler, MessageCircle, ShoppingBag } from "lucide-react";
import { Box, Button, IconButton, LinearProgress, Paper, Typography } from "@mui/material";
import { isSameDay, subDays, isWithinInterval, format } from "date-fns";

import { cashierHomeStyles as styles } from "@/app/theme";
import { DebtorPaymentModal } from "@/components/debtor-payment-modal";
import { HeldSales } from "@/components/records/held-sales";
import { StockBar } from "@/components/stock-bar";
import { processDebtData } from "@/lib/financial-utils";
import { useSyncStore } from "@/lib/store";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const parseAmount = (val: any): number => {
  if (!val) return 0;
  return parseFloat(String(val).replace(/[₦,\s]/g, "")) || 0;
};
const money = (n: number) => `₦${n.toLocaleString(undefined, { minimumFractionDigits: 0 })}`;
function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
const payPill = (status: string) => (status === "Paid" ? styles.pillPaid : status === "Part-payment" ? styles.pillPart : styles.pillUnpaid);

const ACTIONS = [
  { label: "New sale", href: "/cashier/new-entry", icon: Plus, primary: true },
  { label: "Quick-Check", href: "/cashier/quick-check", icon: Ruler, primary: false },
  { label: "Log expense", href: "/cashier/expenses", icon: Receipt, primary: false },
];
const LINKS = [
  { label: "Customers", href: "/cashier/customers" },
  { label: "Job board", href: "/cashier/board" },
  { label: "Estimator", href: "/cashier/estimator" },
  { label: "Phone alerts", href: "/cashier/alerts" },
];

// ─── Pieces ───────────────────────────────────────────────────────────────────

function JobList({ jobs }: { jobs: any[] }) {
  if (jobs.length === 0) {
    return <Box sx={styles.empty}>
      <ShoppingBag size={32} />
      <Typography>No jobs logged today yet</Typography>
      <Button component={Link} href="/cashier/new-entry" variant="contained" size="small">Log the first job</Button>
    </Box>;
  }
  return <>
    {jobs.slice(0, 8).map((job, i) => {
      const client = job["CLIENT NAME"] || job["Client Name"] || "—";
      const desc = job["JOB DESCRIPTION"] || job["Job Description"] || "—";
      const material = job["MATERIAL"] || job["Material"] || "";
      const amount = parseAmount(job["AMOUNT (₦)"] || job["Amount (₦)"]);
      const balance = parseAmount(job["AMOUNT DIFFERENCES"] || job["Amount Differences"]);
      const status = job["PAYMENT STATUS"] || "Unpaid";
      const jobStatus = job["JOB STATUS"] || job["Job Status"] || "Quoted";
      return <Box key={i} sx={styles.jobRow}>
        <Box sx={styles.jobMain}>
          <Typography noWrap sx={styles.strong}>{client}</Typography>
          <Typography noWrap variant="body2" color="text.secondary">{[desc, material].filter(Boolean).join(" · ")}</Typography>
        </Box>
        <Box sx={styles.jobEnd}>
          <Typography sx={styles.money}>{money(amount)}</Typography>
          <Box component="span" sx={[styles.pill, payPill(status)]}>{status === "Unpaid" && balance > 0 ? `Owes ${money(balance)}` : status}</Box>
          <Box component="span" sx={[styles.pill, styles.pillNeutral]}>{jobStatus}</Box>
        </Box>
      </Box>;
    })}
  </>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CashierDashboardPage() {
  const { pendingQueue, cachedSales, setCachedData, cachedExpenses, cachedInventory, cachedPayments, cachedMaterials } =
    useSyncStore();

  const [loading, setLoading] = useState(cachedSales.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDebtor, setSelectedDebtor] = useState<string | null>(null);
  const [cashierName, setCashierName] = useState("");

  useEffect(() => {
    void Promise.resolve().then(() => setCashierName(localStorage.getItem("userName") || ""));
  }, []);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else if (cachedSales.length === 0) setLoading(true);
    try {
      const [sRes, iRes] = await Promise.all([
        fetch("/api/sales"),
        fetch("/api/inventory"),
      ]);
      const sJson = await sRes.json();
      const iJson = await iRes.json();
      
      const sales = sJson.data || cachedSales;
      const inventory = iJson.data || cachedInventory;
      
      setCachedData(sales, cachedExpenses, inventory, cachedPayments, cachedMaterials);
    } catch (error) {
      console.error("Fetch dashboard data error:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [cachedSales, cachedInventory, cachedExpenses, cachedPayments, cachedMaterials, setCachedData]);

  useEffect(() => {
    if (cachedSales.length === 0) void Promise.resolve().then(() => fetchData());
  }, []);

  useEffect(() => {
    const handler = () => fetchData(true);
    window.addEventListener("online", handler);
    return () => window.removeEventListener("online", handler);
  }, [fetchData]);

  // ── Merge pending into allSales ──────────────────────────────────────────
  const allSales = useMemo(() => {
    const pending = pendingQueue
      .filter((i) => i.type === "sale")
      .map((i) => ({
        DATE: i.data[0],
        "CLIENT NAME": i.data[1],
        "JOB DESCRIPTION": i.data[2],
        "CONTACT": i.data[3],
        "MATERIAL": i.data[4],
        "AMOUNT (₦)": "0",
        "INITIAL PAYMENT (₦)": i.data[14] || "0",
        "AMOUNT DIFFERENCES": "0",
        "PAYMENT STATUS": "Unpaid",
        "JOB STATUS": i.data[20] || "Quoted",
        "LOGGED BY": i.data[21] || cashierName,
        __isPending: "true",
      }));
    return [...pending, ...cachedSales];
  }, [pendingQueue, cachedSales, cashierName]);

  const now = new Date();
  const sevenDaysAgo = subDays(now, 7);

  const todaySales = useMemo(
    () =>
      allSales.filter((r) => {
        const d = new Date(r.DATE || r.Date || "");
        return !isNaN(d.getTime()) && isSameDay(d, now);
      }),
    [allSales]
  );

  const weekSales = useMemo(
    () =>
      allSales.filter((r) => {
        const d = new Date(r.DATE || r.Date || "");
        return (
          !isNaN(d.getTime()) &&
          isWithinInterval(d, { start: sevenDaysAgo, end: now })
        );
      }),
    [allSales]
  );

  // ── In-progress jobs ─────────────────────────────────────────────────────
  const inProgressJobs = todaySales.filter((r) => {
    const s = (r["JOB STATUS"] || r["Job Status"] || "").toString().trim();
    return ["Printing", "Finishing", "Ready"].includes(s);
  });

  // ── Today metrics ────────────────────────────────────────────────────────
  const todayRevenue = todaySales.reduce(
    (s, r) => s + parseAmount(r["AMOUNT (₦)"] || r["Amount (₦)"]),
    0
  );
  const todayCollected = todaySales.reduce(
    (s, r) =>
      s +
      parseAmount(
        r["INITIAL PAYMENT (₦)"] || r["INITIAL PAYMENT"] || r["Initial Payment"]
      ),
    0
  );

  // ── Debt data ────────────────────────────────────────────────────────────
  const { totalDebt: dailyDebt } = processDebtData(todaySales);
  const { totalDebt: weeklyDebt, chartData: debtChart } =
    processDebtData(weekSales, 8);

  const debtorList = useMemo(() => {
    const map: Record<string, number> = {};
    weekSales.forEach((r) => {
      const balance = parseAmount(
        r["AMOUNT DIFFERENCES"] || r["Amount Differences"]
      );
      const client = (r["CLIENT NAME"] || r["Client Name"] || "").trim();
      if (client && balance > 0) {
        map[client] = (map[client] || 0) + balance;
      }
    });
    return Object.entries(map)
      .map(([name, balance]) => ({ name, balance }))
      .sort((a, b) => b.balance - a.balance);
  }, [weekSales]);

  const todayDebtors = useMemo(() => {
    return todaySales
      .filter((r) => {
        const bal = parseAmount(
          r["AMOUNT DIFFERENCES"] || r["Amount Differences"]
        );
        return bal > 0;
      })
      .map((r) => ({
        client: (r["CLIENT NAME"] || r["Client Name"] || "—").trim(),
        amount: parseAmount(r["AMOUNT DIFFERENCES"] || r["Amount Differences"]),
        description: (r["JOB DESCRIPTION"] || r["Job Description"] || "—").trim(),
        contact: (r["CONTACT"] || r["Contact"] || "").trim(),
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [todaySales]);

  if (loading) {
    return <Box sx={styles.loading}><LoadingAnimation text="Loading..." /></Box>;
  }

  const collectedPct = todayRevenue > 0 ? Math.min(100, Math.round((todayCollected / todayRevenue) * 100)) : 0;
  const lowStockRolls = cachedInventory.filter((item: any) => {
    const remaining = parseFloat(item["Remaining Length (ft)"] || item.Stock || "0");
    const threshold = parseFloat(item["Low Stock Threshold (ft)"] || "50");
    return remaining > 0 && remaining <= threshold;
  });
  const biggestDebt = Math.max(1, ...debtChart.map((d) => d.balance));

  return (
    <Box sx={styles.page}>
      <Box sx={styles.hero}>
        <Box sx={styles.heroTop}>
          <Box>
            <Typography variant="body2" sx={styles.heroSoft}>{getGreeting()},</Typography>
            <Typography variant="h4" component="h1">{cashierName || "Cashier"}</Typography>
            <Typography variant="body2" sx={styles.heroSoft}>{format(now, "EEEE, d MMMM")}</Typography>
          </Box>
          <Box sx={styles.headingActions}>
            {pendingQueue.length > 0 && <Box component="span" sx={styles.heroPill}>{pendingQueue.length} syncing</Box>}
            <IconButton onClick={() => fetchData(true)} disabled={refreshing} aria-label="Refresh" sx={styles.heroRefresh}><Box component="span" sx={refreshing ? styles.spinning : styles.iconBox}><RefreshCw size={18} /></Box></IconButton>
          </Box>
        </Box>

        <Box sx={styles.heroButtons}>
          {ACTIONS.map(({ label, href, icon: Icon, primary }) => (
            <Button key={href} component={Link} href={href} variant="outlined" startIcon={<Icon size={18} />} sx={primary ? [styles.heroButton, styles.heroButtonMain] : styles.heroButton}>{label}</Button>
          ))}
        </Box>

        <Box sx={styles.heroTiles}>
          {[
            { label: "Jobs today", value: String(todaySales.length) },
            { label: "Still in progress", value: String(inProgressJobs.length) },
            { label: "Sold today", value: money(todayRevenue) },
            { label: "Collected", value: money(todayCollected) },
            { label: "Owed to the shop", value: money(weeklyDebt), wide: true },
          ].map((tile) => <Box key={tile.label} sx={[styles.heroTile, ...(tile.wide ? [styles.heroTileWide] : [])]}>
            <Typography variant="body2" sx={styles.heroSoft}>{tile.label}</Typography>
            <Typography variant="h5" component="p" sx={styles.heroTileValue}>{tile.value}</Typography>
          </Box>)}
        </Box>

        <Box sx={styles.heroCollect}>
          <Box sx={styles.collectTop}>
            <Typography variant="body2" sx={styles.heroSoft}>Collected so far today</Typography>
            <Typography sx={styles.strong}>{collectedPct}%</Typography>
          </Box>
          <LinearProgress variant="determinate" value={collectedPct} sx={styles.heroTrack} aria-label={`${collectedPct}% of today's sales collected`} />
          <Typography variant="body2" sx={styles.heroSoft}>{dailyDebt > 0 ? `${money(dailyDebt)} still to collect from today's jobs` : "Nothing left to collect from today's jobs"}</Typography>
        </Box>
      </Box>

      <Box sx={styles.actionsPhone}>
        {ACTIONS.map(({ label, href, icon: Icon, primary }) => (
          <Paper key={href} component={Link} href={href} variant="outlined" sx={primary ? styles.actionPrimary : styles.action}>
            <Box component="span" sx={primary ? styles.actionIconPrimary : styles.actionIcon}><Icon size={22} /></Box>
            {label}
          </Paper>
        ))}
      </Box>

      <HeldSales />

      <Box sx={styles.columns}>
        <Box sx={styles.column}>
          {todayDebtors.length > 0 && <Box>
            <Box sx={styles.sectionHead}>
              <Typography variant="h6" component="h2">Collect today</Typography>
              <Typography variant="body2" color="text.secondary">{todayDebtors.length} customer{todayDebtors.length === 1 ? "" : "s"}</Typography>
            </Box>
            <Paper variant="outlined" sx={styles.card}>
              {todayDebtors.map((d, i) => (
                <Box key={i} sx={styles.collectRow} role="button" tabIndex={0} onClick={() => setSelectedDebtor(d.client)}
                  onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedDebtor(d.client); } }}>
                  <Box sx={styles.jobMain}>
                    <Typography noWrap sx={styles.strong}>{d.client}</Typography>
                    <Typography noWrap variant="body2" color="text.secondary">{d.description}</Typography>
                  </Box>
                  <Box sx={styles.headingActions}>
                    <Typography sx={styles.money}>{money(d.amount)}</Typography>
                    {d.contact && <IconButton size="small" aria-label={`Send ${d.client} a WhatsApp reminder`} sx={styles.reminder} onClick={(event) => {
                      event.stopPropagation();
                      const phone = d.contact.replace(/\D/g, "").replace(/^0/, "234");
                      const message = `Hello *${d.client}*, this is a reminder from *BOMedia*. You have an outstanding balance of *${money(d.amount)}* on your order: ${d.description}. Kindly settle at your earliest convenience. Thank you!`;
                      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank");
                    }}><MessageCircle size={16} /></IconButton>}
                  </Box>
                </Box>
              ))}
            </Paper>
          </Box>}

          <Box>
            <Box sx={styles.sectionHead}>
              <Typography variant="h6" component="h2">Today&apos;s jobs</Typography>
              <Typography component={Link} href="/cashier/records" sx={styles.sectionLink}>See all</Typography>
            </Box>
            <Paper variant="outlined" sx={styles.card}><JobList jobs={todaySales} /></Paper>
          </Box>
        </Box>

        <Box sx={styles.column}>
          {weeklyDebt > 0 && <Box>
            <Box sx={styles.sectionHead}>
              <Typography variant="h6" component="h2">Who still owes</Typography>
              <Typography variant="body2" color="text.secondary">Tap a name to take a payment</Typography>
            </Box>
            <Paper variant="outlined" sx={styles.card}>
              {debtChart.map((d) => (
                <Box key={d.name} component="button" type="button" sx={styles.owe} onClick={() => setSelectedDebtor(d.name)} aria-label={`${d.name} owes ${money(d.balance)}. Take a payment`}>
                  <Box sx={styles.oweTop}>
                    <Typography noWrap sx={styles.oweName}>{d.name}</Typography>
                    <Typography sx={styles.money}>{money(d.balance)}</Typography>
                  </Box>
                  <LinearProgress variant="determinate" value={Math.max(2, Math.round((d.balance / biggestDebt) * 100))} color="error" sx={styles.oweTrack} aria-hidden />
                </Box>
              ))}
              <Typography variant="body2" sx={styles.oweNote}>{money(weeklyDebt)} is owed in total over the last 7 days.</Typography>
            </Paper>
          </Box>}

          {lowStockRolls.length > 0 && <Box>
            <Box sx={styles.sectionHead}>
              <Typography variant="h6" component="h2">Running low</Typography>
              <Typography component={Link} href="/cashier/inventory" sx={styles.sectionLink}>Stock</Typography>
            </Box>
            <Paper variant="outlined" sx={styles.card}>
              {lowStockRolls.slice(0, 5).map((roll: any, i: number) => {
                const remaining = parseFloat(roll["Remaining Length (ft)"] || roll.Stock || "0");
                return <Box key={roll["Roll ID"] ?? i} sx={styles.lowRow}>
                  <Box sx={styles.lowTop}>
                    <Typography noWrap sx={styles.strong}>{roll["Item Name"] || roll["Roll ID"]}</Typography>
                    <Typography variant="body2" color="text.secondary">{remaining.toFixed(0)} ft left</Typography>
                  </Box>
                  <StockBar compact remaining={remaining} capacity={parseFloat(roll["Total Length (ft)"] || "0")} status="Low Stock" />
                </Box>;
              })}
            </Paper>
          </Box>}

          <Box sx={styles.links}>
            {LINKS.map(({ label, href }) => <Button key={href} component={Link} href={href} variant="outlined" color="inherit">{label}</Button>)}
          </Box>
        </Box>
      </Box>

      <DebtorPaymentModal
        clientName={selectedDebtor}
        isOpen={!!selectedDebtor}
        onClose={() => setSelectedDebtor(null)}
        onUpdate={() => fetchData(true)}
        theme="amber"
      />
    </Box>
  );
}

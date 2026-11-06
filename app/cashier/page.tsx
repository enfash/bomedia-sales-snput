"use client";
import { ScreenLoading } from "@/components/screen-loading";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Plus, Receipt, RefreshCw, Ruler, MessageCircle, ShoppingBag } from "lucide-react";
import { Box, Button, ButtonBase, Collapse, IconButton, LinearProgress, Paper, Typography } from "@mui/material";
import { isSameDay, subDays, isWithinInterval, format } from "date-fns";

import { cashierHomeStyles as styles } from "@/app/theme";
import type { UnifiedRecord } from "@/components/manage-sale-action";
import { DebtorPaymentModal } from "@/components/debtor-payment-modal";
import { HeldSales } from "@/components/records/held-sales";
import { StockBar } from "@/components/stock-bar";
import { buildCashierOrders, owingOrders, reminderText, type CashierOrder, type OrderPill } from "@/lib/cashier-home-view";
import { collectionLook } from "@/lib/collection-status";
import { processDebtData } from "@/lib/financial-utils";
import { itemCount } from "@/lib/customer-sale-items";
import { CollectIcon } from "@/components/icons/collect-icon";
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

const orderKey = (order: CashierOrder) => order.salesId || order.jobs[0].id;
const orderPillStyle = (pill: OrderPill) =>
  pill === "Paid" ? styles.pillPaid : pill === "Part-payment" ? styles.pillPart : pill === "Owes" ? styles.pillUnpaid : styles.pillNeutral;
const orderPillLabel = (order: CashierOrder) => (order.pill === "Owes" ? `Owes ${money(order.owed)}` : order.pill);

/** One job, styled as the job row. Inside an expanded order the client name is left off, since the header has it. */
function JobLine({ job, showClient = true }: { job: UnifiedRecord; showClient?: boolean }) {
  const status = job.raw["PAYMENT STATUS"] || "Unpaid";
  return <Box sx={styles.jobRow}>
    <Box sx={styles.jobMain}>
      {showClient && <Typography noWrap sx={styles.strong}>{job.client}</Typography>}
      <Typography noWrap variant="body2" color="text.secondary">{[job.description, job.material].filter(Boolean).join(" · ")}</Typography>
    </Box>
    <Box sx={styles.jobEnd}>
      <Typography sx={styles.money}>{money(job.amount)}</Typography>
      <Box component="span" sx={[styles.pill, payPill(status)]}>{status === "Unpaid" && (job.balance ?? 0) > 0 ? `Owes ${money(job.balance ?? 0)}` : status}</Box>
      <Box component="span" sx={[styles.pill, styles.pillNeutral]}>{job.jobStatus}</Box>
    </Box>
    <Box sx={styles.chevronSlot} aria-hidden />
  </Box>;
}

/** Today's jobs, one row per order. A single-job order is a plain row; a bigger order opens to show its jobs. */
function JobList({ orders }: { orders: CashierOrder[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (orders.length === 0) {
    return <Box sx={styles.empty}>
      <ShoppingBag size={32} />
      <Typography>No jobs logged today yet</Typography>
      <Button component={Link} href="/cashier/new-entry" variant="contained" size="small">Log the first job</Button>
    </Box>;
  }
  return <>
    {orders.slice(0, 8).map((order) => {
      const key = orderKey(order);
      if (order.jobs.length === 1) return <JobLine key={key} job={order.jobs[0]} />;
      const isOpen = open === key, panel = `jobs-${key}`;
      return <Box key={key} sx={styles.order}>
        <ButtonBase onClick={() => setOpen(isOpen ? null : key)} aria-expanded={isOpen} aria-controls={panel} sx={[styles.orderHead, isOpen && styles.orderHeadOpen]}>
          <Box sx={[styles.jobMain, styles.orderMain]}>
            <Typography noWrap sx={styles.strong}>{order.client}</Typography>
            <Typography noWrap variant="body2" color="text.secondary">{order.salesId} · {itemCount(order.jobs.length)}</Typography>
          </Box>
          <Box sx={styles.orderEnd}>
            <Box sx={styles.jobEnd}>
              <Typography sx={styles.money}>{money(order.total)}</Typography>
              <Box component="span" sx={[styles.pill, orderPillStyle(order.pill)]}>{orderPillLabel(order)}</Box>
            </Box>
            <Box component="span" sx={[styles.orderChevron, isOpen && styles.orderChevronOpen]} aria-hidden="true"><ChevronDown size={18} /></Box>
          </Box>
        </ButtonBase>
        <Collapse in={isOpen} unmountOnExit>
          <Box id={panel} sx={styles.orderBody}>
            {order.jobs.map((job) => <JobLine key={job.id} job={job} showClient={false} />)}
          </Box>
        </Collapse>
      </Box>;
    })}
  </>;
}

/** Orders that still owe, one row each. A single job opens the payment sheet, several jobs expand. The WhatsApp and Collect icons sit on top of the row. */
function CollectList({ orders, onCollect }: { orders: CashierOrder[]; onCollect: (client: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  return <Paper variant="outlined" sx={styles.card}>
    {orders.map((order) => {
      const key = orderKey(order), single = order.jobs.length === 1;
      const isOpen = !single && open === key, panel = `collect-${key}`;
      const owes = money(order.owed);
      const detail = single ? [order.jobs[0].description, order.jobs[0].material].filter(Boolean).join(" · ") : `${order.salesId} · ${itemCount(order.jobs.length)}`;
      return <Box key={key} sx={styles.order}>
        <Box sx={styles.collectRow}>
          {/* The cover button is the row. The icons are siblings above it, so no button sits inside another. */}
          <ButtonBase
            onClick={() => (single ? onCollect(order.client) : setOpen(isOpen ? null : key))}
            aria-label={single ? `${order.client}, owes ${owes}. Take a payment` : `${order.client}, ${detail}, owes ${owes}`}
            aria-expanded={single ? undefined : isOpen}
            aria-controls={single ? undefined : panel}
            sx={[styles.collectCover, isOpen && styles.orderHeadOpen]} />
          <Box sx={styles.orderMain}>
            <Typography noWrap sx={styles.strong}>{order.client}</Typography>
            <Typography noWrap variant="body2" color="text.secondary">{detail}</Typography>
          </Box>
          <Box sx={styles.collectIcons}>
            {order.contact
              ? <IconButton aria-label={`Send ${order.client} a WhatsApp reminder`} sx={styles.reminder} onClick={() => {
                  const phone = order.contact.replace(/\D/g, "").replace(/^0/, "234");
                  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(reminderText(order, money))}`, "_blank");
                }}><MessageCircle size={18} /></IconButton>
              : <Box sx={styles.iconSpacer} aria-hidden />}
            <IconButton aria-label={`Collect payment from ${order.client}`} title="Collect" sx={styles.collectButton} onClick={() => onCollect(order.client)}>
              <CollectIcon size={22} />
            </IconButton>
          </Box>
          <Box sx={styles.collectEnd}>
            <Typography sx={styles.collectAmount}>{owes}</Typography>
            {single
              ? <Box sx={styles.chevronSlot} aria-hidden />
              : <Box component="span" sx={[styles.orderChevron, isOpen && styles.orderChevronOpen]} aria-hidden="true"><ChevronDown size={18} /></Box>}
          </Box>
        </Box>
        {!single && <Collapse in={isOpen} unmountOnExit>
          <Box id={panel} sx={styles.orderBody}>
            {order.jobs.map((job) => <JobLine key={job.id} job={job} showClient={false} />)}
          </Box>
        </Collapse>}
      </Box>;
    })}
  </Paper>;
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
        "SALES ID": i.data[22] || "",
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

  const todayOrders = useMemo(() => buildCashierOrders(todaySales), [todaySales]);
  const owingToday = useMemo(() => owingOrders(todayOrders), [todayOrders]);

  if (loading) {
    return <ScreenLoading screen="dashboard" role="cashier" label="Loading today" />;
  }

  const collectedPct = todayRevenue > 0 ? Math.min(100, Math.round((todayCollected / todayRevenue) * 100)) : 0;
  const collection = collectionLook(collectedPct, todayRevenue, dailyDebt);
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
          <LinearProgress variant="determinate" value={collection.barPercent} sx={[styles.heroTrack, styles.heroTone[collection.tone]]} aria-label={`${collectedPct}% of today's sales collected`} />
          {/* The words follow the bar's colour. While something is still owed, they lead to the list of sales that owe. */}
          {(() => {
            const line = <>
              <Box component="span" aria-hidden sx={[styles.heroDot, styles.heroDotTone[collection.tone]]} />
              <Typography variant="body2" component="span" sx={[styles.heroCollectText, collection.tone === "none" ? styles.heroSoft : styles.strongText]}>
                {todaySales.length === 0 ? "No sales yet today" : dailyDebt > 0 ? `${collection.lead} ${money(dailyDebt)} still to collect` : "All of today's sales collected"}
              </Typography>
              {dailyDebt > 0 && <Box component="span" aria-hidden sx={styles.heroChevron}><ChevronRight size={18} /></Box>}
            </>;
            return dailyDebt > 0
              ? <Box component={Link} href="/cashier/records?show=owing" sx={styles.heroCollectLine}>{line}</Box>
              : <Box sx={styles.heroCollectLine}>{line}</Box>;
          })()}
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
          {owingToday.length > 0 && <Box>
            <Box sx={styles.sectionHead}>
              <Typography variant="h6" component="h2">Collect today</Typography>
              <Typography variant="body2" color="text.secondary">{owingToday.length} order{owingToday.length === 1 ? "" : "s"}</Typography>
            </Box>
            <CollectList orders={owingToday} onCollect={(client) => setSelectedDebtor(client)} />
          </Box>}

          <Box>
            <Box sx={styles.sectionHead}>
              <Typography variant="h6" component="h2">Today&apos;s jobs</Typography>
              <Typography component={Link} href="/cashier/records" sx={styles.sectionLink}>See all</Typography>
            </Box>
            <Paper variant="outlined" sx={styles.card}><JobList orders={todayOrders} /></Paper>
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

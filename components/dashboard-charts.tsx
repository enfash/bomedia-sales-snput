"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
  BarChart,
  Bar,
  ReferenceLine,
} from "recharts";
import {
  Card,
  CardContent,
  Box,
  Chip,
  Typography,
  Stack,
  useTheme,
} from "@mui/material";
import { Inbox, BarChart3, PieChart as PieIcon, TrendingUp, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { chartCountBadgeStyles, chartStyles as styles, getChartKit } from "@/app/theme";

/**
 * Holds a fixed-size box for a chart and only mounts its children once the box
 * has actually been laid out.
 *
 * The dashboards render a mobile layout and a desktop layout at the same time
 * and hide one with `display: none`. Recharts' ResponsiveContainer measures its
 * parent on mount, and a `display: none` ancestor makes that measurement come
 * back as -1 x -1, which is what produces the "width(-1) and height(-1) of
 * chart should be greater than 0" console warnings. Gating on a real
 * measurement keeps the hidden copy unmounted until its breakpoint actually
 * applies, and the ResizeObserver mounts it the moment it does.
 */
function ChartFrame({
  height,
  children,
  sx,
}: {
  height: number;
  children: React.ReactNode;
  sx?: object;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Measured from the element itself rather than from the observer entry.
    // ResizeObserver delivers nothing for an element with no layout box, so an
    // entry-only check can get stuck at `true` when a visible layout becomes
    // display:none on a breakpoint change — leaving the chart mounted inside a
    // hidden container, which is what produces the -1 x -1 warning.
    // getBoundingClientRect() reports zeros in that state, so this settles
    // correctly in both directions.
    const evaluate = () => {
      const { width, height: h } = el.getBoundingClientRect();
      setMeasured(width > 0 && h > 0);
    };

    evaluate();
    const observer = new ResizeObserver(evaluate);
    observer.observe(el);
    window.addEventListener("resize", evaluate);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", evaluate);
    };
  }, []);

  return (
    <Box ref={ref} sx={{ height, width: "100%", ...sx }}>
      {measured ? children : null}
    </Box>
  );
}

interface SalesExpenseData {
  date: string;
  sales: number;
  expenses: number;
}

interface CategoryData {
  name: string;
  value: number;
  color: string;
}

interface DebtData {
  name: string;
  balance: number;
}

function EmptyState({ icon: Icon, title, description }: { icon: any, title: string, description: string }) {
  return (
    <Box sx={styles.emptyWrap}>
      <Box sx={styles.emptyIcon}>
        <Icon size={32} />
      </Box>
      <Typography variant="h6" component="p" sx={{ mb: 0.5 }}>
        {title}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={styles.emptyText}>
        {description}
      </Typography>
    </Box>
  );
}

function ChartHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <Box>
      <Typography variant="h5" component="h3">{title}</Typography>
      <Typography variant="overline" sx={styles.subtitle}>{subtitle}</Typography>
    </Box>
  );
}

export function SalesExpenseChart({ data }: { data: SalesExpenseData[] }) {
  const kit = getChartKit(useTheme());
  const hasData = data.some(d => d.sales > 0 || d.expenses > 0);
  const activeDays = data.filter(d => d.sales > 0).length;
  const totalSalesSum = data.reduce((s, d) => s + d.sales, 0);
  const avgDailySales = activeDays > 0 ? Math.round(totalSalesSum / activeDays) : 0;
  const axisTick = { fontSize: 11, fill: kit.tick, fontWeight: 600 };

  return (
    <Card sx={styles.card}>
      <Box sx={styles.header}>
        <Box sx={styles.titleRow}>
          <ChartHeading title="Sales vs Expenses" subtitle="Daily Performance Trend" />
          {hasData && avgDailySales > 0 && (
            <Chip color="primary" size="small" icon={<TrendingUp size={14} />} label={`Daily Avg: ₦${avgDailySales.toLocaleString()}`} />
          )}
        </Box>
      </Box>
      <CardContent sx={styles.content}>
        <ChartFrame height={280}>
          {!hasData ? (
            <EmptyState
              icon={BarChart3}
              title="No Activity Detected"
              description="New sales or expenses will populate this trend automatically."
            />
          ) : (
            <ResponsiveContainer width="100%" height="100%" minHeight={200}>
              <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={kit.sales} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={kit.sales} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={kit.expenses} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={kit.expenses} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={kit.grid} />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={axisTick} interval="preserveStartEnd" />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={axisTick}
                  tickFormatter={(val) => `₦${val >= 1000 ? (val / 1000).toFixed(0) + "k" : val}`}
                  width={50}
                />
                <Tooltip
                  contentStyle={kit.tooltip.contentStyle}
                  itemStyle={kit.tooltip.itemStyle}
                  labelStyle={kit.tooltip.labelStyle}
                  cursor={{ stroke: kit.sales, strokeWidth: 1, strokeDasharray: '4 4' }}
                  formatter={(value: any) => [`₦${Number(value).toLocaleString()}`, "Amount"]}
                />
                <Area type="monotone" dataKey="sales" stroke={kit.sales} strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" name="Sales" />
                <Area type="monotone" dataKey="expenses" stroke={kit.expenses} strokeWidth={3} fillOpacity={1} fill="url(#colorExpenses)" name="Expenses" />
                {avgDailySales > 0 && (
                  <ReferenceLine
                    y={avgDailySales}
                    stroke={kit.sales}
                    strokeDasharray="5 4"
                    strokeOpacity={0.5}
                    strokeWidth={1.5}
                    label={{ value: `Avg ₦${avgDailySales >= 1000 ? (avgDailySales / 1000).toFixed(0) + "k" : avgDailySales}`, position: "insideTopRight", fontSize: 10, fontWeight: 700, fill: kit.sales, opacity: 0.8 }}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartFrame>

        {hasData && (
          <Box sx={styles.legendRow}>
            <Box sx={styles.legendItem}>
              <Box sx={[styles.legendLine, styles.legendSales]} />
              <Typography variant="overline" color="text.secondary">Sales</Typography>
            </Box>
            <Box sx={styles.legendItem}>
              <Box sx={[styles.legendLine, styles.legendExpenses]} />
              <Typography variant="overline" color="text.secondary">Expenses</Typography>
            </Box>
            {avgDailySales > 0 && (
              <Box sx={styles.legendItem}>
                <Box sx={styles.legendAvg} />
                <Typography variant="overline" color="text.secondary">Daily Avg</Typography>
              </Box>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

export function ExpenseCategorizationChart({ data, total }: { data: CategoryData[]; total: number }) {
  const kit = getChartKit(useTheme());
  const hasData = total > 0;

  return (
    <Card sx={styles.card}>
      <Box sx={styles.header}>
        <ChartHeading title="Expense Breakdown" subtitle="Category Split" />
      </Box>
      <CardContent sx={styles.content}>
        <ChartFrame height={280} sx={{ position: "relative" }}>
          {!hasData ? (
            <EmptyState
              icon={PieIcon}
              title="No Expenses Logged"
              description="Detailed category split will appear once expenses are added."
            />
          ) : (
            <>
              <ResponsiveContainer width="100%" height="100%" minHeight={200}>
                <PieChart>
                  <Pie
                    data={data}
                    cx="50%"
                    cy="45%"
                    innerRadius={65}
                    outerRadius={90}
                    paddingAngle={6}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {data.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color || kit.series[index % kit.series.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={kit.tooltip.contentStyle}
                    itemStyle={kit.tooltip.itemStyle}
                    formatter={(value: any) => [`₦${Number(value).toLocaleString()}`, "Amount"]}
                  />
                  <Legend verticalAlign="bottom" height={30} iconType="circle" wrapperStyle={{ fontSize: "11px", fontWeight: 600 }} />
                </PieChart>
              </ResponsiveContainer>
              <Box sx={styles.donutCenter}>
                <Typography variant="overline" color="text.secondary">Total Exp.</Typography>
                <Typography variant="h4" component="p" sx={styles.donutValue}>₦{total.toLocaleString()}</Typography>
              </Box>
            </>
          )}
        </ChartFrame>
      </CardContent>
    </Card>
  );
}

export function MaterialSalesChart({ data, total }: { data: CategoryData[]; total: number }) {
  const kit = getChartKit(useTheme());
  const hasData = total > 0;

  return (
    <Card sx={styles.card}>
      <Box sx={styles.header}>
        <ChartHeading title="Material Distribution" subtitle="Workload Breakdown" />
      </Box>
      <CardContent sx={styles.content}>
        <ChartFrame height={280} sx={{ position: "relative" }}>
          {!hasData ? (
            <EmptyState
              icon={BarChart3}
              title="No Materials Logged"
              description="Material distribution will populate as jobs are recorded."
            />
          ) : (
            <>
              <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={200}>
                <PieChart>
                  <Pie
                    data={data}
                    cx="50%"
                    cy="45%"
                    innerRadius={65}
                    outerRadius={90}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {data.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color || kit.series[index % kit.series.length]} strokeWidth={0} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={kit.tooltip.contentStyle}
                    itemStyle={kit.tooltip.itemStyle}
                    formatter={(value: any) => [Number(value).toLocaleString(), "Jobs"]}
                  />
                  <Legend verticalAlign="bottom" height={30} iconType="circle" wrapperStyle={{ fontSize: "11px", fontWeight: 600 }} />
                </PieChart>
              </ResponsiveContainer>
              <Box sx={styles.donutCenter}>
                <Typography variant="overline" color="text.secondary">Total Jobs</Typography>
                <Typography variant="h4" component="p" sx={styles.donutValue}>{total.toLocaleString()}</Typography>
              </Box>
            </>
          )}
        </ChartFrame>
      </CardContent>
    </Card>
  );
}

interface OutstandingDebtChartProps {
  data: DebtData[];
  onClientClick?: (name: string) => void;
  ageMap?: Record<string, number>;
}

const AGING_LEGEND = [
  { key: "critical", label: ">14 days overdue" },
  { key: "warning", label: "7–14 days" },
  { key: "normal", label: "<7 days" },
] as const;

export function OutstandingDebtChart({ data, onClientClick, ageMap }: OutstandingDebtChartProps) {
  const kit = getChartKit(useTheme());
  const getBarColor = (name: string) => {
    if (!ageMap) return kit.aging.normal;
    const days = ageMap[name] ?? 0;
    if (days > 14) return kit.aging.critical;
    if (days > 7) return kit.aging.warning;
    return kit.aging.normal;
  };
  const hasData = data && data.length > 0;

  return (
    <Card sx={styles.card}>
      <Box sx={styles.header}>
        <Box sx={styles.titleRow}>
          <ChartHeading title="Outstanding Debt" subtitle="Top Clients with Unpaid Balances" />
          {hasData && (
            <Box sx={[chartCountBadgeStyles.base, chartCountBadgeStyles.debt]}>
              {data.length} client{data.length !== 1 ? "s" : ""}
            </Box>
          )}
        </Box>
      </Box>
      <CardContent sx={styles.content}>
        {hasData && ageMap && (
          <Box sx={styles.agingLegend}>
            {AGING_LEGEND.map(({ key, label }) => (
              <Box key={key} sx={styles.agingItem}>
                <Box sx={[styles.dot, { bgcolor: kit.aging[key] }]} />
                <Typography variant="caption" color="text.secondary">{label}</Typography>
              </Box>
            ))}
          </Box>
        )}
        <ChartFrame height={240}>
          {!hasData ? (
            <EmptyState
              icon={Inbox}
              title="All Balances Cleared"
              description="No outstanding debt found in the current records. Excellent work!"
            />
          ) : (
            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={200}>
              <BarChart
                data={data}
                layout="vertical"
                margin={{ top: 0, right: 24, left: 8, bottom: 0 }}
                barCategoryGap="30%"
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={kit.grid} />
                <XAxis
                  type="number"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: kit.tick, fontWeight: 600 }}
                  tickFormatter={(val) => `₦${val >= 1000 ? (val / 1000).toFixed(0) + "k" : val}`}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: kit.tickStrong, fontWeight: 600 }}
                  width={90}
                  tickFormatter={(name) => (name.length > 14 ? name.slice(0, 13) + "…" : name)}
                />
                <Tooltip
                  contentStyle={kit.tooltip.contentStyle}
                  itemStyle={kit.tooltip.itemStyle}
                  labelStyle={kit.tooltip.labelStyle}
                  formatter={(value: any) => [`₦${Number(value).toLocaleString()}`, "Balance"]}
                />
                <Bar
                  dataKey="balance"
                  radius={[0, 6, 6, 0]}
                  name="Balance"
                  onClick={(payload) => {
                    if (onClientClick && payload?.name) {
                      onClientClick(payload.name);
                    }
                  }}
                  style={{ cursor: onClientClick ? "pointer" : "default" }}
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getBarColor(entry.name)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartFrame>
      </CardContent>
    </Card>
  );
}

interface PaymentStatusWidgetProps {
  paid: number;
  partPaid: number;
  unpaid: number;
  paidAmt: number;
  partPaidAmt: number;
  unpaidAmt: number;
  total: number;
}

export function PaymentStatusWidget({ paid, partPaid, unpaid, paidAmt, partPaidAmt, unpaidAmt, total }: PaymentStatusWidgetProps) {
  const hasData = total > 0;
  const paidPct   = total > 0 ? (paid   / total) * 100 : 0;
  const partPct   = total > 0 ? (partPaid / total) * 100 : 0;
  const unpaidPct = total > 0 ? (unpaid  / total) * 100 : 0;

  // Palette tokens only: segment fill, and a darker text tone that stays readable on white.
  const statuses = [
    { label: "Paid", count: paid, amt: paidAmt, pct: paidPct, fill: "success.main", text: "success.main" },
    { label: "Part-paid", count: partPaid, amt: partPaidAmt, pct: partPct, fill: "warning.main", text: "warning.dark" },
    { label: "Unpaid", count: unpaid, amt: unpaidAmt, pct: unpaidPct, fill: "error.main", text: "error.main" },
  ];

  return (
    <Card sx={styles.card}>
      <Box sx={styles.headerLoose}>
        <ChartHeading title="Payment Status Split" subtitle="Jobs by Payment Status" />
      </Box>
      <CardContent sx={styles.contentPadded}>
        {!hasData ? (
          <EmptyState icon={BarChart3} title="No Jobs Yet" description="Payment status breakdown will appear once jobs are recorded." />
        ) : (
          <>
            <Box sx={styles.statusBar}>
              {statuses.filter(({ pct }) => pct > 0).map(({ label, pct, fill }) => (
                <Box key={label} sx={[styles.statusSegment, { bgcolor: fill, width: `${pct}%` }]} />
              ))}
            </Box>

            <Box sx={styles.statusGrid}>
              {statuses.map(({ label, count, amt, pct, fill, text }) => (
                <Box key={label} sx={styles.statusCell}>
                  <Box sx={styles.statusHead}>
                    <Box sx={[styles.dot, { bgcolor: fill }]} />
                    <Typography variant="overline" color="text.secondary">{label}</Typography>
                  </Box>
                  <Typography variant="h4" component="p" color={text} sx={styles.statusCount}>{count}</Typography>
                  <Typography variant="caption" color="text.secondary" component="p">{pct.toFixed(0)}% of jobs</Typography>
                  <Typography variant="caption" component="p" sx={{ fontWeight: 700 }}>₦{amt.toLocaleString()}</Typography>
                </Box>
              ))}
            </Box>
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface TopClientsWidgetProps {
  clients: { name: string; revenue: number }[];
}

export function TopClientsWidget({ clients }: TopClientsWidgetProps) {
  const hasData = clients.length > 0;
  const maxRevenue = hasData ? Math.max(...clients.map(c => c.revenue), 1) : 1;

  return (
    <Card sx={styles.card}>
      <Box sx={styles.headerLoose}>
        <Box sx={styles.titleRow}>
          <ChartHeading title="Top Clients" subtitle="Revenue by Client" />
          {hasData && (
            <Box sx={[chartCountBadgeStyles.base, chartCountBadgeStyles.clients]}>
              <Users size={12} />
              {clients.length}
            </Box>
          )}
        </Box>
      </Box>
      <CardContent sx={styles.contentPadded}>
        {!hasData ? (
          <EmptyState icon={Users} title="No Clients Yet" description="Client revenue rankings will appear once sales are recorded." />
        ) : (
          <Box sx={styles.list}>
            {clients.map((client, index) => {
              const barWidth = (client.revenue / maxRevenue) * 100;
              const medals = ["🥇", "🥈", "🥉"];
              return (
                <Box key={client.name}>
                  <Box sx={styles.clientRow}>
                    <Box sx={styles.clientName}>
                      <Typography variant="caption" component="span" sx={styles.medal}>
                        {medals[index] ?? `#${index + 1}`}
                      </Typography>
                      <Typography variant="h6" component="span" sx={styles.ellipsis}>
                        {client.name}
                      </Typography>
                    </Box>
                    <Typography variant="h6" component="span" sx={{ flexShrink: 0 }}>
                      ₦{client.revenue >= 1_000_000
                        ? `${(client.revenue / 1_000_000).toFixed(1)}M`
                        : client.revenue >= 1_000
                        ? `${(client.revenue / 1_000).toFixed(0)}k`
                        : client.revenue.toLocaleString()}
                    </Typography>
                  </Box>
                  <Box sx={styles.clientTrack}>
                    <Box sx={[styles.clientFill, { width: `${barWidth}%` }]} />
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

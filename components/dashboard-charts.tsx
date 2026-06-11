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
  Typography,
  Stack,
  useTheme,
} from "@mui/material";
import { Inbox, BarChart3, PieChart as PieIcon, TrendingUp, Users } from "lucide-react";

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

const CHART_COLORS = [
  "var(--primary)",
  "#21c55d", // Green
  "#f59e0b", // Amber
  "#f43f5e", // Rose
  "#8b5cf6", // Violet
  "#0ea5e9", // Sky
  "#049669", // Emerald
  "#facc15", // Yellow
];

function EmptyState({ icon: Icon, title, description }: { icon: any, title: string, description: string }) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        width: "100%",
        py: 6,
        textAlign: "center",
      }}
    >
      <Box sx={{ position: "relative", mb: 2 }}>
        <Box
          sx={{
            bgcolor: "grey.100",
            width: 64,
            height: 64,
            borderRadius: 3,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid",
            borderColor: "divider",
          }}
        >
          <Icon style={{ width: 32, height: 32, color: "var(--mui-palette-text-secondary, #6B7480)" }} />
        </Box>
      </Box>
      <Typography sx={{ fontSize: "0.875rem", fontWeight: 900, color: "text.primary", mb: 0.5 }}>
        {title}
      </Typography>
      <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary", fontWeight: 500, maxWidth: 180, lineHeight: 1.5 }}>
        {description}
      </Typography>
    </Box>
  );
}


export function SalesExpenseChart({ data }: { data: SalesExpenseData[] }) {
  const hasData = data.some(d => d.sales > 0 || d.expenses > 0);
  const activeDays = data.filter(d => d.sales > 0).length;
  const totalSalesSum = data.reduce((s, d) => s + d.sales, 0);
  const avgDailySales = activeDays > 0 ? Math.round(totalSalesSum / activeDays) : 0;

  return (
    <Card sx={{ overflow: "hidden", transition: "box-shadow 300ms", minWidth: 0 }}>
      <Box sx={{ px: 2.5, pt: 2.5, pb: 1 }}>
        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 1 }}>
          <Box>
            <Typography sx={{ fontSize: "1rem", fontWeight: 900, color: "text.primary" }}>
              Sales vs Expenses
            </Typography>
            <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 900 }}>
              Daily Performance Trend
            </Typography>
          </Box>
          {hasData && avgDailySales > 0 && (
            <Box
              sx={{
                bgcolor: "primary.main",
                color: "primary.contrastText",
                fontSize: "0.625rem",
                fontWeight: 900,
                px: 1.5,
                py: 0.5,
                borderRadius: 100,
                border: "1px solid",
                borderColor: "primary.dark",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                display: "flex",
                alignItems: "center",
                gap: 0.5,
              }}
            >
              <TrendingUp size={14} />
              Daily Avg: ₦{avgDailySales.toLocaleString()}
            </Box>
          )}
        </Stack>
      </Box>
      <CardContent sx={{ px: 1, pb: 2 }}>
        <Box sx={{ height: 280, width: "100%" }}>
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
                    <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--destructive)" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="var(--destructive)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)", fontWeight: 700 }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)", fontWeight: 700 }}
                  tickFormatter={(val) => `₦${val >= 1000 ? (val / 1000).toFixed(0) + "k" : val}`}
                  width={50}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--card)",
                    borderRadius: "14px",
                    border: "1px solid var(--border)",
                    boxShadow: "0 10px 30px -10px rgba(0,0,0,0.15)",
                    fontSize: "12px",
                    padding: "12px",
                    color: "var(--foreground)",
                  }}
                  itemStyle={{ fontWeight: "900", color: "var(--foreground)" }}
                  cursor={{ stroke: 'var(--primary)', strokeWidth: 1, strokeDasharray: '4 4' }}
                  formatter={(value: any) => [`₦${Number(value).toLocaleString()}`, "Amount"]}
                  labelStyle={{ fontWeight: "900", marginBottom: "6px", color: "var(--foreground)" }}
                />
                <Area type="monotone" dataKey="sales" stroke="var(--primary)" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" name="Sales" />
                <Area type="monotone" dataKey="expenses" stroke="var(--destructive)" strokeWidth={3} fillOpacity={1} fill="url(#colorExpenses)" name="Expenses" />
                {avgDailySales > 0 && (
                  <ReferenceLine
                    y={avgDailySales}
                    stroke="var(--primary)"
                    strokeDasharray="5 4"
                    strokeOpacity={0.5}
                    strokeWidth={1.5}
                    label={{ value: `Avg ₦${avgDailySales >= 1000 ? (avgDailySales / 1000).toFixed(0) + "k" : avgDailySales}`, position: "insideTopRight", fontSize: 9, fontWeight: 700, fill: "var(--primary)", opacity: 0.7 }}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Box>

        {hasData && (
          <Stack
            direction="row"
            sx={{
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              mt: 2,
              pt: 2,
              borderTop: "1px solid",
              borderColor: "divider",
              flexWrap: "wrap",
            }}
          >
            <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
              <Box sx={{ width: 16, height: 4, borderRadius: 100, bgcolor: "primary.main", display: "inline-block" }} />
              <Typography sx={{ fontSize: "0.625rem", fontWeight: 900, color: "text.secondary", textTransform: "uppercase" }}>Sales</Typography>
            </Stack>
            <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
              <Box sx={{ width: 16, height: 4, borderRadius: 100, bgcolor: "error.main", display: "inline-block" }} />
              <Typography sx={{ fontSize: "0.625rem", fontWeight: 900, color: "text.secondary", textTransform: "uppercase" }}>Expenses</Typography>
            </Stack>
            {avgDailySales > 0 && (
              <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
                <Box sx={{ width: 16, borderTop: "2px dashed", borderColor: "primary.main", opacity: 0.6, display: "inline-block" }} />
                <Typography sx={{ fontSize: "0.625rem", fontWeight: 900, color: "text.secondary", textTransform: "uppercase" }}>Daily Avg</Typography>
              </Stack>
            )}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

export function ExpenseCategorizationChart({ data, total }: { data: CategoryData[]; total: number }) {
  const hasData = total > 0;

  return (
    <Card sx={{ overflow: "hidden", transition: "box-shadow 300ms", minWidth: 0 }}>
      <Box sx={{ px: 2.5, pt: 2.5, pb: 1 }}>
        <Typography sx={{ fontSize: "1rem", fontWeight: 900, color: "text.primary" }}>
          Expense Breakdown
        </Typography>
        <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 900 }}>
          Category Split
        </Typography>
      </Box>
      <CardContent sx={{ px: 1, pb: 2 }}>
        <Box sx={{ height: 280, width: "100%", position: "relative" }}>
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
                      <Cell key={`cell-${index}`} fill={entry.color || CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      borderRadius: "14px",
                      border: "1px solid var(--border)",
                      fontSize: "12px",
                    }}
                    itemStyle={{ color: "var(--foreground)" }}
                    formatter={(value: any) => [`₦${Number(value).toLocaleString()}`, "Amount"]}
                  />
                  <Legend verticalAlign="bottom" height={30} iconType="circle" wrapperStyle={{ fontSize: "10px", fontWeight: "900", textTransform: 'uppercase', letterSpacing: '0.05em' }} />
                </PieChart>
              </ResponsiveContainer>
              <Box
                sx={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: "35%",
                  pointerEvents: "none",
                  textAlign: "center",
                }}
              >
                <Typography sx={{ fontSize: "0.5625rem", fontWeight: 900, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  Total Exp.
                </Typography>
                <Typography sx={{ fontSize: "1.125rem", fontWeight: 900, color: "text.primary", lineHeight: 1.2 }}>
                  ₦{total.toLocaleString()}
                </Typography>
              </Box>
            </>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}

export function MaterialSalesChart({ data, total }: { data: CategoryData[]; total: number }) {
  const hasData = total > 0;

  return (
    <Card sx={{ overflow: "hidden", transition: "box-shadow 300ms", minWidth: 0 }}>
      <Box sx={{ px: 2.5, pt: 2.5, pb: 1 }}>
        <Typography sx={{ fontSize: "1rem", fontWeight: 700, color: "text.primary" }}>
          Material Distribution
        </Typography>
        <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>
          Workload Breakdown
        </Typography>
      </Box>
      <CardContent sx={{ px: 1, pb: 2 }}>
        <Box sx={{ height: 280, width: "100%", position: "relative" }}>
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
                      <Cell key={`cell-${index}`} fill={entry.color || CHART_COLORS[index % CHART_COLORS.length]} strokeWidth={0} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      borderRadius: "14px",
                      border: "1px solid var(--border)",
                      fontSize: "12px",
                    }}
                    itemStyle={{ color: "var(--foreground)" }}
                    formatter={(value: any) => [Number(value).toLocaleString(), "Jobs"]}
                  />
                  <Legend verticalAlign="bottom" height={30} iconType="circle" wrapperStyle={{ fontSize: "10px", fontWeight: "900", textTransform: 'uppercase', letterSpacing: '0.05em' }} />
                </PieChart>
              </ResponsiveContainer>
              <Box
                sx={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: "35%",
                  pointerEvents: "none",
                  textAlign: "center",
                }}
              >
                <Typography sx={{ fontSize: "0.5625rem", fontWeight: 900, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  Total Jobs
                </Typography>
                <Typography sx={{ fontSize: "1.125rem", fontWeight: 900, color: "text.primary", lineHeight: 1.2 }}>
                  {total.toLocaleString()}
                </Typography>
              </Box>
            </>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}

interface OutstandingDebtChartProps {
  data: DebtData[];
  onClientClick?: (name: string) => void;
  ageMap?: Record<string, number>;
}

export function OutstandingDebtChart({ data, onClientClick, ageMap }: OutstandingDebtChartProps) {
  const getBarColor = (name: string) => {
    if (!ageMap) return "var(--destructive)";
    const days = ageMap[name] ?? 0;
    if (days > 14) return "#f43f5e"; // Rose
    if (days > 7) return "#f59e0b"; // Amber
    return "var(--destructive)";
  };
  const hasData = data && data.length > 0;

  return (
    <Card sx={{ overflow: "hidden", transition: "box-shadow 300ms", minWidth: 0 }}>
      <Box sx={{ px: 2.5, pt: 2.5, pb: 1 }}>
        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 1 }}>
          <Box>
            <Typography sx={{ fontSize: "1rem", fontWeight: 700, color: "text.primary" }}>
              Outstanding Debt
            </Typography>
            <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>
              Top Clients with Unpaid Balances
            </Typography>
          </Box>
          {hasData && (
            <Box
              sx={{
                bgcolor: "error.light",
                color: "error.dark",
                fontSize: "0.625rem",
                fontWeight: 900,
                px: 1.5,
                py: 0.5,
                borderRadius: 100,
                border: "1px solid",
                borderColor: "error.main",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {data.length} client{data.length !== 1 ? "s" : ""}
            </Box>
          )}
        </Stack>
      </Box>
      <CardContent sx={{ px: 1, pb: 2 }}>
        {hasData && ageMap && (
          <Stack direction="row" sx={{ alignItems: "center", flexWrap: "wrap", gap: 2, mb: 1.5, px: 1 }}>
            {[
              { color: "#f43f5e", label: ">14 days overdue" },
              { color: "#f59e0b", label: "7–14 days" },
              { color: "error.main", label: "<7 days" },
            ].map(({ color, label }) => (
              <Stack key={label} direction="row" sx={{ alignItems: "center", gap: 0.75 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: color }} />
                <Typography sx={{ fontSize: "0.5625rem", fontWeight: 700, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  {label}
                </Typography>
              </Stack>
            ))}
          </Stack>
        )}
        <Box sx={{ height: 240, width: "100%" }}>
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
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" opacity={0.5} />
                <XAxis
                  type="number"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)", fontWeight: 700 }}
                  tickFormatter={(val) => `₦${val >= 1000 ? (val / 1000).toFixed(0) + "k" : val}`}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: "var(--foreground)", fontWeight: 700 }}
                  width={90}
                  tickFormatter={(name) => (name.length > 14 ? name.slice(0, 13) + "…" : name)}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--card)",
                    borderRadius: "14px",
                    border: "1px solid var(--border)",
                    fontSize: "12px",
                    color: "var(--foreground)",
                    boxShadow: "0 10px 30px -10px rgba(0,0,0,0.15)",
                  }}
                  itemStyle={{ color: "var(--foreground)" }}
                  formatter={(value: any) => [`₦${Number(value).toLocaleString()}`, "Balance"]}
                  labelStyle={{ fontWeight: "900", marginBottom: "6px", color: "var(--foreground)" }}
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
        </Box>
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

  return (
    <Card sx={{ overflow: "hidden", transition: "box-shadow 300ms", minWidth: 0 }}>
      <Box sx={{ px: 2.5, pt: 2.5, pb: 1.5 }}>
        <Typography sx={{ fontSize: "1rem", fontWeight: 900, color: "text.primary" }}>
          Payment Status Split
        </Typography>
        <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 900 }}>
          Jobs by Payment Status
        </Typography>
      </Box>
      <CardContent sx={{ px: 2.5, pb: 2.5 }}>
        {!hasData ? (
          <EmptyState icon={BarChart3} title="No Jobs Yet" description="Payment status breakdown will appear once jobs are recorded." />
        ) : (
          <>
            <Box sx={{ width: "100%", height: 12, borderRadius: 100, overflow: "hidden", display: "flex", mb: 2.5 }}>
              {paidPct > 0   && <Box sx={{ bgcolor: "#10b981", height: "100%", transition: "width 500ms ease-out", width: `${paidPct}%` }} />}
              {partPct > 0   && <Box sx={{ bgcolor: "#fbbf24", height: "100%", transition: "width 500ms ease-out", width: `${partPct}%` }} />}
              {unpaidPct > 0 && <Box sx={{ bgcolor: "#f43f5e", height: "100%", transition: "width 500ms ease-out", width: `${unpaidPct}%` }} />}
            </Box>

            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1.5 }}>
              {[
                { label: "Paid", count: paid, amt: paidAmt, pct: paidPct, dot: "#10b981", color: "#059669" },
                { label: "Part-paid", count: partPaid, amt: partPaidAmt, pct: partPct, dot: "#fbbf24", color: "#d97706" },
                { label: "Unpaid", count: unpaid, amt: unpaidAmt, pct: unpaidPct, dot: "#f43f5e", color: "#e11d48" },
              ].map(({ label, count, amt, pct, dot, color }) => (
                <Box key={label} sx={{ textAlign: "center" }}>
                  <Stack direction="row" sx={{ alignItems: "center", justifyContent: "center", gap: 0.75, mb: 0.5 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: dot }} />
                    <Typography sx={{ fontSize: "0.5625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary" }}>
                      {label}
                    </Typography>
                  </Stack>
                  <Typography sx={{ fontSize: "1.125rem", fontWeight: 900, lineHeight: 1, color }}>
                    {count}
                  </Typography>
                  <Typography sx={{ fontSize: "0.5625rem", fontWeight: 700, color: "text.secondary", mt: 0.25 }}>
                    {pct.toFixed(0)}% of jobs
                  </Typography>
                  <Typography sx={{ fontSize: "0.625rem", fontWeight: 900, color: "text.primary", mt: 0.25 }}>
                    ₦{amt.toLocaleString()}
                  </Typography>
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
    <Card sx={{ overflow: "hidden", transition: "box-shadow 300ms", minWidth: 0 }}>
      <Box sx={{ px: 2.5, pt: 2.5, pb: 1.5 }}>
        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <Box>
            <Typography sx={{ fontSize: "1rem", fontWeight: 900, color: "text.primary" }}>
              Top Clients
            </Typography>
            <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 900 }}>
              Revenue by Client
            </Typography>
          </Box>
          {hasData && (
            <Box
              sx={{
                bgcolor: "primary.light",
                color: "primary.dark",
                fontSize: "0.625rem",
                fontWeight: 900,
                px: 1.5,
                py: 0.5,
                borderRadius: 100,
                border: "1px solid",
                borderColor: "primary.main",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                display: "flex",
                alignItems: "center",
                gap: 0.5,
              }}
            >
              <Users size={12} />
              {clients.length}
            </Box>
          )}
        </Stack>
      </Box>
      <CardContent sx={{ px: 2.5, pb: 2.5 }}>
        {!hasData ? (
          <EmptyState icon={Users} title="No Clients Yet" description="Client revenue rankings will appear once sales are recorded." />
        ) : (
          <Stack sx={{ gap: 1.5 }}>
            {clients.map((client, index) => {
              const barWidth = (client.revenue / maxRevenue) * 100;
              const medals = ["🥇", "🥈", "🥉"];
              return (
                <Box key={client.name}>
                  <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 1, mb: 0.5 }}>
                    <Stack direction="row" sx={{ alignItems: "center", gap: 1, minWidth: 0 }}>
                      <Typography sx={{ fontSize: "0.625rem", flexShrink: 0 }}>
                        {medals[index] ?? `#${index + 1}`}
                      </Typography>
                      <Typography sx={{ fontSize: "0.75rem", fontWeight: 900, color: "text.primary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {client.name}
                      </Typography>
                    </Stack>
                    <Typography sx={{ fontSize: "0.75rem", fontWeight: 900, color: "text.primary", flexShrink: 0 }}>
                      ₦{client.revenue >= 1_000_000
                        ? `${(client.revenue / 1_000_000).toFixed(1)}M`
                        : client.revenue >= 1_000
                        ? `${(client.revenue / 1_000).toFixed(0)}k`
                        : client.revenue.toLocaleString()}
                    </Typography>
                  </Stack>
                  <Box sx={{ height: 6, borderRadius: 100, bgcolor: "grey.200", overflow: "hidden" }}>
                    <Box
                      sx={{
                        height: "100%",
                        borderRadius: 100,
                        bgcolor: "primary.main",
                        opacity: 0.7,
                        transition: "width 500ms ease-out",
                        width: `${barWidth}%`,
                      }}
                    />
                  </Box>
                </Box>
              );
            })}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

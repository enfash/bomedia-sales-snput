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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  "hsl(var(--primary))",    // BOMedia Indigo
  "hsl(142 71% 45%)",       // Emerald Green
  "hsl(38 92% 50%)",        // Amber Orange
  "hsl(346 84% 61%)",       // Rose Pink
  "hsl(262 83% 58%)",       // Violet Purple
  "hsl(199 89% 48%)",       // Sky Blue
  "hsl(161 94% 30%)",       // Teal
  "hsl(43 96% 56%)",        // Yellow Gold
];

function EmptyState({ icon: Icon, title, description }: { icon: any, title: string, description: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full w-full py-12 text-center animate-in fade-in zoom-in duration-500">
      <div className="relative mb-4">
        <div className="absolute inset-0 bg-primary/5 rounded-full blur-2xl h-20 w-20 -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
        <div className="bg-muted h-16 w-16 rounded-2xl flex items-center justify-center border border-border shadow-sm">
          <Icon className="h-8 w-8 text-muted-foreground" />
        </div>
      </div>
      <h3 className="text-sm font-black text-foreground mb-1">{title}</h3>
      <p className="text-[11px] text-muted-foreground font-medium max-w-[180px] leading-relaxed">
        {description}
      </p>
    </div>
  );
}


// ─── Sales vs Expenses Area Chart ──────────────────────────────────────────
export function SalesExpenseChart({ data }: { data: SalesExpenseData[] }) {
  const hasData = data.some(d => d.sales > 0 || d.expenses > 0);
  const activeDays = data.filter(d => d.sales > 0).length;
  const totalSalesSum = data.reduce((s, d) => s + d.sales, 0);
  const avgDailySales = activeDays > 0 ? Math.round(totalSalesSum / activeDays) : 0;

  return (
    <Card className="glass overflow-hidden rounded-2xl transition-[box-shadow] duration-300 [@media(hover:hover)]:hover:shadow-xl">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-base font-black text-foreground">Sales vs Expenses</CardTitle>
            <CardDescription className="text-[11px] text-muted-foreground uppercase tracking-widest font-black">Daily Performance Trend</CardDescription>
          </div>
          {hasData && avgDailySales > 0 && (
            <div className="bg-primary/10 text-primary text-[10px] font-black px-3 py-1 rounded-full border border-primary/20 uppercase tracking-wider flex items-center gap-1 animate-in fade-in slide-in-from-right-2 duration-300">
              <TrendingUp className="w-3.5 h-3.5" />
              Daily Avg: ₦{avgDailySales.toLocaleString()}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-2 pb-4">
        <div className="h-[280px] w-full">
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
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", fontWeight: 700 }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", fontWeight: 700 }}
                  tickFormatter={(val) => `₦${val >= 1000 ? (val / 1000).toFixed(0) + "k" : val}`}
                  width={50}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    borderRadius: "14px",
                    border: "1px solid hsl(var(--border))",
                    boxShadow: "0 10px 30px -10px rgba(0,0,0,0.15)",
                    fontSize: "12px",
                    padding: "12px",
                    color: "hsl(var(--foreground))",
                  }}
                  cursor={{ stroke: 'hsl(var(--primary))', strokeWidth: 1, strokeDasharray: '4 4' }}
                  itemStyle={{ fontWeight: "900" }}
                  formatter={(value: any) => [`₦${Number(value).toLocaleString()}`, "Amount"]}
                  labelStyle={{ fontWeight: "900", marginBottom: "6px", color: "hsl(var(--foreground))" }}
                />
                <Area type="monotone" dataKey="sales" stroke="hsl(var(--primary))" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" name="Sales" />
                <Area type="monotone" dataKey="expenses" stroke="hsl(var(--destructive))" strokeWidth={3} fillOpacity={1} fill="url(#colorExpenses)" name="Expenses" />
                {avgDailySales > 0 && (
                  <ReferenceLine
                    y={avgDailySales}
                    stroke="hsl(var(--primary))"
                    strokeDasharray="5 4"
                    strokeOpacity={0.5}
                    strokeWidth={1.5}
                    label={{ value: `Avg ₦${avgDailySales >= 1000 ? (avgDailySales / 1000).toFixed(0) + "k" : avgDailySales}`, position: "insideTopRight", fontSize: 9, fontWeight: 700, fill: "hsl(var(--primary))", opacity: 0.7 }}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
        
        {hasData && (
          <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t border-border flex-wrap">
            <div className="flex items-center gap-2">
              <span className="w-4 h-1 rounded-full bg-primary inline-block" />
              <span className="text-[10px] font-black text-gray-600 dark:text-zinc-400 uppercase">Sales</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-1 rounded-full bg-destructive inline-block" />
              <span className="text-[10px] font-black text-gray-600 dark:text-zinc-400 uppercase">Expenses</span>
            </div>
            {avgDailySales > 0 && (
              <div className="flex items-center gap-2">
                <span className="w-4 h-0 border-t-2 border-dashed border-primary opacity-60 inline-block" />
                <span className="text-[10px] font-black text-gray-400 dark:text-zinc-500 uppercase">Daily Avg</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Expense Categorization Donut Chart ────────────────────────────────────
export function ExpenseCategorizationChart({ data, total }: { data: CategoryData[]; total: number }) {
  const hasData = total > 0;

  return (
    <Card className="glass overflow-hidden rounded-2xl transition-[box-shadow] duration-300 [@media(hover:hover)]:hover:shadow-xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-black text-foreground">Expense Breakdown</CardTitle>
        <CardDescription className="text-[11px] text-muted-foreground uppercase tracking-widest font-black">Category Split</CardDescription>
      </CardHeader>
      <CardContent className="px-2 pb-4">
        <div className="h-[280px] w-full relative">
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
                      backgroundColor: "hsl(var(--card))",
                      borderRadius: "14px",
                      border: "1px solid hsl(var(--border))",
                      fontSize: "12px",
                    }}
                    formatter={(value: any) => [`₦${Number(value).toLocaleString()}`, "Amount"]}
                  />
                  <Legend verticalAlign="bottom" height={30} iconType="circle" wrapperStyle={{ fontSize: "10px", fontWeight: "900", textTransform: 'uppercase', letterSpacing: '0.05em' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-x-0 pointer-events-none" style={{ top: "35%" }}>
                <p className="text-center text-[9px] font-black text-gray-500 dark:text-zinc-400 uppercase tracking-widest">Total Exp.</p>
                <p className="text-center text-lg font-black text-foreground leading-tight">₦{total.toLocaleString()}</p>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Material Sales Donut Chart ────────────────────────────────────────────
export function MaterialSalesChart({ data, total }: { data: CategoryData[]; total: number }) {
  const hasData = total > 0;

  return (
    <Card className="glass overflow-hidden rounded-2xl transition-[box-shadow] duration-300 [@media(hover:hover)]:hover:shadow-xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-bold text-foreground">Material Distribution</CardTitle>
        <CardDescription className="text-[11px] text-muted-foreground uppercase tracking-widest font-bold">Workload Breakdown</CardDescription>
      </CardHeader>
      <CardContent className="px-2 pb-4">
        <div className="h-[280px] w-full relative">
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
                      backgroundColor: "hsl(var(--card))",
                      borderRadius: "14px",
                      border: "1px solid hsl(var(--border))",
                      fontSize: "12px",
                    }}
                    formatter={(value: any) => [Number(value).toLocaleString(), "Jobs"]}
                  />
                  <Legend verticalAlign="bottom" height={30} iconType="circle" wrapperStyle={{ fontSize: "10px", fontWeight: "900", textTransform: 'uppercase', letterSpacing: '0.05em' }} />
                </PieChart>
              </ResponsiveContainer>
              {/* Center Label */}
              <div className="absolute inset-x-0 pointer-events-none" style={{ top: "35%" }}>
                <p className="text-center text-[9px] font-black text-gray-500 dark:text-zinc-400 uppercase tracking-widest">Total Jobs</p>
                <p className="text-center text-lg font-black text-foreground leading-tight">{total.toLocaleString()}</p>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Outstanding Debt Bar Chart ─────────────────────────────────────────────
interface OutstandingDebtChartProps {
  data: DebtData[];
  onClientClick?: (name: string) => void;
  ageMap?: Record<string, number>; // client name → days since oldest unpaid invoice
}

export function OutstandingDebtChart({ data, onClientClick, ageMap }: OutstandingDebtChartProps) {
  const getBarColor = (name: string) => {
    if (!ageMap) return "hsl(var(--destructive))";
    const days = ageMap[name] ?? 0;
    if (days > 14) return "hsl(346 84% 61%)";   // rose — very overdue
    if (days > 7) return "hsl(38 92% 50%)";      // amber — getting old
    return "hsl(var(--destructive))";
  };
  const hasData = data && data.length > 0;

  return (
    <Card className="glass overflow-hidden rounded-2xl transition-[box-shadow] duration-300 [@media(hover:hover)]:hover:shadow-xl">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold text-foreground">Outstanding Debt</CardTitle>
            <CardDescription className="text-[11px] text-muted-foreground uppercase tracking-widest font-bold">Top Clients with Unpaid Balances</CardDescription>
          </div>
          {hasData && (
            <div className="bg-destructive/10 text-destructive text-[10px] font-black px-3 py-1 rounded-full border border-destructive/30 uppercase tracking-wider">
              {data.length} client{data.length !== 1 ? "s" : ""}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-2 pb-4">
        {hasData && ageMap && (
          <div className="flex items-center gap-4 mb-3 px-2">
            {[
              { color: "bg-rose-500", label: ">14 days overdue" },
              { color: "bg-amber-500", label: "7–14 days" },
              { color: "bg-destructive", label: "<7 days" },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${color}`} />
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide">{label}</span>
              </div>
            ))}
          </div>
        )}
        <div className="h-[240px] w-full">
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
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" opacity={0.5} />
                <XAxis
                  type="number"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", fontWeight: 700 }}
                  tickFormatter={(val) => `₦${val >= 1000 ? (val / 1000).toFixed(0) + "k" : val}`}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: "hsl(var(--foreground))", fontWeight: 700 }}
                  width={90}
                  tickFormatter={(name) => (name.length > 14 ? name.slice(0, 13) + "…" : name)}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    borderRadius: "14px",
                    border: "1px solid hsl(var(--border))",
                    fontSize: "12px",
                    color: "hsl(var(--foreground))",
                  }}
                  formatter={(value: any) => [`₦${Number(value).toLocaleString()}`, "Balance"]}
                  labelStyle={{ fontWeight: "900", marginBottom: "6px", color: "hsl(var(--foreground))" }}
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
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Payment Status Breakdown Widget ───────────────────────────────────────
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
    <Card className="glass overflow-hidden rounded-2xl transition-[box-shadow] duration-300 [@media(hover:hover)]:hover:shadow-xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-black text-foreground">Payment Status Split</CardTitle>
        <CardDescription className="text-[11px] text-muted-foreground uppercase tracking-widest font-black">Jobs by Payment Status</CardDescription>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {!hasData ? (
          <EmptyState icon={BarChart3} title="No Jobs Yet" description="Payment status breakdown will appear once jobs are recorded." />
        ) : (
          <>
            {/* Stacked bar */}
            <div className="w-full h-3 rounded-full overflow-hidden flex mb-5">
              {paidPct > 0   && <div className="bg-emerald-500 h-full [transition:width_500ms_ease-out]" style={{ width: `${paidPct}%` }} />}
              {partPct > 0   && <div className="bg-amber-400 h-full [transition:width_500ms_ease-out]"  style={{ width: `${partPct}%` }} />}
              {unpaidPct > 0 && <div className="bg-rose-500 h-full [transition:width_500ms_ease-out]"   style={{ width: `${unpaidPct}%` }} />}
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Paid", count: paid, amt: paidAmt, pct: paidPct, dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
                { label: "Part-paid", count: partPaid, amt: partPaidAmt, pct: partPct, dot: "bg-amber-400", text: "text-amber-600 dark:text-amber-400" },
                { label: "Unpaid", count: unpaid, amt: unpaidAmt, pct: unpaidPct, dot: "bg-rose-500", text: "text-rose-600 dark:text-rose-400" },
              ].map(({ label, count, amt, pct, dot, text }) => (
                <div key={label} className="text-center space-y-1">
                  <div className="flex items-center justify-center gap-1.5 mb-2">
                    <div className={`w-2 h-2 rounded-full ${dot}`} />
                    <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{label}</span>
                  </div>
                  <p className={`text-lg font-black leading-none ${text}`}>{count}</p>
                  <p className="text-[9px] font-bold text-muted-foreground">{pct.toFixed(0)}% of jobs</p>
                  <p className="text-[10px] font-black text-foreground">₦{amt.toLocaleString()}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Top Clients by Revenue Widget ─────────────────────────────────────────
interface TopClientsWidgetProps {
  clients: { name: string; revenue: number }[];
}

export function TopClientsWidget({ clients }: TopClientsWidgetProps) {
  const hasData = clients.length > 0;
  const maxRevenue = hasData ? Math.max(...clients.map(c => c.revenue), 1) : 1;

  return (
    <Card className="glass overflow-hidden rounded-2xl transition-[box-shadow] duration-300 [@media(hover:hover)]:hover:shadow-xl">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-black text-foreground">Top Clients</CardTitle>
            <CardDescription className="text-[11px] text-muted-foreground uppercase tracking-widest font-black">Revenue by Client</CardDescription>
          </div>
          {hasData && (
            <div className="bg-primary/10 text-primary text-[10px] font-black px-3 py-1 rounded-full border border-primary/20 uppercase tracking-wider flex items-center gap-1">
              <Users className="w-3 h-3" />
              {clients.length}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {!hasData ? (
          <EmptyState icon={Users} title="No Clients Yet" description="Client revenue rankings will appear once sales are recorded." />
        ) : (
          <div className="space-y-3">
            {clients.map((client, index) => {
              const barWidth = (client.revenue / maxRevenue) * 100;
              const medals = ["🥇", "🥈", "🥉"];
              return (
                <div key={client.name} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] shrink-0">{medals[index] ?? `#${index + 1}`}</span>
                      <span className="text-xs font-black text-foreground truncate">{client.name}</span>
                    </div>
                    <span className="text-xs font-black text-foreground shrink-0">
                      ₦{client.revenue >= 1_000_000
                        ? `${(client.revenue / 1_000_000).toFixed(1)}M`
                        : client.revenue >= 1_000
                        ? `${(client.revenue / 1_000).toFixed(0)}k`
                        : client.revenue.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary/70 [transition:width_500ms_ease-out]"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

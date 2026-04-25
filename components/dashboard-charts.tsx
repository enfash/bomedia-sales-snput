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
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Inbox, BarChart3, PieChart as PieIcon } from "lucide-react";

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

const CHART_COLORS = ["hsl(var(--primary))", "hsl(243 75% 75%)", "hsl(var(--success))", "hsl(var(--warning))", "hsl(var(--muted-foreground))", "hsl(190 90% 50%)"];

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

  return (
    <Card className="glass overflow-hidden rounded-2xl transition-all duration-500 hover:shadow-xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-black text-foreground">Sales vs Expenses</CardTitle>
        <CardDescription className="text-[11px] text-muted-foreground uppercase tracking-widest font-black">Daily Performance Trend</CardDescription>
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
                  }}
                  cursor={{ stroke: 'hsl(var(--primary))', strokeWidth: 1, strokeDasharray: '4 4' }}
                  itemStyle={{ fontWeight: "900" }}
                  formatter={(value: any) => [`₦${Number(value).toLocaleString()}`, "Amount"]}
                  labelStyle={{ fontWeight: "900", marginBottom: "6px", color: "hsl(var(--foreground))" }}
                />
                <Area type="monotone" dataKey="sales" stroke="hsl(var(--primary))" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" name="Sales" />
                <Area type="monotone" dataKey="expenses" stroke="hsl(var(--destructive))" strokeWidth={3} fillOpacity={1} fill="url(#colorExpenses)" name="Expenses" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
        
        {hasData && (
          <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t border-border">
            <div className="flex items-center gap-2">
              <span className="w-4 h-1 rounded-full bg-primary inline-block" />
              <span className="text-[10px] font-black text-muted-foreground uppercase">Sales</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-1 rounded-full bg-destructive inline-block" />
              <span className="text-[10px] font-black text-muted-foreground uppercase">Expenses</span>
            </div>
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
    <Card className="glass overflow-hidden rounded-2xl transition-all duration-500 hover:shadow-xl">
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
                <p className="text-center text-[9px] font-black text-muted-foreground uppercase tracking-widest opacity-60">Total Exp.</p>
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
    <Card className="glass overflow-hidden rounded-2xl transition-all duration-500 hover:shadow-xl">
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
                <p className="text-center text-[9px] font-black text-muted-foreground uppercase tracking-widest opacity-60">Total Jobs</p>
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
}

export function OutstandingDebtChart({ data, onClientClick }: OutstandingDebtChartProps) {
  const hasData = data && data.length > 0;

  return (
    <Card className="glass overflow-hidden rounded-2xl transition-all duration-500 hover:shadow-xl">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold text-foreground">Outstanding Debt</CardTitle>
            <CardDescription className="text-[11px] text-muted-foreground uppercase tracking-widest font-bold">Top Clients with Unpaid Balances</CardDescription>
          </div>
          {hasData && (
            <div className="bg-destructive/10 text-destructive text-[10px] font-black px-3 py-1 rounded-full border border-destructive/20 uppercase tracking-wider">
              {data.length} client{data.length !== 1 ? "s" : ""}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-2 pb-4">
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
                  }}
                  formatter={(value: any) => [`₦${Number(value).toLocaleString()}`, "Balance"]}
                  labelStyle={{ fontWeight: "900", marginBottom: "6px", color: "hsl(var(--foreground))" }}
                />
                <Bar 
                  dataKey="balance" 
                  fill="hsl(var(--destructive))" 
                  radius={[0, 6, 6, 0]} 
                  name="Balance"
                  onClick={(payload) => {
                    if (onClientClick && payload?.name) {
                      onClientClick(payload.name);
                    }
                  }}
                  style={{ cursor: onClientClick ? "pointer" : "default" }}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

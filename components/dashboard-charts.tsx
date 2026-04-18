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

const CHART_COLORS = ["#6366f1", "#a855f7", "#10b981", "#f59e0b", "#64748b", "#06b6d4"];

// ─── Sales vs Expenses Area Chart ──────────────────────────────────────────
export function SalesExpenseChart({ data }: { data: SalesExpenseData[] }) {
  return (
    <Card className="border-none shadow-sm bg-white dark:bg-zinc-900 overflow-hidden rounded-2xl border border-transparent dark:border-white/5 transition-colors">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-bold text-gray-900 dark:text-white">Sales vs Expenses</CardTitle>
        <CardDescription className="text-[11px] text-gray-400 uppercase tracking-wider font-bold">Last 30 Days</CardDescription>
      </CardHeader>
      <CardContent className="px-2 pb-4">
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f4f8" className="stroke-gray-100 dark:stroke-zinc-800" />
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                className="[&_.recharts-cartesian-axis-tick-value]:dark:fill-zinc-500"
                interval="preserveStartEnd"
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                className="[&_.recharts-cartesian-axis-tick-value]:dark:fill-zinc-500"
                tickFormatter={(val) => `₦${val >= 1000 ? (val / 1000).toFixed(0) + "k" : val}`}
                width={50}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--popover)",
                  borderRadius: "12px",
                  border: "1px solid var(--border)",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                  fontSize: "12px",
                  padding: "8px 12px",
                }}
                itemStyle={{ fontWeight: "800" }}
                formatter={(value: any) => [`₦${Number(value).toLocaleString()}`, "Amount"]}
                labelStyle={{ fontWeight: "900", marginBottom: "4px", color: "var(--foreground)" }}
              />
              <Area type="monotone" dataKey="sales" stroke="#6366f1" strokeWidth={2.5} fillOpacity={1} fill="url(#colorSales)" name="Sales" />
              <Area type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2.5} fillOpacity={1} fill="url(#colorExpenses)" name="Expenses" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {/* Custom Legend */}
        <div className="flex items-center justify-center gap-6 mt-2">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-1.5 rounded-full bg-indigo-500 inline-block" />
            <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400">Sales</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-1.5 rounded-full bg-rose-500 inline-block" />
            <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400">Expenses</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Expense Categorization Donut Chart ────────────────────────────────────
export function ExpenseCategorizationChart({ data, total }: { data: CategoryData[]; total: number }) {
  return (
    <Card className="border-none shadow-sm bg-white dark:bg-zinc-900 overflow-hidden rounded-2xl border border-transparent dark:border-white/5 transition-colors">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-bold text-gray-900 dark:text-white">Expense Breakdown</CardTitle>
        <CardDescription className="text-[11px] text-gray-400 uppercase tracking-wider font-bold">By Category</CardDescription>
      </CardHeader>
      <CardContent className="px-2 pb-4">
        <div className="h-[280px] w-full relative">
          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
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
                  backgroundColor: "var(--popover)",
                  borderRadius: "12px",
                  border: "1px solid var(--border)",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                  fontSize: "12px",
                }}
                formatter={(value: any) => [`₦${Number(value).toLocaleString()}`, "Amount"]}
              />
              <Legend verticalAlign="bottom" height={30} iconType="circle" wrapperStyle={{ fontSize: "11px", fontWeight: "700" }} />
            </PieChart>
          </ResponsiveContainer>
          {/* Center Label */}
          <div className="absolute inset-x-0 pointer-events-none" style={{ top: "38%" }}>
            <p className="text-center text-[9px] font-black text-gray-400 uppercase tracking-widest">Total</p>
            <p className="text-center text-base font-black text-gray-900 dark:text-white leading-tight">₦{total.toLocaleString()}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Material Sales Donut Chart ────────────────────────────────────────────
export function MaterialSalesChart({ data, total }: { data: CategoryData[]; total: number }) {
  return (
    <Card className="border-none shadow-sm bg-white dark:bg-zinc-900 overflow-hidden rounded-2xl border border-transparent dark:border-white/5 transition-colors">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-bold text-gray-900 dark:text-white">Material Distribution</CardTitle>
        <CardDescription className="text-[11px] text-gray-400 uppercase tracking-wider font-bold">Today&apos;s Jobs</CardDescription>
      </CardHeader>
      <CardContent className="px-2 pb-4">
        <div className="h-[280px] w-full relative">
          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
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
                  backgroundColor: "var(--popover)",
                  borderRadius: "12px",
                  border: "1px solid var(--border)",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                  fontSize: "12px",
                }}
                formatter={(value: any) => [Number(value).toLocaleString(), "Jobs"]}
              />
              <Legend verticalAlign="bottom" height={30} iconType="circle" wrapperStyle={{ fontSize: "11px", fontWeight: "700" }} />
            </PieChart>
          </ResponsiveContainer>
          {/* Center Label */}
          <div className="absolute inset-x-0 pointer-events-none" style={{ top: "38%" }}>
            <p className="text-center text-[9px] font-black text-gray-400 uppercase tracking-widest">Total</p>
            <p className="text-center text-base font-black text-gray-900 dark:text-white leading-tight">{total.toLocaleString()} Jobs</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Outstanding Debt Bar Chart ─────────────────────────────────────────────
export function OutstandingDebtChart({ data }: { data: DebtData[] }) {
  if (!data || data.length === 0) {
    return (
      <Card className="border-none shadow-sm bg-white dark:bg-zinc-900 overflow-hidden rounded-2xl border border-transparent dark:border-white/5 transition-colors">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-bold text-gray-900 dark:text-white">Outstanding Debt</CardTitle>
          <CardDescription className="text-[11px] text-gray-400 uppercase tracking-wider font-bold">Clients with Unpaid Balances</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-40">
          <div className="text-center">
            <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-900/20 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-2xl">✅</span>
            </div>
            <p className="text-sm font-bold text-gray-500 dark:text-gray-400">All balances cleared!</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-none shadow-sm bg-white dark:bg-zinc-900 overflow-hidden rounded-2xl border border-transparent dark:border-white/5 transition-colors">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold text-gray-900 dark:text-white">Outstanding Debt</CardTitle>
            <CardDescription className="text-[11px] text-gray-400 uppercase tracking-wider font-bold">Top Clients with Unpaid Balances</CardDescription>
          </div>
          <div className="bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 text-[11px] font-black px-3 py-1 rounded-full border border-rose-100 dark:border-rose-900/30">
            {data.length} client{data.length !== 1 ? "s" : ""}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-2 pb-4">
        <div className="h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 0, right: 24, left: 8, bottom: 0 }}
              barCategoryGap="30%"
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f4f8" className="stroke-gray-100 dark:stroke-zinc-800" />
              <XAxis
                type="number"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                className="[&_.recharts-cartesian-axis-tick-value]:dark:fill-zinc-500"
                tickFormatter={(val) => `₦${val >= 1000 ? (val / 1000).toFixed(0) + "k" : val}`}
              />
              <YAxis
                type="category"
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: "#475569", fontWeight: 700 }}
                className="[&_.recharts-cartesian-axis-tick-value]:dark:fill-zinc-400"
                width={90}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--popover)",
                  borderRadius: "12px",
                  border: "1px solid var(--border)",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                  fontSize: "12px",
                }}
                formatter={(value: any) => [`₦${Number(value).toLocaleString()}`, "Balance"]}
                labelStyle={{ fontWeight: "bold", color: "var(--foreground)" }}
              />
              <Bar dataKey="balance" fill="#f43f5e" radius={[0, 6, 6, 0]} name="Balance" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

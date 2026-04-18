"use client";

import { TrendingUp, TrendingDown, DollarSign, ShoppingBag, AlertCircle, BarChart2 } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: number;
  change?: string;
  isPositive?: boolean;
  icon: React.ElementType;
  accent: string;       // hex color
  accentLight: string;  // hex light version
  subLabel?: string;
}

export function MetricCard({
  title,
  value,
  change,
  isPositive,
  icon: Icon,
  accent,
  accentLight,
  subLabel,
}: MetricCardProps) {
  return (
    <div
      className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm p-5 hover:shadow-md transition-all duration-200 flex flex-col gap-3 border border-transparent dark:border-white/5"
      style={{ borderTop: `4px solid ${accent}` }}
    >
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">{title}</p>
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center dark:!bg-zinc-800"
          style={{ backgroundColor: accentLight }}
        >
          <Icon className="w-4 h-4 dark:!text-white" style={{ color: accent }} />
        </div>
      </div>

      <div>
        <p className="text-2xl font-black text-gray-900 dark:text-white leading-none">
          ₦{value.toLocaleString(undefined, { minimumFractionDigits: 0 })}
        </p>
        {subLabel && (
          <p className="text-[11px] text-gray-400 mt-1 font-medium">{subLabel}</p>
        )}
      </div>

      {change && (
        <div className="flex items-center gap-1.5">
          {isPositive ? (
            <div className="flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full border border-emerald-100 dark:border-emerald-800/30">
              <TrendingUp className="w-3 h-3" />
              {change} vs last month
            </div>
          ) : (
            <div className="flex items-center gap-1 text-xs font-bold text-rose-500 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 px-2 py-0.5 rounded-full border border-rose-100 dark:border-rose-800/30">
              <TrendingDown className="w-3 h-3" />
              {change} vs last month
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface DashboardMetricsProps {
  totalSales: number;
  totalExpenses: number;
  netProfit: number;
  outstandingDebt: number;
  unpaidCount: number;
  salesChange: string;
  expensesChange: string;
  profitChange: string;
  isSalesUp: boolean;
  isExpensesDown: boolean;
  isProfitUp: boolean;
}

export function DashboardMetrics({
  totalSales,
  totalExpenses,
  netProfit,
  outstandingDebt,
  unpaidCount,
  salesChange,
  expensesChange,
  profitChange,
  isSalesUp,
  isExpensesDown,
  isProfitUp,
}: DashboardMetricsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <MetricCard
        title="Total Sales"
        value={totalSales}
        change={salesChange}
        isPositive={isSalesUp}
        icon={ShoppingBag}
        accent="#4f46e5"
        accentLight="#eef2ff"
      />
      <MetricCard
        title="Total Expenses"
        value={totalExpenses}
        change={expensesChange}
        isPositive={isExpensesDown}
        icon={DollarSign}
        accent="#9333ea"
        accentLight="#f5f3ff"
      />
      <MetricCard
        title="Net Profit"
        value={netProfit}
        change={profitChange}
        isPositive={isProfitUp}
        icon={BarChart2}
        accent="#10b981"
        accentLight="#ecfdf5"
      />
      <MetricCard
        title="Outstanding Debt"
        value={outstandingDebt}
        icon={AlertCircle}
        accent="#f43f5e"
        accentLight="#fff1f2"
        subLabel={unpaidCount > 0 ? `${unpaidCount} unpaid client${unpaidCount !== 1 ? "s" : ""}` : "All cleared"}
      />
    </div>
  );
}

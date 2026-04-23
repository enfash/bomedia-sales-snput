"use client";

import { TrendingUp, TrendingDown, DollarSign, ShoppingBag, AlertCircle, BarChart2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

// Inline micro-sparkline rendered as SVG — no extra dependencies
function Sparkline({ data, color = "currentColor" }: { data: number[]; color?: string }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 100;
  const h = 32;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  });
  const polyline = pts.join(" ");
  // Fill path: close below
  const fill = `M${pts[0]} L${pts.join(" L")} L${w},${h} L0,${h} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-8 overflow-visible" preserveAspectRatio="none">
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fill} fill="url(#spark-fill)" />
      <polyline points={polyline} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface MetricCardProps {
  title: string;
  value: number;
  change?: string;
  isPositive?: boolean;
  icon: React.ElementType;
  variant?: 'default' | 'hero' | 'alert';
  subLabel?: string;
  sparkData?: number[];
}

export function MetricCard({
  title,
  value,
  change,
  isPositive,
  icon: Icon,
  variant = 'default',
  subLabel,
  sparkData,
}: MetricCardProps) {
  const isHero = variant === 'hero';
  const isAlert = variant === 'alert' && value > 0;

  return (
    <div
      className={cn(
        "relative overflow-hidden h-full bg-card rounded-2xl shadow-sm border border-border p-2 sm:p-5 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 flex flex-col justify-between",
        isHero && "metric-hero border-primary/20 bg-primary/[0.03] p-5",
        isAlert && "animate-pulse-debt border-destructive/50 ring-2 ring-destructive/20"
      )}
    >
      {/* Background Decor for Hero */}
      {isHero && (
        <div className="absolute -right-4 -top-4 h-28 w-28 rounded-full bg-primary/5 blur-2xl" />
      )}

      <div className="flex items-center justify-between mb-2 sm:mb-4 gap-1">
        <div className="flex items-center gap-1.5">
          <p className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-widest text-muted-foreground line-clamp-1">{title}</p>
          {isAlert && (
            <motion.div 
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ repeat: Infinity, duration: 1.2 }}
              className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-destructive shadow-sm shadow-destructive/50 shrink-0"
            />
          )}
        </div>
        <div
          className={cn(
            "rounded-xl flex items-center justify-center transition-colors shrink-0",
            isHero ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 w-10 h-10" 
              : isAlert ? "bg-destructive/10 text-destructive w-6 h-6 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl"
              : "bg-muted text-foreground w-6 h-6 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl"
          )}
        >
          <Icon className="w-3 h-3 sm:w-5 sm:h-5" />
        </div>
      </div>

      <div className="space-y-1">
        <p className={cn(
          "font-black tracking-tight text-foreground leading-none truncate",
          isHero ? "text-3xl sm:text-4xl" : "text-xs sm:text-xl lg:text-2xl"
        )}>
          ₦{value.toLocaleString(undefined, { minimumFractionDigits: 0 })}
        </p>
        {(subLabel || (isHero && change)) && (
          <div className="flex items-center gap-2 mt-1 sm:mt-2">
            {subLabel && (
              <p className="text-[9px] sm:text-xs text-muted-foreground font-semibold truncate">{subLabel}</p>
            )}
            {isHero && change && (
              <div className={cn(
                "flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border",
                isPositive 
                  ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" 
                  : "bg-destructive/10 text-destructive border-destructive/20"
              )}>
                {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {change}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sparkline for hero card */}
      {isHero && sparkData && sparkData.length >= 2 && (
        <div className="mt-3 opacity-60">
          <Sparkline data={sparkData} color="hsl(var(--primary))" />
        </div>
      )}

      {!isHero && change && (
        <div className="mt-2 sm:mt-4 pt-2 sm:pt-4 border-t border-border flex items-center justify-between">
          <span className="text-[8px] sm:text-[10px] font-semibold text-muted-foreground uppercase hidden sm:inline-block">Performance</span>
          <div className={cn(
            "flex items-center gap-0.5 sm:gap-1 text-[9px] sm:text-xs font-bold",
            isPositive ? "text-emerald-600" : "text-destructive"
          )}>
            {isPositive ? <TrendingUp className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> : <TrendingDown className="w-2.5 h-2.5 sm:w-3 sm:h-3" />}
            {change}
          </div>
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
  sparkData?: number[];
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
  sparkData,
}: DashboardMetricsProps) {
  return (
    <div className="grid grid-cols-3 lg:grid-cols-5 gap-1.5 sm:gap-4">
      {/* Hero Card — Spans 3 columns on mobile to fill width, 2 columns on desktop */}
      <div className="col-span-3 lg:col-span-2">
        <MetricCard
          variant="hero"
          title="Total Sales"
          value={totalSales}
          change={salesChange}
          isPositive={isSalesUp}
          icon={ShoppingBag}
          sparkData={sparkData}
        />
      </div>
      
      <div className="col-span-1">
        <MetricCard
          title="Expenses"
          value={totalExpenses}
          change={expensesChange}
          isPositive={isExpensesDown}
          icon={DollarSign}
        />
      </div>
      
      <div className="col-span-1">
        <MetricCard
          title="Net Profit"
          value={netProfit}
          change={profitChange}
          isPositive={isProfitUp}
          icon={BarChart2}
        />
      </div>
      
      <div className="col-span-1">
        <MetricCard
          variant="alert"
          title="Outstanding Debt"
          value={outstandingDebt}
          icon={AlertCircle}
          subLabel={unpaidCount > 0 ? `${unpaidCount} unpaid jobs` : "All cleared ✓"}
        />
      </div>
    </div>
  );
}

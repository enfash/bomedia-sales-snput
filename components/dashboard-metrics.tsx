"use client";

import { useEffect, useState, useId } from "react";
import { TrendingUp, TrendingDown, DollarSign, ShoppingBag, AlertCircle, BarChart2, Percent } from "lucide-react";
import { motion, animate } from "framer-motion";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { metricsStyles as styles } from "@/app/theme";

const cardContainerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};
const cardItemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const } },
};

function Sparkline({ data, color = "currentColor" }: { data: number[]; color?: string }) {
  const uid = useId();
  const gradId = `spark-fill-${uid.replace(/:/g, "")}`;
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
  const fill = `M${pts[0]} L${pts.join(" L")} L${w},${h} L0,${h} Z`;

  return (
    <Box component="svg" viewBox={`0 0 ${w} ${h}`} sx={styles.sparkSvg} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fill} fill={`url(#${gradId})`} />
      <polyline points={polyline} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Box>
  );
}

interface MetricCardProps {
  title: string;
  value: number;
  displayValue?: string;
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
  displayValue,
  change,
  isPositive,
  icon: Icon,
  variant = 'default',
  subLabel,
  sparkData,
}: MetricCardProps) {
  const isHero = variant === 'hero';
  const isAlert = variant === 'alert' && value > 0;

  const [animatedNum, setAnimatedNum] = useState(0);
  useEffect(() => {
    const controls = animate(0, value, {
      duration: 0.8,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setAnimatedNum(v),
    });
    return () => controls.stop();
  }, [value]);

  const animatedDisplay = displayValue
    ? (/^[\d.]+%$/.test(displayValue) ? `${animatedNum.toFixed(1)}%` : displayValue)
    : `₦${Math.round(animatedNum).toLocaleString(undefined, { minimumFractionDigits: 0 })}`;

  const trendIcon = isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />;

  return (
    <Box sx={[styles.card, isHero && styles.cardHero, isAlert && styles.cardAlert]}>
      {isHero && <Box sx={styles.glow} />}

      <Box sx={styles.header}>
        <Box sx={styles.titleRow}>
          {isAlert && (
            <Box
              component={motion.div}
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ repeat: Infinity, duration: 1.2 }}
              sx={styles.alertDot}
            />
          )}
          <Typography variant="overline" sx={styles.title}>
            {title}
          </Typography>
        </Box>
        <Box sx={[styles.icon, isHero ? styles.iconHero : isAlert ? styles.iconAlert : styles.iconDefault]}>
          <Icon size={isHero ? 20 : 16} />
        </Box>
      </Box>

      <Box sx={styles.body}>
        <Typography component="p" sx={[styles.value, isHero ? styles.valueHero : styles.valueDefault]}>
          {animatedDisplay}
        </Typography>
        {(isHero && change) && (
          <Box sx={styles.trendRow}>
            <Box sx={[styles.trendChip, isPositive ? styles.trendUp : styles.trendDown]}>
              {trendIcon}
              {change}
            </Box>
          </Box>
        )}
      </Box>

      {isHero && sparkData && sparkData.length >= 2 && (
        <Box sx={styles.spark}>
          <Sparkline data={sparkData} />
        </Box>
      )}

      {!isHero && (change || subLabel) && (
        <Box sx={styles.footer}>
          <Typography variant="overline" sx={styles.subLabel}>
            {subLabel || "Performance"}
          </Typography>
          {change && (
            <Box color={isPositive ? "success.main" : "error.main"} sx={styles.change}>
              {trendIcon}
              {change}
            </Box>
          )}
        </Box>
      )}
    </Box>
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
  grossMarginPct: number;
  prevGrossMarginPct: number;
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
  grossMarginPct,
  prevGrossMarginPct,
  sparkData,
}: DashboardMetricsProps) {
  const marginChange = `${Math.abs(Math.round(grossMarginPct - prevGrossMarginPct))}pp`;
  const isMarginUp = grossMarginPct >= prevGrossMarginPct;

  return (
    <Box
      component={motion.div}
      variants={cardContainerVariants}
      initial="hidden"
      animate="show"
      sx={styles.grid}
    >
      <Box component={motion.div} variants={cardItemVariants} sx={styles.heroCell}>
        <MetricCard
          variant="hero"
          title="Total Sales"
          value={totalSales}
          change={salesChange}
          isPositive={isSalesUp}
          icon={ShoppingBag}
          sparkData={sparkData}
        />
      </Box>

      <Box component={motion.div} variants={cardItemVariants} sx={styles.cell}>
        <MetricCard
          title="Expenses"
          value={totalExpenses}
          change={expensesChange}
          isPositive={isExpensesDown}
          icon={DollarSign}
        />
      </Box>

      <Box component={motion.div} variants={cardItemVariants} sx={styles.cell}>
        <MetricCard
          title="Net Profit"
          value={netProfit}
          change={profitChange}
          isPositive={isProfitUp}
          icon={BarChart2}
        />
      </Box>

      <Box component={motion.div} variants={cardItemVariants} sx={styles.cell}>
        <MetricCard
          variant="alert"
          title="Outstanding Debt"
          value={outstandingDebt}
          icon={AlertCircle}
          subLabel={unpaidCount > 0 ? `${unpaidCount} unpaid jobs` : "All cleared ✓"}
        />
      </Box>

      <Box component={motion.div} variants={cardItemVariants} sx={styles.cell}>
        <MetricCard
          title="Gross Margin"
          value={grossMarginPct}
          displayValue={totalSales > 0 ? `${grossMarginPct.toFixed(1)}%` : "—%"}
          change={totalSales > 0 ? marginChange : undefined}
          isPositive={isMarginUp}
          icon={Percent}
          subLabel={totalSales > 0 ? (grossMarginPct >= 40 ? "Healthy margin" : grossMarginPct >= 20 ? "Watch expenses" : "Margin is tight") : "No sales yet"}
        />
      </Box>
    </Box>
  );
}

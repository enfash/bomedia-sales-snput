"use client";

import { useEffect, useState, useId } from "react";
import { TrendingUp, TrendingDown, DollarSign, ShoppingBag, AlertCircle, BarChart2, Percent } from "lucide-react";
import { motion, animate } from "framer-motion";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { StatTile } from "@/components/stat-tile";
import { metricsStyles as styles } from "@/app/theme";

const cardContainerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};
const cardItemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const } },
};

function Sparkline({ data, color = "currentColor", classic = false }: { data: number[]; color?: string; classic?: boolean }) {
  const uid = useId();
  const gradId = `spark-fill-${uid.replace(/:/g, "")}`;
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 100;
  const h = 32;
  // Keep the line a few units inside the box, so its thickness is never cut off at the top or bottom.
  const pad = 3;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = pad + (1 - (v - min) / range) * (h - 2 * pad);
    return `${x},${y}`;
  });
  const polyline = pts.join(" ");
  const fill = `M${pts[0]} L${pts.join(" L")} L${w},${h} L0,${h} Z`;

  return (
    <Box component="svg" viewBox={`0 0 ${w} ${h}`} sx={[styles.sparkSvg, classic && styles.sparkSvgClassic]} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fill} fill={`url(#${gradId})`} />
      <polyline points={polyline} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </Box>
  );
}

/** Counts a number up from zero, the same way the headline figure does. */
function useCountUp(value: number) {
  const [animated, setAnimated] = useState(0);
  useEffect(() => {
    const controls = animate(0, value, { duration: 0.8, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => setAnimated(v) });
    return () => controls.stop();
  }, [value]);
  return animated;
}

/** One of the small figures along the bottom of the headline card. */
export interface HeroStat {
  label: string;
  value: number;
  /** Shown instead of the money format, for example a percentage. */
  displayValue?: string;
  change?: string;
  isPositive?: boolean;
  hint?: string;
}

function StatFigure({ stat }: { stat: HeroStat }) {
  const animated = useCountUp(stat.value);
  const shown = stat.displayValue
    ? (/^[\d.]+%$/.test(stat.displayValue) ? `${animated.toFixed(1)}%` : stat.displayValue)
    : `₦${Math.round(animated).toLocaleString()}`;
  return (
    <Box sx={styles.stat}>
      <Typography component="span" sx={styles.statLabel}>{stat.label}</Typography>
      <Typography component="p" sx={styles.statValue}>{shown}</Typography>
      {stat.change && (
        <Box component="span" sx={[styles.statChange, stat.isPositive ? styles.statUp : styles.statDown]}>
          {stat.isPositive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {stat.change}
        </Box>
      )}
      {stat.hint && <Typography component="span" sx={styles.statHint}>{stat.hint}</Typography>}
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
  /** Small figures shown along the bottom of the headline card. */
  stats?: HeroStat[];
  /** The desktop look of the headline card: light tint, dark figures, no stats footer. */
  classic?: boolean;
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
  stats,
  classic = false,
}: MetricCardProps) {
  const isHero = variant === 'hero';
  const modern = isHero && !classic;
  const isAlert = variant === 'alert' && value > 0;

  const animatedNum = useCountUp(value);

  const animatedDisplay = displayValue
    ? (/^[\d.]+%$/.test(displayValue) ? `${animatedNum.toFixed(1)}%` : displayValue)
    : `₦${Math.round(animatedNum).toLocaleString(undefined, { minimumFractionDigits: 0 })}`;

  const trendIcon = isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />;

  return (
    <Box sx={[styles.card, modern && styles.cardHero, isHero && classic && styles.cardHeroClassic, isAlert && styles.cardAlert]}>
      {isHero && <Box sx={[styles.glow, classic && styles.glowClassic]} />}

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
          <Typography variant="overline" sx={[styles.title, modern && styles.titleHero]}>
            {title}
          </Typography>
        </Box>
        <Box sx={[styles.icon, modern ? styles.iconHero : isHero ? styles.iconHeroClassic : isAlert ? styles.iconAlert : styles.iconDefault]}>
          <Icon size={isHero ? 20 : 16} />
        </Box>
      </Box>

      <Box sx={styles.body}>
        <Typography component="p" sx={[styles.value, isHero ? styles.valueHero : styles.valueDefault, isHero && classic && styles.valueHeroClassic]}>
          {animatedDisplay}
        </Typography>
        {(isHero && change) && (
          <Box sx={styles.trendRow}>
            <Box sx={[styles.trendChip, isPositive ? styles.trendUp : styles.trendDown, modern && styles.trendHero]}>
              {trendIcon}
              {change}
            </Box>
          </Box>
        )}
      </Box>

      {isHero && sparkData && sparkData.length >= 2 && (
        <Box sx={[styles.spark, classic && styles.sparkClassic]}>
          <Sparkline data={sparkData} classic={classic} />
        </Box>
      )}

      {modern && stats && stats.length > 0 && (
        <Box sx={styles.stats}>
          {stats.map((stat) => <StatFigure key={stat.label} stat={stat} />)}
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

const naira = (amount: number) => `₦${Math.round(amount).toLocaleString()}`;
const customers = (count: number) => `${count} customer${count === 1 ? "" : "s"}`;

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
  /** What is owed from today's jobs and from the last 7 days. */
  owedToday: { amount: number; customers: number };
  owedWeek: { amount: number; customers: number };
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
  owedToday,
  owedWeek,
}: DashboardMetricsProps) {
  const marginChange = `${Math.abs(Math.round(grossMarginPct - prevGrossMarginPct))}pp`;
  const isMarginUp = grossMarginPct >= prevGrossMarginPct;

  const marginHint = totalSales > 0 ? (grossMarginPct >= 40 ? "Healthy margin" : grossMarginPct >= 20 ? "Watch expenses" : "Margin is tight") : "No sales yet";
  const marginDisplay = totalSales > 0 ? `${grossMarginPct.toFixed(1)}%` : "—%";
  const marginDelta = totalSales > 0 ? marginChange : undefined;
  const salesCard = (classic: boolean) => (
    <MetricCard
      variant="hero"
      title="Total Sales"
      value={totalSales}
      change={salesChange}
      isPositive={isSalesUp}
      icon={ShoppingBag}
      sparkData={sparkData}
      classic={classic}
      stats={classic ? undefined : [
        { label: "Expenses", value: totalExpenses, change: expensesChange, isPositive: isExpensesDown },
        { label: "Net profit", value: netProfit, change: profitChange, isPositive: isProfitUp },
        { label: "Margin", value: grossMarginPct, displayValue: marginDisplay, change: marginDelta, isPositive: isMarginUp, hint: marginHint },
      ]}
    />
  );

  return (
    <>
      {/* Below 1200px: the headline card with the owed row. */}
      <Box sx={styles.compactOnly}>
        <Box component={motion.div} variants={cardContainerVariants} initial="hidden" animate="show" sx={styles.grid}>
          <Box component={motion.div} variants={cardItemVariants} sx={styles.heroCell}>{salesCard(false)}</Box>
          <Box component={motion.div} variants={cardItemVariants} sx={styles.owedRow}>
            <StatTile compact tone={outstandingDebt > 0 ? "error" : "neutral"} label="Total owed" value={naira(outstandingDebt)}
              caption={unpaidCount > 0 ? `${unpaidCount} unpaid jobs` : "All cleared ✓"} />
            <StatTile compact tone={owedToday.amount > 0 ? "warning" : "neutral"} label="Owed today" value={naira(owedToday.amount)} caption={customers(owedToday.customers)} />
            <StatTile compact tone={owedWeek.amount > 0 ? "error" : "neutral"} label="Owed 7 days" value={naira(owedWeek.amount)} caption={customers(owedWeek.customers)} />
          </Box>
        </Box>
      </Box>

      {/* 1200px and up: the classic row of separate cards, with the two debt tiles under it. */}
      <Box sx={styles.desktopOnly}>
        <Box component={motion.div} variants={cardContainerVariants} initial="hidden" animate="show" sx={styles.classicGrid}>
          <Box component={motion.div} variants={cardItemVariants} sx={styles.classicHeroCell}>{salesCard(true)}</Box>
          <Box component={motion.div} variants={cardItemVariants} sx={styles.classicCell}>
            <MetricCard title="Expenses" value={totalExpenses} change={expensesChange} isPositive={isExpensesDown} icon={DollarSign} />
          </Box>
          <Box component={motion.div} variants={cardItemVariants} sx={styles.classicCell}>
            <MetricCard title="Net Profit" value={netProfit} change={profitChange} isPositive={isProfitUp} icon={BarChart2} />
          </Box>
          <Box component={motion.div} variants={cardItemVariants} sx={styles.classicCell}>
            <MetricCard variant="alert" title="Outstanding Debt" value={outstandingDebt} icon={AlertCircle}
              subLabel={unpaidCount > 0 ? `${unpaidCount} unpaid jobs` : "All cleared ✓"} />
          </Box>
          <Box component={motion.div} variants={cardItemVariants} sx={styles.classicCell}>
            <MetricCard title="Gross Margin" value={grossMarginPct} displayValue={marginDisplay} change={marginDelta} isPositive={isMarginUp} icon={Percent} subLabel={marginHint} />
          </Box>
        </Box>
        <Box sx={styles.classicDebtTiles}>
          <StatTile tone={owedToday.amount > 0 ? "warning" : "neutral"} label="Owed from today's jobs" value={naira(owedToday.amount)} caption={customers(owedToday.customers)} />
          <StatTile tone={owedWeek.amount > 0 ? "error" : "neutral"} label="Owed from the last 7 days" value={naira(owedWeek.amount)} caption={customers(owedWeek.customers)} />
        </Box>
      </Box>
    </>
  );
}

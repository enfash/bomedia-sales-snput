"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, DollarSign, ShoppingBag, AlertCircle, BarChart2, Percent } from "lucide-react";
import { motion, animate } from "framer-motion";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

const cardContainerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};
const cardItemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const } },
};

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
  const fill = `M${pts[0]} L${pts.join(" L")} L${w},${h} L0,${h} Z`;

  return (
    <Box component="svg" viewBox={`0 0 ${w} ${h}`} sx={{ width: '100%', height: 32, overflow: 'visible' }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fill} fill="url(#spark-fill)" />
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

  return (
    <Box
      sx={{
        position: 'relative',
        overflow: 'hidden',
        height: '100%',
        bgcolor: isHero ? 'primary.main' : 'background.paper',
        opacity: isHero ? 0.97 : 1, // approximate bg-primary/[0.03] -> wait, isHero in tailwind was bg-primary/[0.03] which is almost transparent. Let's use alpha.
        backgroundColor: isHero ? 'rgba(var(--mui-palette-primary-mainChannel) / 0.03)' : 'background.paper',
        borderRadius: "16px",
        boxShadow: 1,
        border: '1px solid',
        borderColor: isHero ? 'rgba(var(--mui-palette-primary-mainChannel) / 0.2)' : (isAlert ? 'error.main' : 'divider'),
        p: { xs: 1.5, sm: 2.5 },
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        transition: 'box-shadow 0.3s, transform 0.3s',
        '&:hover': {
          '@media (hover: hover)': {
            boxShadow: 4,
            transform: 'translateY(-4px)',
          }
        },
        ...(isAlert && {
          borderColor: 'error.main',
          outline: '2px solid',
          outlineColor: 'rgba(var(--mui-palette-error-mainChannel) / 0.2)',
        })
      }}
    >
      {isHero && (
        <Box sx={{
          position: 'absolute', right: -16, top: -16, height: 112, width: 112,
          borderRadius: '50%', bgcolor: 'rgba(var(--mui-palette-primary-mainChannel) / 0.05)',
          filter: 'blur(24px)'
        }} />
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: { xs: 1, sm: 2 }, gap: 0.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          {isAlert && (
            <Box
              component={motion.div}
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ repeat: Infinity, duration: 1.2 }}
              sx={{ width: { xs: 6, sm: 8 }, height: { xs: 6, sm: 8 }, borderRadius: '50%', bgcolor: 'error.main', boxShadow: '0 0 4px rgba(239,68,68,0.5)', flexShrink: 0 }}
            />
          )}
          <Typography sx={{ fontSize: { xs: '9px', sm: '10px' }, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title}
          </Typography>
        </Box>
        <Box
          sx={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            borderRadius: { xs: 1.5, sm: 2 },
            width: isHero ? 40 : { xs: 24, sm: 40 }, height: isHero ? 40 : { xs: 24, sm: 40 },
            ...(isHero ? { bgcolor: 'primary.main', color: 'primary.contrastText', boxShadow: '0 4px 12px rgba(var(--mui-palette-primary-mainChannel) / 0.2)' }
              : isAlert ? { bgcolor: 'rgba(var(--mui-palette-error-mainChannel) / 0.1)', color: 'error.main' }
              : { bgcolor: 'action.hover', color: 'text.primary' })
          }}
        >
          <Icon size={isHero ? 20 : 16} />
        </Box>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Typography sx={{ fontWeight: 900, letterSpacing: '-0.02em', color: 'text.primary', lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: isHero ? { xs: '1.5rem', sm: '2.25rem' } : { xs: '1rem', sm: '1.25rem', lg: '1.5rem' } }}>
          {animatedDisplay}
        </Typography>
        {(isHero && change) && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: { xs: 0.5, sm: 1 } }}>
            <Box sx={{
              display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '10px', fontWeight: 700, px: 1, py: 0.25, borderRadius: 10, border: '1px solid',
              ...(isPositive ? { bgcolor: 'rgba(16,185,129,0.1)', color: '#059669', borderColor: 'rgba(16,185,129,0.2)' }
                : { bgcolor: 'rgba(239,68,68,0.1)', color: '#dc2626', borderColor: 'rgba(239,68,68,0.2)' })
            }}>
              {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {change}
            </Box>
          </Box>
        )}
      </Box>

      {isHero && sparkData && sparkData.length >= 2 && (
        <Box sx={{ mt: 1.5, opacity: 0.6 }}>
          <Sparkline data={sparkData} color="var(--primary)" />
        </Box>
      )}

      {!isHero && (change || subLabel) && (
        <Box sx={{ mt: { xs: 1, sm: 2 }, pt: { xs: 1, sm: 2 }, borderTop: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography sx={{ fontSize: { xs: '8px', sm: '10px' }, fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase' }}>
            {subLabel || "Performance"}
          </Typography>
          {change && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.25, sm: 0.5 }, fontSize: { xs: '9px', sm: '0.75rem' }, fontWeight: 700, color: isPositive ? '#059669' : '#dc2626' }}>
              {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
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
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'repeat(2, 1fr)', lg: 'repeat(6, 1fr)' },
        gap: { xs: 0.75, sm: 2 }
      }}
    >
      <Box component={motion.div} variants={cardItemVariants} sx={{ gridColumn: { xs: 'span 2', lg: 'span 2' } }}>
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

      <Box component={motion.div} variants={cardItemVariants} sx={{ gridColumn: 'span 1' }}>
        <MetricCard
          title="Expenses"
          value={totalExpenses}
          change={expensesChange}
          isPositive={isExpensesDown}
          icon={DollarSign}
        />
      </Box>

      <Box component={motion.div} variants={cardItemVariants} sx={{ gridColumn: 'span 1' }}>
        <MetricCard
          title="Net Profit"
          value={netProfit}
          change={profitChange}
          isPositive={isProfitUp}
          icon={BarChart2}
        />
      </Box>

      <Box component={motion.div} variants={cardItemVariants} sx={{ gridColumn: 'span 1' }}>
        <MetricCard
          variant="alert"
          title="Outstanding Debt"
          value={outstandingDebt}
          icon={AlertCircle}
          subLabel={unpaidCount > 0 ? `${unpaidCount} unpaid jobs` : "All cleared ✓"}
        />
      </Box>

      <Box component={motion.div} variants={cardItemVariants} sx={{ gridColumn: 'span 1' }}>
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

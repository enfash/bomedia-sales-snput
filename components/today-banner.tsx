"use client";

import type { ReactNode } from "react";
import { useSyncStore } from "@/lib/store";
import { RefreshCw, TrendingUp } from "lucide-react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { dashboardStyles, todayStyles as styles } from "@/app/theme";

interface TodayBannerProps {
  jobCount: number;
  revenue: number;
  salesCount?: number;
  sx?: any;
}

type TileTone = typeof styles.sales;

/** One stat tile; the three tiles differ only by tone and content. */
function StatTile({ tone, label, caption, children }: { tone: TileTone; label: string; caption: ReactNode; children: ReactNode }) {
  return (
    <Box sx={[styles.tile, tone.root]}>
      <Box sx={[styles.stripe, tone.stripe]} />
      <Box sx={[styles.blob, tone.blob]} />
      <Typography variant="overline" sx={[styles.label, tone.label]}>{label}</Typography>
      {children}
      {caption}
    </Box>
  );
}

export function TodayBanner({ jobCount, revenue, salesCount, sx }: TodayBannerProps) {
  const { pendingQueue, syncStatus } = useSyncStore();

  const isSyncing = syncStatus === "syncing";
  const hasPending = pendingQueue.length > 0;

  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "short",
  });

  const revenueDisplay =
    revenue >= 1000000
      ? `₦${(revenue / 1000000).toFixed(1)}M`
      : revenue >= 1000
      ? `₦${(revenue / 1000).toFixed(1)}k`
      : `₦${revenue.toLocaleString()}`;

  return (
    <Box sx={{ ...styles.root, ...sx }}>
      <Box sx={styles.heading}>
        <Box>
          <Typography variant="overline" sx={styles.date}>{dateLabel}</Typography>
          <Typography variant="h2" component="h2" sx={styles.title}>Today at a glance</Typography>
        </Box>

        {/* LIVE / Sync badge */}
        <Box sx={[styles.badge, isSyncing ? styles.badgeSyncing : hasPending ? styles.badgePending : styles.badgeLive]}>
          {isSyncing ? (
            <Box component="span" sx={[dashboardStyles.iconSpan, dashboardStyles.refreshing]}>
              <RefreshCw size={12} />
            </Box>
          ) : (
            <Box component="span" sx={styles.badgeDot} />
          )}
          {isSyncing ? "Syncing" : hasPending ? `${pendingQueue.length} pending` : "Live"}
        </Box>
      </Box>

      <Box sx={styles.tiles}>
        <StatTile tone={styles.sales} label="Sales" caption={<Typography variant="caption" color="text.secondary">transactions</Typography>}>
          <Typography variant="h2" component="p" sx={styles.number}>{salesCount ?? jobCount}</Typography>
        </StatTile>

        <StatTile tone={styles.jobs} label="Jobs" caption={<Typography variant="caption" color="text.secondary">logged today</Typography>}>
          <Typography variant="h2" component="p" sx={styles.number}>{String(jobCount).padStart(2, "0")}</Typography>
        </StatTile>

        <StatTile
          tone={styles.revenue}
          label="Revenue"
          caption={<Typography variant="caption" component="div" sx={styles.trend}><TrendingUp size={12} /> today</Typography>}
        >
          <Typography variant="h4" component="p" sx={styles.money}>{revenueDisplay}</Typography>
        </StatTile>
      </Box>
    </Box>
  );
}

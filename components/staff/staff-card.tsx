"use client";

import { useState } from "react";
import { Box, ButtonBase, Paper, Typography } from "@mui/material";
import { AlertTriangle, BarChart3, ChevronDown, Clock, TrendingUp, Wallet } from "lucide-react";
import { staffManagerStyles as styles } from "@/app/theme";
import { avatarBg, fmtMoney, initials, parseAmt, type StaffStats } from "./staff-utils";

const JOB_STATUS_STYLE = { Paid: styles.jobPaid, "Part-payment": styles.jobPart } as const;

export function StaffCard({ stats }: { stats: StaffStats }) {
  const [expanded, setExpanded] = useState(false);

  const collectionColor =
    stats.collectionRate >= 80 ? "success.main" : stats.collectionRate >= 50 ? "warning.dark" : "error.main";

  const statItems = [
    { label: "Collected", val: fmtMoney(stats.totalCollected), icon: Wallet, color: "success.main" },
    { label: "Debt Left", val: fmtMoney(stats.totalDebt), icon: AlertTriangle, color: stats.totalDebt > 0 ? "error.main" : "text.disabled" },
    { label: "Collection %", val: `${stats.collectionRate.toFixed(0)}%`, icon: TrendingUp, color: collectionColor },
    { label: "Top Material", val: stats.topMaterial || "—", icon: BarChart3, color: "primary.main" },
  ];

  return (
    <Paper variant="outlined" sx={styles.card}>
      <ButtonBase onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} sx={styles.cardHeader}>
        <Box sx={[styles.avatar, { bgcolor: avatarBg(stats.name) }]}>{initials(stats.name)}</Box>

        <Box sx={styles.grow}>
          <Box sx={styles.nameRow}>
            <Typography variant="h6" component="span" sx={styles.ellipsis}>{stats.name}</Typography>
            {stats.isOnline && (
              <Box component="span" sx={[styles.pill, styles.pillOnline]}>
                <Box component="span" sx={styles.dot} />
                Online
              </Box>
            )}
          </Box>
          <Typography variant="caption" color="text.secondary" sx={styles.block}>
            {stats.totalJobs} total jobs · {stats.jobsToday} today
          </Typography>
        </Box>

        <Box sx={styles.right}>
          <Typography variant="h6" component="p">{fmtMoney(stats.totalRevenue)}</Typography>
          <Typography variant="caption" color="text.secondary">all time revenue</Typography>
        </Box>

        <Box component="span" sx={[styles.chevron, expanded && styles.chevronOpen]}>
          <ChevronDown size={16} />
        </Box>
      </ButtonBase>

      <Box sx={styles.statsGrid}>
        {statItems.map(({ label, val, icon: Icon, color }) => (
          <Box key={label} sx={styles.statCell}>
            <Box color={color} sx={styles.statIcon}><Icon size={14} /></Box>
            <Typography variant="overline" color="text.secondary" sx={styles.block}>{label}</Typography>
            <Typography variant="h6" color={color} sx={styles.ellipsis}>{val}</Typography>
          </Box>
        ))}
      </Box>

      <Box sx={[styles.expand, expanded && styles.expandOpen]}>
        <Box sx={styles.expandInner}>
          <Box sx={styles.expandBody}>
            <Box sx={styles.todayGrid}>
              {[
                { label: "Today's Jobs", val: String(stats.jobsToday) },
                { label: "Today's Revenue", val: fmtMoney(stats.revenueToday) },
              ].map(({ label, val }) => (
                <Paper key={label} variant="outlined" sx={styles.todayCell}>
                  <Typography variant="overline" color="text.secondary" sx={styles.block}>{label}</Typography>
                  <Typography variant="h4" component="p">{val}</Typography>
                </Paper>
              ))}
            </Box>

            {stats.recentJobs.length > 0 && (
              <>
                <Typography variant="overline" color="text.secondary">Recent Jobs (last 5)</Typography>
                <Box sx={styles.jobs}>
                  {stats.recentJobs.slice(0, 5).map((job: any, i: number) => {
                    const client = job["CLIENT NAME"] || job["Client Name"] || "—";
                    const desc = job["JOB DESCRIPTION"] || job["Job Description"] || "—";
                    const amt = parseAmt(job["AMOUNT (₦)"] || job["Amount (₦)"]);
                    const status = job["PAYMENT STATUS"] || "Unpaid";
                    const statusStyle = JOB_STATUS_STYLE[status as keyof typeof JOB_STATUS_STYLE] ?? styles.jobUnpaid;
                    return (
                      <Paper key={i} variant="outlined" sx={styles.jobRow}>
                        <Box sx={styles.grow}>
                          <Typography variant="body2" sx={[styles.bold, styles.ellipsis]}>{client}</Typography>
                          <Typography variant="caption" color="text.secondary" sx={[styles.block, styles.ellipsis]}>{desc}</Typography>
                        </Box>
                        <Box sx={styles.jobMeta}>
                          <Box component="span" sx={[styles.jobStatus, statusStyle]}>{status}</Box>
                          <Typography variant="body2" sx={styles.bold}>{fmtMoney(amt)}</Typography>
                        </Box>
                      </Paper>
                    );
                  })}
                </Box>
              </>
            )}

            {stats.lastLogin && (
              <Box sx={styles.lastLogin}>
                <Clock size={12} />
                <Typography variant="caption">Last login: {stats.lastLogin}</Typography>
              </Box>
            )}
          </Box>
        </Box>
      </Box>
    </Paper>
  );
}

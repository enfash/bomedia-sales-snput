"use client";

import { useSyncStore } from "@/lib/store";
import { RefreshCw, TrendingUp } from "lucide-react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import { alpha } from "@mui/material/styles";

interface TodayBannerProps {
  jobCount: number;
  revenue: number;
  salesCount?: number;
  sx?: any;
}

export function TodayBanner({ jobCount, revenue, salesCount, sx }: TodayBannerProps) {
  const { pendingQueue, syncStatus } = useSyncStore();
  const theme = useTheme();
  const primaryMain = theme.palette.primary.main; // #2e388d for admin

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
    <Box sx={{ mb: 3, ...sx }}>
      {/* Heading Row */}
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 2 }}>
        <Box>
          <Typography sx={{ fontSize: "0.75rem", fontWeight: 600, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.1em", mb: 0.5 }}>
            {dateLabel}
          </Typography>
          <Typography sx={{ fontSize: { xs: "1.5rem", sm: "1.875rem" }, fontWeight: 900, letterSpacing: "-0.025em", color: "text.primary", lineHeight: 1 }}>
            Today at a glance
          </Typography>
        </Box>

        {/* LIVE / Sync badge */}
        <Stack
          direction="row"
          sx={{
            alignItems: "center",
            gap: 0.75,
            px: 1.5,
            py: 0.75,
            borderRadius: 99,
            fontSize: "0.6875rem",
            fontWeight: "bold",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            border: "1px solid",
            transition: "all 0.2s ease",
            ...(isSyncing
              ? { bgcolor: alpha("#3b82f6", 0.1), color: "#2563eb", borderColor: alpha("#3b82f6", 0.2) }
              : hasPending
              ? { bgcolor: alpha("#f59e0b", 0.1), color: "#d97706", borderColor: alpha("#f59e0b", 0.2) }
              : { bgcolor: alpha(primaryMain, 0.1), color: primaryMain, borderColor: alpha(primaryMain, 0.2) }
            )
          }}
        >
          {isSyncing ? (
            <RefreshCw size={12} style={{ animation: "spin 1s linear infinite" }} />
          ) : (
            <Box
              sx={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                bgcolor: hasPending ? "#f59e0b" : "primary.main",
              }}
            />
          )}
          {isSyncing ? "Syncing" : hasPending ? `${pendingQueue.length} pending` : "Live"}
        </Stack>
      </Stack>

      {/* Stat Tiles */}
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1.5 }}>
        {/* Sales */}
        <Box
          sx={{
            position: "relative",
            bgcolor: "background.paper",
            border: "1px solid",
            borderColor: "rgba(59, 130, 246, 0.15)",
            borderRadius: "16px",
            p: 2,
            display: "flex",
            flexDirection: "column",
            gap: 0.5,
            boxShadow: 1,
            overflow: "hidden",
            "&:hover": { boxShadow: 2 },
            transition: "box-shadow 0.2s",
          }}
        >
          <Box sx={{ position: "absolute", top: 0, left: 0, width: 4, height: "100%", bgcolor: "#4A56C4", borderTopLeftRadius: 16, borderBottomLeftRadius: 16 }} />
          <Box sx={{ position: "absolute", top: -16, right: -16, width: 56, height: 56, borderRadius: "50%", bgcolor: alpha("#4A56C4", 0.06) }} />
          <Typography sx={{ fontSize: "0.625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "#4A56C4", position: "relative", zIndex: 10 }}>Sales</Typography>
          <Typography sx={{ fontSize: { xs: "1.5rem", sm: "1.875rem" }, fontWeight: 900, color: "text.primary", lineHeight: 1, position: "relative", zIndex: 10 }}>
            {salesCount ?? jobCount}
          </Typography>
          <Typography sx={{ fontSize: "0.5625rem", color: "text.secondary", fontWeight: 600 }}>transactions</Typography>
        </Box>

        {/* Jobs */}
        <Box
          sx={{
            position: "relative",
            bgcolor: "background.paper",
            border: "1px solid",
            borderColor: "rgba(139, 92, 246, 0.15)",
            borderRadius: "16px",
            p: 2,
            display: "flex",
            flexDirection: "column",
            gap: 0.5,
            boxShadow: 1,
            overflow: "hidden",
            "&:hover": { boxShadow: 2 },
            transition: "box-shadow 0.2s",
          }}
        >
          <Box sx={{ position: "absolute", top: 0, left: 0, width: 4, height: "100%", bgcolor: primaryMain, borderTopLeftRadius: 16, borderBottomLeftRadius: 16 }} />
          <Box sx={{ position: "absolute", top: -16, right: -16, width: 56, height: 56, borderRadius: "50%", bgcolor: alpha(primaryMain, 0.06) }} />
          <Typography sx={{ fontSize: "0.625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: primaryMain, position: "relative", zIndex: 10 }}>Jobs</Typography>
          <Typography sx={{ fontSize: { xs: "1.5rem", sm: "1.875rem" }, fontWeight: 900, color: "text.primary", lineHeight: 1, position: "relative", zIndex: 10 }}>
            {String(jobCount).padStart(2, "0")}
          </Typography>
          <Typography sx={{ fontSize: "0.5625rem", color: "text.secondary", fontWeight: 600 }}>logged today</Typography>
        </Box>

        {/* Revenue */}
        <Box
          sx={{
            position: "relative",
            bgcolor: "background.paper",
            border: "1px solid",
            borderColor: "rgba(16, 185, 129, 0.15)",
            borderRadius: "16px",
            p: 2,
            display: "flex",
            flexDirection: "column",
            gap: 0.5,
            boxShadow: 1,
            overflow: "hidden",
            "&:hover": { boxShadow: 2 },
            transition: "box-shadow 0.2s",
          }}
        >
          <Box sx={{ position: "absolute", top: 0, left: 0, width: 4, height: "100%", bgcolor: "#10b981", borderTopLeftRadius: 16, borderBottomLeftRadius: 16 }} />
          <Box sx={{ position: "absolute", top: -16, right: -16, width: 56, height: 56, borderRadius: "50%", bgcolor: "rgba(16, 185, 129, 0.05)" }} />
          <Typography sx={{ fontSize: "0.625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "#059669", position: "relative", zIndex: 10 }}>Revenue</Typography>
          <Typography sx={{ fontSize: { xs: "1.125rem", sm: "1.25rem" }, fontWeight: 900, color: "text.primary", lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", position: "relative", zIndex: 10 }}>
            {revenueDisplay}
          </Typography>
          <Stack direction="row" sx={{ alignItems: "center", gap: 0.5, fontSize: "0.5625rem", color: "#059669", fontWeight: "bold" }}>
            <TrendingUp size={12} /> today
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}

"use client";
import { LoadingAnimation } from "@/components/loading-animation";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  Plus,
  Receipt,
  BarChart3,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  Zap,
  ChevronRight,
  Ruler,
  TrendingUp,
  Wallet,
  ArrowUpRight,
  MessageCircle,
  ShoppingBag,
  Users,
  Package,
} from "lucide-react";
import { motion } from "framer-motion";
import { useSyncStore } from "@/lib/store";
import { OutstandingDebtChart } from "@/components/dashboard-charts";
import { DebtorPaymentModal } from "@/components/debtor-payment-modal";
import { processDebtData } from "@/lib/financial-utils";
import { AnimatedNumber } from "@/components/animated-number";
import {
  isSameDay,
  subDays,
  isWithinInterval,
  format,
} from "date-fns";

// MUI imports
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Skeleton from "@mui/material/Skeleton";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Avatar from "@mui/material/Avatar";
import Badge from "@mui/material/Badge";
import IconButton from "@mui/material/IconButton";
import LinearProgress from "@mui/material/LinearProgress";
import { alpha, useTheme } from "@mui/material/styles";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const parseAmount = (val: any): number => {
  if (!val) return 0;
  return parseFloat(String(val).replace(/[₦,\s]/g, "")) || 0;
};

const fmtMoney = (n: number) =>
  n >= 1_000_000
    ? `₦${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
    ? `₦${(n / 1_000).toFixed(0)}k`
    : `₦${n.toLocaleString()}`;

const fmtMoneyFull = (n: number) =>
  `₦${n.toLocaleString(undefined, { minimumFractionDigits: 0 })}`;

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const sectionVariants = {
  hidden: { opacity: 0, y: 16 },
  show: (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, delay, ease: [0.16, 1, 0.3, 1] as const },
  }),
};

// ─── Shift Hero (mobile) ──────────────────────────────────────────────────────

function ShiftHero({
  cashierName,
  jobsToday,
  revenueToday,
  collectedToday,
  pendingCount,
  inProgressCount,
}: {
  cashierName: string;
  jobsToday: number;
  revenueToday: number;
  collectedToday: number;
  pendingCount: number;
  inProgressCount: number;
}) {
  const theme = useTheme();
  const progressPct =
    revenueToday > 0
      ? Math.min(100, (collectedToday / revenueToday) * 100)
      : 0;

  return (
    <Paper
      elevation={0}
      sx={{
        position: "relative",
        overflow: "hidden",
        borderRadius: "16px",
        bgcolor: "primary.main",
        color: "primary.contrastText",
        p: 3,
        boxShadow: `0 16px 32px ${alpha(theme.palette.primary.main, 0.25)}`,
      }}
    >
      {/* Decorative background shapes */}
      <Box
        sx={{
          position: "absolute",
          top: -32,
          right: -32,
          width: 160,
          height: 160,
          borderRadius: "50%",
          bgcolor: "rgba(255, 255, 255, 0.1)",
          pointerEvents: "none",
        }}
      />
      <Box
        sx={{
          position: "absolute",
          bottom: -48,
          left: -24,
          width: 144,
          height: 144,
          borderRadius: "50%",
          bgcolor: "rgba(0, 0, 0, 0.15)",
          pointerEvents: "none",
        }}
      />

      <Stack sx={{ position: "relative", gap: 3.5 }}>
        {/* Top row */}
        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <Box>
            <Typography sx={{ color: "rgba(255, 255, 255, 0.7)", fontSize: "0.75rem", fontWeight: 700, mb: 0.5 }}>
              {getGreeting()},
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 900, lineHeight: 1 }}>
              {cashierName || "Cashier"} 👋
            </Typography>
            <Typography sx={{ color: "rgba(255, 255, 255, 0.7)", fontSize: "0.625rem", fontWeight: 500, mt: 0.5 }}>
              {format(new Date(), "EEEE, MMMM d")}
            </Typography>
          </Box>

          {pendingCount > 0 && (
            <Chip
              label={`${pendingCount} syncing`}
              size="small"
              sx={{
                bgcolor: "rgba(255, 255, 255, 0.2)",
                color: "#ffffff",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                fontWeight: 900,
                fontSize: "0.625rem",
                height: 24,
                "& .MuiChip-label": { px: 1 },
              }}
            />
          )}
        </Stack>

        {/* Stats Grid */}
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1 }}>
          {[
            { label: "Jobs", val: String(jobsToday) },
            { label: "Revenue", val: fmtMoney(revenueToday) },
            { label: "Collected", val: fmtMoney(collectedToday) },
            { label: "In Progress", val: String(inProgressCount), highlight: inProgressCount > 0 },
          ].map(({ label, val, highlight }) => (
            <Box
              key={label}
              sx={{
                bgcolor: highlight ? "rgba(255, 255, 0, 0.15)" : "rgba(255, 255, 255, 0.15)",
                border: "1px solid",
                borderColor: highlight ? "rgba(255, 255, 0, 0.25)" : "rgba(255, 255, 255, 0.1)",
                borderRadius: "16px",
                p: 1.5,
                textAlign: "center",
              }}
            >
              <Typography sx={{ color: "rgba(255, 255, 255, 0.7)", fontSize: "0.5rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em", mb: 0.5 }}>
                {label}
              </Typography>
              <Typography sx={{ fontSize: "0.875rem", fontWeight: 900, color: highlight ? "#ffd700" : "#ffffff", lineHeight: 1 }}>
                {val}
              </Typography>
            </Box>
          ))}
        </Box>

        {/* Collection progress */}
        <Box>
          <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1 }}>
            <Typography sx={{ color: "rgba(255, 255, 255, 0.7)", fontSize: "0.5625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Collection Rate
            </Typography>
            <Typography sx={{ fontSize: "0.625rem", fontWeight: 900 }}>
              {progressPct.toFixed(0)}%
            </Typography>
          </Stack>
          <Box sx={{ width: "100%", height: 8, bgcolor: "rgba(255, 255, 255, 0.2)", borderRadius: "10px", overflow: "hidden" }}>
            <Box
              sx={{
                height: "100%",
                borderRadius: "10px",
                bgcolor: progressPct >= 80 ? "#10b981" : progressPct >= 50 ? "#ffd700" : "rgba(255, 255, 255, 0.6)",
                width: `${progressPct}%`,
                transition: "width 0.7s ease-out",
              }}
            />
          </Box>
          <Typography sx={{ color: "rgba(255, 255, 255, 0.7)", fontSize: "0.5625rem", fontWeight: 500, mt: 1 }}>
            {fmtMoneyFull(revenueToday - collectedToday)} still outstanding
          </Typography>
        </Box>
      </Stack>
    </Paper>
  );
}

// ─── Action Grid (mobile primary actions) ─────────────────────────────────────

const actionsList = [
  { label: "New Sale", sub: "Log a job", href: "/cashier/new-entry", icon: Plus, primary: true },
  { label: "Quick Check", sub: "Test a roll", href: "/quick-check", icon: Ruler },
  { label: "Records", sub: "Today's jobs", href: "/cashier/records", icon: BarChart3 },
  { label: "Log Expense", sub: "Record payout", href: "/cashier/expenses", icon: Receipt },
  { label: "Estimator", sub: "Price a job", href: "/cashier/estimator", icon: Zap },
  { label: "Customers", sub: "View profiles", href: "/cashier/customers", icon: Users },
];

function ActionGrid() {
  const theme = useTheme();
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1.25 }}>
      {actionsList.map(({ label, sub, href, icon: Icon, primary }) => (
        <Link key={href} href={href} style={{ textDecoration: "none" }}>
          <motion.div whileTap={{ scale: 0.97 }}>
            <Paper
              sx={{
                borderRadius: "16px",
                p: 2,
                display: "flex",
                flexDirection: "column",
                gap: 1.5,
                transition: "background-color 0.2s ease, border-color 0.2s ease",
                cursor: "pointer",
                ...(primary
                  ? {
                      bgcolor: "primary.main",
                      color: "primary.contrastText",
                      boxShadow: `0 8px 16px ${alpha(theme.palette.primary.main, 0.15)}`,
                    }
                  : {
                      bgcolor: "background.paper",
                      border: "1px solid",
                      borderColor: "divider",
                      "&:hover": {
                        bgcolor: alpha(theme.palette.primary.main, 0.04),
                        borderColor: alpha(theme.palette.primary.main, 0.2),
                      },
                    }),
              }}
            >
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: "10px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  bgcolor: primary ? "rgba(255, 255, 255, 0.25)" : alpha(theme.palette.primary.main, 0.08),
                }}
              >
                <Icon size={16} color={primary ? "#ffffff" : theme.palette.primary.main} />
              </Box>
              <Box>
                <Typography sx={{ fontSize: "0.6875rem", fontWeight: 800, lineHeight: 1 }}>
                  {label}
                </Typography>
                <Typography sx={{ fontSize: "0.5625rem", mt: 0.25, color: primary ? "rgba(255, 255, 255, 0.7)" : "text.secondary" }}>
                  {sub}
                </Typography>
              </Box>
            </Paper>
          </motion.div>
        </Link>
      ))}
    </Box>
  );
}

// ─── Pending Debts Row ────────────────────────────────────────────────────────

function DebtRow({
  client,
  amount,
  description,
  contact,
  onClick,
}: {
  client: string;
  amount: number;
  description: string;
  contact?: string;
  onClick: () => void;
}) {
  const initials = client
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");

  const handleWhatsApp = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!contact) return;
    const phone = contact.replace(/\D/g, "").replace(/^0/, "234");
    const msg = `Hello *${client}*, this is a reminder from *BOMedia*. You have an outstanding balance of *${fmtMoneyFull(amount)}* on your order: ${description}. Kindly settle at your earliest convenience. Thank you!`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  return (
    <Stack
      direction="row"
      sx={{
        alignItems: "center",
        gap: 1.5,
        py: 1.5,
        borderBottom: "1px solid",
        borderColor: "divider",
        "&:last-child": { border: 0 },
        cursor: "pointer",
        transition: "background-color 0.15s ease",
        mx: -2,
        px: 2,
        borderRadius: "10px",
        "&:hover": {
          bgcolor: (theme) => alpha(theme.palette.primary.main, 0.04),
        },
      }}
      onClick={onClick}
    >
      <Avatar
        sx={{
          width: 36,
          height: 36,
          borderRadius: "10px",
          bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
          color: "primary.main",
          fontSize: "0.625rem",
          fontWeight: 900,
        }}
      >
        {initials}
      </Avatar>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography noWrap sx={{ fontSize: "0.875rem", fontWeight: 800, color: "text.primary" }}>
          {client}
        </Typography>
        <Typography noWrap sx={{ fontSize: "0.625rem", color: "text.secondary", fontWeight: 500 }}>
          {description}
        </Typography>
      </Box>

      <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
        <Box sx={{ textAlign: "right" }}>
          <Typography sx={{ fontSize: "0.875rem", fontWeight: 900, color: "error.main", fontFamily: "monospace" }}>
            {fmtMoneyFull(amount)}
          </Typography>
          <Typography sx={{ fontSize: "0.5625rem", color: "text.disabled", fontWeight: 500 }}>
            due
          </Typography>
        </Box>
        {contact && (
          <IconButton
            size="small"
            onClick={handleWhatsApp}
            sx={{
              width: 32,
              height: 32,
              borderRadius: "10px",
              bgcolor: (theme) => alpha(theme.palette.success.main, 0.08),
              border: "1px solid",
              borderColor: (theme) => alpha(theme.palette.success.main, 0.15),
              color: "success.main",
              "&:hover": {
                bgcolor: (theme) => alpha(theme.palette.success.main, 0.15),
              },
            }}
            title="Send WhatsApp reminder"
          >
            <MessageCircle size={14} />
          </IconButton>
        )}
      </Stack>
    </Stack>
  );
}

// ─── Today's Job Feed ─────────────────────────────────────────────────────────

function JobFeed({ jobs }: { jobs: any[] }) {
  if (jobs.length === 0) {
    return (
      <Stack sx={{ alignItems: "center", justifyContent: "center", py: 5, color: "text.disabled" }}>
        <ShoppingBag size={32} />
        <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, mt: 1 }}>
          No jobs logged today yet
        </Typography>
        <Link href="/cashier/new-entry" style={{ textDecoration: "none", marginTop: 12 }}>
          <Button
            size="small"
            variant="contained"
            color="primary"
            sx={{ borderRadius: "10px", fontWeight: 900, fontSize: "0.6875rem", px: 2, height: 32 }}
          >
            Log First Job
          </Button>
        </Link>
      </Stack>
    );
  }

  return (
    <Stack sx={{ gap: 1 }}>
      {jobs.slice(0, 8).map((job, i) => {
        const client = job["CLIENT NAME"] || job["Client Name"] || "—";
        const desc = job["JOB DESCRIPTION"] || job["Job Description"] || "—";
        const amt = parseAmount(job["AMOUNT (₦)"] || job["Amount (₦)"]);
        const paid = parseAmount(
          job["INITIAL PAYMENT (₦)"] || job["INITIAL PAYMENT"] || "0"
        );
        const status = job["PAYMENT STATUS"] || "Unpaid";
        const material = job["MATERIAL"] || job["Material"] || "";
        const jobStatus = job["JOB STATUS"] || job["Job Status"] || "Quoted";
        const loggedBy = job["LOGGED BY"] || job["Logged By"] || "—";

        return (
          <Box
            key={i}
            sx={{
              display: "flex",
              alignItems: "flex-start",
              gap: 1.5,
              p: 1.75,
              bgcolor: "background.paper",
              borderRadius: "16px",
              border: "1px solid",
              borderColor: "divider",
              transition: "border-color 0.15s ease",
              "&:hover": {
                borderColor: (theme) => alpha(theme.palette.primary.main, 0.2),
              },
            }}
          >
            {/* Index */}
            <Box
              sx={{
                width: 24,
                height: 24,
                borderRadius: "10px",
                bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
                color: "primary.main",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.5625rem",
                fontWeight: 900,
                mt: 0.25,
                shrink: 0,
              }}
            >
              {i + 1}
            </Box>

            {/* Content */}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", gap: 1 }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography noWrap sx={{ fontSize: "0.875rem", fontWeight: 900, color: "text.primary" }}>
                    {client}
                  </Typography>
                  <Typography noWrap sx={{ fontSize: "0.625rem", color: "text.secondary", fontWeight: 500, mt: 0.25 }}>
                    {desc}
                  </Typography>
                </Box>
                <Box sx={{ textAlign: "right", shrink: 0 }}>
                  <Typography sx={{ fontSize: "0.875rem", fontWeight: 900, color: "text.primary", fontFamily: "monospace" }}>
                    {fmtMoneyFull(amt)}
                  </Typography>
                  {paid > 0 && (
                    <Typography sx={{ fontSize: "0.5625rem", color: "success.main", fontWeight: 700, mt: 0.25, fontFamily: "monospace" }}>
                      +{fmtMoneyFull(paid)} paid
                    </Typography>
                  )}
                </Box>
              </Stack>

              <Stack direction="row" sx={{ alignItems: "center", gap: 1, mt: 1.5, flexWrap: "wrap" }}>
                {material && (
                  <Chip
                    label={material}
                    size="small"
                    sx={{
                      borderRadius: "10px",
                      height: 18,
                      fontSize: "0.5rem",
                      fontWeight: 900,
                      bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
                      color: "primary.main",
                      border: "none",
                      "& .MuiChip-label": { px: 1 },
                    }}
                  />
                )}
                <Chip
                  label={jobStatus}
                  size="small"
                  sx={{
                    borderRadius: "10px",
                    height: 18,
                    fontSize: "0.5rem",
                    fontWeight: 900,
                    ...(() => {
                      if (jobStatus === "Ready" || jobStatus === "Delivered") {
                        return {
                          bgcolor: (theme) => alpha(theme.palette.success.main, 0.08),
                          color: "success.main",
                        };
                      }
                      if (jobStatus === "Printing" || jobStatus === "Finishing") {
                        return {
                          bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
                          color: "primary.main",
                        };
                      }
                      return {
                        bgcolor: "action.selected",
                        color: "text.secondary",
                      };
                    })(),
                    border: "none",
                    "& .MuiChip-label": { px: 1 },
                  }}
                />
                <Chip
                  label={status}
                  size="small"
                  sx={{
                    borderRadius: "10px",
                    height: 18,
                    fontSize: "0.5rem",
                    fontWeight: 900,
                    ...(() => {
                      if (status === "Paid") {
                        return {
                          bgcolor: (theme) => alpha(theme.palette.success.main, 0.08),
                          color: "success.main",
                        };
                      }
                      if (status === "Part-payment") {
                        return {
                          bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
                          color: "primary.main",
                        };
                      }
                      return {
                        bgcolor: (theme) => alpha(theme.palette.error.main, 0.08),
                        color: "error.main",
                      };
                    })(),
                    border: "none",
                    "& .MuiChip-label": { px: 1 },
                  }}
                />
                <Typography sx={{ fontSize: "0.5rem", color: "text.disabled", fontWeight: 500, ml: "auto" }}>
                  via {loggedBy}
                </Typography>
              </Stack>
            </Box>
          </Box>
        );
      })}

      {jobs.length > 8 && (
        <Link href="/cashier/records" style={{ textDecoration: "none" }}>
          <Stack
            direction="row"
            sx={{
              alignItems: "center",
              justifyContent: "center",
              gap: 1,
              p: 1.5,
              borderRadius: "16px",
              border: "1px dashed",
              borderColor: (theme) => alpha(theme.palette.primary.main, 0.2),
              color: "primary.main",
              cursor: "pointer",
              transition: "background-color 0.15s ease",
              "&:hover": {
                bgcolor: (theme) => alpha(theme.palette.primary.main, 0.04),
              },
            }}
          >
            <Typography sx={{ fontSize: "0.75rem", fontWeight: 900 }}>
              +{jobs.length - 8} more jobs today
            </Typography>
            <ChevronRight size={14} />
          </Stack>
        </Link>
      )}
    </Stack>
  );
}

// ─── Desktop Sidebar Panel ────────────────────────────────────────────────────

function DesktopSidePanel({
  debtors,
  onDebtorClick,
  inventory,
}: {
  debtors: { name: string; balance: number }[];
  onDebtorClick: (name: string) => void;
  inventory: any[];
}) {
  const theme = useTheme();
  const lowStockRolls = inventory.filter((item) => {
    const rem = parseFloat(
      item["Remaining Length (ft)"] || item.Stock || "0"
    );
    const threshold = parseFloat(item["Low Stock Threshold (ft)"] || "50");
    return rem > 0 && rem <= threshold;
  });

  return (
    <Stack sx={{ gap: 2 }}>
      {/* Outstanding debts */}
      <Paper variant="outlined" sx={{ borderRadius: "16px", overflow: "hidden", borderColor: "divider" }}>
        <Stack
          direction="row"
          sx={{
            p: 2,
            borderBottom: "1px solid",
            borderColor: "divider",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
            <Box
              sx={{
                width: 24,
                height: 24,
                borderRadius: "10px",
                bgcolor: alpha(theme.palette.error.main, 0.08),
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AlertCircle size={14} color="var(--mui-palette-error-main)" />
            </Box>
            <Typography sx={{ fontSize: "0.625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "text.secondary" }}>
              Outstanding
            </Typography>
          </Stack>
          <Chip
            label={debtors.length}
            size="small"
            sx={{
              height: 18,
              borderRadius: "10px",
              fontWeight: 900,
              fontSize: "0.5625rem",
              bgcolor: alpha(theme.palette.error.main, 0.08),
              color: "error.main",
            }}
          />
        </Stack>
        <Box sx={{ p: 2 }}>
          {debtors.length === 0 ? (
            <Stack sx={{ alignItems: "center", py: 3, color: "text.disabled" }}>
              <CheckCircle2 size={24} />
              <Typography sx={{ fontSize: "0.6875rem", fontWeight: 700, mt: 1 }}>
                All cleared!
              </Typography>
            </Stack>
          ) : (
            <Stack sx={{ gap: 0.5 }}>
              {debtors.slice(0, 6).map((d, i) => (
                <Stack
                  key={i}
                  direction="row"
                  onClick={() => onDebtorClick(d.name)}
                  sx={{
                    alignItems: "center",
                    justifyContent: "space-between",
                    p: 1.25,
                    borderRadius: "10px",
                    cursor: "pointer",
                    transition: "background-color 0.15s ease, transform 0.1s ease",
                    "&:hover": {
                      bgcolor: alpha(theme.palette.error.main, 0.04),
                    },
                    "&:active": {
                      transform: "scale(0.98)",
                    },
                  }}
                >
                  <Stack direction="row" sx={{ alignItems: "center", gap: 1, minWidth: 0 }}>
                    <Avatar
                      sx={{
                        width: 28,
                        height: 28,
                        borderRadius: "10px",
                        bgcolor: alpha(theme.palette.error.main, 0.08),
                        color: "error.main",
                        fontSize: "0.5625rem",
                        fontWeight: 900,
                      }}
                    >
                      {d.name[0]?.toUpperCase()}
                    </Avatar>
                    <Typography noWrap sx={{ fontSize: "0.75rem", fontWeight: 700, color: "text.primary" }}>
                      {d.name}
                    </Typography>
                  </Stack>
                  <Typography sx={{ fontSize: "0.75rem", fontWeight: 900, color: "error.main", shrink: 0, ml: 1, fontFamily: "monospace" }}>
                    {fmtMoney(d.balance)}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          )}
        </Box>
      </Paper>

      {/* Inventory alerts */}
      {lowStockRolls.length > 0 && (
        <Paper
          variant="outlined"
          sx={{
            borderRadius: "16px",
            overflow: "hidden",
            borderColor: alpha(theme.palette.primary.main, 0.3),
            bgcolor: alpha(theme.palette.primary.main, 0.02),
          }}
        >
          <Stack
            direction="row"
            sx={{
              p: 2,
              borderBottom: "1px solid",
              borderColor: alpha(theme.palette.primary.main, 0.15),
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
              <Box
                sx={{
                  width: 24,
                  height: 24,
                  borderRadius: "10px",
                  bgcolor: alpha(theme.palette.primary.main, 0.08),
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Package size={14} color="var(--mui-palette-primary-main)" />
              </Box>
              <Typography sx={{ fontSize: "0.625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "text.secondary" }}>
                Low Stock
              </Typography>
            </Stack>
            <Chip
              label={lowStockRolls.length}
              size="small"
              sx={{
                height: 18,
                borderRadius: "10px",
                fontWeight: 900,
                fontSize: "0.5625rem",
                bgcolor: alpha(theme.palette.primary.main, 0.08),
                color: "primary.main",
              }}
            />
          </Stack>
          <Stack sx={{ p: 1.5, gap: 1 }}>
            {lowStockRolls.slice(0, 4).map((roll, i) => {
              const rem = parseFloat(
                roll["Remaining Length (ft)"] || roll.Stock || "0"
              );
              return (
                <Stack
                  key={i}
                  direction="row"
                  sx={{
                    alignItems: "center",
                    justifyContent: "space-between",
                    p: 1.25,
                    borderRadius: "10px",
                    bgcolor: alpha(theme.palette.primary.main, 0.04),
                  }}
                >
                  <Typography noWrap sx={{ fontSize: "0.6875rem", fontWeight: 900, color: "text.primary", flex: 1, minWidth: 0 }}>
                    {roll["Roll ID"] || roll["Item Name"]}
                  </Typography>
                  <Chip
                    label={`${rem.toFixed(0)}ft`}
                    size="small"
                    sx={{
                      height: 18,
                      borderRadius: "10px",
                      fontWeight: 900,
                      fontSize: "0.5625rem",
                      bgcolor: rem <= 0 ? "error.light" : "primary.light",
                      color: rem <= 0 ? "error.contrastText" : "primary.contrastText",
                      fontFamily: "monospace",
                    }}
                  />
                </Stack>
              );
            })}
          </Stack>
        </Paper>
      )}

      {/* Quick Links */}
      <Paper variant="outlined" sx={{ borderRadius: "16px", p: 1.5, borderColor: "divider" }}>
        {[
          { label: "Job Board", href: "/cashier/board", icon: BarChart3 },
          { label: "Customers", href: "/cashier/customers", icon: Users },
          { label: "Price Estimator", href: "/cashier/estimator", icon: Zap },
          { label: "Material Quick-Check", href: "/quick-check", icon: Ruler },
        ].map(({ label, href, icon: Icon }) => (
          <Link key={href} href={href} style={{ textDecoration: "none" }}>
            <Stack
              direction="row"
              sx={{
                alignItems: "center",
                gap: 1.5,
                p: 1.25,
                borderRadius: "10px",
                cursor: "pointer",
                transition: "background-color 0.15s ease",
                "&:hover": {
                  bgcolor: alpha(theme.palette.primary.main, 0.04),
                  "& .quick-link-arrow": { color: "primary.main" },
                },
              }}
            >
              <Box
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: "10px",
                  bgcolor: alpha(theme.palette.primary.main, 0.08),
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon size={14} color="var(--mui-palette-primary-main)" />
              </Box>
              <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700, color: "text.primary", flex: 1 }}>
                {label}
              </Typography>
              <ChevronRight size={14} className="quick-link-arrow" style={{ color: "#9ca3af", transition: "color 0.15s ease" }} />
            </Stack>
          </Link>
        ))}
      </Paper>
    </Stack>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CashierDashboardPage() {
  const theme = useTheme();
  const { pendingQueue, cachedSales, setCachedData, cachedExpenses, cachedInventory, cachedPayments, cachedMaterials } =
    useSyncStore();

  const [loading, setLoading] = useState(cachedSales.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDebtor, setSelectedDebtor] = useState<string | null>(null);
  const [cashierName, setCashierName] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setCashierName(localStorage.getItem("userName") || "");
    }
  }, []);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else if (cachedSales.length === 0) setLoading(true);
    try {
      const [sRes, iRes] = await Promise.all([
        fetch("/api/sales"),
        fetch("/api/inventory"),
      ]);
      const sJson = await sRes.json();
      const iJson = await iRes.json();
      
      const sales = sJson.data || cachedSales;
      const inventory = iJson.data || cachedInventory;
      
      setCachedData(sales, cachedExpenses, inventory, cachedPayments, cachedMaterials);
    } catch (error) {
      console.error("Fetch dashboard data error:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [cachedSales, cachedInventory, cachedExpenses, cachedPayments, cachedMaterials, setCachedData]);

  useEffect(() => {
    if (cachedSales.length === 0) {
      fetchData();
    }
  }, []);

  useEffect(() => {
    const handler = () => fetchData(true);
    window.addEventListener("online", handler);
    return () => window.removeEventListener("online", handler);
  }, [fetchData]);

  // ── Merge pending into allSales ──────────────────────────────────────────
  const allSales = useMemo(() => {
    const pending = pendingQueue
      .filter((i) => i.type === "sale")
      .map((i) => ({
        DATE: i.data[0],
        "CLIENT NAME": i.data[1],
        "JOB DESCRIPTION": i.data[2],
        "CONTACT": i.data[3],
        "MATERIAL": i.data[4],
        "AMOUNT (₦)": "0",
        "INITIAL PAYMENT (₦)": i.data[14] || "0",
        "AMOUNT DIFFERENCES": "0",
        "PAYMENT STATUS": "Unpaid",
        "JOB STATUS": i.data[20] || "Quoted",
        "LOGGED BY": i.data[21] || cashierName,
        __isPending: "true",
      }));
    return [...pending, ...cachedSales];
  }, [pendingQueue, cachedSales, cashierName]);

  const now = new Date();
  const sevenDaysAgo = subDays(now, 7);

  const todaySales = useMemo(
    () =>
      allSales.filter((r) => {
        const d = new Date(r.DATE || r.Date || "");
        return !isNaN(d.getTime()) && isSameDay(d, now);
      }),
    [allSales]
  );

  const weekSales = useMemo(
    () =>
      allSales.filter((r) => {
        const d = new Date(r.DATE || r.Date || "");
        return (
          !isNaN(d.getTime()) &&
          isWithinInterval(d, { start: sevenDaysAgo, end: now })
        );
      }),
    [allSales]
  );

  // ── In-progress jobs ─────────────────────────────────────────────────────
  const inProgressJobs = todaySales.filter((r) => {
    const s = (r["JOB STATUS"] || r["Job Status"] || "").toString().trim();
    return ["Printing", "Finishing", "Ready"].includes(s);
  });

  // ── Today metrics ────────────────────────────────────────────────────────
  const todayRevenue = todaySales.reduce(
    (s, r) => s + parseAmount(r["AMOUNT (₦)"] || r["Amount (₦)"]),
    0
  );
  const todayCollected = todaySales.reduce(
    (s, r) =>
      s +
      parseAmount(
        r["INITIAL PAYMENT (₦)"] || r["INITIAL PAYMENT"] || r["Initial Payment"]
      ),
    0
  );

  // ── Debt data ────────────────────────────────────────────────────────────
  const { totalDebt: dailyDebt } = processDebtData(todaySales);
  const { totalDebt: weeklyDebt, chartData: debtChart } =
    processDebtData(weekSales, 8);

  const debtorList = useMemo(() => {
    const map: Record<string, number> = {};
    weekSales.forEach((r) => {
      const balance = parseAmount(
        r["AMOUNT DIFFERENCES"] || r["Amount Differences"]
      );
      const client = (r["CLIENT NAME"] || r["Client Name"] || "").trim();
      if (client && balance > 0) {
        map[client] = (map[client] || 0) + balance;
      }
    });
    return Object.entries(map)
      .map(([name, balance]) => ({ name, balance }))
      .sort((a, b) => b.balance - a.balance);
  }, [weekSales]);

  const todayDebtors = useMemo(() => {
    return todaySales
      .filter((r) => {
        const bal = parseAmount(
          r["AMOUNT DIFFERENCES"] || r["Amount Differences"]
        );
        return bal > 0;
      })
      .map((r) => ({
        client: (r["CLIENT NAME"] || r["Client Name"] || "—").trim(),
        amount: parseAmount(r["AMOUNT DIFFERENCES"] || r["Amount Differences"]),
        description: (r["JOB DESCRIPTION"] || r["Job Description"] || "—").trim(),
        contact: (r["CONTACT"] || r["Contact"] || "").trim(),
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [todaySales]);

  if (loading) {
    return (
      <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <LoadingAnimation text="Loading..." />
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: "100vh", pb: 5, bgcolor: alpha(theme.palette.primary.main, 0.02), transition: "colors 0.5s ease" }}>

      {/* ── Mobile Layout ───────────────────────────────────────────────── */}
      <Box sx={{ display: { xs: "block", md: "none" }, p: 2 }}>
        <Stack sx={{ gap: 2 }}>
          {/* Shift hero */}
          <motion.div variants={sectionVariants} custom={0} initial="hidden" animate="show">
            <ShiftHero
              cashierName={cashierName}
              jobsToday={todaySales.length}
              revenueToday={todayRevenue}
              collectedToday={todayCollected}
              pendingCount={pendingQueue.length}
              inProgressCount={inProgressJobs.length}
            />
          </motion.div>

          {/* Action grid */}
          <motion.div variants={sectionVariants} custom={0.08} initial="hidden" animate="show">
            <ActionGrid />
          </motion.div>

          {/* Today's debtors */}
          {todayDebtors.length > 0 && (
            <motion.div variants={sectionVariants} custom={0.14} initial="hidden" animate="show">
              <Paper variant="outlined" sx={{ borderRadius: "16px", overflow: "hidden" }}>
                <Stack
                  direction="row"
                  sx={{
                    px: 2,
                    py: 1.5,
                    borderBottom: "1px solid",
                    borderColor: "divider",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
                    <AlertCircle size={16} color="var(--mui-palette-error-main)" />
                    <Typography sx={{ fontSize: "0.6875rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em", color: "text.secondary" }}>
                      Collect Today
                    </Typography>
                  </Stack>
                  <Chip
                    label={`${todayDebtors.length} client${todayDebtors.length !== 1 ? "s" : ""}`}
                    size="small"
                    sx={{
                      height: 18,
                      borderRadius: "10px",
                      fontWeight: 900,
                      fontSize: "0.5625rem",
                      bgcolor: alpha(theme.palette.error.main, 0.08),
                      color: "error.main",
                      border: "none",
                    }}
                  />
                </Stack>
                <Box sx={{ px: 2, py: 0.5 }}>
                  {todayDebtors.map((d, i) => (
                    <DebtRow
                      key={i}
                      client={d.client}
                      amount={d.amount}
                      description={d.description}
                      contact={d.contact}
                      onClick={() => setSelectedDebtor(d.client)}
                    />
                  ))}
                </Box>
              </Paper>
            </motion.div>
          )}

          {/* Today's job feed */}
          <motion.div variants={sectionVariants} custom={0.19} initial="hidden" animate="show">
            <Paper variant="outlined" sx={{ borderRadius: "16px", overflow: "hidden" }}>
              <Stack
                direction="row"
                sx={{
                  px: 2,
                  py: 1.5,
                  borderBottom: "1px solid",
                  borderColor: "divider",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
                  <Clock size={16} color="var(--mui-palette-primary-main)" />
                  <Typography sx={{ fontSize: "0.6875rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em", color: "text.secondary" }}>
                    Today's Jobs
                  </Typography>
                </Stack>
                <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
                  <IconButton
                    size="small"
                    onClick={() => fetchData(true)}
                    disabled={refreshing}
                    sx={{
                      width: 28,
                      height: 28,
                      borderRadius: "10px",
                      transition: "transform 0.15s ease",
                      "&:active": { transform: "scale(0.95)" },
                    }}
                  >
                    <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} style={{ color: "#9ca3af" }} />
                  </IconButton>
                  <Link href="/cashier/records" style={{ display: "flex", alignItems: "center" }}>
                    <ChevronRight size={16} style={{ color: "#9ca3af" }} />
                  </Link>
                </Stack>
              </Stack>
              <Box sx={{ p: 2 }}>
                <JobFeed jobs={todaySales} />
              </Box>
            </Paper>
          </motion.div>

          {/* Weekly debt summary */}
          {weeklyDebt > 0 && (
            <motion.div variants={sectionVariants} custom={0.24} initial="hidden" animate="show">
              <Paper variant="outlined" sx={{ borderRadius: "16px", p: 2 }}>
                <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
                  <Typography sx={{ fontSize: "0.6875rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em", color: "text.secondary" }}>
                    7-Day Debt Summary
                  </Typography>
                  <Typography sx={{ fontSize: "0.875rem", fontWeight: 900, color: "error.main", fontFamily: "monospace" }}>
                    {fmtMoneyFull(weeklyDebt)}
                  </Typography>
                </Stack>
                <Typography sx={{ fontSize: "0.625rem", color: "text.disabled", fontWeight: 500, mb: 2 }}>
                  Tap a bar to log a payment
                </Typography>
                <OutstandingDebtChart
                  data={debtChart}
                  onClientClick={setSelectedDebtor}
                />
              </Paper>
            </motion.div>
          )}
        </Stack>
      </Box>

      {/* ── Desktop Layout ───────────────────────────────────────────────── */}
      <Box sx={{ display: { xs: "none", md: "block" }, p: { xs: 3, lg: 4 }, maxWidth: "7xl", mx: "auto" }}>

        {/* Header */}
        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 3 }}>
          <Box>
            <Typography sx={{ fontSize: "0.6875rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "text.secondary" }}>
              {format(now, "EEEE, MMMM d")}
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 900, color: "text.primary", tracking: "tight", mt: 0.5 }}>
              {getGreeting()}, {cashierName || "Cashier"} 👋
            </Typography>
          </Box>

          <Stack direction="row" sx={{ alignItems: "center", gap: 2 }}>
            {pendingQueue.length > 0 && (
              <Chip
                label={`${pendingQueue.length} syncing`}
                size="small"
                sx={{
                  bgcolor: alpha(theme.palette.primary.main, 0.08),
                  color: "primary.main",
                  border: "1px solid",
                  borderColor: alpha(theme.palette.primary.main, 0.15),
                  fontWeight: 900,
                  fontSize: "0.625rem",
                  "& .MuiChip-label": { px: 1.25 },
                }}
              />
            )}
            <Button
              variant="outlined"
              size="small"
              onClick={() => fetchData(true)}
              disabled={refreshing}
              sx={{
                bgcolor: "background.paper",
                borderColor: "divider",
                color: "text.primary",
                borderRadius: "10px",
                fontWeight: 900,
                fontSize: "0.75rem",
                px: 2,
                height: 36,
                "&:hover": {
                  bgcolor: alpha(theme.palette.primary.main, 0.04),
                  borderColor: "primary.light",
                },
              }}
              startIcon={<RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />}
            >
              {refreshing ? "Updating…" : "Refresh"}
            </Button>
          </Stack>
        </Stack>

        {/* Desktop metric strip */}
        <motion.div variants={sectionVariants} custom={0.08} initial="hidden" animate="show">
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 2, mb: 3 }}>
            {[
              {
                label: "Today's Jobs",
                val: String(todaySales.length),
                sub: "logged this shift",
                icon: ShoppingBag,
                accentColor: theme.palette.primary.main,
              },
              {
                label: "In Progress",
                val: String(inProgressJobs.length),
                sub: inProgressJobs.length > 0 ? "Printing / Finishing / Ready" : "No active jobs",
                icon: Clock,
                accentColor: inProgressJobs.length > 0 ? theme.palette.primary.main : theme.palette.success.main,
              },
              {
                label: "Today's Revenue",
                val: fmtMoneyFull(todayRevenue),
                sub: `${fmtMoneyFull(todayCollected)} collected`,
                icon: TrendingUp,
                accentColor: theme.palette.success.main,
              },
              {
                label: "Daily Debt",
                val: fmtMoneyFull(dailyDebt),
                sub: `${todayDebtors.length} client${todayDebtors.length !== 1 ? "s" : ""} owe today`,
                icon: AlertCircle,
                accentColor: dailyDebt > 0 ? theme.palette.error.main : theme.palette.success.main,
              },
              {
                label: "Weekly Debt",
                val: fmtMoneyFull(weeklyDebt),
                sub: "last 7 days total",
                icon: Wallet,
                accentColor: theme.palette.primary.main,
              },
            ].map(({ label, val, sub, icon: Icon, accentColor }) => (
              <Box key={label}>
                <Paper
                  variant="outlined"
                  sx={{
                    position: "relative",
                    borderRadius: "16px",
                    p: 2.5,
                    overflow: "hidden",
                    bgcolor: alpha(accentColor, 0.04),
                    borderColor: alpha(accentColor, 0.15),
                  }}
                >
                  <Box
                    sx={{
                      position: "absolute",
                      right: -16,
                      top: -16,
                      width: 80,
                      height: 80,
                      borderRadius: "50%",
                      bgcolor: accentColor,
                      opacity: 0.05,
                    }}
                  />
                  <Box
                    sx={{
                      width: 32,
                      height: 32,
                      borderRadius: "10px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      mb: 1.5,
                      bgcolor: alpha(accentColor, 0.08),
                    }}
                  >
                    <Icon size={16} color={accentColor} />
                  </Box>
                  <Typography sx={{ fontSize: "0.5625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "text.secondary", mb: 0.5 }}>
                    {label}
                  </Typography>
                  <Typography sx={{ fontSize: "1.25rem", fontWeight: 800, lineHeight: 1.2 }}>
                    <AnimatedNumber value={parseAmount(val)} formatType={val.includes("₦") ? "currency" : "number"} />
                  </Typography>
                  <Typography sx={{ fontSize: "0.625rem", color: "text.secondary", mt: 0.5 }}>
                    {sub}
                  </Typography>
                </Paper>
              </Box>
            ))}
          </Box>
        </motion.div>

        {/* Desktop two-column layout */}
        <motion.div variants={sectionVariants} custom={0.16} initial="hidden" animate="show">
          <Box sx={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 3 }}>
            {/* Left Column (2/3) */}
            <Box>
              <Stack sx={{ gap: 2.5 }}>
                {/* Action row */}
                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2 }}>
                  {[
                    { label: "Log New Sale", href: "/cashier/new-entry", icon: Plus, primary: true },
                    { label: "Price Estimator", href: "/cashier/estimator", icon: Zap },
                    { label: "Quick Check", href: "/quick-check", icon: Ruler },
                  ].map(({ label, href, icon: Icon, primary }) => (
                    <Link key={href} href={href} style={{ textDecoration: "none" }}>
                      <motion.div whileTap={{ scale: 0.97 }}>
                        <Paper
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1.75,
                            p: 2,
                            borderRadius: "16px",
                            cursor: "pointer",
                            transition: "background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease",
                            ...(primary
                              ? {
                                  bgcolor: "primary.main",
                                  color: "primary.contrastText",
                                  boxShadow: `0 8px 16px ${alpha(theme.palette.primary.main, 0.15)}`,
                                }
                              : {
                                  bgcolor: "background.paper",
                                  border: "1px solid",
                                  borderColor: "divider",
                                  "&:hover": {
                                    bgcolor: alpha(theme.palette.primary.main, 0.04),
                                    borderColor: "primary.light",
                                  },
                                }),
                          }}
                        >
                          <Box
                            sx={{
                              width: 36,
                              height: 36,
                              borderRadius: "10px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              bgcolor: primary ? "rgba(255, 255, 255, 0.2)" : alpha(theme.palette.primary.main, 0.08),
                            }}
                          >
                            <Icon size={16} color={primary ? "#ffffff" : theme.palette.primary.main} />
                          </Box>
                          <Typography sx={{ fontSize: "0.875rem", fontWeight: 900 }}>
                            {label}
                          </Typography>
                        </Paper>
                      </motion.div>
                    </Link>
                  ))}
                </Box>

                {/* Today's job feed */}
                <Paper variant="outlined" sx={{ borderRadius: "16px", overflow: "hidden" }}>
                  <Stack
                    direction="row"
                    sx={{
                      px: 3,
                      py: 2,
                      borderBottom: "1px solid",
                      borderColor: "divider",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
                      <Clock size={16} color="var(--mui-palette-primary-main)" />
                      <Typography sx={{ fontSize: "0.875rem", fontWeight: 900, color: "text.primary" }}>
                        Today's Jobs
                      </Typography>
                      <Chip
                        label={todaySales.length}
                        size="small"
                        sx={{
                          height: 18,
                          borderRadius: "10px",
                          fontWeight: 900,
                          fontSize: "0.5625rem",
                          bgcolor: alpha(theme.palette.primary.main, 0.08),
                          color: "primary.main",
                          ml: 0.5,
                        }}
                      />
                    </Stack>
                    <Link
                      href="/cashier/records"
                      style={{
                        fontSize: "0.6875rem",
                        fontWeight: 900,
                        color: theme.palette.primary.main,
                        textDecoration: "none",
                        display: "flex",
                        alignItems: "center",
                        gap: 2,
                      }}
                    >
                      All records <ChevronRight size={12} />
                    </Link>
                  </Stack>
                  <Box sx={{ p: 3 }}>
                    <JobFeed jobs={todaySales} />
                  </Box>
                </Paper>

                {/* Today debtors */}
                {todayDebtors.length > 0 && (
                  <Paper variant="outlined" sx={{ borderRadius: "16px", overflow: "hidden" }}>
                    <Stack
                      direction="row"
                      sx={{
                        px: 3,
                        py: 2,
                        borderBottom: "1px solid",
                        borderColor: "divider",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
                        <AlertCircle size={16} color="var(--mui-palette-error-main)" />
                        <Typography sx={{ fontSize: "0.875rem", fontWeight: 900, color: "text.primary" }}>
                          Collect Today
                        </Typography>
                      </Stack>
                      <Chip
                        label={todayDebtors.length}
                        size="small"
                        sx={{
                          height: 18,
                          borderRadius: "10px",
                          fontWeight: 900,
                          fontSize: "0.5625rem",
                          bgcolor: alpha(theme.palette.error.main, 0.08),
                          color: "error.main",
                        }}
                      />
                    </Stack>
                    <Box sx={{ px: 3, py: 0.5 }}>
                      {todayDebtors.map((d, i) => (
                        <DebtRow
                          key={i}
                          client={d.client}
                          amount={d.amount}
                          description={d.description}
                          contact={d.contact}
                          onClick={() => setSelectedDebtor(d.client)}
                        />
                      ))}
                    </Box>
                  </Paper>
                )}
              </Stack>
            </Box>

            {/* Right Column (1/3) */}
            <Box>
              <DesktopSidePanel
                debtors={debtorList}
                onDebtorClick={setSelectedDebtor}
                inventory={cachedInventory}
              />
            </Box>
          </Box>
        </motion.div>
      </Box>

      {/* ── Debtor payment modal ──────────────────────────────────────────── */}
      <DebtorPaymentModal
        clientName={selectedDebtor}
        isOpen={!!selectedDebtor}
        onClose={() => setSelectedDebtor(null)}
        onUpdate={() => fetchData(true)}
        theme="amber"
      />
    </Box>
  );
}

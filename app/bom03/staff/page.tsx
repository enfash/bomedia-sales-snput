"use client";
import { LoadingAnimation } from "@/components/loading-animation";

import { useEffect, useState, useMemo } from "react";
import {
  Users,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  BarChart3,
  Wallet,
  Clock,
  ChevronDown,
  ArrowLeft,
  Plus,
  X,
  Trash2,
  UserCheck,
  UserX,
  ShieldCheck,
  Loader2,
  KeyRound,
} from "lucide-react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Stack from "@mui/material/Stack";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContentText from "@mui/material/DialogContentText";
import DialogActions from "@mui/material/DialogActions";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import ToggleButton from "@mui/material/ToggleButton";
import { subDays, isWithinInterval, isSameDay } from "date-fns";
import Link from "next/link";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StaffStats {
  name: string;
  totalJobs: number;
  totalRevenue: number;
  totalCollected: number;
  totalDebt: number;
  collectionRate: number;
  jobsToday: number;
  revenueToday: number;
  topMaterial: string;
  recentJobs: any[];
  isOnline: boolean;
  lastLogin: string;
}

interface Cashier {
  Name: string;
  Status: string;
  "Last Login": string;
  "Last Active": string;
  Passcode?: string;
  HasPasscode?: boolean;
  _rowIndex?: number;
}

const ONLINE_THRESHOLD_MS = 7 * 60 * 1000; // 7 min = 2 missed heartbeats + buffer

function isReallyOnline(cashier: Cashier): boolean {
  const lastActive = cashier["Last Active"];
  if (!lastActive) return false;
  return Date.now() - new Date(lastActive).getTime() < ONLINE_THRESHOLD_MS;
}

function lastSeenLabel(cashier: Cashier): string {
  const lastActive = cashier["Last Active"];
  if (!lastActive) return cashier["Last Login"] || "Never";
  const diffMs = Date.now() - new Date(lastActive).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return cashier["Last Login"] || "Never";
}

const parseAmt = (v: any) =>
  parseFloat(String(v ?? "0").replace(/[₦,\s]/g, "")) || 0;

const fmtMoney = (n: number) =>
  `₦${n.toLocaleString(undefined, { minimumFractionDigits: 0 })}`;

// ─── Avatar color helper ──────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "#C8472E", // brand-600
  "#059669", // emerald-600
  "#7C3AED", // violet-600
  "#E11D48", // rose-600
  "#D97706", // amber-600
  "#0891B2", // cyan-600
];

function avatarBg(name: string) {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
}

// ─── Staff Performance Card ───────────────────────────────────────────────────

function StaffCard({ stats }: { stats: StaffStats }) {
  const [expanded, setExpanded] = useState(false);

  const collectionColor =
    stats.collectionRate >= 80
      ? "success.main"
      : stats.collectionRate >= 50
      ? "warning.main"
      : "error.main";

  const statItems = [
    {
      label: "Collected",
      val: fmtMoney(stats.totalCollected),
      icon: Wallet,
      color: "success.main",
    },
    {
      label: "Debt Left",
      val: fmtMoney(stats.totalDebt),
      icon: AlertTriangle,
      color: stats.totalDebt > 0 ? "error.main" : "text.disabled",
    },
    {
      label: "Collection %",
      val: `${stats.collectionRate.toFixed(0)}%`,
      icon: TrendingUp,
      color: collectionColor,
    },
    {
      label: "Top Material",
      val: stats.topMaterial || "—",
      icon: BarChart3,
      color: "primary.main",
    },
  ];

  return (
    <Box
      sx={{
        bgcolor: "background.paper",
        borderRadius: 3,
        border: "1px solid",
        borderColor: "grey.100",
        boxShadow: "0 1px 2px rgba(31,41,51,.04)",
        overflow: "hidden",
      }}
    >
      {/* Header row — clickable */}
      <Box
        component="button"
        type="button"
        onClick={() => setExpanded((v) => !v)}
        sx={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 2,
          p: 2.5,
          textAlign: "left",
          background: "none",
          border: "none",
          cursor: "pointer",
          transition: "background-color 0.15s ease-out, transform 0.15s ease-out",
          "&:hover": { bgcolor: "grey.50" },
          "&:active": { transform: "scale(0.97)" },
        }}
      >
        {/* Avatar */}
        <Box
          sx={{
            width: 48,
            height: 48,
            borderRadius: 2,
            bgcolor: avatarBg(stats.name),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: "0.8rem",
            fontWeight: 900,
            flexShrink: 0,
          }}
        >
          {initials(stats.name)}
        </Box>

        {/* Name + jobs */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
            <Typography
              sx={{ fontSize: "0.875rem", fontWeight: 900, color: "text.primary" }}
            >
              {stats.name}
            </Typography>
            {stats.isOnline && (
              <Box
                component="span"
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 0.5,
                  fontSize: "0.625rem",
                  fontWeight: 900,
                  color: "success.main",
                  bgcolor: "rgba(46,125,91,0.08)",
                  px: 0.75,
                  py: 0.25,
                  borderRadius: 10,
                }}
              >
                <Box
                  component="span"
                  sx={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    bgcolor: "success.main",
                    display: "inline-block",
                  }}
                />
                Online
              </Box>
            )}
          </Stack>
          <Typography
            sx={{
              fontSize: "0.625rem",
              color: "text.secondary",
              fontWeight: 500,
              mt: 0.25,
            }}
          >
            {stats.totalJobs} total jobs · {stats.jobsToday} today
          </Typography>
        </Box>

        {/* Revenue */}
        <Box sx={{ textAlign: "right", flexShrink: 0 }}>
          <Typography sx={{ fontSize: "0.875rem", fontWeight: 900, color: "text.primary" }}>
            {fmtMoney(stats.totalRevenue)}
          </Typography>
          <Typography sx={{ fontSize: "0.625rem", color: "text.secondary" }}>
            all time revenue
          </Typography>
        </Box>

        {/* Chevron */}
        <Box
          component={ChevronDown}
          sx={{
            width: 16,
            height: 16,
            color: "text.disabled",
            flexShrink: 0,
            ml: 0.5,
            transition: "transform 0.2s ease-out",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </Box>

      {/* Stats grid */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          borderTop: "1px solid",
          borderColor: "grey.50",
        }}
      >
        {statItems.map(({ label, val, icon: Icon, color }, idx) => (
          <Box
            key={label}
            sx={{
              p: 1.5,
              textAlign: "center",
              borderRight: idx < 3 ? "1px solid" : "none",
              borderColor: "grey.50",
            }}
          >
            <Box component={Icon} sx={{ width: 14, height: 14, color, mx: "auto", mb: 0.5 }} />
            <Typography
              sx={{
                fontSize: "0.5625rem",
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "text.secondary",
                mb: 0.25,
              }}
            >
              {label}
            </Typography>
            <Typography
              sx={{
                fontSize: "0.75rem",
                fontWeight: 900,
                color,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {val}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* Expandable section */}
      <Box
        sx={{
          display: "grid",
          gridTemplateRows: expanded ? "1fr" : "0fr",
          transition: expanded
            ? "grid-template-rows 0.3s ease-out"
            : "grid-template-rows 0.2s ease-in",
        }}
      >
        <Box sx={{ minHeight: 0, overflow: "hidden" }}>
          <Box
            sx={{
              borderTop: "1px solid",
              borderColor: "grey.50",
              p: 2,
              bgcolor: "grey.50",
            }}
          >
            {/* Today summary */}
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, mb: 2 }}>
              {[
                { label: "Today's Jobs", val: String(stats.jobsToday) },
                { label: "Today's Revenue", val: fmtMoney(stats.revenueToday) },
              ].map(({ label, val }) => (
                <Box
                  key={label}
                  sx={{
                    p: 1.5,
                    bgcolor: "background.paper",
                    borderRadius: 2,
                    border: "1px solid",
                    borderColor: "grey.100",
                    textAlign: "center",
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: "0.5625rem",
                      fontWeight: 900,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      color: "text.secondary",
                      mb: 0.5,
                    }}
                  >
                    {label}
                  </Typography>
                  <Typography sx={{ fontSize: "1.125rem", fontWeight: 900, color: "text.primary" }}>
                    {val}
                  </Typography>
                </Box>
              ))}
            </Box>

            {/* Recent jobs */}
            {stats.recentJobs.length > 0 && (
              <>
                <Typography
                  sx={{
                    fontSize: "0.5625rem",
                    fontWeight: 900,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    color: "text.secondary",
                    mb: 1,
                  }}
                >
                  Recent Jobs (last 5)
                </Typography>
                <Stack sx={{ gap: 0.75 }}>
                  {stats.recentJobs.slice(0, 5).map((job: any, i: number) => {
                    const client = job["CLIENT NAME"] || job["Client Name"] || "—";
                    const desc = job["JOB DESCRIPTION"] || job["Job Description"] || "—";
                    const amt = parseAmt(job["AMOUNT (₦)"] || job["Amount (₦)"]);
                    const status = job["PAYMENT STATUS"] || "Unpaid";
                    const statusColors: Record<string, { bg: string; color: string }> = {
                      Paid: { bg: "rgba(46,125,91,0.10)", color: "#2E7D5B" },
                      "Part-payment": { bg: "rgba(232,161,58,0.12)", color: "#D97706" },
                    };
                    const sc = statusColors[status] ?? { bg: "rgba(192,57,43,0.10)", color: "#C0392B" };
                    return (
                      <Stack
                        key={i}
                        direction="row"
                        sx={{
                          alignItems: "center",
                          justifyContent: "space-between",
                          p: 1.25,
                          bgcolor: "background.paper",
                          borderRadius: 2,
                          border: "1px solid",
                          borderColor: "grey.100",
                        }}
                      >
                        <Box sx={{ minWidth: 0, flex: 1, pr: 1 }}>
                          <Typography
                            sx={{
                              fontSize: "0.75rem",
                              fontWeight: 700,
                              color: "text.primary",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {client}
                          </Typography>
                          <Typography
                            sx={{
                              fontSize: "0.625rem",
                              color: "text.secondary",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {desc}
                          </Typography>
                        </Box>
                        <Stack direction="row" sx={{ alignItems: "center", gap: 1, flexShrink: 0 }}>
                          <Box
                            component="span"
                            sx={{
                              fontSize: "0.5625rem",
                              fontWeight: 900,
                              px: 0.75,
                              py: 0.25,
                              borderRadius: 1,
                              bgcolor: sc.bg,
                              color: sc.color,
                            }}
                          >
                            {status}
                          </Box>
                          <Typography sx={{ fontSize: "0.75rem", fontWeight: 900, color: "text.primary" }}>
                            {fmtMoney(amt)}
                          </Typography>
                        </Stack>
                      </Stack>
                    );
                  })}
                </Stack>
              </>
            )}

            {/* Last login */}
            {stats.lastLogin && (
              <Stack direction="row" sx={{ alignItems: "center", gap: 0.5, mt: 1.5 }}>
                <Box component={Clock} sx={{ width: 12, height: 12, color: "text.disabled" }} />
                <Typography sx={{ fontSize: "0.5625rem", color: "text.disabled" }}>
                  Last login: {stats.lastLogin}
                </Typography>
              </Stack>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

// ─── Manage Users Tab ─────────────────────────────────────────────────────────

function ManageUsers({
  cashiers,
  onRefresh,
}: {
  cashiers: Cashier[];
  onRefresh: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPasscode, setNewPasscode] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Cashier | null>(null);
  const [deleting, setDeleting] = useState(false);

  // States for PIN editing
  const [pinEditTarget, setPinEditTarget] = useState<Cashier | null>(null);
  const [editPinValue, setEditPinValue] = useState("");
  const [updatingPin, setUpdatingPin] = useState(false);

  const handleCreate = async () => {
    const name = newName.trim();
    const passcode = newPasscode.trim();
    if (!name) return;
    if (passcode !== "" && !/^\d{4}$/.test(passcode)) {
      toast.error("PIN must be exactly 4 digits");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/cashiers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, passcode }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create");
      toast.success(`${name} added as cashier`);
      setNewName("");
      setNewPasscode("");
      setShowForm(false);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleUpdatePin = async () => {
    if (!pinEditTarget) return;
    const pin = editPinValue.trim();
    if (pin !== "" && !/^\d{4}$/.test(pin)) {
      toast.error("PIN must be exactly 4 digits");
      return;
    }
    setUpdatingPin(true);
    try {
      const res = await fetch("/api/cashiers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: pinEditTarget.Name, passcode: pin }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update PIN");
      toast.success(`PIN updated for ${pinEditTarget.Name}`);
      setPinEditTarget(null);
      setEditPinValue("");
      onRefresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUpdatingPin(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/cashiers", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: deleteTarget.Name }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to delete");
      toast.success(`${deleteTarget.Name} removed`);
      setDeleteTarget(null);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Stack sx={{ gap: 2 }}>
      {/* Header row */}
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
        <Typography
          sx={{
            fontSize: "0.75rem",
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "text.secondary",
          }}
        >
          {cashiers.length} registered user{cashiers.length !== 1 ? "s" : ""}
        </Typography>
        <Button
          size="small"
          variant={showForm ? "outlined" : "contained"}
          startIcon={showForm ? <X size={14} /> : <Plus size={14} />}
          onClick={() => {
            setShowForm((v) => !v);
            setNewName("");
            setNewPasscode("");
          }}
          sx={{
            borderRadius: 2,
            fontWeight: 900,
            fontSize: "0.75rem",
            px: 2,
            py: 0.875,
            ...(showForm && {
              borderColor: "grey.300",
              color: "text.secondary",
            }),
          }}
        >
          {showForm ? "Cancel" : "New User"}
        </Button>
      </Stack>

      {/* Create form */}
      {showForm && (
        <Box
          sx={{
            bgcolor: "background.paper",
            borderRadius: 3,
            border: "1px solid",
            borderColor: "grey.100",
            p: 2,
            boxShadow: "0 1px 2px rgba(31,41,51,.04)",
          }}
        >
          <Typography
            sx={{
              fontSize: "0.625rem",
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "text.secondary",
              mb: 1.5,
            }}
          >
            Add New Cashier / User
          </Typography>
          <Stack
            direction={{ xs: "column", md: "row" }}
            sx={{ gap: 1.5, mb: 1.5 }}
          >
            <TextField
              placeholder="Full name (e.g. Amara Okafor)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              disabled={creating}
              autoFocus
              sx={{ flex: 1 }}
              slotProps={{
                htmlInput: { style: { fontWeight: 700 } },
              }}
            />
            <TextField
              placeholder="PIN (e.g. 1234)"
              value={newPasscode}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                setNewPasscode(v);
              }}
              disabled={creating}
              type="text"
              sx={{ width: { xs: "100%", md: 144 } }}
              slotProps={{
                htmlInput: {
                  maxLength: 4,
                  inputMode: "numeric",
                  pattern: "[0-9]*",
                  style: { fontWeight: 700 },
                },
              }}
            />
            <Button
              variant="contained"
              onClick={handleCreate}
              disabled={!newName.trim() || creating}
              sx={{ borderRadius: 2, fontWeight: 900, flexShrink: 0, px: 2.5 }}
            >
              {creating ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : "Add User"}
            </Button>
          </Stack>
          <Typography sx={{ fontSize: "0.625rem", color: "text.secondary" }}>
            The cashier will select their name and type this 4-digit PIN to access their dashboard.
          </Typography>
        </Box>
      )}

      {/* Cashier list */}
      {cashiers.length === 0 ? (
        <Box
          sx={{
            textAlign: "center",
            py: 8,
            bgcolor: "background.paper",
            borderRadius: 3,
            border: "1px solid",
            borderColor: "grey.100",
          }}
        >
          <Box component={Users} sx={{ width: 36, height: 36, color: "text.disabled", mx: "auto", mb: 1.5 }} />
          <Typography sx={{ fontSize: "0.875rem", fontWeight: 900, color: "text.secondary" }}>
            No users registered yet
          </Typography>
          <Typography sx={{ fontSize: "0.6875rem", color: "text.disabled", mt: 0.5 }}>
            Tap "New User" above to add your first cashier.
          </Typography>
        </Box>
      ) : (
        <Box
          sx={{
            bgcolor: "background.paper",
            borderRadius: 3,
            border: "1px solid",
            borderColor: "grey.100",
            boxShadow: "0 1px 2px rgba(31,41,51,.04)",
            overflow: "hidden",
          }}
        >
          {cashiers.map((cashier, i) => {
            const isOnline = isReallyOnline(cashier);
            const init = initials(cashier.Name);
            const bg = avatarBg(cashier.Name);

            return (
              <Stack
                key={cashier.Name}
                direction="row"
                sx={{
                  alignItems: "center",
                  gap: 2,
                  px: 2,
                  py: 1.75,
                  borderBottom: i < cashiers.length - 1 ? "1px solid" : "none",
                  borderColor: "grey.50",
                }}
              >
                {/* Avatar */}
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: 2,
                    bgcolor: bg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontSize: "0.75rem",
                    fontWeight: 900,
                    flexShrink: 0,
                  }}
                >
                  {init}
                </Box>

                {/* Name + status */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
                    <Typography
                      sx={{
                        fontSize: "0.875rem",
                        fontWeight: 900,
                        color: "text.primary",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {cashier.Name}
                    </Typography>
                    <Box
                      component="span"
                      sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 0.5,
                        fontSize: "0.5625rem",
                        fontWeight: 900,
                        px: 0.75,
                        py: 0.25,
                        borderRadius: 10,
                        flexShrink: 0,
                        ...(isOnline
                          ? {
                              bgcolor: "rgba(46,125,91,0.08)",
                              color: "success.main",
                            }
                          : {
                              bgcolor: "grey.100",
                              color: "text.secondary",
                            }),
                      }}
                    >
                      {isOnline ? (
                        <>
                          <Box
                            component="span"
                            sx={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              bgcolor: "success.main",
                              display: "inline-block",
                            }}
                          />
                          Online
                        </>
                      ) : (
                        <>
                          <Box component={UserX} sx={{ width: 10, height: 10 }} />
                          Offline
                        </>
                      )}
                    </Box>
                  </Stack>
                  <Stack direction="row" sx={{ alignItems: "center", gap: 0.5, mt: 0.25, flexWrap: "wrap" }}>
                    <Box component={Clock} sx={{ width: 12, height: 12, color: "text.secondary" }} />
                    <Typography sx={{ fontSize: "0.625rem", color: "text.secondary", fontWeight: 500 }}>
                      {isOnline ? "Active now" : `Last seen: ${lastSeenLabel(cashier)}`}
                    </Typography>
                    <Typography sx={{ fontSize: "0.625rem", color: "text.disabled", mx: 0.5 }}>|</Typography>
                    <Typography
                      component="span"
                      sx={{
                        fontSize: "0.625rem",
                        fontWeight: 700,
                        borderRadius: 1,
                        px: cashier.Passcode ? 0 : 0.75,
                        ...(cashier.Passcode
                          ? { color: "warning.dark" }
                          : {
                              color: "warning.main",
                              bgcolor: "rgba(232,161,58,0.10)",
                            }),
                      }}
                    >
                      PIN: {cashier.Passcode ? cashier.Passcode : "None set"}
                    </Typography>
                  </Stack>
                </Box>

                {/* Edit PIN */}
                <IconButton
                  size="small"
                  onClick={() => {
                    setPinEditTarget(cashier);
                    setEditPinValue(cashier.Passcode || "");
                  }}
                  title="Change PIN"
                  sx={{
                    color: "text.disabled",
                    borderRadius: 2,
                    flexShrink: 0,
                    "&:hover": {
                      color: "warning.main",
                      bgcolor: "rgba(232,161,58,0.08)",
                    },
                  }}
                >
                  <KeyRound size={16} />
                </IconButton>

                {/* Delete */}
                <IconButton
                  size="small"
                  onClick={() => setDeleteTarget(cashier)}
                  aria-label={`Remove ${cashier.Name}`}
                  sx={{
                    color: "text.disabled",
                    borderRadius: 2,
                    flexShrink: 0,
                    "&:hover": {
                      color: "error.main",
                      bgcolor: "rgba(192,57,43,0.08)",
                    },
                  }}
                >
                  <Trash2 size={16} />
                </IconButton>
              </Stack>
            );
          })}
        </Box>
      )}

      {/* Info note */}
      <Stack
        direction="row"
        sx={{
          gap: 1,
          p: 1.5,
          borderRadius: 2,
          bgcolor: "rgba(59,130,246,0.06)",
          border: "1px solid rgba(59,130,246,0.15)",
          alignItems: "flex-start",
        }}
      >
        <Box component={ShieldCheck} sx={{ width: 16, height: 16, color: "#3B82F6", flexShrink: 0, mt: 0.25 }} />
        <Typography sx={{ fontSize: "0.6875rem", color: "#2563EB", fontWeight: 500 }}>
          Removing a user only deletes their login access. All sales they logged remain in the records.
        </Typography>
      </Stack>

      {/* PIN Edit Dialog */}
      <Dialog
        open={!!pinEditTarget}
        onClose={() => setPinEditTarget(null)}
        slotProps={{ paper: { sx: { borderRadius: 3, maxWidth: 400 } } }}
      >
        <DialogContent sx={{ p: 3 }}>
          {/* Icon */}
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: 2,
              bgcolor: "rgba(217,119,6,0.10)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              mb: 1.5,
            }}
          >
            <Box component={KeyRound} sx={{ width: 20, height: 20, color: "warning.main" }} />
          </Box>
          <DialogTitle sx={{ p: 0, mb: 0.5, fontSize: "1.125rem", fontWeight: 900 }}>
            Change PIN for {pinEditTarget?.Name}
          </DialogTitle>
          <DialogContentText sx={{ mb: 2, fontSize: "0.875rem" }}>
            Set a 4-digit PIN for cashier login. Leave it completely empty to allow login without a
            passcode.
          </DialogContentText>
          <TextField
            placeholder="Enter 4-Digit PIN (e.g. 1234)"
            value={editPinValue}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 4);
              setEditPinValue(v);
            }}
            type="text"
            disabled={updatingPin}
            autoFocus
            fullWidth
            slotProps={{
              htmlInput: {
                maxLength: 4,
                inputMode: "numeric",
                pattern: "[0-9]*",
                style: {
                  fontWeight: 700,
                  textAlign: "center",
                  fontSize: "1.125rem",
                  letterSpacing: "0.25em",
                },
              },
            }}
            sx={{ mb: 0 }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          <Button
            variant="outlined"
            onClick={() => setPinEditTarget(null)}
            disabled={updatingPin}
            sx={{ flex: 1, borderRadius: 2, fontWeight: 900, borderColor: "grey.300" }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleUpdatePin}
            disabled={updatingPin}
            sx={{
              flex: 1,
              borderRadius: 2,
              fontWeight: 900,
              bgcolor: "#D97706",
              "&:hover": { bgcolor: "#B45309" },
            }}
          >
            {updatingPin ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : "Save PIN"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        slotProps={{ paper: { sx: { borderRadius: 3, maxWidth: 400 } } }}
      >
        <DialogContent sx={{ p: 3 }}>
          {/* Icon */}
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: 2,
              bgcolor: "rgba(192,57,43,0.10)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              mb: 1.5,
            }}
          >
            <Box component={Trash2} sx={{ width: 20, height: 20, color: "error.main" }} />
          </Box>
          <DialogTitle sx={{ p: 0, mb: 0.5, fontSize: "1.125rem", fontWeight: 900 }}>
            Remove {deleteTarget?.Name}?
          </DialogTitle>
          <DialogContentText sx={{ fontSize: "0.875rem" }}>
            This removes their login access from the cashier portal. Their sales history will not be
            affected.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          <Button
            variant="outlined"
            onClick={() => setDeleteTarget(null)}
            disabled={deleting}
            sx={{ flex: 1, borderRadius: 2, fontWeight: 900, borderColor: "grey.300" }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleDelete}
            disabled={deleting}
            sx={{
              flex: 1,
              borderRadius: 2,
              fontWeight: 900,
              bgcolor: "error.main",
              "&:hover": { bgcolor: "error.dark" },
            }}
          >
            {deleting ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : "Remove"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StaffManagerPage() {
  const [sales, setSales] = useState<any[]>([]);
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dateRange, setDateRange] = useState<"all" | "7d" | "30d">("30d");
  const [tab, setTab] = useState<"performance" | "manage">("performance");

  const fetchData = async () => {
    setRefreshing(true);
    try {
      const [sRes, cRes] = await Promise.all([
        fetch("/api/sales"),
        fetch("/api/cashiers"),
      ]);
      const sJson = await sRes.json();
      const cJson = await cRes.json();
      setSales(sJson.data || []);
      setCashiers(cJson.data || []);
    } catch {
      toast.error("Could not load staff data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const now = new Date();

  const staffStats: StaffStats[] = useMemo(() => {
    const startDate =
      dateRange === "7d"
        ? subDays(now, 7)
        : dateRange === "30d"
        ? subDays(now, 30)
        : new Date("2020-01-01");

    const namesFromSales = new Set<string>(
      sales
        .map((s) => (s["LOGGED BY"] || s["Logged By"] || "").trim())
        .filter(Boolean)
    );
    cashiers.forEach((c) => {
      if (c.Name) namesFromSales.add(c.Name.trim());
    });

    return Array.from(namesFromSales)
      .filter((n) => n && n !== "Unknown")
      .map((name) => {
        const cashierSales = sales.filter((s) => {
          const n = (s["LOGGED BY"] || s["Logged By"] || "").trim();
          if (n !== name) return false;
          const d = new Date(s.DATE || s.Date || "");
          if (isNaN(d.getTime())) return true;
          return isWithinInterval(d, { start: startDate, end: now });
        });
        const todaySales = cashierSales.filter((s) => {
          const d = new Date(s.DATE || s.Date || "");
          return !isNaN(d.getTime()) && isSameDay(d, now);
        });
        const totalRevenue = cashierSales.reduce(
          (s, r) => s + parseAmt(r["AMOUNT (₦)"] || r["Amount (₦)"]),
          0
        );
        const totalCollected = cashierSales.reduce(
          (s, r) =>
            s +
            parseAmt(
              r["INITIAL PAYMENT (₦)"] ||
                r["INITIAL PAYMENT"] ||
                r["Initial Payment"]
            ),
          0
        );
        const totalDebt = cashierSales.reduce(
          (s, r) =>
            s +
            Math.max(
              0,
              parseAmt(r["AMOUNT DIFFERENCES"] || r["Amount Differences"])
            ),
          0
        );
        const collectionRate =
          totalRevenue > 0 ? (totalCollected / totalRevenue) * 100 : 0;
        const matMap: Record<string, number> = {};
        cashierSales.forEach((s) => {
          const mat = s.MATERIAL || s.Material || "Other";
          matMap[mat] = (matMap[mat] || 0) + 1;
        });
        const topMaterial =
          Object.entries(matMap).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
        const cashierRecord = cashiers.find((c) => c.Name?.trim() === name);
        return {
          name,
          totalJobs: cashierSales.length,
          totalRevenue,
          totalCollected,
          totalDebt,
          collectionRate,
          jobsToday: todaySales.length,
          revenueToday: todaySales.reduce(
            (s, r) => s + parseAmt(r["AMOUNT (₦)"] || r["Amount (₦)"]),
            0
          ),
          topMaterial,
          recentJobs: [...cashierSales]
            .sort(
              (a, b) =>
                new Date(b.DATE || b.Date || "").getTime() -
                new Date(a.DATE || a.Date || "").getTime()
            )
            .slice(0, 5),
          isOnline: cashierRecord ? isReallyOnline(cashierRecord) : false,
          lastLogin: cashierRecord?.["Last Login"] || "",
        };
      })
      .sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [sales, cashiers, dateRange]);

  const totals = useMemo(() => {
    const rev = staffStats.reduce((s, c) => s + c.totalRevenue, 0);
    const col = staffStats.reduce((s, c) => s + c.totalCollected, 0);
    const dbt = staffStats.reduce((s, c) => s + c.totalDebt, 0);
    return { rev, col, dbt, avgCollection: rev > 0 ? (col / rev) * 100 : 0 };
  }, [staffStats]);

  // ── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <LoadingAnimation text="Loading..." />
      </Box>
    );
  }

  // ── Tab toggle styles (shared) ────────────────────────────────────────────
  const toggleSx = {
    bgcolor: "grey.100",
    borderRadius: 2,
    p: 0.5,
    "& .MuiToggleButton-root": {
      border: "none",
      borderRadius: "8px !important",
      fontSize: "0.7rem",
      fontWeight: 700,
      px: 1.5,
      py: 0.625,
      textTransform: "uppercase",
      letterSpacing: "0.06em",
      "&.Mui-selected": {
        bgcolor: "primary.main",
        color: "#fff",
        boxShadow: "0 4px 14px rgba(200,71,46,.22)",
        "&:hover": { bgcolor: "primary.dark" },
      },
    },
  };

  // ── Summary card data ──────────────────────────────────────────────────────
  const summaryCards = [
    {
      label: "Active Staff",
      val: String(staffStats.length),
      sub: `${cashiers.filter((c) => isReallyOnline(c)).length} online now`,
      icon: Users,
      iconBg: "rgba(200,71,46,0.08)",
      iconColor: "primary.main",
    },
    {
      label: "Team Revenue",
      val:
        totals.rev >= 1000
          ? `₦${(totals.rev / 1000).toFixed(0)}k`
          : fmtMoney(totals.rev),
      sub: fmtMoney(totals.rev),
      icon: TrendingUp,
      iconBg: "rgba(46,125,91,0.08)",
      iconColor: "success.main",
    },
    {
      label: "Cash Collected",
      val:
        totals.col >= 1000
          ? `₦${(totals.col / 1000).toFixed(0)}k`
          : fmtMoney(totals.col),
      sub: `${totals.avgCollection.toFixed(0)}% collection rate`,
      icon: Wallet,
      iconBg: "rgba(59,130,246,0.08)",
      iconColor: "#3B82F6",
    },
    {
      label: "Team Debt",
      val:
        totals.dbt >= 1000
          ? `₦${(totals.dbt / 1000).toFixed(0)}k`
          : fmtMoney(totals.dbt),
      sub: "outstanding across all",
      icon: AlertTriangle,
      iconBg: totals.dbt > 0 ? "rgba(192,57,43,0.08)" : "grey.50",
      iconColor: totals.dbt > 0 ? "error.main" : "text.disabled",
    },
  ];

  return (
    <Box
      sx={{
        p: { xs: 2, md: 4 },
        bgcolor: "background.default",
        minHeight: "100vh",
        pb: 12,
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <Stack
        direction="row"
        sx={{ alignItems: "center", justifyContent: "space-between", gap: 2, mb: 3 }}
      >
        <Stack direction="row" sx={{ alignItems: "center", gap: 1.5 }}>
          <Link href="/bom03">
            <IconButton
              sx={{
                borderRadius: 2,
                border: "1px solid",
                borderColor: "grey.200",
                bgcolor: "background.paper",
                width: 36,
                height: 36,
              }}
            >
              <ArrowLeft size={16} />
            </IconButton>
          </Link>
          <Box>
            <Typography
              variant="h2"
              sx={{ fontSize: "1.5rem", fontWeight: 900, letterSpacing: "-0.02em" }}
            >
              Staff Manager
            </Typography>
            <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mt: 0.25 }}>
              Performance, access & user management
            </Typography>
          </Box>
        </Stack>
        <Button
          variant="outlined"
          size="small"
          onClick={fetchData}
          disabled={refreshing}
          startIcon={
            <Box
              component={RefreshCw}
              sx={{
                width: 14,
                height: 14,
                ...(refreshing && {
                  animation: "spin 1s linear infinite",
                  "@keyframes spin": {
                    from: { transform: "rotate(0deg)" },
                    to: { transform: "rotate(360deg)" },
                  },
                }),
              }}
            />
          }
          sx={{
            borderRadius: 2,
            borderColor: "grey.200",
            bgcolor: "background.paper",
            fontWeight: 900,
            fontSize: "0.75rem",
            px: 2,
          }}
        >
          Refresh
        </Button>
      </Stack>

      {/* ── Tab switcher ─────────────────────────────────────────────────── */}
      <Box sx={{ mb: 3 }}>
        <ToggleButtonGroup
          value={tab}
          exclusive
          onChange={(_, val) => val && setTab(val)}
          size="small"
          sx={toggleSx}
        >
          <ToggleButton value="performance" disableRipple>
            <Stack direction="row" sx={{ alignItems: "center", gap: 0.75 }}>
              <Box component={BarChart3} sx={{ width: 14, height: 14 }} />
              Performance
            </Stack>
          </ToggleButton>
          <ToggleButton value="manage" disableRipple>
            <Stack direction="row" sx={{ alignItems: "center", gap: 0.75 }}>
              <Box component={UserCheck} sx={{ width: 14, height: 14 }} />
              Manage Users
            </Stack>
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* ── Performance Tab ─────────────────────────────────────────────── */}
      {tab === "performance" && (
        <>
          {/* Date range filter */}
          <Box sx={{ mb: 3 }}>
            <ToggleButtonGroup
              value={dateRange}
              exclusive
              onChange={(_, val) => val && setDateRange(val)}
              size="small"
              sx={toggleSx}
            >
              {(["7d", "30d", "all"] as const).map((r) => (
                <ToggleButton key={r} value={r} disableRipple>
                  {r === "all" ? "All Time" : r}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>

          {/* Team summary cards */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(4, 1fr)" },
              gap: 1.5,
              mb: 3,
            }}
          >
            {summaryCards.map(({ label, val, sub, icon: Icon, iconBg, iconColor }) => (
              <Box
                key={label}
                sx={{
                  bgcolor: "background.paper",
                  borderRadius: 3,
                  border: "1px solid",
                  borderColor: "grey.100",
                  boxShadow: "0 1px 2px rgba(31,41,51,.04)",
                  p: 2,
                }}
              >
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: 2,
                    bgcolor: iconBg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    mb: 1.5,
                  }}
                >
                  <Box component={Icon} sx={{ width: 16, height: 16, color: iconColor }} />
                </Box>
                <Typography
                  sx={{
                    fontSize: "0.5625rem",
                    fontWeight: 900,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    color: "text.secondary",
                    mb: 0.25,
                  }}
                >
                  {label}
                </Typography>
                <Typography sx={{ fontSize: "1.25rem", fontWeight: 900, color: "text.primary" }}>
                  {val}
                </Typography>
                <Typography sx={{ fontSize: "0.625rem", color: "text.secondary", fontWeight: 500, mt: 0.25 }}>
                  {sub}
                </Typography>
              </Box>
            ))}
          </Box>

          {/* Staff cards */}
          {staffStats.length === 0 ? (
            <Box
              sx={{
                textAlign: "center",
                py: 10,
                bgcolor: "background.paper",
                borderRadius: 3,
                border: "1px solid",
                borderColor: "grey.100",
              }}
            >
              <Box component={Users} sx={{ width: 40, height: 40, color: "text.disabled", mx: "auto", mb: 1.5 }} />
              <Typography sx={{ fontSize: "0.875rem", fontWeight: 700, color: "text.secondary" }}>
                No staff activity found for this period
              </Typography>
            </Box>
          ) : (
            <Stack sx={{ gap: 1.5 }}>
              {staffStats.map((stats) => (
                <StaffCard key={`${stats.name}-${dateRange}`} stats={stats} />
              ))}
            </Stack>
          )}
        </>
      )}

      {/* ── Manage Users Tab ────────────────────────────────────────────── */}
      {tab === "manage" && (
        <ManageUsers cashiers={cashiers} onRefresh={fetchData} />
      )}
    </Box>
  );
}

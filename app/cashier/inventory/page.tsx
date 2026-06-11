"use client";
import { LoadingAnimation } from "@/components/loading-animation";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Package,
  RefreshCw,
  Search,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Ruler,
  ArrowLeft,
} from "lucide-react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Skeleton from "@mui/material/Skeleton";
import LinearProgress from "@mui/material/LinearProgress";
import InputAdornment from "@mui/material/InputAdornment";
import { toast } from "sonner";

type Material = Record<string, any>;

const parseNum = (v: any) =>
  parseFloat(String(v ?? "0").replace(/[^\d.-]/g, "")) || 0;

function StatusPill({ status }: { status: string }) {
  if (status === "Low Stock") {
    return (
      <Chip
        label={status}
        size="small"
        sx={{
          fontSize: "0.6rem",
          fontWeight: 900,
          bgcolor: "primary.light",
          color: "primary.dark",
          border: "none",
          height: 20,
        }}
      />
    );
  }
  if (status === "Out of Stock") {
    return (
      <Chip
        label={status}
        size="small"
        sx={{
          fontSize: "0.6rem",
          fontWeight: 900,
          bgcolor: "error.light",
          color: "error.dark",
          border: "none",
          height: 20,
        }}
      />
    );
  }
  // Active (default)
  return (
    <Chip
      label={status}
      size="small"
      sx={{
        fontSize: "0.6rem",
        fontWeight: 900,
        bgcolor: "success.light",
        color: "success.dark",
        border: "none",
        height: 20,
      }}
    />
  );
}

export default function CashierInventoryPage() {
  const router = useRouter();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");

  const fetchData = async () => {
    if (materials.length > 0) setRefreshing(true);
    try {
      const res = await fetch("/api/materials");
      const json = await res.json();
      if (res.ok) setMaterials(json.data || []);
      else toast.error(json.error || "Failed to load materials");
    } catch {
      toast.error("Network error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return materials.filter(
      (m) =>
        (m["Material Name"] || "").toLowerCase().includes(q) ||
        (m["Material ID"] || "").toLowerCase().includes(q)
    );
  }, [materials, search]);

  const stats = useMemo(
    () => ({
      active: materials.filter((m) => m.Status === "Active").length,
      lowStock: materials.filter((m) => m.Status === "Low Stock").length,
      outOfStock: materials.filter((m) => m.Status === "Out of Stock").length,
    }),
    [materials]
  );

  if (loading) {
    return (
      <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <LoadingAnimation text="Loading..." />
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, minHeight: "100vh", pb: 16 }}>
      {/* Header */}
      <Stack
        direction={{ xs: "column", md: "row" }}
        sx={{ alignItems: { md: "center" }, justifyContent: "space-between", gap: 2, mb: 4 }}
      >
        <Box>
          <Stack direction="row" sx={{ alignItems: "center", gap: 1.5 }}>
            <IconButton
              onClick={() => router.back()}
              size="small"
              sx={{
                display: { md: "none" },
                borderRadius: "10px",
                bgcolor: "background.paper",
                border: "1px solid",
                borderColor: "divider",
                transition: "transform 0.15s ease-out",
                "&:active": { transform: "scale(0.97)" },
              }}
            >
              <ArrowLeft size={16} />
            </IconButton>
            <Typography
              variant="h2"
              sx={{ fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1.2 }}
            >
              Material Stock
            </Typography>
            {refreshing && (
              <Box
                component={RefreshCw}
                size={16}
                sx={{ color: "primary.main", animation: "spin 1s linear infinite",
                  "@keyframes spin": { from: { transform: "rotate(0deg)" }, to: { transform: "rotate(360deg)" } },
                }}
              />
            )}
          </Stack>
          <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>
            Check available materials before logging a sale.
          </Typography>
        </Box>

        <Button
          variant="outlined"
          onClick={fetchData}
          disabled={refreshing}
          startIcon={
            <Box
              component={RefreshCw}
              size={16}
              sx={refreshing
                ? { animation: "spin 1s linear infinite", "@keyframes spin": { from: { transform: "rotate(0deg)" }, to: { transform: "rotate(360deg)" } } }
                : undefined}
            />
          }
          sx={{ width: { xs: "100%", md: "auto" }, borderRadius: "10px", height: 44, px: 3, fontWeight: 700 }}
        >
          Refresh
        </Button>
      </Stack>

      {/* Stats */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 2,
          mb: 4,
        }}
      >
        {[
          {
            title: "Available",
            val: stats.active,
            Icon: CheckCircle2,
            iconBg: "success.light",
            iconColor: "success.main",
          },
          {
            title: "Low Stock",
            val: stats.lowStock,
            Icon: AlertTriangle,
            iconBg: "primary.light",
            iconColor: "primary.main",
          },
          {
            title: "Out of Stock",
            val: stats.outOfStock,
            Icon: XCircle,
            iconBg: "error.light",
            iconColor: "error.main",
          },
        ].map((s) => (
          <Card key={s.title} sx={{ border: "none" }}>
            <CardContent
              sx={{
                p: 2,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                "&:last-child": { pb: 2 },
              }}
            >
              <Box>
                <Typography
                  sx={{
                    fontSize: "0.625rem",
                    fontWeight: 900,
                    color: "text.secondary",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    mb: 0.5,
                  }}
                >
                  {s.title}
                </Typography>
                <Typography sx={{ fontSize: "1.5rem", fontWeight: 900, lineHeight: 1 }}>
                  {s.val}
                </Typography>
              </Box>
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: "16px",
                  bgcolor: s.iconBg,
                  color: s.iconColor,
                  display: { xs: "none", sm: "flex" },
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <s.Icon size={20} />
              </Box>
            </CardContent>
          </Card>
        ))}
      </Box>

      {/* Search */}
      <TextField
        fullWidth
        placeholder="Search by material name..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        size="small"
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <Search size={16} />
              </InputAdornment>
            ),
          },
        }}
        sx={{
          mb: 3,
          "& .MuiOutlinedInput-root": {
            borderRadius: "10px",
            height: 44,
            bgcolor: "background.paper",
          },
        }}
      />

      {/* Materials grid */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(3, 1fr)" },
          gap: 2,
        }}
      >
        {filtered.length === 0 ? (
          <Box
            sx={{
              gridColumn: "1 / -1",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              py: 10,
              color: "text.secondary",
            }}
          >
            <Box component={Package} size={40} sx={{ mb: 1.5, opacity: 0.3 }} />
            <Typography sx={{ fontWeight: 700 }}>No materials found.</Typography>
          </Box>
        ) : (
          filtered.map((mat) => {
            const remaining = parseNum(mat["Total Remaining (ft)"]);
            const capacity = parseNum(mat["Total Capacity (ft)"]);
            const pct =
              capacity > 0 ? Math.min(100, (remaining / capacity) * 100) : 0;

            const progressColor =
              mat.Status === "Out of Stock"
                ? "error"
                : mat.Status === "Low Stock"
                ? "warning"
                : "success";

            const cardBorderColor =
              mat.Status === "Out of Stock"
                ? "error.light"
                : mat.Status === "Low Stock"
                ? "primary.light"
                : "transparent";

            return (
              <Card
                key={mat["Material ID"]}
                sx={{
                  border: "2px solid",
                  borderColor: cardBorderColor,
                  opacity: mat.Status === "Out of Stock" ? 0.7 : 1,
                  transition: "border-color 0.2s, opacity 0.2s",
                }}
              >
                <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
                  {/* Name + status */}
                  <Stack
                    direction="row"
                    sx={{ alignItems: "flex-start", justifyContent: "space-between", mb: 1.5 }}
                  >
                    <Box>
                      <Typography sx={{ fontWeight: 900, fontSize: "0.875rem" }}>
                        {mat["Material Name"]}
                      </Typography>
                      <Typography
                        sx={{
                          fontSize: "0.625rem",
                          color: "text.secondary",
                          fontFamily: "monospace",
                          mt: 0.25,
                        }}
                      >
                        {mat["Material ID"]}
                      </Typography>
                    </Box>
                    <StatusPill status={mat.Status || "Active"} />
                  </Stack>

                  {/* Width + remaining */}
                  <Stack
                    direction="row"
                    sx={{ alignItems: "center", justifyContent: "space-between", mb: 0.75 }}
                  >
                    <Stack direction="row" sx={{ alignItems: "center", gap: 0.5 }}>
                      <Ruler size={12} />
                      <Typography
                        sx={{
                          fontSize: "0.625rem",
                          fontWeight: 900,
                          color: "text.secondary",
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                        }}
                      >
                        {parseNum(mat["Width (ft)"])}ft wide
                      </Typography>
                    </Stack>
                    <Typography sx={{ fontSize: "0.875rem", fontWeight: 900 }}>
                      {remaining.toFixed(1)}ft left
                    </Typography>
                  </Stack>

                  {/* Progress bar */}
                  <LinearProgress
                    variant="determinate"
                    value={pct}
                    color={progressColor as "success" | "warning" | "error"}
                    sx={{
                      mt: 1.5,
                      mb: 0.5,
                      height: 8,
                      borderRadius: "16px",
                      bgcolor: "action.hover",
                    }}
                  />

                  {/* Status messages */}
                  {mat.Status === "Low Stock" && (
                    <Stack direction="row" sx={{ alignItems: "center", gap: 0.5, mt: 1 }}>
                      <AlertTriangle size={12} color="var(--mui-palette-primary-main)" />
                      <Typography
                        sx={{ fontSize: "0.625rem", fontWeight: 700, color: "primary.main" }}
                      >
                        Running low — inform admin
                      </Typography>
                    </Stack>
                  )}
                  {mat.Status === "Out of Stock" && (
                    <Stack direction="row" sx={{ alignItems: "center", gap: 0.5, mt: 1 }}>
                      <XCircle size={12} color="var(--mui-palette-error-main)" />
                      <Typography
                        sx={{ fontSize: "0.625rem", fontWeight: 700, color: "error.main" }}
                      >
                        Not available
                      </Typography>
                    </Stack>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </Box>
    </Box>
  );
}

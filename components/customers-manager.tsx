"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  RefreshCw, Search, Users, Wallet, ArrowUpDown,
  ShoppingBag, ChevronLeft, ChevronRight,
  TrendingUp, AlertCircle, CheckCircle2, Calendar,
  Activity, Download, Filter, PhoneCall, ArrowLeft,
} from "lucide-react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Skeleton from "@mui/material/Skeleton";
import InputAdornment from "@mui/material/InputAdornment";
import { useSyncStore } from "@/lib/store";
import { WhatsAppReminder } from "@/components/whatsapp-reminder";
import { formatDistanceToNow } from "date-fns";
import { CustomerTimelineModal } from "@/components/customer-timeline-modal";

// ── Helpers ───────────────────────────────────────────────────────────────────

const parseAmount = (val: any): number =>
  parseFloat(String(val ?? "0").replace(/[₦,\s]/g, "")) || 0;

const formatDate = (dateStr: string): string => {
  if (!dateStr || dateStr === "N/A") return "—";
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? dateStr : formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return dateStr;
  }
};

const getInitials = (name: string) =>
  name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");

const AVATAR_BG_COLORS = [
  "#7C3AED", "#3B82F6", "#10B981",
  "#F97316", "#F43F5E", "#06B6D4", "#F59E0B",
];
const getAvatarBg = (name: string) =>
  AVATAR_BG_COLORS[name.charCodeAt(0) % AVATAR_BG_COLORS.length];

// ── Types ─────────────────────────────────────────────────────────────────────

interface CustomerMetrics {
  name: string;
  contact: string;
  totalOrders: number;
  totalSpent: number;
  totalDebt: number;
  lastOrderDate: string;
}

type SortKey = "name" | "orders" | "spent" | "debt";

// ── Custom hook ───────────────────────────────────────────────────────────────

function useCustomers() {
  const { cachedSales, setCachedData, cachedExpenses, cachedInventory, cachedMaterials } = useSyncStore();
  const [loading, setLoading]       = useState(cachedSales.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]         = useState("");
  const [sortBy, setSortBy]         = useState<SortKey>("spent");
  const [sortOrder, setSortOrder]   = useState<"asc" | "desc">("desc");
  const [debtorsOnly, setDebtorsOnly] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedClient, setSelectedClient] = useState<{ name: string; contact: string } | null>(null);
  const ITEMS_PER_PAGE = 50;

  const fetchData = useCallback(async () => {
    if (cachedSales.length === 0) setLoading(true); else setRefreshing(true);
    try {
      const [sRes, eRes, pRes] = await Promise.all([
        fetch("/api/sales"),
        fetch("/api/expenses"),
        fetch("/api/payments"),
      ]);
      const [sJson, eJson, pJson] = await Promise.all([sRes.json(), eRes.json(), pRes.json()]);
      setCachedData(sJson.data ?? [], eJson.data ?? [], cachedInventory, pJson.data ?? [], cachedMaterials);
    } catch (err) {
      console.error("Customers: fetch error", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const customerMap = useMemo<CustomerMetrics[]>(() => {
    const map = new Map<string, CustomerMetrics>();
    cachedSales.forEach((s) => {
      const name    = (s["CLIENT NAME"] || s["Client Name"] || "Walking Customer").trim();
      const contact = (s["CONTACT"]     || s["Contact"]     || "").trim();
      const amount  = parseAmount(s["TOTAL"] || s["Total"] || s["AMOUNT (₦)"] || s["Amount (₦)"] || s["INITIAL PAYMENT (₦)"]);
      const total   = parseAmount(s["AMOUNT (₦)"]          || s["Amount (₦)"]);
      const init    = parseAmount(s["INITIAL PAYMENT (₦)"] || s["Initial Payment (₦)"]);
      const addl1   = parseAmount(s["ADDITIONAL PAYMENT 1"] || s["Additional Payment 1"]);
      const addl2   = parseAmount(s["ADDITIONAL PAYMENT 2"] || s["Additional Payment 2"]);
      const debt    = Math.max(0, total - init - addl1 - addl2);
      const date    = s["DATE"] || s["Date"] || "N/A";

      const existing = map.get(name);
      if (existing) {
        existing.totalOrders += 1;
        existing.totalSpent  += amount;
        existing.totalDebt   += debt;
        if (date !== "N/A" && (existing.lastOrderDate === "N/A" || new Date(date) > new Date(existing.lastOrderDate)))
          existing.lastOrderDate = date;
        if (!existing.contact && contact) existing.contact = contact;
      } else {
        map.set(name, { name, contact, totalOrders: 1, totalSpent: amount, totalDebt: debt, lastOrderDate: date });
      }
    });
    return Array.from(map.values());
  }, [cachedSales]);

  const filtered = useMemo(() =>
    customerMap.filter(c => {
      const q = search.toLowerCase();
      return (!debtorsOnly || c.totalDebt > 0) &&
        (c.name.toLowerCase().includes(q) || c.contact.includes(search));
    }),
    [customerMap, search, debtorsOnly],
  );

  const sorted = useMemo(() =>
    [...filtered].sort((a, b) => {
      const cmp =
        sortBy === "name"   ? a.name.localeCompare(b.name) :
        sortBy === "orders" ? a.totalOrders - b.totalOrders :
        sortBy === "spent"  ? a.totalSpent  - b.totalSpent :
                              a.totalDebt   - b.totalDebt;
      return sortOrder === "asc" ? cmp : -cmp;
    }),
    [filtered, sortBy, sortOrder],
  );

  const totalPages = Math.ceil(sorted.length / ITEMS_PER_PAGE);
  const paginated  = sorted.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  useEffect(() => { setCurrentPage(1); }, [search, sortBy, sortOrder, debtorsOnly]);

  const stats = useMemo(() => ({
    totalClients:    customerMap.length,
    aggregateDebt:   customerMap.reduce((s, c) => s + Math.max(0, c.totalDebt), 0),
    clientsWithDebt: customerMap.filter(c => c.totalDebt > 0).length,
    topSpender:      customerMap.length === 0 ? null :
                     customerMap.reduce((m, c) => c.totalSpent > m.totalSpent ? c : m, customerMap[0]),
  }), [customerMap]);

  const exportCSV = useCallback(() => {
    const rows = [
      ["Name", "Contact", "Orders", "Total Spent (₦)", "Debt (₦)", "Last Order"],
      ...sorted.map(c => [
        c.name, c.contact || "—", c.totalOrders,
        c.totalSpent.toFixed(2), c.totalDebt.toFixed(2),
        c.lastOrderDate === "N/A" ? "—" : c.lastOrderDate,
      ]),
    ].map(r => r.join(",")).join("\n");

    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([rows], { type: "text/csv" })),
      download: `customers-${new Date().toISOString().slice(0, 10)}.csv`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
  }, [sorted]);

  return {
    loading, refreshing, fetchData,
    search, setSearch,
    sortBy, setSortBy,
    sortOrder, setSortOrder,
    debtorsOnly, setDebtorsOnly,
    currentPage, setCurrentPage,
    totalPages, paginated, sorted,
    stats,
    selectedClient, setSelectedClient,
    exportCSV,
    ITEMS_PER_PAGE,
  };
}

// ── Skeleton components ───────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <TableRow>
      <TableCell sx={{ pl: 3, py: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Skeleton variant="circular" width={32} height={32} />
          <Skeleton variant="text" width={112} />
        </Box>
      </TableCell>
      <TableCell><Skeleton variant="text" width={96} /></TableCell>
      <TableCell align="center"><Skeleton variant="circular" width={28} height={28} sx={{ mx: "auto" }} /></TableCell>
      <TableCell align="right"><Skeleton variant="text" width={80} sx={{ ml: "auto" }} /></TableCell>
      <TableCell align="right"><Skeleton variant="text" width={64} sx={{ ml: "auto" }} /></TableCell>
      <TableCell align="center"><Skeleton variant="text" width={80} sx={{ mx: "auto" }} /></TableCell>
      <TableCell align="center"><Skeleton variant="text" width={64} sx={{ mx: "auto" }} /></TableCell>
    </TableRow>
  );
}

function SkeletonCard() {
  return (
    <Card>
      <CardContent>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1.5 }}>
          <Skeleton variant="circular" width={40} height={40} />
          <Box sx={{ flex: 1 }}>
            <Skeleton variant="text" width={128} />
            <Skeleton variant="text" width={96} />
          </Box>
          <Skeleton variant="rounded" width={32} height={32} />
        </Box>
        <Skeleton variant="rounded" height={56} />
      </CardContent>
    </Card>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ContactChip({ contact }: { contact: string }) {
  if (!contact) return (
    <Typography sx={{ fontSize: "0.7rem", color: "text.disabled" }}>—</Typography>
  );
  return (
    <Box
      component="a"
      href={`tel:${contact}`}
      onClick={(e: React.MouseEvent) => e.stopPropagation()}
      sx={{
        display: "inline-flex", alignItems: "center", gap: 0.5,
        fontSize: "0.7rem", fontWeight: 600, color: "text.secondary",
        textDecoration: "none",
        "&:hover": { color: "primary.main" },
        transition: "color .15s ease",
      }}
    >
      <PhoneCall size={12} />
      {contact}
    </Box>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1, py: 10, color: "text.disabled" }}>
      <Users size={40} opacity={0.2} />
      <Typography sx={{ fontSize: "0.875rem", fontWeight: 600 }}>
        {filtered ? "No clients match your filters." : "No clients yet."}
      </Typography>
    </Box>
  );
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <Box sx={{
      width: size, height: size, borderRadius: "50%",
      bgcolor: getAvatarBg(name),
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0, color: "#fff",
      fontSize: size <= 32 ? "0.65rem" : "0.8rem",
      fontWeight: 900,
    }}>
      {getInitials(name)}
    </Box>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CustomersPage({ isAdmin = true }: { isAdmin?: boolean }) {
  const router = useRouter();
  const {
    loading, refreshing, fetchData,
    search, setSearch,
    sortBy, setSortBy,
    sortOrder, setSortOrder,
    debtorsOnly, setDebtorsOnly,
    currentPage, setCurrentPage,
    totalPages, paginated, sorted,
    stats,
    selectedClient, setSelectedClient,
    exportCSV,
    ITEMS_PER_PAGE,
  } = useCustomers();

  const isFiltered = !!search || debtorsOnly;

  return (
    <Box sx={{ p: { xs: 1.5, md: 4 }, bgcolor: "background.default", minHeight: "100vh", pb: 16 }}>

      {/* ── Header ── */}
      <Box sx={{
        display: "flex", flexDirection: { xs: "column", md: "row" },
        alignItems: { md: "center" }, justifyContent: "space-between",
        gap: 2, mb: 4,
      }}>
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <IconButton
              size="small"
              onClick={() => router.back()}
              sx={{
                display: { md: "none" },
                bgcolor: "background.paper",
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 2,
              }}
            >
              <ArrowLeft size={16} />
            </IconButton>
            <Typography variant="h3" sx={{ fontWeight: 900, color: "primary.main", display: "flex", alignItems: "center", gap: 1 }}>
              <Users size={28} /> Customer Manager
            </Typography>
            {refreshing && (
              <Chip
                label={
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    <RefreshCw size={10} style={{ animation: "spin 1s linear infinite" }} />
                    Updating…
                  </Box>
                }
                size="small"
                color="primary"
                variant="outlined"
                sx={{ fontSize: "0.6rem", fontWeight: 700 }}
              />
            )}
          </Box>
          <Typography variant="body2" sx={{ color: "text.secondary", fontWeight: 600, mt: 0.5 }}>
            {stats.totalClients} clients · {stats.clientsWithDebt} with outstanding balance
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button
            variant="outlined"
            size="small"
            onClick={exportCSV}
            disabled={loading || sorted.length === 0}
            startIcon={<Download size={16} />}
            sx={{ borderRadius: 3, height: 44, px: 2, fontWeight: 700 }}
          >
            Export
          </Button>
          <Button
            variant="outlined"
            size="small"
            onClick={fetchData}
            disabled={loading || refreshing}
            startIcon={<RefreshCw size={16} style={{ animation: (loading || refreshing) ? "spin 1s linear infinite" : undefined }} />}
            sx={{ borderRadius: 3, height: 44, px: 2.5, fontWeight: 700 }}
          >
            {loading ? "Loading…" : refreshing ? "Updating…" : "Refresh"}
          </Button>
        </Box>
      </Box>

      {/* ── Summary Cards ── */}
      <Box sx={{
        display: "grid",
        gridTemplateColumns: isAdmin ? { xs: "1fr 1fr", md: "repeat(3, 1fr)" } : { xs: "1fr 1fr" },
        gap: 2, mb: 4,
      }}>
        {/* Total Clients */}
        <Card sx={{ overflow: "hidden", position: "relative" }}>
          <Box sx={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(200,71,46,.05) 0%, transparent 100%)" }} />
          <Box sx={{ position: "absolute", top: 0, left: 0, width: 4, height: "100%", bgcolor: "primary.main", borderRadius: "4px 0 0 4px" }} />
          <CardContent sx={{ position: "relative", p: 2, "&:last-child": { pb: 2 } }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
              <Typography sx={{ fontSize: "0.6rem", fontWeight: 900, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.12em" }}>
                Total Clients
              </Typography>
              <Box sx={{ p: 0.75, borderRadius: 2, bgcolor: "rgba(200,71,46,.1)", color: "primary.main", display: "flex" }}>
                <Users size={16} />
              </Box>
            </Box>
            <Typography sx={{ fontSize: "1.875rem", fontWeight: 900, color: "text.primary" }}>{stats.totalClients}</Typography>
            <Typography sx={{ fontSize: "0.6rem", color: "primary.main", fontWeight: 700, mt: 0.5, display: "flex", alignItems: "center", gap: 0.5 }}>
              <TrendingUp size={12} /> All-time unique clients
            </Typography>
          </CardContent>
        </Card>

        {/* Unpaid Debt */}
        <Card sx={{ overflow: "hidden", position: "relative" }}>
          <Box sx={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(244,63,94,.05) 0%, transparent 100%)" }} />
          <Box sx={{ position: "absolute", top: 0, left: 0, width: 4, height: "100%", bgcolor: "#F43F5E", borderRadius: "4px 0 0 4px" }} />
          <CardContent sx={{ position: "relative", p: 2, "&:last-child": { pb: 2 } }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
              <Typography sx={{ fontSize: "0.6rem", fontWeight: 900, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.12em" }}>
                Unpaid Debt
              </Typography>
              <Box sx={{ p: 0.75, borderRadius: 2, bgcolor: "rgba(244,63,94,.1)", color: "#F43F5E", display: "flex" }}>
                <Wallet size={16} />
              </Box>
            </Box>
            <Typography sx={{ fontSize: "1.5rem", fontWeight: 900, color: "text.primary" }}>₦{stats.aggregateDebt.toLocaleString()}</Typography>
            <Typography sx={{ fontSize: "0.6rem", color: "#E11D48", fontWeight: 700, mt: 0.5, display: "flex", alignItems: "center", gap: 0.5 }}>
              <AlertCircle size={12} /> Across {stats.clientsWithDebt} clients
            </Typography>
          </CardContent>
        </Card>

        {/* Top Spender (admin only) */}
        {isAdmin && (
          <Card sx={{ gridColumn: { xs: "1 / -1", md: "auto" }, overflow: "hidden", position: "relative" }}>
            <Box sx={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(16,185,129,.05) 0%, transparent 100%)" }} />
            <Box sx={{ position: "absolute", top: 0, left: 0, width: 4, height: "100%", bgcolor: "#10B981", borderRadius: "4px 0 0 4px" }} />
            <CardContent sx={{ position: "relative", p: 2, "&:last-child": { pb: 2 } }}>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
                <Typography sx={{ fontSize: "0.6rem", fontWeight: 900, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.12em" }}>
                  Top Spender
                </Typography>
                <Box sx={{ p: 0.75, borderRadius: 2, bgcolor: "rgba(16,185,129,.1)", color: "#10B981", display: "flex" }}>
                  <ShoppingBag size={16} />
                </Box>
              </Box>
              {stats.topSpender ? (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                  <Avatar name={stats.topSpender.name} size={36} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: "0.875rem", fontWeight: 900, color: "text.primary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {stats.topSpender.name}
                    </Typography>
                    <Typography sx={{ fontSize: "0.6rem", color: "#10B981", fontWeight: 700 }}>
                      ₦{stats.topSpender.totalSpent.toLocaleString()} · {stats.topSpender.totalOrders} orders
                    </Typography>
                  </Box>
                </Box>
              ) : (
                <Typography sx={{ fontSize: "0.875rem", color: "text.disabled" }}>No data yet</Typography>
              )}
            </CardContent>
          </Card>
        )}
      </Box>

      {/* ── Search & Filters ── */}
      <Box sx={{ display: "flex", flexDirection: { xs: "column", lg: "row" }, gap: 1.5, mb: 3 }}>
        <TextField
          placeholder="Search by name or contact…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          size="small"
          sx={{ flex: 1, "& .MuiOutlinedInput-root": { borderRadius: 3, height: 44, bgcolor: "background.paper" } }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={16} />
                </InputAdornment>
              ),
            },
          }}
        />
        <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>

          {/* Debtors-only toggle */}
          <Button
            onClick={() => setDebtorsOnly(v => !v)}
            variant={debtorsOnly ? "contained" : "outlined"}
            size="small"
            startIcon={<Filter size={14} />}
            sx={{
              height: 44, borderRadius: 3, fontSize: "0.75rem", fontWeight: 700,
              ...(debtorsOnly
                ? { bgcolor: "#E11D48", "&:hover": { bgcolor: "#BE123C" }, borderColor: "#E11D48" }
                : { bgcolor: "background.paper", borderColor: "divider", color: "text.secondary" }),
            }}
          >
            Debtors only
            {debtorsOnly && (
              <Box component="span" sx={{ ml: 0.5, bgcolor: "rgba(255,255,255,.25)", borderRadius: 1, px: 0.75, fontSize: "0.65rem" }}>
                {sorted.length}
              </Box>
            )}
          </Button>

          {/* Sort tabs */}
          <Box sx={{ display: "flex", bgcolor: "background.paper", p: 0.5, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
            {(["name", "orders", "spent", "debt"] as const).map(key => (
              <Box
                key={key}
                component="button"
                onClick={() => setSortBy(key)}
                sx={{
                  px: 1.5, py: 0.75, borderRadius: 2, fontSize: "0.75rem", fontWeight: 700,
                  border: "none", cursor: "pointer", transition: "background-color .15s, color .15s",
                  textTransform: "capitalize",
                  bgcolor: sortBy === key ? "rgba(200,71,46,.1)" : "transparent",
                  color: sortBy === key ? "primary.main" : "text.secondary",
                  "&:hover": { color: sortBy === key ? "primary.main" : "text.primary" },
                }}
              >
                {key === "spent" ? "Value" : key === "name" ? "Name" : key === "orders" ? "Orders" : "Debt"}
              </Box>
            ))}
          </Box>

          <IconButton
            onClick={() => setSortOrder(o => o === "asc" ? "desc" : "asc")}
            title={sortOrder === "asc" ? "Ascending" : "Descending"}
            sx={{ height: 44, width: 44, borderRadius: 3, border: "1px solid", borderColor: "divider", bgcolor: "background.paper" }}
          >
            <ArrowUpDown size={16} color="#C8472E" style={{ transform: sortOrder === "desc" ? "rotate(180deg)" : undefined, transition: "transform .2s" }} />
          </IconButton>
        </Box>
      </Box>

      {/* ── Desktop Table ── */}
      <Box sx={{ display: { xs: "none", md: "block" }, bgcolor: "background.paper", borderRadius: "16px", border: "1px solid", borderColor: "divider", overflow: "hidden" }}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: "rgba(0,0,0,.02)" }}>
              <TableCell sx={{ pl: 3, py: 2, fontSize: "0.6rem", fontWeight: 900, textTransform: "uppercase", color: "text.secondary", letterSpacing: "0.1em", border: "none" }}>Client</TableCell>
              <TableCell sx={{ fontSize: "0.6rem", fontWeight: 900, textTransform: "uppercase", color: "text.secondary", letterSpacing: "0.1em", border: "none" }}>Contact</TableCell>
              <TableCell align="center" sx={{ fontSize: "0.6rem", fontWeight: 900, textTransform: "uppercase", color: "text.secondary", letterSpacing: "0.1em", border: "none" }}>Orders</TableCell>
              {isAdmin && <TableCell align="right" sx={{ fontSize: "0.6rem", fontWeight: 900, textTransform: "uppercase", color: "text.secondary", letterSpacing: "0.1em", border: "none" }}>Total Value</TableCell>}
              <TableCell align="right" sx={{ fontSize: "0.6rem", fontWeight: 900, textTransform: "uppercase", color: "text.secondary", letterSpacing: "0.1em", border: "none" }}>Debt</TableCell>
              <TableCell align="center" sx={{ fontSize: "0.6rem", fontWeight: 900, textTransform: "uppercase", color: "text.secondary", letterSpacing: "0.1em", border: "none" }}>Last Order</TableCell>
              <TableCell align="center" sx={{ fontSize: "0.6rem", fontWeight: 900, textTransform: "uppercase", color: "text.secondary", letterSpacing: "0.1em", border: "none" }}>Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              Array.from({ length: 7 }).map((_, i) => <SkeletonRow key={i} />)
            ) : paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isAdmin ? 7 : 6} sx={{ border: "none" }}>
                  <EmptyState filtered={isFiltered} />
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((client, idx) => (
                <TableRow
                  key={idx}
                  hover
                  sx={{ cursor: "pointer", borderBottom: "1px solid", borderColor: "divider" }}
                  onClick={() => setSelectedClient({ name: client.name, contact: client.contact })}
                >
                  <TableCell sx={{ pl: 3, py: 1.5, border: "none" }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                      <Avatar name={client.name} size={32} />
                      <Typography sx={{ fontSize: "0.875rem", fontWeight: 700, color: "text.primary" }}>{client.name}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ border: "none" }} onClick={e => e.stopPropagation()}>
                    <ContactChip contact={client.contact} />
                  </TableCell>
                  <TableCell align="center" sx={{ border: "none" }}>
                    <Box sx={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: 28, height: 28, borderRadius: "50%",
                      bgcolor: "rgba(200,71,46,.1)", color: "primary.main",
                      fontSize: "0.75rem", fontWeight: 900,
                    }}>
                      {client.totalOrders}
                    </Box>
                  </TableCell>
                  {isAdmin && (
                    <TableCell align="right" sx={{ border: "none" }}>
                      <Typography sx={{ fontSize: "0.875rem", fontWeight: 900, color: "#10B981" }}>
                        ₦{client.totalSpent.toLocaleString()}
                      </Typography>
                    </TableCell>
                  )}
                  <TableCell align="right" sx={{ border: "none" }}>
                    {client.totalDebt <= 0 ? (
                      <Chip
                        icon={<CheckCircle2 size={12} />}
                        label="Cleared"
                        size="small"
                        sx={{
                          bgcolor: "rgba(16,185,129,.08)", color: "#10B981",
                          border: "1px solid rgba(16,185,129,.2)", fontWeight: 700, fontSize: "0.65rem",
                          "& .MuiChip-icon": { color: "#10B981" },
                        }}
                      />
                    ) : (
                      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0.5 }}>
                        <Typography sx={{ fontSize: "0.875rem", fontWeight: 900, color: "#E11D48" }}>
                          ₦{client.totalDebt.toLocaleString()}
                        </Typography>
                        {isAdmin && client.totalSpent > 0 && (
                          <Box sx={{ width: 64, height: 4, borderRadius: 2, bgcolor: "rgba(0,0,0,.08)", overflow: "hidden" }}>
                            <Box sx={{
                              height: "100%", borderRadius: 2, bgcolor: "#F87171",
                              width: `${Math.min(100, (client.totalDebt / client.totalSpent) * 100)}%`,
                            }} />
                          </Box>
                        )}
                      </Box>
                    )}
                  </TableCell>
                  <TableCell align="center" sx={{ border: "none" }}>
                    <Typography sx={{ fontSize: "0.7rem", fontWeight: 500, color: "text.disabled", display: "flex", alignItems: "center", justifyContent: "center", gap: 0.5 }}>
                      <Calendar size={12} />
                      {formatDate(client.lastOrderDate)}
                    </Typography>
                  </TableCell>
                  <TableCell align="center" sx={{ border: "none" }} onClick={e => e.stopPropagation()}>
                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0.75 }}>
                      <IconButton
                        size="small"
                        onClick={() => setSelectedClient({ name: client.name, contact: client.contact })}
                        title="View Timeline"
                        sx={{ border: "1px solid rgba(200,71,46,.2)", color: "primary.main", borderRadius: 2, "&:hover": { bgcolor: "rgba(200,71,46,.05)" } }}
                      >
                        <Activity size={16} />
                      </IconButton>
                      <WhatsAppReminder
                        clientName={client.name}
                        contact={client.contact || ""}
                        balance={client.totalDebt}
                        jobDescription="Outstanding balance reminder"
                        variant="icon"
                      />
                    </Box>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Box>

      {/* ── Mobile Cards ── */}
      <Box sx={{ display: { xs: "flex", md: "none" }, flexDirection: "column", gap: 1.5 }}>
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : paginated.length === 0 ? (
          <EmptyState filtered={isFiltered} />
        ) : (
          paginated.map((client, idx) => (
            <Card
              key={idx}
              onClick={() => setSelectedClient({ name: client.name, contact: client.contact })}
              sx={{ cursor: "pointer", overflow: "hidden", transition: "transform .15s ease", "&:active": { transform: "scale(.99)" } }}
            >
              <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
                {/* Header */}
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 1, mb: 1.5 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
                    <Avatar name={client.name} size={40} />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontSize: "0.875rem", fontWeight: 900, color: "text.primary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {client.name}
                      </Typography>
                      {client.contact ? (
                        <Box
                          component="a"
                          href={`tel:${client.contact}`}
                          onClick={(e: React.MouseEvent) => e.stopPropagation()}
                          sx={{ display: "flex", alignItems: "center", gap: 0.5, fontSize: "0.75rem", color: "primary.main", textDecoration: "none", mt: 0.25 }}
                        >
                          <PhoneCall size={12} /> {client.contact}
                        </Box>
                      ) : (
                        <Typography sx={{ fontSize: "0.65rem", color: "text.disabled", mt: 0.25 }}>No contact</Typography>
                      )}
                    </Box>
                  </Box>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    <IconButton
                      size="small"
                      onClick={() => setSelectedClient({ name: client.name, contact: client.contact })}
                      title="View Timeline"
                      sx={{ border: "1px solid rgba(200,71,46,.2)", color: "primary.main", borderRadius: 2, "&:hover": { bgcolor: "rgba(200,71,46,.05)" } }}
                    >
                      <Activity size={16} />
                    </IconButton>
                    <WhatsAppReminder
                      clientName={client.name}
                      contact={client.contact || ""}
                      balance={client.totalDebt}
                      jobDescription="Outstanding balance reminder"
                      variant="icon"
                    />
                  </Box>
                </Box>

                {/* Stats strip */}
                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", bgcolor: "rgba(0,0,0,.03)", borderRadius: 2, overflow: "hidden" }}>
                  <Box sx={{ textAlign: "center", p: 1.5 }}>
                    <Typography sx={{ fontSize: "0.55rem", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 900, color: "text.secondary" }}>Orders</Typography>
                    <Typography sx={{ fontSize: "0.875rem", fontWeight: 900, color: "primary.main", mt: 0.25 }}>{client.totalOrders}</Typography>
                  </Box>
                  <Box sx={{ textAlign: "center", p: 1.5, borderLeft: "1px solid", borderRight: "1px solid", borderColor: "divider" }}>
                    <Typography sx={{ fontSize: "0.55rem", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 900, color: "text.secondary" }}>
                      {isAdmin ? "Value" : "Jobs"}
                    </Typography>
                    <Typography sx={{ fontSize: "0.875rem", fontWeight: 900, color: "#10B981", mt: 0.25 }}>
                      {isAdmin ? `₦${(client.totalSpent / 1000).toFixed(0)}k` : client.totalOrders}
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: "center", p: 1.5 }}>
                    <Typography sx={{ fontSize: "0.55rem", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 900, color: "text.secondary" }}>Debt</Typography>
                    {client.totalDebt <= 0 ? (
                      <Typography sx={{ fontSize: "0.65rem", fontWeight: 900, color: "#10B981", mt: 0.25, display: "flex", alignItems: "center", justifyContent: "center", gap: 0.25 }}>
                        <CheckCircle2 size={12} /> Clear
                      </Typography>
                    ) : (
                      <Typography sx={{ fontSize: "0.875rem", fontWeight: 900, color: "#E11D48", mt: 0.25 }}>
                        ₦{(client.totalDebt / 1000).toFixed(0)}k
                      </Typography>
                    )}
                  </Box>
                </Box>

                {/* Footer */}
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mt: 1.25 }}>
                  <Typography sx={{ fontSize: "0.65rem", color: "text.disabled", display: "flex", alignItems: "center", gap: 0.5 }}>
                    <Calendar size={12} />
                    Last order {formatDate(client.lastOrderDate)}
                  </Typography>
                  {client.totalDebt > 0 && (
                    <Chip
                      label={`Owes ₦${(client.totalDebt / 1000).toFixed(0)}k`}
                      size="small"
                      sx={{
                        bgcolor: "rgba(225,29,72,.06)", color: "#E11D48",
                        border: "1px solid rgba(225,29,72,.15)", fontWeight: 900, fontSize: "0.55rem",
                        height: 20,
                      }}
                    />
                  )}
                </Box>
              </CardContent>
            </Card>
          ))
        )}
      </Box>

      {/* ── Pagination ── */}
      {sorted.length > ITEMS_PER_PAGE && (
        <Box sx={{
          mt: 4, display: "flex", flexDirection: { xs: "column", sm: "row" },
          alignItems: "center", justifyContent: "space-between", gap: 2,
          bgcolor: "background.paper", p: 2, borderRadius: "16px", border: "1px solid", borderColor: "divider",
        }}>
          <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, color: "text.secondary", order: { xs: 2, sm: 1 } }}>
            Showing{" "}
            <Box component="span" sx={{ color: "primary.main" }}>
              {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(sorted.length, currentPage * ITEMS_PER_PAGE)}
            </Box>
            {" "}of {sorted.length} customers
          </Typography>
          <Box sx={{ display: "flex", gap: 1, order: { xs: 1, sm: 2 }, width: { xs: "100%", sm: "auto" } }}>
            <Button
              variant="outlined"
              size="small"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              startIcon={<ChevronLeft size={16} />}
              sx={{ flex: { xs: 1, sm: "none" }, borderRadius: 3, height: 36, fontWeight: 900, fontSize: "0.75rem" }}
            >
              Back
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              endIcon={<ChevronRight size={16} />}
              sx={{ flex: { xs: 1, sm: "none" }, borderRadius: 3, height: 36, fontWeight: 900, fontSize: "0.75rem" }}
            >
              Next
            </Button>
          </Box>
        </Box>
      )}

      <CustomerTimelineModal
        isOpen={!!selectedClient}
        onClose={() => setSelectedClient(null)}
        clientName={selectedClient?.name ?? null}
        contact={selectedClient?.contact}
      />
    </Box>
  );
}

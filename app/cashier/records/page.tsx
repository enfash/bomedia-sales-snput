"use client";

import { useEffect, useState, Fragment, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  RefreshCw, Search, ArrowUpDown, ArrowLeft, ArrowRight,
  ChevronDown, ChevronRight, Printer, CalendarRange,
} from "lucide-react";
import { useSyncStore } from "@/lib/store";
import { RecordCard, type RecordStatus } from "@/components/record-card";
import { isSameDay, format, subDays, isWithinInterval, startOfDay } from "date-fns";
import { ManageSaleAction, type UnifiedRecord } from "@/components/manage-sale-action";
import { StatusBadge } from "@/components/status-badge";
import { SYSTEM_DEFAULTS } from "@/lib/constants";
import { ManageBatchAction } from "@/components/manage-batch-action";
import { WhatsAppReminder } from "@/components/whatsapp-reminder";
import { ReceiptModal } from "@/components/receipt-modal";
import { BatchCard } from "@/components/batch-card";
import { motion } from "framer-motion";

import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs from "dayjs";
import InputAdornment from "@mui/material/InputAdornment";
import Chip from "@mui/material/Chip";
import Skeleton from "@mui/material/Skeleton";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";

// ─── Animation Variants ───────────────────────────────────────────────────────

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.045, // 45ms staggered delay cascade
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as const }, // Spring cubic-bezier
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const parseAmount = (val: any): number => {
  if (val === undefined || val === null) return 0;
  const str = val.toString().replace(/[₦, \s]/g, "");
  return parseFloat(str) || 0;
};

const parseSheetDate = (dateStr: any): string => {
  if (!dateStr) return "N/A";
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? dateStr : format(d, "MMM dd, yyyy");
};

type Row = Record<string, string>;

// ─── StatusBadge ──────────────────────────────────────────────────────────────



// ─── Shared header cell sx ────────────────────────────────────────────────────

const TH = {
  fontSize: "0.625rem", fontWeight: 800, textTransform: "uppercase" as const,
  color: "text.secondary", letterSpacing: "0.08em", py: 2,
};

// ─── Filter pill button ───────────────────────────────────────────────────────

function PillBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button
      size="small"
      onClick={onClick}
      disableElevation
      sx={{
        borderRadius: "10px", px: 2, py: 0.75, minWidth: 0,
        fontSize: "0.75rem", fontWeight: 700, boxShadow: "none",
        bgcolor: active ? "primary.main" : "transparent",
        color: active ? "primary.contrastText" : "text.secondary",
        "&:hover": { bgcolor: active ? "primary.dark" : "action.hover" },
      }}
    >
      {children}
    </Button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CashierRecordsPage() {
  const router = useRouter();
  const { pendingQueue, cachedSales, cachedExpenses, cachedInventory, cachedPayments, cachedMaterials, setCachedData } = useSyncStore();

  const [salesData, setSalesData] = useState<Row[]>(cachedSales || []);
  const [loading, setLoading] = useState(cachedSales.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"All" | "Pending">("All");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = SYSTEM_DEFAULTS.PAGINATION_ITEMS_PER_PAGE;
  const [sortBy, setSortBy] = useState<"date" | "name" | "debt">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [groupReceiptRecords, setGroupReceiptRecords] = useState<UnifiedRecord[]>([]);
  const [dateRange, setDateRange] = useState<"today" | "7d" | "30d" | "custom">("today");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const fetchData = async () => {
    if (salesData.length === 0) setLoading(true);
    else setRefreshing(true);
    setError("");
    try {
      const salesRes = await fetch("/api/sales");
      const salesJson = await salesRes.json();
      const newSales = salesJson.data ?? [];
      setSalesData(newSales);
      setCachedData(newSales, cachedExpenses, cachedInventory, cachedPayments, cachedMaterials);
    } catch {
      if (salesData.length > 0) {
        console.warn("Currently offline. Using cached records.");
      } else {
        setError("Failed to load records.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    const handleOnline = () => fetchData();
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mapSale = (r: Row, isPending: boolean, timestamp?: number): UnifiedRecord => {
    const amount = parseAmount(r["AMOUNT (₦)"] || r["Amount (₦)"]);
    let status: RecordStatus = "In Progress";
    const rawStatus = r["PAYMENT STATUS"];
    if (rawStatus === "Paid") status = "Settled";
    else if (rawStatus === "Part-payment") status = "Part-payment";
    else if (rawStatus === "Unpaid") status = "In Progress";
    if (isPending) status = "Syncing";
    return {
      id: `sale-${r.DATE}-${r["CLIENT NAME"]}-${Math.random()}`,
      date: parseSheetDate(r.DATE || r.Date),
      type: "Sale",
      client: r["CLIENT NAME"] || r["Client Name"] || "N/A",
      contact: r["CONTACT"] || r["Contact"] || "",
      description: r["JOB DESCRIPTION"] || r["Job Description"] || "—",
      amount, status,
      loggedBy: r["Logged By"] || "Unknown",
      isPending,
      rowIndex: r._rowIndex ? parseInt(r._rowIndex.toString()) : undefined,
      timestamp,
      additionalPayment1: parseAmount(r["ADDITIONAL PAYMENT 1"] || r["Additional Payment 1"]),
      additionalPayment2: parseAmount(r["ADDITIONAL PAYMENT 2"] || r["Additional Payment 2"]),
      jobStatus: r["JOB STATUS"] || r["Job Status"] || "Quoted",
      balance: Math.max(0,
        amount
        - parseAmount(r["INITIAL PAYMENT (₦)"] || r["Initial Payment (₦)"])
        - parseAmount(r["ADDITIONAL PAYMENT 1"] || r["Additional Payment 1"])
        - parseAmount(r["ADDITIONAL PAYMENT 2"] || r["Additional Payment 2"])
      ),
      salesId: r["Sales ID"] || r["SALES ID"] || r["Sales Id"] || "",
      raw: r,
    };
  };

  const pendingSales = pendingQueue.filter(item => item.type === "sale").map(item => {
    const v = item.data;
    return mapSale({
      "DATE": v[0], "CLIENT NAME": v[1], "JOB DESCRIPTION": v[2], "CONTACT": v[3],
      "Material": v[4], "QTY": v[12], "AMOUNT (₦)": "0",
      "INITIAL PAYMENT (₦)": v[14], "PAYMENT STATUS": v[19],
      "JOB STATUS": v[20] || "Quoted", "Logged By": v[21],
      "ADDITIONAL PAYMENT 1": "0", "ADDITIONAL PAYMENT 2": "0",
      "AMOUNT DIFFERENCES": "0", "SALES ID": v[22],
    }, true, item.timestamp);
  });

  const syncedSales = salesData.map(r => mapSale(r, false));
  const allSales = [...pendingSales, ...syncedSales];

  const now = new Date();
  const sevenDaysAgo = subDays(now, 7);

  const dateFilterFn = (r: UnifiedRecord): boolean => {
    const dateStr = r.raw.DATE || r.raw.Date;
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    if (dateRange === "today") {
      if (isSameDay(d, now)) return true;
      if (isWithinInterval(d, { start: sevenDaysAgo, end: now }) && (r.balance || 0) > 0) return true;
      return false;
    }
    if (dateRange === "7d") return isWithinInterval(d, { start: subDays(now, 7), end: now });
    if (dateRange === "30d") return isWithinInterval(d, { start: subDays(now, 30), end: now });
    if (dateRange === "custom" && customStart && customEnd)
      return isWithinInterval(d, { start: startOfDay(new Date(customStart)), end: new Date(customEnd + "T23:59:59") });
    return false;
  };

  const dateFilteredRecords = allSales.filter(dateFilterFn);

  const filtered = dateFilteredRecords.filter(r => {
    const matchesSearch =
      r.client.toLowerCase().includes(search.toLowerCase()) ||
      r.description.toLowerCase().includes(search.toLowerCase());
    if (activeTab === "Pending") return matchesSearch && r.isPending;
    return matchesSearch;
  });

  const sorted = [...filtered].sort((a, b) => {
    let comparison = 0;
    if (sortBy === "date") {
      const timeA = new Date(a.date).getTime();
      const timeB = new Date(b.date).getTime();
      comparison = (isNaN(timeA) ? 0 : timeA) - (isNaN(timeB) ? 0 : timeB);
      if (comparison === 0) {
        if (a.isPending && !b.isPending) comparison = 1;
        else if (!a.isPending && b.isPending) comparison = -1;
        else if (a.isPending && b.isPending) comparison = (a.timestamp || 0) - (b.timestamp || 0);
        else comparison = (a.rowIndex || 0) - (b.rowIndex || 0);
      }
    } else if (sortBy === "name") {
      comparison = a.client.localeCompare(b.client);
    } else if (sortBy === "debt") {
      comparison = (a.balance || 0) - (b.balance || 0);
    }
    return sortOrder === "asc" ? comparison : -comparison;
  });

  type GroupUnit = { type: "group"; salesId: string; items: UnifiedRecord[] };
  type FlatUnit = { type: "flat"; record: UnifiedRecord };
  type DisplayUnit = GroupUnit | FlatUnit;

  const displayUnits: DisplayUnit[] = useMemo(() => {
    const groups = new Map<string, UnifiedRecord[]>();
    sorted.forEach(r => {
      if (r.salesId && r.salesId.trim() !== "" && r.type === "Sale") {
        const existing = groups.get(r.salesId) ?? [];
        existing.push(r);
        groups.set(r.salesId, existing);
      }
    });
    const seen = new Set<string>();
    const units: DisplayUnit[] = [];
    sorted.forEach(r => {
      if (r.salesId && r.salesId.trim() !== "" && r.type === "Sale") {
        if (!seen.has(r.salesId)) {
          seen.add(r.salesId);
          units.push({ type: "group", salesId: r.salesId, items: groups.get(r.salesId)! });
        }
      } else {
        units.push({ type: "flat", record: r });
      }
    });
    return units;
  }, [sorted]);

  const totalPages = Math.ceil(displayUnits.length / itemsPerPage);
  const paginatedUnits = displayUnits.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const groupStatus = (items: UnifiedRecord[]): RecordStatus => {
    if (items.some(r => r.status === "Syncing")) return "Syncing";
    if (items.every(r => r.status === "Settled")) return "Settled";
    if (items.some(r => r.status === "Part-payment")) return "Part-payment";
    return "In Progress";
  };

  const handleGroupReceipt = (items: UnifiedRecord[], salesId: string) => {
    setGroupReceiptRecords(items);
    setIsReceiptModalOpen(true);
  };

  useEffect(() => { setCurrentPage(1); }, [search, activeTab, sortBy, sortOrder, dateRange, customStart, customEnd]);

  return (
    <Box sx={{p: { xs: 3, md: 4 }, pb: { xs: 14, md: 4 }, minHeight: "100vh", bgcolor: "rgba(255, 167, 38, 0.02)"}}>

      {/* Header */}
      <Box sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, alignItems: { md: "center" }, justifyContent: { md: "space-between" }, gap: 2, mb: 4 }}>
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <IconButton
              size="small"
              onClick={() => router.back()}
              sx={{ display: { md: "none" }, bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: "10px"}}
            >
              <ArrowLeft size={16} />
            </IconButton>
            <Typography variant="h4" sx={{ fontWeight: 800, color: "primary.main" }}>
              Daily Sales Records
            </Typography>
            {refreshing && (
              <Chip
                label="Syncing..."
                size="small"
                icon={<RefreshCw size={10} className="animate-spin" />}
                sx={{ bgcolor: "rgba(247,104,8,0.1)", color: "primary.dark", fontWeight: 700, fontSize: "0.625rem", border: "1px solid", borderColor: "primary.light" }}
              />
            )}
          </Box>
          <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>
            Review all sales logged today.
          </Typography>
        </Box>
        <Button
          variant="outlined"
          size="small"
          onClick={fetchData}
          disabled={loading || refreshing}
          startIcon={<RefreshCw size={14} className={loading || refreshing ? "animate-spin" : ""} />}
          sx={{ width: { xs: "100%", md: "auto" }, height: 44, px: 3, borderRadius: "10px", fontWeight: 700 }}
        >
          {loading ? "Loading..." : refreshing ? "Updating..." : "Refresh"}
        </Button>
      </Box>

      {/* Date Range Filter */}
      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1, mb: 2 }}>
        <Box sx={{ display: "inline-flex", bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: "10px", p: 0.5, gap: 0.5, flexShrink: 0 }}>
          {(["today", "7d", "30d"] as const).map(id => (
            <PillBtn key={id} active={dateRange === id} onClick={() => setDateRange(id)}>
              {id === "today" ? "Today" : id === "7d" ? "7D" : "30D"}
            </PillBtn>
          ))}
          <IconButton
            size="small"
            onClick={() => setDateRange("custom")}
            sx={{
              borderRadius: "10px", p: 0.75,
              bgcolor: dateRange === "custom" ? "primary.main" : "transparent",
              color: dateRange === "custom" ? "primary.contrastText" : "text.secondary",
              "&:hover": { bgcolor: dateRange === "custom" ? "primary.dark" : "action.hover" },
            }}
          >
            <CalendarRange size={14} />
          </IconButton>
        </Box>
        {dateRange === "custom" && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <DatePicker
              value={customStart ? dayjs(customStart) : null}
              onChange={(newVal) => setCustomStart(newVal ? newVal.format("YYYY-MM-DD") : "")}
              maxDate={customEnd ? dayjs(customEnd) : undefined}
              slotProps={{ textField: { size: "small", sx: { width: 140 } } }}
            />
            <Typography variant="caption" sx={{ color: "text.disabled" }}>→</Typography>
            <DatePicker
              value={customEnd ? dayjs(customEnd) : null}
              onChange={(newVal) => setCustomEnd(newVal ? newVal.format("YYYY-MM-DD") : "")}
              minDate={customStart ? dayjs(customStart) : undefined}
              slotProps={{ textField: { size: "small", sx: { width: 140 } } }}
            />
          </Box>
        )}
      </Box>

      {/* Search + Sort + Tab Bar */}
      <Box sx={{ display: "flex", flexDirection: { xs: "column", lg: "row" }, gap: 2, mb: 3 }}>
        <TextField
          fullWidth size="small"
          placeholder="Search by client or job description..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={16} />
                </InputAdornment>
              ),
            },
          }}
          sx={{ flex: 1 }}
        />

        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          <Box sx={{ display: "inline-flex", bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: "10px", p: 0.5, gap: 0.5 }}>
            {[{ id: "date", label: "Date" }, { id: "name", label: "Name" }, { id: "debt", label: "Debt" }].map(opt => (
              <PillBtn key={opt.id} active={sortBy === opt.id} onClick={() => setSortBy(opt.id as any)}>
                {opt.label}
              </PillBtn>
            ))}
          </Box>
          <IconButton
            size="small"
            onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
            title={sortOrder === "asc" ? "Ascending" : "Descending"}
            sx={{
              width: 44, height: 44, borderRadius: "10px",
              bgcolor: "background.paper", border: "1px solid", borderColor: "divider",
              color: "primary.main",
              transform: sortOrder === "desc" ? "rotate(180deg)" : "none",
              transition: "transform 0.2s ease",
            }}
          >
            <ArrowUpDown size={16} />
          </IconButton>
        </Box>

        <Box sx={{ display: "inline-flex", bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: "10px", p: 0.5, gap: 0.5 }}>
          {["All", "Pending"].map(tab => (
            <PillBtn key={tab} active={activeTab === tab} onClick={() => setActiveTab(tab as any)}>
              {tab}
            </PillBtn>
          ))}
        </Box>
      </Box>

      {/* Desktop Table */}
      <Box sx={{ display: { xs: "none", md: "block" }, mb: 2 }}>
        <TableContainer component={Paper} sx={{ borderRadius: "16px", border: "1px solid", borderColor: "divider" }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: "grey.50" }}>
                <TableCell sx={TH}>Client</TableCell>
                <TableCell sx={TH}>Description</TableCell>
                <TableCell sx={{ ...TH, textAlign: "right" }}>Amount</TableCell>
                <TableCell sx={{ ...TH, textAlign: "right" }}>Debt</TableCell>
                <TableCell sx={{ ...TH, textAlign: "center" }}>Status</TableCell>
                <TableCell sx={TH}>Logged By</TableCell>
                <TableCell sx={{ ...TH, textAlign: "center" }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && paginatedUnits.length === 0 ? (
                [0,1,2,3,4,5].map(i => (
                  <TableRow key={i} sx={{ borderBottom: "1px solid", borderColor: "divider" }}>
                    <TableCell><Skeleton variant="text" width={96} /></TableCell>
                    <TableCell><Skeleton variant="text" width={160} /></TableCell>
                    <TableCell><Box sx={{ display: "flex", justifyContent: "flex-end" }}><Skeleton variant="text" width={80} /></Box></TableCell>
                    <TableCell><Box sx={{ display: "flex", justifyContent: "flex-end" }}><Skeleton variant="text" width={64} /></Box></TableCell>
                    <TableCell><Box sx={{ display: "flex", justifyContent: "center" }}><Skeleton variant="rounded" width={80} height={20} sx={{ borderRadius: "16px"}} /></Box></TableCell>
                    <TableCell><Skeleton variant="text" width={64} /></TableCell>
                    <TableCell><Box sx={{ display: "flex", justifyContent: "center" }}><Skeleton variant="rounded" width={80} height={32} sx={{ borderRadius: "10px"}} /></Box></TableCell>
                  </TableRow>
                ))
              ) : paginatedUnits.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} sx={{ textAlign: "center", py: 10, color: "text.disabled" }}>
                    No records found matching your search.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedUnits.map(unit => {
                  if (unit.type === "flat") {
                    const r = unit.record;
                    return (
                      <TableRow key={r.id} sx={{ borderBottom: "1px solid", borderColor: "divider", "&:hover": { bgcolor: "grey.50" }, transition: "background-color 0.15s" }}>
                        <TableCell sx={{ fontSize: "0.875rem", fontWeight: 700 }}>{r.client}</TableCell>
                        <TableCell sx={{ fontSize: "0.75rem", color: "text.secondary", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.description}</TableCell>
                        <TableCell sx={{ fontSize: "0.875rem", fontWeight: 800, textAlign: "right", fontFamily: "monospace" }}>₦{r.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell sx={{ fontSize: "0.875rem", fontWeight: 700, color: "error.main", textAlign: "right", fontFamily: "monospace" }}>₦{(r.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell sx={{ textAlign: "center" }}><StatusBadge status={r.status} /></TableCell>
                        <TableCell sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{r.loggedBy}</TableCell>
                        <TableCell sx={{ textAlign: "center" }}>
                          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0.5 }}>
                            <WhatsAppReminder clientName={r.client} contact={r.contact || ""} balance={r.balance || 0} jobDescription={r.description} variant="icon" />
                            {r.type === "Sale" && (
                              <IconButton size="small" sx={{ color: "primary.main", "&:hover": { bgcolor: "primary.50" } }} onClick={() => handleGroupReceipt([r], r.salesId || "")}>
                                <Printer size={16} />
                              </IconButton>
                            )}
                            <ManageSaleAction record={r} onUpdate={fetchData} />
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  }

                  const isExpanded = expandedGroups.has(unit.salesId);
                  const totalAmt = unit.items.reduce((s, i) => s + i.amount, 0);
                  const totalBal = unit.items.reduce((s, i) => s + (i.balance || 0), 0);
                  const firstItem = unit.items[0];

                  return (
                    <Fragment key={unit.salesId}>
                      <TableRow
                        sx={{
                          borderBottom: "1px solid", borderColor: "divider", cursor: "pointer", transition: "background-color 0.15s",
                          bgcolor: isExpanded ? "rgba(247,104,8,0.04)" : "background.paper",
                          "&:hover": { bgcolor: isExpanded ? "rgba(247,104,8,0.06)" : "grey.50" },
                        }}
                        onClick={() => {
                          const next = new Set(expandedGroups);
                          if (next.has(unit.salesId)) next.delete(unit.salesId);
                          else next.add(unit.salesId);
                          setExpandedGroups(next);
                        }}
                      >
                        <TableCell sx={{ fontWeight: 800, py: 2 }}>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            {isExpanded ? <ChevronDown size={16} color="#F76808" /> : <ChevronRight size={16} color="#F76808" />}
                            {firstItem.client}
                            <Typography variant="caption" sx={{ color: "text.secondary", ml: 1 }}>{unit.salesId}</Typography>
                          </Box>
                        </TableCell>
                        <TableCell sx={{ fontSize: "0.75rem", fontWeight: 700, color: "primary.main" }}>{unit.items.length} Batched Items</TableCell>
                        <TableCell sx={{ fontSize: "0.875rem", fontWeight: 800, textAlign: "right", fontFamily: "monospace" }}>₦{totalAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell sx={{ fontSize: "0.875rem", fontWeight: 800, color: "error.main", textAlign: "right", fontFamily: "monospace" }}>₦{totalBal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell sx={{ textAlign: "center" }}><StatusBadge status={groupStatus(unit.items)} /></TableCell>
                        <TableCell sx={{ fontSize: "0.75rem", color: "text.secondary" }}>Multiple</TableCell>
                        <TableCell sx={{ textAlign: "center" }} onClick={e => e.stopPropagation()}>
                          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0.5 }}>
                            <IconButton size="small" sx={{ color: "primary.main", "&:hover": { bgcolor: "primary.50" } }} onClick={() => handleGroupReceipt(unit.items, unit.salesId)}>
                              <Printer size={16} />
                            </IconButton>
                            <ManageBatchAction variant="icon" records={unit.items} salesId={unit.salesId} onUpdate={fetchData} />
                          </Box>
                        </TableCell>
                      </TableRow>
                      {isExpanded && unit.items.map(item => (
                        <TableRow key={item.id} sx={{ bgcolor: "grey.50", borderBottom: "1px solid", borderColor: "divider" }}>
                          <TableCell sx={{ pl: 4, fontSize: "0.75rem", color: "text.disabled" }}>—</TableCell>
                          <TableCell sx={{ fontSize: "0.75rem", fontWeight: 700, color: "text.secondary" }}>{item.description || "No description"}</TableCell>
                          <TableCell sx={{ fontSize: "0.875rem", fontWeight: 800, textAlign: "right", fontFamily: "monospace" }}>₦{item.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                          <TableCell sx={{ fontSize: "0.875rem", fontWeight: 700, color: "error.light", textAlign: "right", fontFamily: "monospace" }}>₦{(item.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                          <TableCell sx={{ textAlign: "center" }}><StatusBadge status={item.status} /></TableCell>
                          <TableCell sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{item.loggedBy}</TableCell>
                          <TableCell sx={{ textAlign: "center" }}><ManageSaleAction record={item} onUpdate={fetchData} /></TableCell>
                        </TableRow>
                      ))}
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      {/* Mobile Cards */}
      <Box sx={{ display: { md: "none" } }}>
        {loading && paginatedUnits.length === 0 ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, pt: 0.5 }}>
            {[0,1,2,3].map(i => (
              <Paper key={i} variant="outlined" sx={{ borderRadius: "16px", p: 2 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1.5 }}>
                  <Box><Skeleton variant="text" width={112} /><Skeleton variant="text" width={176} /></Box>
                  <Skeleton variant="rounded" width={80} height={20} sx={{ borderRadius: "16px"}} />
                </Box>
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Skeleton variant="text" width={64} />
                  <Skeleton variant="text" width={96} />
                </Box>
              </Paper>
            ))}
          </Box>
        ) : paginatedUnits.length === 0 ? (
          <Box sx={{ textAlign: "center", py: 10, color: "text.disabled" }}>No records found.</Box>
        ) : (
          <Box
            component={motion.div}
            variants={containerVariants}
            initial="hidden"
            animate="show"
            sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}
          >
            {paginatedUnits.map(unit => {
              const key = unit.type === "group" ? unit.salesId : unit.record.id;
              return (
                <motion.div key={key} variants={itemVariants}>
                  {unit.type === "group" ? (
                    <BatchCard salesId={unit.salesId} records={unit.items} onUpdate={fetchData} />
                  ) : (
                    <RecordCard
                      date={unit.record.date} type={unit.record.type} client={unit.record.client}
                      description={unit.record.description}
                      amount={`₦${unit.record.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                      status={unit.record.status} isPending={unit.record.isPending}
                      record={unit.record} onUpdate={fetchData} allSalesContext={allSales}
                    />
                  )}
                </motion.div>
              );
            })}
          </Box>
        )}
      </Box>

      {/* Pagination */}
      {totalPages > 1 && (
        <Paper variant="outlined" sx={{ mt: 4, display: "flex", alignItems: "center", justifyContent: "space-between", p: 2, borderRadius: "16px"}}>
          <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>
            Page <Box component="span" sx={{ color: "primary.main" }}>{currentPage}</Box> of {totalPages}
            <Box component="span" sx={{ ml: 1, opacity: 0.5 }}>({displayUnits.length} units)</Box>
          </Typography>
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button variant="outlined" size="small" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} startIcon={<ArrowLeft size={14} />} sx={{ borderRadius: "10px", fontWeight: 700 }}>Back</Button>
            <Button variant="outlined" size="small" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} endIcon={<ArrowRight size={14} />} sx={{ borderRadius: "10px", fontWeight: 700 }}>Next</Button>
          </Box>
        </Paper>
      )}

      <ReceiptModal
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        records={groupReceiptRecords}
        salesId={groupReceiptRecords[0]?.salesId}
      />
    </Box>
  );
}

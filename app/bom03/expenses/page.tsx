"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ExpenseEntry } from "@/components/expense-entry";
import { StatusBadge } from "@/components/status-badge";
import {
  Receipt, ArrowLeft, Plus, X, RefreshCw, ChevronDown, ChevronUp,
  ExternalLink, Loader2, CheckCircle2, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { useSyncStore } from "@/lib/store";

import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Chip from "@mui/material/Chip";

type Expense = {
  DATE: string; AMOUNT: string; CATEGORY: string; DESCRIPTION: string;
  "PAID TO": string; "PAYMENT METHOD": string; "RECEIPT URL": string;
  "Logged By": string; STATUS: string; "PAID BY": string; "PAID AT": string; TIMESTAMP: string;
};

function formatDate(d: string) {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTime(d: string) {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  return date.toLocaleString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}



function ExpenseRow({ expense, onStatusToggle }: {
  expense: Expense;
  onStatusToggle: (timestamp: string, newStatus: "Paid" | "Unpaid") => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [toggling, setToggling] = useState(false);
  const isPaid = expense.STATUS === "Paid";

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setToggling(true);
    await onStatusToggle(expense.TIMESTAMP, isPaid ? "Unpaid" : "Paid");
    setToggling(false);
  };

  return (
    <Box sx={{ borderBottom: "1px solid", borderColor: "divider", "&:last-child": { borderBottom: "none" } }}>
      <Box
        component="button"
        type="button"
        onClick={() => setExpanded(v => !v)}
        sx={{
          width: "100%", display: "flex", alignItems: "center", gap: 1.5, px: 2, py: 1.75,
          textAlign: "left", bgcolor: "transparent", border: "none", cursor: "pointer",
          "&:hover": { bgcolor: "action.hover" }, transition: "background-color 0.15s",
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
            <Typography variant="body2" sx={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {expense.CATEGORY}
            </Typography>
            {expense["PAID TO"] && (
              <Typography variant="caption" sx={{ color: "text.secondary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                · {expense["PAID TO"]}
              </Typography>
            )}
          </Box>
          <Typography variant="caption" sx={{ color: "text.secondary", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", mt: 0.25 }}>
            {formatDate(expense.DATE)}{expense.DESCRIPTION ? ` · ${expense.DESCRIPTION}` : ""}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 800, color: "error.main" }}>
            ₦{Number(expense.AMOUNT || 0).toLocaleString()}
          </Typography>
          <StatusBadge variant="expenses" status={expense.STATUS || "Unpaid"} />
          {expanded ? <ChevronUp size={16} color="#9CA3AF" /> : <ChevronDown size={16} color="#9CA3AF" />}
        </Box>
      </Box>

      {expanded && (
        <Box sx={{ px: 2, pb: 2, pt: 0.5, bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.100' : 'grey.50' }}>
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, mb: 2 }}>
            <Box>
              <Typography sx={{ fontSize: "0.625rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary", mb: 0.25 }}>Method</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>{expense["PAYMENT METHOD"] || "—"}</Typography>
            </Box>
            <Box>
              <Typography sx={{ fontSize: "0.625rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary", mb: 0.25 }}>Logged By</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>{expense["Logged By"] || "—"}</Typography>
            </Box>
            {expense.DESCRIPTION && (
              <Box sx={{ gridColumn: "span 2" }}>
                <Typography sx={{ fontSize: "0.625rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary", mb: 0.25 }}>Description</Typography>
                <Typography variant="body2">{expense.DESCRIPTION}</Typography>
              </Box>
            )}
            {expense["RECEIPT URL"] && (
              <Box sx={{ gridColumn: "span 2" }}>
                <Typography sx={{ fontSize: "0.625rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary", mb: 0.5 }}>Receipt</Typography>
                <Box component="a" href={expense["RECEIPT URL"]} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                  sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, fontSize: "0.75rem", fontWeight: 800, color: "primary.main", textDecoration: "none", "&:hover": { textDecoration: "underline" } }}>
                  <ExternalLink size={12} />
                  View Receipt
                </Box>
              </Box>
            )}
          </Box>

          <Box sx={{ borderTop: "1px solid", borderColor: "divider", pt: 1.5 }}>
            <Typography sx={{ fontSize: "0.625rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary", mb: 1 }}>Payment Status</Typography>
            {isPaid && expense["PAID BY"] && (
              <Typography variant="caption" sx={{ color: "success.main", display: "block", mb: 1 }}>
                Marked paid by <strong>{expense["PAID BY"]}</strong> on {formatDateTime(expense["PAID AT"])}
              </Typography>
            )}
            <Button
              size="small"
              disabled={toggling}
              onClick={handleToggle}
              sx={{
                height: 32, px: 2, borderRadius: 2, fontSize: "0.6875rem", fontWeight: 800, boxShadow: "none",
                bgcolor: isPaid 
                  ? (theme) => theme.palette.mode === "dark" ? "rgba(192, 57, 43, 0.15)" : "#fee2e2"
                  : (theme) => theme.palette.mode === "dark" ? "rgba(46, 125, 91, 0.15)" : "#d1fae5",
                color: isPaid 
                  ? (theme) => theme.palette.mode === "dark" ? "#fca5a5" : "#991b1b"
                  : (theme) => theme.palette.mode === "dark" ? "#6ee7b7" : "#065f46",
                border: "1px solid",
                borderColor: isPaid 
                  ? (theme) => theme.palette.mode === "dark" ? "rgba(192, 57, 43, 0.3)" : "#fca5a5"
                  : (theme) => theme.palette.mode === "dark" ? "rgba(46, 125, 91, 0.3)" : "#86efac",
                "&:hover": { 
                  bgcolor: isPaid 
                    ? (theme) => theme.palette.mode === "dark" ? "rgba(192, 57, 43, 0.25)" : "#fecaca"
                    : (theme) => theme.palette.mode === "dark" ? "rgba(46, 125, 91, 0.25)" : "#bbf7d0", 
                  boxShadow: "none" 
                },
              }}
            >
              {toggling ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : isPaid ? "Mark as Unpaid" : "Mark as Paid"}
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  );
}

export default function ExpensesPage() {
  const router = useRouter();
  const { cachedExpenses, cachedSales, cachedInventory, cachedPayments, cachedMaterials, setCachedData } = useSyncStore();

  const [expenses, setExpenses] = useState<Expense[]>(() =>
    cachedExpenses.length > 0 ? [...cachedExpenses].reverse() : []
  );
  const [loading, setLoading] = useState(cachedExpenses.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"All" | "Paid" | "Unpaid">("All");
  const [showForm, setShowForm] = useState(false);

  const fetchExpenses = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch("/api/expenses");
      if (!res.ok) throw new Error("Failed to fetch");
      const { data } = await res.json();
      const sorted = (data as Expense[]).reverse();
      setExpenses(sorted);
      setCachedData(cachedSales, data, cachedInventory, cachedPayments, cachedMaterials);
      if (isManual) toast.success("Expenses refreshed");
    } catch {
      toast.error("Could not load expenses.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [cachedSales, cachedInventory, cachedPayments, cachedMaterials, setCachedData]);

  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  const handleStatusToggle = async (timestamp: string, newStatus: "Paid" | "Unpaid") => {
    const userName = localStorage.getItem("userName") || "Unknown";
    try {
      const res = await fetch("/api/expenses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timestamp, status: newStatus, paidBy: userName }),
      });
      if (!res.ok) throw new Error("Failed to update");
      setExpenses(prev => prev.map(e =>
        e.TIMESTAMP === timestamp
          ? { ...e, STATUS: newStatus, "PAID BY": newStatus === "Paid" ? userName : "", "PAID AT": newStatus === "Paid" ? new Date().toISOString() : "" }
          : e
      ));
      toast.success(`Marked as ${newStatus}`);
    } catch {
      toast.error("Failed to update status. Try again.");
    }
  };

  const filtered = expenses.filter(e => filter === "All" || (e.STATUS || "Unpaid") === filter);
  const unpaidExpenses = expenses.filter(e => (e.STATUS || "Unpaid") === "Unpaid");
  const totalUnpaid = unpaidExpenses.reduce((sum, e) => sum + (Number(e.AMOUNT) || 0), 0);

  return (
    <Box sx={{p: { xs: 3, md: 4 }, pb: { xs: 14, md: 4 }, maxWidth: 768, minHeight: "100vh"}}>
      {/* Header */}
      <Box sx={{ mb: 2.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5, mb: 0.5 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <IconButton size="small" onClick={() => router.back()} sx={{ display: { md: "none" }, bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
              <ArrowLeft size={16} />
            </IconButton>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Receipt size={20} color="#2E388E" />
              <Typography variant="h4" sx={{ fontWeight: 800 }}>Expenses</Typography>
            </Box>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <IconButton size="small" onClick={() => fetchExpenses(true)} disabled={refreshing}
              sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
              <RefreshCw size={16} style={refreshing ? { animation: "spin 1s linear infinite" } : undefined} />
            </IconButton>
            <Button
              size="small"
              onClick={() => setShowForm(v => !v)}
              variant={showForm ? "outlined" : "contained"}
              startIcon={showForm ? <X size={14} /> : <Plus size={14} />}
              sx={{ height: 36, px: 2, borderRadius: 2, fontWeight: 800, fontSize: "0.75rem" }}
            >
              {showForm ? "Cancel" : "New"}
            </Button>
          </Box>
        </Box>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>Track and manage business expenses.</Typography>
      </Box>

      {/* Unpaid alert */}
      {totalUnpaid > 0 && (
        <Box sx={{ 
          display: "flex", alignItems: "center", gap: 1, px: 2, py: 1.25, borderRadius: 2.5, 
          bgcolor: (theme) => theme.palette.mode === "dark" ? "rgba(192, 57, 43, 0.15)" : "#fff1f2", 
          border: "1px solid",
          borderColor: (theme) => theme.palette.mode === "dark" ? "rgba(192, 57, 43, 0.3)" : "#fecdd3", 
          mb: 2 
        }}>
          <Clock size={16} color="#f43f5e" style={{ flexShrink: 0 }} />
          <Typography variant="body2" sx={{ fontWeight: 800, color: (theme) => theme.palette.mode === "dark" ? "#fca5a5" : "#9f1239" }}>
            ₦{totalUnpaid.toLocaleString()} unpaid
          </Typography>
          <Typography variant="caption" sx={{ color: (theme) => theme.palette.mode === "dark" ? "text.secondary" : "#f43f5e" }}>
            across {unpaidExpenses.length} expense{unpaidExpenses.length !== 1 ? "s" : ""}
          </Typography>
        </Box>
      )}

      {/* Inline form */}
      {showForm && (
        <Box sx={{ mb: 3 }}>
          <ExpenseEntry onSaved={() => { fetchExpenses(); setShowForm(false); }} />
        </Box>
      )}

      {/* Filter pills */}
      <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
        {(["All", "Unpaid", "Paid"] as const).map(f => (
          <Button key={f} size="small" onClick={() => setFilter(f)}
            variant={filter === f ? "contained" : "outlined"}
            sx={{ borderRadius: 2, fontWeight: 800, fontSize: "0.75rem", height: 32, px: 2 }}>
            {f}
          </Button>
        ))}
      </Box>

      {/* Expense list */}
      <Paper variant="outlined" sx={{ borderRadius: "16px", overflow: "hidden", mb: 3 }}>
        {loading ? (
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1, py: 6, color: "text.secondary" }}>
            <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
            <Typography variant="body2">Loading expenses...</Typography>
          </Box>
        ) : filtered.length === 0 ? (
          <Box sx={{ py: 6, textAlign: "center" }}>
            <Receipt size={32} color="#D1D5DB" style={{ margin: "0 auto 8px" }} />
            <Typography variant="body2" sx={{ fontWeight: 800, color: "text.disabled" }}>
              {filter === "All" ? "No expenses logged yet" : `No ${filter.toLowerCase()} expenses`}
            </Typography>
          </Box>
        ) : (
          filtered.map((expense, i) => (
            <ExpenseRow key={expense.TIMESTAMP ? `${expense.TIMESTAMP}-${i}` : i} expense={expense} onStatusToggle={handleStatusToggle} />
          ))
        )}
      </Paper>
    </Box>
  );
}

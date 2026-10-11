"use client";

import { useCallback, useEffect, useState } from "react";
import { parseAmount } from "@/lib/financial-utils";
import { useRouter } from "next/navigation";
import { Alert } from '@mui/material';
import { ExpensePaymentSheet } from '@/components/expense-payment-sheet';
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
import { expenseStyles as styles } from "@/app/theme";

export type Expense = {
  _expenseId?:string; _amountKobo?:string; _payable?:boolean; _backend?:string;
  "EXPENSE ID"?:string;
  _rowIndex?: number;
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
  onStatusToggle: (expense: Expense, newStatus: "Paid" | "Unpaid") => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [toggling, setToggling] = useState(false);
  const isPaid = expense.STATUS === "Paid";

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setToggling(true);
    await onStatusToggle(expense, isPaid ? "Unpaid" : "Paid");
    setToggling(false);
  };

  return (
    <Box sx={styles.row}>
      <Box component="button" type="button" onClick={() => setExpanded(v => !v)} sx={styles.rowButton}>
        <Box sx={styles.rowMain}>
          <Box sx={styles.titleLine}>
            <Typography variant="body2" sx={styles.category}>{expense.CATEGORY}</Typography>
            {expense["PAID TO"] && <Typography variant="caption" sx={styles.payee}>· {expense["PAID TO"]}</Typography>}
          </Box>
          <Typography variant="caption" sx={styles.meta}>
            {formatDate(expense.DATE)}{expense.DESCRIPTION ? ` · ${expense.DESCRIPTION}` : ""}
          </Typography>
        </Box>
        <Box sx={styles.rowEnd}>
          <Typography variant="body2" sx={styles.amount}>₦{parseAmount(expense.AMOUNT).toLocaleString()}</Typography>
          <StatusBadge variant="expenses" status={expense.STATUS || "Unpaid"} />
          <Box component="span" sx={styles.chevron}>{expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</Box>
        </Box>
      </Box>

      {expanded && (
        <Box sx={styles.details}>
          <Box sx={styles.detailGrid}>
            <Box>
              <Typography sx={styles.label}>Method</Typography>
              <Typography variant="body2" sx={styles.value}>{expense["PAYMENT METHOD"] || "—"}</Typography>
            </Box>
            <Box>
              <Typography sx={styles.label}>Logged By</Typography>
              <Typography variant="body2" sx={styles.value}>{expense["Logged By"] || "—"}</Typography>
            </Box>
            {expense['EXPENSE ID']&&<Typography variant="caption">{expense['EXPENSE ID']}</Typography>}
            {expense.DESCRIPTION && (
              <Box sx={styles.span2}>
                <Typography sx={styles.label}>Description</Typography>
                <Typography variant="body2">{expense.DESCRIPTION}</Typography>
              </Box>
            )}
            {expense["RECEIPT URL"] && (
              <Box sx={styles.span2}>
                <Typography sx={styles.labelReceipt}>Receipt</Typography>
                <Box component="a" href={expense["RECEIPT URL"]} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} sx={styles.receiptLink}>
                  <ExternalLink size={12} />
                  View Receipt
                </Box>
              </Box>
            )}
          </Box>

          <Box sx={styles.statusBlock}>
            <Typography sx={styles.labelStatus}>Payment Status</Typography>
            {isPaid && expense["PAID BY"] && (
              <Typography variant="caption" sx={styles.paidBy}>
                Marked paid by <strong>{expense["PAID BY"]}</strong> on {formatDateTime(expense["PAID AT"])}
              </Typography>
            )}
            {expense._backend==='postgres'&&expense.STATUS==='Unpaid'&&!expense._payable&&<Alert severity="warning">Opening balance review required. This historical expense has no accepted liability in the books yet. Keep its original amount, date and receipt for the final-import reconciliation.</Alert>}
            {!(expense._backend==='postgres'&&(isPaid||!expense._payable))&&<Button
              size="small"
              disabled={toggling}
              onClick={handleToggle}
              sx={[styles.toggle, isPaid ? styles.markUnpaid : styles.markPaid]}
            >
              {toggling ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : isPaid ? "Mark as Unpaid" : "Mark as Paid"}
            </Button>}
          </Box>
        </Box>
      )}
    </Box>
  );
}

export default function ExpensesPage() {
  const router = useRouter();
  // Selectors rather than destructuring the whole store: subscribing to
  // everything re-rendered this page on any unrelated write in the app.
  const cachedExpenses = useSyncStore((s) => s.cachedExpenses);
  const lastSyncTime = useSyncStore((s) => s.lastSyncTime);
  const setCachedData = useSyncStore((s) => s.setCachedData);

  const [expenses, setExpenses] = useState<Expense[]>(() =>
    cachedExpenses.length > 0 ? [...cachedExpenses].reverse() : []
  );
  const [loading, setLoading] = useState(cachedExpenses.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"All" | "Paid" | "Unpaid">("All");
  const [showForm, setShowForm] = useState(false);
  const [paying,setPaying]=useState<Expense|null>(null);

  const fetchExpenses = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch("/api/expenses");
      if (!res.ok) throw new Error("Failed to fetch");
      const { data } = await res.json();
      // Copy before reversing — Array.reverse mutates, so reversing `data`
      // in place meant the array handed to the cache was already flipped and
      // the effect below flipped it a second time.
      setExpenses([...(data as Expense[])].reverse());
      // Read the other slices at call time instead of listing them as
      // dependencies. They are only passed through, but as dependencies they
      // gave this callback a new identity every time anything else in the
      // store was replaced, which re-triggered the fetch effect.
      const { cachedSales, cachedInventory, cachedPayments, cachedMaterials } =
        useSyncStore.getState();
      useSyncStore.setState({cachedExpenses:data});
      if (isManual) toast.success("Expenses refreshed");
    } catch {
      toast.error("Could not load expenses.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [setCachedData]);

  // Fetch on mount, and again when a background sync reports new data.
  useEffect(() => { fetchExpenses(); }, [fetchExpenses, lastSyncTime]);

  useEffect(() => {
    if (cachedExpenses) {
      setExpenses([...cachedExpenses].reverse());
    }
  }, [cachedExpenses]);

  const handleStatusToggle = async (expense: Expense, newStatus: "Paid" | "Unpaid") => {
    if(expense._backend==='postgres'){
      if(newStatus==='Paid'&&expense._payable)setPaying(expense);
      return;
    }
    const timestamp=expense.TIMESTAMP;
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
  const totalUnpaid = unpaidExpenses.reduce((sum, e) => sum + parseAmount(e.AMOUNT), 0);

  return (
    <Box sx={styles.page}>
      <Box sx={styles.header}>
        <Box sx={styles.headerRow}>
          <Box sx={styles.headerStart}>
            <IconButton size="small" onClick={() => router.back()} sx={styles.backButton}>
              <ArrowLeft size={16} />
            </IconButton>
            <Box sx={styles.titleBox}>
              <Box component="span" sx={styles.headerIcon}><Receipt size={20} /></Box>
              <Typography variant="h4" sx={styles.title}>Expenses</Typography>
            </Box>
          </Box>
          <Box sx={styles.actions}>
            <IconButton size="small" onClick={() => fetchExpenses(true)} disabled={refreshing} sx={styles.iconButton}>
              <RefreshCw size={16} style={refreshing ? { animation: "spin 1s linear infinite" } : undefined} />
            </IconButton>
            <Button
              size="small"
              onClick={() => setShowForm(v => !v)}
              variant={showForm ? "outlined" : "contained"}
              startIcon={showForm ? <X size={14} /> : <Plus size={14} />}
              sx={styles.newButton}
            >
              {showForm ? "Cancel" : "New"}
            </Button>
          </Box>
        </Box>
        <Typography variant="body2" sx={styles.subtitle}>Track and manage business expenses.</Typography>
      </Box>

      {/* Unpaid alert */}
      {totalUnpaid > 0 && (
        <Box sx={styles.alert}>
          <Box component="span" sx={styles.alertIcon}><Clock size={16} /></Box>
          <Typography variant="body2" sx={styles.alertAmount}>₦{totalUnpaid.toLocaleString()} unpaid</Typography>
          <Typography variant="caption" sx={styles.alertNote}>
            across {unpaidExpenses.length} expense{unpaidExpenses.length !== 1 ? "s" : ""}
          </Typography>
        </Box>
      )}

      {/* Inline form */}
      {showForm && (
        <Box sx={styles.form}>
          <ExpenseEntry onSaved={() => { fetchExpenses(); setShowForm(false); }} />
        </Box>
      )}

      <ExpensePaymentSheet expense={paying} onClose={()=>setPaying(null)}/>
      {/* Filter pills */}
      <Box sx={styles.filters}>
        {(["All", "Unpaid", "Paid"] as const).map(f => (
          <Button key={f} size="small" onClick={() => setFilter(f)} variant={filter === f ? "contained" : "outlined"} sx={styles.filterButton}>
            {f}
          </Button>
        ))}
      </Box>

      {/* Expense list */}
      <Paper variant="outlined" sx={styles.list}>
        {loading ? (
          <Box sx={styles.loading}>
            <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
            <Typography variant="body2">Loading expenses...</Typography>
          </Box>
        ) : filtered.length === 0 ? (
          <Box sx={styles.empty}>
            <Box sx={styles.emptyIcon}><Receipt size={32} /></Box>
            <Typography variant="body2" sx={styles.emptyText}>
              {filter === "All" ? "No expenses logged yet" : `No ${filter.toLowerCase()} expenses`}
            </Typography>
          </Box>
        ) : (
          filtered.map((expense, i) => (
            <ExpenseRow key={expense._expenseId ?? expense._rowIndex ?? `${expense.TIMESTAMP}-${expense.DESCRIPTION}-${i}`} expense={expense} onStatusToggle={handleStatusToggle} />
          ))
        )}
      </Paper>
    </Box>
  );
}

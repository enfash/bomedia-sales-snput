"use client";

import { useSyncStore } from "@/lib/store";
import { Bell, Clock, AlertTriangle, User, TrendingUp, TrendingDown, CheckCircle2, WifiOff, AlertCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { format, isToday, isYesterday } from "date-fns";
import { toast } from "sonner";
import IconButton from "@mui/material/IconButton";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import { activityStyles as styles } from "@/app/theme";
import { SidePanel } from "@/components/side-panel";

type ActivityType = "sale" | "expense" | "inventory";

interface ActivityItem {
  type: ActivityType;
  id: string;
  timestamp: string;
  user?: string;
  client?: string;
  description: string;
  material?: string;
  category?: string;
  amount: number;
  paid?: number;
  balance?: number;
  status?: string;
  stock?: number;
  itemName?: string;
  rowIndex?: number;
}

export function ActivityFeed() {
  const { cachedSales, cachedExpenses, cachedInventory, cachedMaterials, pendingQueue } = useSyncStore();
  const [isRestocking, setIsRestocking] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tabValue, setTabValue] = useState(0);

  const activityItems = useMemo(() => {
    const parseVal = (val: any) => {
      if (val === undefined || val === null) return 0;
      const str = val.toString().replace(/[₦,\s]/g, "");
      return parseFloat(str) || 0;
    };

    const sales = cachedSales.map((s) => ({
      type: "sale" as const,
      id: s["SALES ID"] || `s-${s._rowIndex}`,
      timestamp: s["TIMESTAMP"] || s["Timestamp"] || s["DATE"] || s["Date"],
      user: s["LOGGED BY"] || s["Logged By"] || "Staff",
      client: s["CLIENT NAME"] || s["Client Name"] || "Walking Customer",
      description: s["JOB DESCRIPTION"] || s["Job Description"] || "General Printing",
      material: s["MATERIAL"] || s["Material"] || "General",
      amount: parseVal(s["TOTAL"] || s["Total"]),
      paid: parseVal(s["INITIAL PAYMENT (₦)"] || s["INITIAL PAYMENT"] || s["Initial Payment"]),
      balance: parseVal(s["AMOUNT DIFFERENCES"] || s["Amount Differences"] || s["BALANCE"] || s["Balance"]),
      status: s["PAYMENT STATUS"] || s["Payment Status"],
    }));

    const expenses = cachedExpenses.map((e, idx) => ({
      type: "expense" as const,
      id: `e-${idx}`,
      timestamp: e["TIMESTAMP"] || e["Timestamp"] || e["DATE"] || e["Date"],
      user: e["Logged By"] || e["LOGGED BY"] || "Staff",
      category: e["CATEGORY"] || e["Category"] || "General",
      description: e["DESCRIPTION"] || e["Description"] || "Miscellaneous expense",
      amount: parseVal(e["AMOUNT"] || e["Amount"]),
    }));

    const combined = [...sales, ...expenses];

    return combined
      .filter((item) => item.timestamp)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 30);
  }, [cachedSales, cachedExpenses]);

  const alerts = useMemo(() => {
    const parseVal = (val: any) => {
      if (val === undefined || val === null) return 0;
      const str = val.toString().replace(/[₦,\s]/g, "");
      return parseFloat(str) || 0;
    };

    const inventory = (cachedMaterials || [])
      .filter((mat) => {
        const remaining = parseVal(mat["Total Remaining (ft)"]);
        const threshold = parseVal(mat["Low Stock Threshold (ft)"] || 20);
        return remaining <= threshold;
      })
      .map((mat) => {
        const remaining = parseVal(mat["Total Remaining (ft)"]);
        const activeRollId = mat["Active Roll ID"];
        const activeRoll = cachedInventory.find(r => r["Roll ID"] === activeRollId);

        return {
          type: "inventory" as const,
          id: `m-${mat["Material ID"]}`,
          description: `Aggregate stock level for ${mat["Material Name"]} is ${(remaining <= 0.1 ? "CRITICAL" : "LOW")}`,
          itemName: mat["Material Name"],
          stock: remaining,
          rowIndex: activeRoll ? activeRoll._rowIndex : mat._rowIndex,
          critical: remaining <= 0.1,
        };
      });

    const pending = pendingQueue.map((item) => ({
      type: "pending" as const,
      id: item.id,
      description: `Pending sync: ${item.type.toUpperCase()}`,
      actionType: item.type,
      timestamp: item.timestamp,
    }));

    return {
      inventory,
      pending,
      totalCount: inventory.length + pending.length,
      criticalCount: inventory.filter(i => i.critical).length
    };
  }, [cachedInventory, cachedMaterials, pendingQueue]);

  const groupedActivities = useMemo(() => {
    const groups: Record<string, ActivityItem[]> = {};

    activityItems.forEach((item) => {
      let dateKey = "";
      try {
        const date = new Date(item.timestamp);
        if (isToday(date)) dateKey = "Today";
        else if (isYesterday(date)) dateKey = "Yesterday";
        else dateKey = format(date, "MMMM dd, yyyy");
      } catch (e) {
        dateKey = "Unknown Date";
      }

      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(item);
    });

    return groups;
  }, [activityItems]);

  const handleRestock = async (rowIndex: number, itemName: string) => {
    setIsRestocking(rowIndex);
    try {
      const res = await fetch("/api/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowIndex, adjustment: 164 })
      });
      if (res.ok) {
        toast.success(`Restocked 164ft of ${itemName}!`);
      } else {
        toast.error("Restock failed");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setIsRestocking(null);
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return format(date, "h:mm a");
    } catch (e) {
      return "";
    }
  };

  return (
    <>
      <IconButton aria-label="Notifications" onClick={() => setDrawerOpen(true)} sx={styles.bell}>
        <Bell size={20} />
        {alerts.totalCount > 0 && <Box component="span" sx={styles.bellDot} />}
      </IconButton>

      <SidePanel open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Activity & System Alerts" subtitle="Recent updates & warnings" icon={<Clock size={20} />}>
        <Box sx={styles.tabsWrap}>
          <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} variant="fullWidth" sx={styles.tabs}>
            <Tab label={<Box sx={styles.tabLabel}><Clock size={14} /><span>Updates ({activityItems.length})</span></Box>} />
            <Tab label={
              <Box sx={styles.tabLabel}>
                <AlertTriangle size={14} />
                <span>Alerts</span>
                {alerts.totalCount > 0 && <Chip label={alerts.totalCount} size="small" sx={[styles.countChip, alerts.criticalCount > 0 ? styles.countCritical : styles.countWarning]} />}
              </Box>
            } />
          </Tabs>
        </Box>

        {tabValue === 0 && (
          <Box sx={styles.scroll}>
            {Object.keys(groupedActivities).length === 0 ? (
              <Box sx={styles.empty}>
                <Box sx={styles.emptyIcon}><Bell size={32} /></Box>
                <Typography sx={styles.emptyTitle}>Quiet on the front</Typography>
                <Typography variant="caption" sx={styles.emptyText}>New transactions will appear here.</Typography>
              </Box>
            ) : (
              Object.entries(groupedActivities).map(([date, items]) => (
                <Box key={date} sx={styles.day}>
                  <Box sx={styles.dayHead}>
                    <Box sx={styles.dayRule} />
                    <Typography variant="caption" sx={styles.dayLabel}>{date}</Typography>
                    <Box sx={styles.dayRule} />
                  </Box>

                  <Box sx={styles.list}>
                    {items.map((item) => (
                      <Box key={item.id} sx={styles.item}>
                        <Box sx={[styles.itemIcon, item.type === "sale" ? styles.itemIconSale : styles.itemIconExpense]}>
                          {item.type === "sale" ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
                        </Box>

                        <Box sx={styles.itemBody}>
                          <Box sx={styles.itemTop}>
                            <Typography variant="caption" sx={styles.metaLabel}>{item.type} • {formatTime(item.timestamp)}</Typography>
                            {item.user && (
                              <Box sx={styles.userPill}>
                                <User size={10} />
                                <Typography variant="caption" sx={styles.userName}>{item.user}</Typography>
                              </Box>
                            )}
                          </Box>

                          <Typography sx={styles.itemTitle}>
                            {item.type === "sale" ? `New Sale for ${item.client}` : `Expense: ${item.category}`}
                          </Typography>
                          <Typography variant="caption" sx={styles.itemNote}>{item.description}</Typography>

                          {item.type === "sale" && (
                            <Box sx={styles.tags}>
                              <Box sx={styles.tagOk}>Paid: ₦{item.paid?.toLocaleString()}</Box>
                              <Box sx={item.balance! > 0 ? styles.tagWarn : styles.tagOk}>Bal: ₦{item.balance?.toLocaleString()}</Box>
                            </Box>
                          )}

                          {item.type === "expense" && (
                            <Box sx={styles.tags}><Box sx={styles.tagWarn}>Amount: ₦{item.amount.toLocaleString()}</Box></Box>
                          )}
                        </Box>
                      </Box>
                    ))}
                  </Box>
                </Box>
              ))
            )}
          </Box>
        )}

        {tabValue === 1 && (
          <Box sx={styles.scroll}>
            {alerts.totalCount === 0 ? (
              <Box sx={styles.empty}>
                <Box sx={[styles.emptyIcon, styles.emptyIconOk]}><CheckCircle2 size={32} /></Box>
                <Typography sx={styles.emptyTitle}>All systems operational</Typography>
                <Typography variant="caption" sx={styles.emptyText}>No low stock warnings or pending offline actions.</Typography>
              </Box>
            ) : (
              <Box sx={styles.sections}>
                {alerts.pending.length > 0 && (
                  <Box>
                    <Box sx={styles.pillWarn}><WifiOff size={14} />Offline Sync Queue ({alerts.pending.length})</Box>
                    <Box sx={styles.stack1}>
                      {alerts.pending.map((p) => (
                        <Box key={p.id} sx={styles.pendingRow}>
                          <Box>
                            <Typography sx={styles.pendingTitle}>{p.description}</Typography>
                            <Typography sx={styles.pendingTime}>Queued: {format(new Date(p.timestamp), "h:mm a")}</Typography>
                          </Box>
                          <Box sx={styles.pendingBadge}>Pending Sync</Box>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                )}

                {alerts.inventory.length > 0 && (
                  <Box>
                    <Box sx={styles.pillError}><AlertCircle size={14} />Material Stock Alerts ({alerts.inventory.length})</Box>
                    <Box sx={styles.stack15}>
                      {alerts.inventory.map((item) => {
                        const look = styles.stock[item.critical ? "critical" : "low"];
                        return (
                          <Box key={item.id} sx={look.card}>
                            <Box sx={styles.stockRow}>
                              <Box>
                                <Box sx={styles.stockName}>
                                  <Box sx={look.dot} />
                                  <Typography sx={styles.stockTitle}>{item.itemName}</Typography>
                                </Box>
                                <Typography sx={styles.stockDesc}>{item.description}</Typography>
                                <Box sx={look.tag}>Stock: {item.stock.toFixed(1)} ft remaining</Box>
                              </Box>

                              <Button size="small" variant="outlined" disabled={isRestocking === item.rowIndex} onClick={() => handleRestock(item.rowIndex!, item.itemName!)} sx={look.button}>
                                {isRestocking === item.rowIndex ? "Restocking..." : "Restock Roll"}
                              </Button>
                            </Box>
                          </Box>
                        );
                      })}
                    </Box>
                  </Box>
                )}
              </Box>
            )}
          </Box>
        )}
      </SidePanel>
    </>
  );
}

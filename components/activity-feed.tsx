"use client";

import { useSyncStore } from "@/lib/store";
import { Bell, Clock, AlertTriangle, User, TrendingUp, TrendingDown, CheckCircle2, WifiOff, AlertCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { format, isToday, isYesterday } from "date-fns";
import { toast } from "sonner";
import IconButton from "@mui/material/IconButton";
import Drawer from "@mui/material/Drawer";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";

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
      <IconButton
        onClick={() => setDrawerOpen(true)}
        sx={{
          position: "relative",
          width: 40,
          height: 40,
          borderRadius: "50%",
          color: "text.secondary",
          "&:hover": { color: "primary.main", bgcolor: "primary.main" + "1A" },
          transition: "background-color 0.2s, color 0.2s, transform 0.2s",
          "&:active": { transform: "scale(0.97)" },
        }}
      >
        <Bell size={20} />
        {alerts.totalCount > 0 && (
          <Box
            component="span"
            sx={{
              position: "absolute",
              top: 8,
              right: 8,
              width: 10,
              height: 10,
              borderRadius: "50%",
              bgcolor: "#f43f5e",
              border: "2px solid white",
              animation: "bounce 1s infinite",
            }}
          />
        )}
      </IconButton>

      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        slotProps={{
          paper: {
            sx: {
              width: { xs: "100%", sm: 420 },
              display: "flex",
              flexDirection: "column",
              bgcolor: "background.paper",
              color: "text.primary",
              borderLeft: "1px solid",
              borderColor: "divider",
            },
          },
        }}
      >
        <Box
          sx={{
            p: 3,
            borderBottom: "1px solid",
            borderColor: "divider",
            bgcolor: "grey.50",
            flexShrink: 0,
          }}
        >
          <Stack direction="row" sx={{ alignItems: "center", gap: 1, mb: 0.5 }}>
            <Clock size={20} color="#C8472E" />
            <Typography variant="h6" sx={{ fontWeight: 900, letterSpacing: "-0.02em", color: "text.primary" }}>
              Activity & System Alerts
            </Typography>
          </Stack>
          <Typography variant="caption" sx={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: "text.secondary" }}>
            Recent updates & warnings
          </Typography>
        </Box>

        <Box sx={{ px: 2, pt: 2, flexShrink: 0 }}>
          <Tabs
            value={tabValue}
            onChange={(_, v) => setTabValue(v)}
            variant="fullWidth"
            sx={{
              bgcolor: "grey.100",
              borderRadius: 3,
              p: 0.5,
              minHeight: 0,
              "& .MuiTabs-indicator": { display: "none" },
              "& .MuiTab-root": {
                minHeight: 36,
                borderRadius: 2,
                fontSize: "0.7rem",
                fontWeight: 900,
                textTransform: "uppercase",
                color: "text.secondary",
                "&.Mui-selected": {
                  bgcolor: "background.paper",
                  color: "text.primary",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                },
              },
            }}
          >
            <Tab
              label={
                <Stack direction="row" sx={{ alignItems: "center", gap: 0.5 }}>
                  <Clock size={14} />
                  <span>Updates ({activityItems.length})</span>
                </Stack>
              }
            />
            <Tab
              label={
                <Stack direction="row" sx={{ alignItems: "center", gap: 0.5 }}>
                  <AlertTriangle size={14} />
                  <span>Alerts</span>
                  {alerts.totalCount > 0 && (
                    <Chip
                      label={alerts.totalCount}
                      size="small"
                      sx={{
                        height: 16,
                        fontSize: "0.55rem",
                        fontWeight: 900,
                        bgcolor: alerts.criticalCount > 0 ? "#f43f5e" : "#f59e0b",
                        color: "white",
                        "& .MuiChip-label": { px: 0.75 },
                        animation: alerts.criticalCount > 0 ? "pulse 2s infinite" : "none",
                      }}
                    />
                  )}
                </Stack>
              }
            />
          </Tabs>
        </Box>

        {tabValue === 0 && (
          <Box sx={{ flex: 1, overflowY: "auto", p: 2 }}>
            {Object.keys(groupedActivities).length === 0 ? (
              <Stack sx={{ alignItems: "center", justifyContent: "center", height: "100%", textAlign: "center", p: 4, mt: 6 }}>
                <Box
                  sx={{
                    width: 64,
                    height: 64,
                    borderRadius: "50%",
                    bgcolor: "grey.100",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    mb: 2,
                  }}
                >
                  <Bell size={32} color="#9ca3af" />
                </Box>
                <Typography sx={{ fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.01em", color: "text.primary" }}>
                  Quiet on the front
                </Typography>
                <Typography variant="caption" sx={{ color: "text.secondary", mt: 1, fontWeight: 500 }}>
                  New transactions will appear here.
                </Typography>
              </Stack>
            ) : (
              Object.entries(groupedActivities).map(([date, items]) => (
                <Box key={date} sx={{ mb: 3 }}>
                  <Stack
                    direction="row"
                    sx={{
                      alignItems: "center",
                      gap: 1,
                      position: "sticky",
                      top: 0,
                      zIndex: 10,
                      bgcolor: "background.paper",
                      backdropFilter: "blur(8px)",
                      py: 0.5,
                    }}
                  >
                    <Box sx={{ flex: 1, height: 1, bgcolor: "grey.100" }} />
                    <Typography
                      variant="caption"
                      sx={{ fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.2em", color: "text.disabled", whiteSpace: "nowrap", fontSize: "0.6rem" }}
                    >
                      {date}
                    </Typography>
                    <Box sx={{ flex: 1, height: 1, bgcolor: "grey.100" }} />
                  </Stack>

                  <Stack sx={{ gap: 1.5, mt: 1 }}>
                    {items.map((item) => (
                      <Box
                        key={item.id}
                        sx={{
                          p: 2,
                          borderRadius: 3,
                          border: "1px solid",
                          borderColor: "grey.100",
                          bgcolor: "background.paper",
                          "&:hover": { boxShadow: "0 4px 12px rgba(0,0,0,0.08)" },
                          transition: "box-shadow 0.2s",
                        }}
                      >
                        <Stack direction="row" sx={{ gap: 2 }}>
                          <Box
                            sx={{
                              width: 48,
                              height: 48,
                              borderRadius: 3,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                              bgcolor: item.type === "sale" ? "rgba(16,185,129,0.1)" : "rgba(245,158,11,0.1)",
                              color: item.type === "sale" ? "#059669" : "#d97706",
                            }}
                          >
                            {item.type === "sale" ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
                          </Box>

                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                              <Typography variant="caption" sx={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "text.disabled", fontSize: "0.6rem" }}>
                                {item.type} • {formatTime(item.timestamp)}
                              </Typography>
                              {item.user && (
                                <Stack
                                  direction="row"
                                  sx={{
                                    alignItems: "center",
                                    gap: 0.5,
                                    bgcolor: "primary.main" + "0D",
                                    px: 1,
                                    py: 0.25,
                                    borderRadius: 100,
                                  }}
                                >
                                  <User size={10} color="#C8472E" />
                                  <Typography variant="caption" sx={{ fontWeight: 700, color: "primary.main", fontSize: "0.6rem" }}>
                                    {item.user}
                                  </Typography>
                                </Stack>
                              )}
                            </Stack>

                            <Typography sx={{ fontWeight: 900, fontSize: "0.875rem", mt: 0.5, lineHeight: 1.3, letterSpacing: "-0.01em", color: "text.primary" }}>
                              {item.type === "sale"
                                ? `New Sale for ${item.client}`
                                : `Expense: ${item.category}`}
                            </Typography>

                            <Typography variant="caption" sx={{ color: "text.secondary", mt: 0.5, display: "block", fontStyle: "italic", fontWeight: 500 }}>
                              {item.description}
                            </Typography>

                            {item.type === "sale" && (
                              <Stack direction="row" sx={{ alignItems: "center", gap: 1, mt: 1.5 }}>
                                <Box
                                  sx={{
                                    px: 1,
                                    py: 0.5,
                                    borderRadius: 1,
                                    bgcolor: "rgba(16,185,129,0.08)",
                                    color: "#059669",
                                    fontSize: "0.6rem",
                                    fontWeight: 900,
                                    textTransform: "uppercase",
                                    fontFamily: "monospace",
                                  }}
                                >
                                  Paid: ₦{item.paid?.toLocaleString()}
                                </Box>
                                <Box
                                  sx={{
                                    px: 1,
                                    py: 0.5,
                                    borderRadius: 1,
                                    bgcolor: item.balance! > 0 ? "rgba(245,158,11,0.08)" : "rgba(16,185,129,0.08)",
                                    color: item.balance! > 0 ? "#d97706" : "#059669",
                                    fontSize: "0.6rem",
                                    fontWeight: 900,
                                    textTransform: "uppercase",
                                    fontFamily: "monospace",
                                  }}
                                >
                                  Bal: ₦{item.balance?.toLocaleString()}
                                </Box>
                              </Stack>
                            )}

                            {item.type === "expense" && (
                              <Box
                                sx={{
                                  mt: 1.5,
                                  px: 1,
                                  py: 0.5,
                                  width: "fit-content",
                                  borderRadius: 1,
                                  bgcolor: "rgba(245,158,11,0.08)",
                                  color: "#d97706",
                                  fontSize: "0.6rem",
                                  fontWeight: 900,
                                  textTransform: "uppercase",
                                  fontFamily: "monospace",
                                }}
                              >
                                Amount: ₦{item.amount.toLocaleString()}
                              </Box>
                            )}
                          </Box>
                        </Stack>
                      </Box>
                    ))}
                  </Stack>
                </Box>
              ))
            )}
          </Box>
        )}

        {tabValue === 1 && (
          <Box sx={{ flex: 1, overflowY: "auto", p: 2 }}>
            {alerts.totalCount === 0 ? (
              <Stack sx={{ alignItems: "center", justifyContent: "center", height: "100%", textAlign: "center", p: 4, mt: 6 }}>
                <Box
                  sx={{
                    width: 64,
                    height: 64,
                    borderRadius: "50%",
                    bgcolor: "rgba(16,185,129,0.08)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    mb: 2,
                  }}
                >
                  <CheckCircle2 size={32} color="#10b981" />
                </Box>
                <Typography sx={{ fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.01em", color: "text.primary" }}>
                  All systems operational
                </Typography>
                <Typography variant="caption" sx={{ color: "text.secondary", mt: 1, fontWeight: 500 }}>
                  No low stock warnings or pending offline actions.
                </Typography>
              </Stack>
            ) : (
              <Stack sx={{ gap: 3 }}>
                {alerts.pending.length > 0 && (
                  <Box>
                    <Box
                      sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 0.75,
                        fontSize: "0.6rem",
                        fontWeight: 900,
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        color: "#d97706",
                        bgcolor: "rgba(245,158,11,0.08)",
                        px: 1.5,
                        py: 0.5,
                        borderRadius: 100,
                        mb: 1.5,
                      }}
                    >
                      <WifiOff size={14} />
                      Offline Sync Queue ({alerts.pending.length})
                    </Box>
                    <Stack sx={{ gap: 1 }}>
                      {alerts.pending.map((p) => (
                        <Stack
                          key={p.id}
                          direction="row"
                          sx={{
                            alignItems: "center",
                            justifyContent: "space-between",
                            p: 1.75,
                            borderRadius: 3,
                            border: "1px solid rgba(245,158,11,0.3)",
                            bgcolor: "rgba(245,158,11,0.04)",
                          }}
                        >
                          <Box>
                            <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, color: "text.primary" }}>
                              {p.description}
                            </Typography>
                            <Typography sx={{ fontSize: "0.55rem", fontFamily: "monospace", color: "text.disabled", mt: 0.25 }}>
                              Queued: {format(new Date(p.timestamp), "h:mm a")}
                            </Typography>
                          </Box>
                          <Box
                            sx={{
                              fontSize: "0.55rem",
                              fontWeight: 900,
                              color: "#d97706",
                              textTransform: "uppercase",
                              letterSpacing: "0.15em",
                              bgcolor: "rgba(245,158,11,0.12)",
                              px: 1,
                              py: 0.25,
                              borderRadius: 100,
                              animation: "pulse 2s infinite",
                            }}
                          >
                            Pending Sync
                          </Box>
                        </Stack>
                      ))}
                    </Stack>
                  </Box>
                )}

                {alerts.inventory.length > 0 && (
                  <Box>
                    <Box
                      sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 0.75,
                        fontSize: "0.6rem",
                        fontWeight: 900,
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        color: "#e11d48",
                        bgcolor: "rgba(244,63,94,0.08)",
                        px: 1.5,
                        py: 0.5,
                        borderRadius: 100,
                        mb: 1.5,
                      }}
                    >
                      <AlertCircle size={14} />
                      Material Stock Alerts ({alerts.inventory.length})
                    </Box>
                    <Stack sx={{ gap: 1.5 }}>
                      {alerts.inventory.map((item) => (
                        <Box
                          key={item.id}
                          sx={{
                            p: 2,
                            borderRadius: 3,
                            border: "1px solid",
                            borderColor: item.critical ? "rgba(244,63,94,0.3)" : "rgba(245,158,11,0.3)",
                            bgcolor: item.critical ? "rgba(244,63,94,0.04)" : "rgba(245,158,11,0.04)",
                          }}
                        >
                          <Stack direction="row" sx={{ alignItems: "flex-start", justifyContent: "space-between", gap: 1.5 }}>
                            <Box>
                              <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
                                <Box
                                  sx={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: "50%",
                                    bgcolor: item.critical ? "#f43f5e" : "#f59e0b",
                                    animation: item.critical ? "ping 1s infinite" : "none",
                                  }}
                                />
                                <Typography sx={{ fontSize: "0.75rem", fontWeight: 900, color: "text.primary" }}>
                                  {item.itemName}
                                </Typography>
                              </Stack>
                              <Typography sx={{ fontSize: "0.7rem", color: "text.secondary", fontWeight: 500, mt: 0.5, lineHeight: 1.5 }}>
                                {item.description}
                              </Typography>
                              <Box
                                sx={{
                                  mt: 1.5,
                                  display: "inline-block",
                                  px: 1,
                                  py: 0.25,
                                  borderRadius: 1,
                                  fontSize: "0.55rem",
                                  fontWeight: 900,
                                  textTransform: "uppercase",
                                  bgcolor: item.critical ? "rgba(244,63,94,0.1)" : "rgba(245,158,11,0.1)",
                                  color: item.critical ? "#e11d48" : "#d97706",
                                }}
                              >
                                Stock: {item.stock.toFixed(1)} ft remaining
                              </Box>
                            </Box>

                            <Button
                              size="small"
                              variant="outlined"
                              disabled={isRestocking === item.rowIndex}
                              onClick={() => handleRestock(item.rowIndex!, item.itemName!)}
                              sx={{
                                flexShrink: 0,
                                height: 32,
                                px: 1.5,
                                borderRadius: 2,
                                fontSize: "0.6rem",
                                fontWeight: 900,
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                                borderColor: item.critical ? "rgba(244,63,94,0.4)" : "rgba(245,158,11,0.4)",
                                color: item.critical ? "#e11d48" : "#d97706",
                                "&:hover": {
                                  bgcolor: item.critical ? "#e11d48" : "#d97706",
                                  color: "white",
                                  borderColor: "transparent",
                                },
                              }}
                            >
                              {isRestocking === item.rowIndex ? "Restocking..." : "Restock Roll"}
                            </Button>
                          </Stack>
                        </Box>
                      ))}
                    </Stack>
                  </Box>
                )}
              </Stack>
            )}
          </Box>
        )}
      </Drawer>
    </>
  );
}

"use client";

import { UnifiedRecord } from "@/components/manage-sale-action";
import { useState, useMemo } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import { MaterialBadge } from "@/components/material-badge";
import { Clock, CheckCircle2, RefreshCw, X, Check, MoreVertical } from "lucide-react";
import { useSyncStore } from "@/lib/store";

const parseAmount = (val: any): number => {
  if (val === undefined || val === null) return 0;
  const str = val.toString().replace(/[₦, \s]/g, "");
  return parseFloat(str) || 0;
};

const mapSale = (r: any): UnifiedRecord => {
  const amount = parseAmount(r["AMOUNT (₦)"] || r["Amount (₦)"]);
  const sId = r["Sales ID"] || r["Sales Id"] || r["SALES ID"] || "";
  const rowIndexStr = r._rowIndex !== undefined ? r._rowIndex.toString() : "";
  return {
    id: sId ? `${sId}-${rowIndexStr}` : `sale-${r.DATE || r.Date || ""}-${r["CLIENT NAME"] || r["Client Name"] || ""}-${rowIndexStr}`,
    date: r.DATE || r.Date || "N/A",
    type: "Sale",
    client: r["CLIENT NAME"] || r["Client Name"] || "N/A",
    description: r["JOB DESCRIPTION"] || r["Job Description"] || "—",
    amount,
    status: "In Progress",
    loggedBy: r["Logged By"] || "Unknown",
    isPending: false,
    rowIndex: r._rowIndex ? parseInt(r._rowIndex.toString()) : undefined,
    jobStatus: r["JOB STATUS"] || r["Job Status"] || "Quoted",
    material: r["Material"] || r["MATERIAL"] || r["material"] || "",
    balance: parseAmount(r["AMOUNT DIFFERENCES"] || r["Amount Differences"]),
    salesId: sId,
    raw: r
  };
};

const COLUMNS = [
  {
    id: "Quoted",
    label: "Quoted / Pending",
    chipColor: "#6b7280",
    chipBg: "rgba(107,114,128,0.1)",
    accentColor: "#9ca3af",
    stripBg: "#e5e7eb",
  },
  {
    id: "Printing",
    label: "Printing",
    chipColor: "#d97706",
    chipBg: "rgba(245,158,11,0.1)",
    accentColor: "#f59e0b",
    stripBg: "#fde68a",
  },
  {
    id: "Finishing",
    label: "Finishing / In Progress",
    chipColor: "#0284c7",
    chipBg: "rgba(2,132,199,0.1)",
    accentColor: "#38bdf8",
    stripBg: "#bae6fd",
  },
  {
    id: "Ready",
    label: "Ready",
    chipColor: "#059669",
    chipBg: "rgba(5,150,105,0.1)",
    accentColor: "#34d399",
    stripBg: "#a7f3d0",
  },
  {
    id: "Delivered",
    label: "Delivered / Completed",
    chipColor: "#C8472E",
    chipBg: "rgba(200,71,46,0.1)",
    accentColor: "#C8472E",
    stripBg: "#fca5a5",
  },
];

const getColumnId = (status: string) => {
  if (status === "Pending" || status === "Quoted") return "Quoted";
  if (status === "In Progress" || status === "Finishing") return "Finishing";
  if (status === "Completed" || status === "Delivered") return "Delivered";
  if (status === "Ready") return "Ready";
  if (status === "Printing") return "Printing";
  return "Quoted";
};

interface JobBoardProps {
  isAdmin?: boolean;
  filterClient?: string | null;
}

export function JobBoard({ isAdmin = false, filterClient }: JobBoardProps) {
  const { cachedSales, updateSaleStatus } = useSyncStore();
  const [draggedJob, setDraggedJob] = useState<UnifiedRecord | null>(null);
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Status Menu State for Mobile & Touch interactions
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [menuActiveJob, setMenuActiveJob] = useState<UnifiedRecord | null>(null);

  const handleMenuOpen = (e: React.MouseEvent<HTMLElement>, job: UnifiedRecord) => {
    e.stopPropagation();
    setMenuAnchorEl(e.currentTarget);
    setMenuActiveJob(job);
  };

  const handleMenuClose = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setMenuAnchorEl(null);
    setMenuActiveJob(null);
  };

  const handleStatusSelect = (dbStatus: string) => {
    if (menuActiveJob) {
      updateSaleStatus(menuActiveJob.salesId || "", menuActiveJob.rowIndex, dbStatus);
    }
    handleMenuClose();
  };

  const records = useMemo(() => {
    let mapped = (cachedSales || []).map((r: any) => mapSale(r));
    if (filterClient) {
      mapped = mapped.filter((r: UnifiedRecord) =>
        r.client.toLowerCase().includes(filterClient.toLowerCase())
      );
    }
    return mapped;
  }, [cachedSales, filterClient]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/sales");
      const json = await res.json();
      const store = useSyncStore.getState();
      store.setCachedData(json.data || [], store.cachedExpenses, store.cachedInventory, store.cachedPayments, store.cachedMaterials);
    } catch (error) {
      console.error("Failed to refresh board");
    } finally {
      setIsRefreshing(false);
    }
  };

  const toggleSelection = (jobId: string) => {
    setSelectedJobIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(jobId)) {
        newSet.delete(jobId);
      } else {
        newSet.add(jobId);
      }
      return newSet;
    });
  };

  const handleDrop = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    if (!draggedJob) return;

    const currentId = getColumnId(draggedJob.jobStatus || "Quoted");
    if (currentId !== columnId) {
      // Map columnId back to standard database JOB STATUS strings
      let dbStatus = columnId;
      if (columnId === "Finishing") dbStatus = "In Progress";
      if (columnId === "Delivered") dbStatus = "Delivered";

      if (selectedJobIds.has(draggedJob.id)) {
        const jobsToMove = records.filter(r => selectedJobIds.has(r.id));
        jobsToMove.forEach(job => {
          const jobCurrentId = getColumnId(job.jobStatus || "Quoted");
          if (jobCurrentId !== columnId) {
            updateSaleStatus(job.salesId || "", job.rowIndex, dbStatus);
          }
        });
        setSelectedJobIds(new Set());
      } else {
        updateSaleStatus(draggedJob.salesId || "", draggedJob.rowIndex, dbStatus);
      }
    }
    setDraggedJob(null);
  };

  const boardData = COLUMNS.map(col => ({
    ...col,
    items: records.filter(r => r.type === "Sale" && getColumnId(r.jobStatus || "Quoted") === col.id)
  }));

  return (
    <Stack sx={{ gap: 2 }}>
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", minHeight: 36 }}>
        <Box>
          {selectedJobIds.size > 0 && (
            <Stack direction="row" sx={{ alignItems: "center", gap: 1.5 }}>
              <Chip
                label={`${selectedJobIds.size} selected`}
                size="small"
                sx={{
                  bgcolor: "primary.main" + "1A",
                  color: "primary.main",
                  fontWeight: 700,
                  fontSize: "0.875rem",
                  height: 28,
                  border: "1px solid",
                  borderColor: "primary.main" + "33",
                }}
              />
              <Button
                variant="text"
                size="small"
                onClick={() => setSelectedJobIds(new Set())}
                sx={{ color: "text.secondary", fontSize: "0.75rem", "&:hover": { color: "text.primary" }, height: 32, px: 1 }}
                startIcon={<X size={14} />}
              >
                Clear
              </Button>
              <Typography sx={{ fontSize: "0.75rem", fontWeight: 500, color: "text.disabled" }}>
                Drag any selected card to move all
              </Typography>
            </Stack>
          )}
        </Box>
        <Button
          variant="outlined"
          size="small"
          onClick={handleRefresh}
          disabled={isRefreshing}
          startIcon={<RefreshCw size={16} style={{ animation: isRefreshing ? "spin 1s linear infinite" : "none" }} />}
          sx={{ height: 36, flexShrink: 0 }}
        >
          Refresh Board
        </Button>
      </Stack>

      <Box
        sx={{
          display: "flex",
          gap: 2,
          overflowX: "auto",
          pb: 2,
          minHeight: "calc(100vh - 14rem)",
          scrollSnapType: "x mandatory",
        }}
      >
        {boardData.map((column) => (
          <Box
            key={column.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleDrop(e, column.id)}
            sx={{
              flexShrink: 0,
              width: 320,
              display: "flex",
              flexDirection: "column",
              bgcolor: (theme) => theme.palette.mode === "dark" ? "rgba(30, 41, 59, 0.5)" : "rgba(249,250,251,0.5)",
              borderRadius: 3,
              border: "1px solid",
              borderColor: "grey.100",
              scrollSnapAlign: "start",
              maxHeight: "calc(100vh - 10rem)",
              transition: "background-color 0.2s",
            }}
          >
            <Stack
              direction="row"
              sx={{
                alignItems: "center",
                justifyContent: "space-between",
                p: 2,
                borderBottom: "1px solid",
                borderColor: "grey.100",
                position: "sticky",
                top: 0,
                bgcolor: (theme) => theme.palette.mode === "dark" ? "rgba(30, 41, 59, 0.95)" : "rgba(249,250,251,0.95)",
                backdropFilter: "blur(8px)",
                zIndex: 10,
                borderRadius: "12px 12px 0 0",
              }}
            >
              <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    bgcolor: (theme) => theme.palette.mode === "dark" ? column.chipColor : column.stripBg,
                    border: "2px solid",
                    borderColor: column.accentColor,
                  }}
                />
                <Typography sx={{ fontWeight: 700, color: "text.primary", fontSize: "0.875rem" }}>
                  {column.label}
                </Typography>
              </Stack>
              <Chip
                label={column.items.length}
                size="small"
                sx={{
                  bgcolor: "background.paper",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  height: 22,
                  "& .MuiChip-label": { px: 1 },
                }}
              />
            </Stack>

            <Box sx={{ p: 1.5, flex: 1, overflowY: "auto" }}>
              <Stack sx={{ gap: 1.5 }}>
                {column.items.map((job) => {
                  const isSelected = selectedJobIds.has(job.id);
                  const isDraggingSelected = draggedJob && selectedJobIds.has(draggedJob.id) && isSelected;
                  const isDraggingThis = draggedJob?.id === job.id;

                  return (
                    <Card
                      key={job.id}
                      draggable
                      onClick={() => toggleSelection(job.id)}
                      onDragStart={() => setDraggedJob(job)}
                      onDragEnd={() => setDraggedJob(null)}
                      sx={{
                        position: "relative",
                        cursor: "grab",
                        "&:active": { cursor: "grabbing" },
                        transition: "all 0.2s",
                        opacity: isDraggingThis || isDraggingSelected ? 0.5 : 1,
                        transform: isDraggingThis || isDraggingSelected ? "scale(0.95)" : "scale(1)",
                        ...(isSelected
                          ? {
                              outline: "2px solid",
                              outlineColor: "primary.main",
                              bgcolor: "primary.main" + "0D",
                              borderColor: "primary.main",
                              boxShadow: "0 4px 12px rgba(200,71,46,0.15)",
                            }
                          : {
                              "&:hover": {
                                boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                                borderColor: "grey.300",
                              },
                            }),
                        borderRadius: "16px",
                        overflow: "visible",
                      }}
                    >
                      <Box
                        sx={{
                          position: "absolute",
                          left: 0,
                          top: 0,
                          bottom: 0,
                          width: 4,
                          borderRadius: "10px 0 0 10px",
                          bgcolor: (theme) => theme.palette.mode === "dark" ? column.chipColor : column.stripBg,
                        }}
                      />

                      {isSelected && (
                        <Box
                          sx={{
                            position: "absolute",
                            top: -8,
                            right: -8,
                            bgcolor: "primary.main",
                            color: "primary.contrastText",
                            width: 20,
                            height: 20,
                            borderRadius: "50%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
                            zIndex: 10,
                          }}
                        >
                          <Check size={12} />
                        </Box>
                      )}

                      <CardContent sx={{ p: "12px !important", pl: "20px !important" }}>
                        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", mb: 1 }}>
                          <Box sx={{ minWidth: 0, pr: 1, pointerEvents: "none", flex: 1 }}>
                            <Typography sx={{ fontSize: "0.7rem", color: "text.secondary", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {job.client}
                            </Typography>
                            <Typography sx={{ fontSize: "0.875rem", fontWeight: 700, color: "text.primary", lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", mt: 0.25 }}>
                              {job.description}
                            </Typography>
                          </Box>

                          <IconButton
                            size="small"
                            onClick={(e) => handleMenuOpen(e, job)}
                            sx={{
                              p: 0.5,
                              mt: -0.5,
                              mr: -0.5,
                              color: "text.secondary",
                              "&:hover": { color: "text.primary", bgcolor: "action.hover" }
                            }}
                          >
                            <MoreVertical size={16} />
                          </IconButton>
                        </Stack>

                        <Box sx={{ mb: 1.5, pointerEvents: "none" }}>
                          {job.material && <MaterialBadge material={job.material} />}
                        </Box>

                        <Stack
                          direction="row"
                          sx={{
                            alignItems: "center",
                            justifyContent: "space-between",
                            pt: 1,
                            borderTop: "1px solid",
                            borderColor: "grey.100",
                            pointerEvents: "none",
                          }}
                        >
                          <Stack direction="row" sx={{ alignItems: "center", gap: 0.75 }}>
                            <Clock size={14} color="#6b7280" />
                            <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
                              {job.date?.split(",")[0]}
                            </Typography>
                          </Stack>

                          {column.id === "Delivered" && (
                            <Stack direction="row" sx={{ alignItems: "center", gap: 0.5 }}>
                              <CheckCircle2 size={14} color="#059669" />
                              <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, color: "#059669" }}>
                                Done
                              </Typography>
                            </Stack>
                          )}
                        </Stack>
                      </CardContent>
                    </Card>
                  );
                })}

                {column.items.length === 0 && (
                  <Box
                    sx={{
                      height: 96,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "2px dashed",
                      borderColor: "grey.200",
                      borderRadius: 3,
                    }}
                  >
                    <Typography sx={{ fontSize: "0.75rem", color: "text.disabled", fontWeight: 500 }}>
                      Drop jobs here
                    </Typography>
                  </Box>
                )}
              </Stack>
            </Box>
          </Box>
        ))}
      </Box>

      {/* Tactile Status Selector for Mobile/Desktop */}
      <Menu
        anchorEl={menuAnchorEl}
        open={Boolean(menuAnchorEl)}
        onClose={() => handleMenuClose()}
        onClick={(e) => e.stopPropagation()}
        slotProps={{
          paper: {
            sx: {
              borderRadius: 3,
              boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
              border: "1px solid",
              borderColor: "divider",
              minWidth: 180,
            }
          }
        }}
      >
        <Box sx={{ px: 2, py: 1, borderBottom: "1px solid", borderColor: "divider", mb: 0.5 }}>
          <Typography variant="caption" sx={{ fontWeight: 700, color: "text.disabled", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Move Job To
          </Typography>
        </Box>
        {COLUMNS.map((col) => {
          let dbStatus = col.id;
          if (col.id === "Finishing") dbStatus = "In Progress";
          if (col.id === "Delivered") dbStatus = "Delivered";

          const isCurrent = getColumnId(menuActiveJob?.jobStatus || "Quoted") === col.id;

          return (
            <MenuItem
              key={col.id}
              onClick={() => handleStatusSelect(dbStatus)}
              disabled={isCurrent}
              sx={{
                fontSize: "0.8125rem",
                fontWeight: 600,
                py: 1,
                px: 2,
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                color: isCurrent ? "text.disabled" : "text.primary"
              }}
            >
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  bgcolor: col.chipColor,
                }}
              />
              {col.label}
            </MenuItem>
          );
        })}
      </Menu>
    </Stack>
  );
}

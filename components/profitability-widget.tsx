"use client";

import { useMemo } from "react";
import { TrendingUp, TrendingDown, Minus, Package } from "lucide-react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

// ─── Types ────────────────────────────────────────────────────────────────────

interface InventoryRow {
  "Item Name"?: string;
  "Price"?: string | number;
  "Cost per Sqft"?: string | number;
  "Remaining Length (ft)"?: string | number;
  "Width (ft)"?: string | number;
  [key: string]: any;
}

interface SaleRow {
  MATERIAL?: string;
  Material?: string;
  "AMOUNT (₦)"?: string | number;
  "Amount (₦)"?: string | number;
  "JOB WIDTH"?: string | number;
  "JOB HEIGHT"?: string | number;
  "Job Width"?: string | number;
  "Job Height"?: string | number;
  [key: string]: any;
}

interface ProfitabilityWidgetProps {
  sales: SaleRow[];
  inventory: InventoryRow[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const parseNum = (v: any) =>
  parseFloat(String(v ?? "0").replace(/[₦,\s]/g, "")) || 0;

const fmtMoney = (n: number) =>
  `₦${n.toLocaleString(undefined, { minimumFractionDigits: 0 })}`;

// ─── Component ────────────────────────────────────────────────────────────────

export function ProfitabilityWidget({ sales, inventory }: ProfitabilityWidgetProps) {
  // Build cost lookup from inventory: itemName → costPerSqft
  const costMap = useMemo(() => {
    const map: Record<string, number> = {};
    inventory.forEach((row) => {
      const name = (row["Item Name"] || "").trim();
      const cost = parseNum(row["Cost per Sqft"]);
      if (name && cost > 0) {
        // average if multiple rolls of same material
        if (map[name] !== undefined) {
          map[name] = (map[name] + cost) / 2;
        } else {
          map[name] = cost;
        }
      }
    });
    return map;
  }, [inventory]);

  // Build profit stats per material from sales
  const materialStats = useMemo(() => {
    const map: Record<
      string,
      {
        revenue: number;
        estimatedCost: number;
        jobCount: number;
        sqftSold: number;
        avgPricePerSqft: number;
      }
    > = {};

    sales.forEach((sale) => {
      const material = (sale.MATERIAL || sale.Material || "Unknown").trim();
      const revenue = parseNum(sale["AMOUNT (₦)"] || sale["Amount (₦)"]);
      const w = parseNum(sale["JOB WIDTH"] || sale["Job Width"]);
      const h = parseNum(sale["JOB HEIGHT"] || sale["Job Height"]);
      const sqft = w * h;

      if (!map[material]) {
        map[material] = {
          revenue: 0,
          estimatedCost: 0,
          jobCount: 0,
          sqftSold: 0,
          avgPricePerSqft: 0,
        };
      }

      const cost = costMap[material] || 0;
      map[material].revenue += revenue;
      map[material].estimatedCost += sqft * cost;
      map[material].jobCount += 1;
      map[material].sqftSold += sqft;
    });

    // Compute margins and avg rate
    return Object.entries(map)
      .map(([name, stats]) => {
        const profit = stats.revenue - stats.estimatedCost;
        const marginPct = stats.revenue > 0 ? (profit / stats.revenue) * 100 : null;
        const avgPricePerSqft =
          stats.sqftSold > 0 ? stats.revenue / stats.sqftSold : 0;
        const hasCostData = (costMap[name] || 0) > 0;
        return { name, ...stats, profit, marginPct, avgPricePerSqft, hasCostData };
      })
      .sort((a, b) => b.revenue - a.revenue);
  }, [sales, costMap]);

  if (materialStats.length === 0) {
    return (
      <Box sx={{ bgcolor: "background.paper", borderRadius: 4, border: "1px solid", borderColor: "grey.100", boxShadow: 1, p: 2.5 }}>
        <Stack direction="row" sx={{ alignItems: "center", gap: 1, mb: 2 }}>
          <TrendingUp size={16} style={{ color: "var(--mui-palette-primary-main)" }} />
          <Typography sx={{ fontSize: "0.875rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "text.primary" }}>
            Material Profitability
          </Typography>
        </Stack>
        <Box sx={{ textAlign: "center", py: 4 }}>
          <Package size={32} style={{ color: "var(--mui-palette-grey-300)", margin: "0 auto 8px" }} />
          <Typography sx={{ fontSize: "0.75rem", fontWeight: 500, color: "text.secondary" }}>
            No sales data to analyse
          </Typography>
        </Box>
      </Box>
    );
  }

  const maxRevenue = Math.max(...materialStats.map((m) => m.revenue), 1);

  return (
    <Box sx={{ bgcolor: "background.paper", borderRadius: 4, border: "1px solid", borderColor: "grey.100", boxShadow: 1, p: 2.5 }}>
      {/* Header */}
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 2.5 }}>
        <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
          <TrendingUp size={16} style={{ color: "var(--mui-palette-primary-main)" }} />
          <Typography sx={{ fontSize: "0.875rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "text.primary" }}>
            Material Profitability
          </Typography>
        </Stack>
        <Typography sx={{ fontSize: "0.5625rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "text.secondary" }}>
          {materialStats.reduce((s, m) => s + m.jobCount, 0)} jobs
        </Typography>
      </Stack>

      {/* Per-material rows */}
      <Stack sx={{ gap: 2 }}>
        {materialStats.map((mat) => {
          const margin = mat.marginPct;
          const isGood = margin !== null && margin >= 40;
          const isOk = margin !== null && margin >= 20 && margin < 40;
          const isBad = margin !== null && margin < 20;
          const noData = margin === null || !mat.hasCostData;

          const barColor = noData
            ? "grey.200"
            : isGood
            ? "success.main"
            : isOk
            ? "warning.main"
            : "error.main";

          const marginColor = noData
            ? "text.disabled"
            : isGood
            ? "success.dark"
            : isOk
            ? "warning.dark"
            : "error.dark";

          const Icon = noData ? Minus : isGood ? TrendingUp : isBad ? TrendingDown : Minus;

          return (
            <Stack key={mat.name} sx={{ gap: 1 }}>
              {/* Top row */}
              <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                <Stack direction="row" sx={{ alignItems: "center", gap: 1, minWidth: 0 }}>
                  <Box sx={{ color: marginColor, display: "flex" }}>
                    <Icon size={14} />
                  </Box>
                  <Typography sx={{ fontSize: "0.75rem", fontWeight: 900, color: "text.primary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {mat.name}
                  </Typography>
                  <Typography sx={{ fontSize: "0.5625rem", fontWeight: 700, color: "text.secondary", flexShrink: 0 }}>
                    {mat.jobCount} job{mat.jobCount !== 1 ? "s" : ""}
                  </Typography>
                </Stack>
                <Stack direction="row" sx={{ alignItems: "center", gap: 1.5, flexShrink: 0 }}>
                  <Typography sx={{ fontSize: "0.75rem", fontWeight: 900, color: "text.primary" }}>
                    {fmtMoney(mat.revenue)}
                  </Typography>
                  <Typography sx={{ fontSize: "0.75rem", fontWeight: 900, minWidth: 46, textAlign: "right", color: marginColor }}>
                    {noData ? "—%" : `${margin!.toFixed(0)}%`}
                  </Typography>
                </Stack>
              </Stack>

              {/* Revenue bar */}
              <Box sx={{ height: 8, borderRadius: 99, bgcolor: "grey.100", overflow: "hidden" }}>
                <Box
                  sx={{
                    height: "100%",
                    borderRadius: 99,
                    width: `${(mat.revenue / maxRevenue) * 100}%`,
                    bgcolor: barColor,
                    transition: "width 500ms ease-out",
                  }}
                />
              </Box>

              {/* Sub-row: sqft & cost detail */}
              <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
                <Typography sx={{ fontSize: "0.625rem", color: "text.secondary", fontWeight: 500 }}>
                  {mat.sqftSold > 0 ? `${mat.sqftSold.toFixed(0)} sqft sold` : "no dimension data"}
                  {mat.avgPricePerSqft > 0 && ` · ₦${mat.avgPricePerSqft.toFixed(0)}/sqft avg`}
                </Typography>
                {mat.hasCostData && mat.estimatedCost > 0 && (
                  <Typography sx={{ fontSize: "0.625rem", color: "text.secondary", fontWeight: 500 }}>
                    est. cost {fmtMoney(mat.estimatedCost)} · profit {fmtMoney(mat.profit)}
                  </Typography>
                )}
                {!mat.hasCostData && (
                  <Typography sx={{ fontSize: "0.625rem", color: "text.secondary", fontWeight: 500, fontStyle: "italic" }}>
                    add material cost to see margin
                  </Typography>
                )}
              </Stack>
            </Stack>
          );
        })}
      </Stack>

      {/* Legend */}
      <Stack direction="row" sx={{ alignItems: "center", gap: 2, mt: 2.5, pt: 2, borderTop: "1px solid", borderColor: "grey.50" }}>
        {[
          { color: "success.main", label: "≥40% margin" },
          { color: "warning.main", label: "20–40%" },
          { color: "error.main", label: "<20%" },
          { color: "grey.200", label: "No cost data" },
        ].map(({ color, label }) => (
          <Stack key={label} direction="row" sx={{ alignItems: "center", gap: 0.75 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: color }} />
            <Typography sx={{ fontSize: "0.5625rem", color: "text.secondary", fontWeight: 500 }}>
              {label}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}

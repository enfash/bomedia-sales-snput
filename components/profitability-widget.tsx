"use client";

import { useMemo } from "react";
import { TrendingUp, TrendingDown, Minus, Package } from "lucide-react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import { profitabilityStyles as styles } from "@/app/theme";

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

  const title = (
    <Box sx={styles.title}>
      <TrendingUp size={16} />
      <Typography variant="h5" component="h3" color="text.primary">Material Profitability</Typography>
    </Box>
  );

  if (materialStats.length === 0) {
    return (
      <Card sx={styles.card}>
        <CardContent>
          <Box sx={styles.header}>{title}</Box>
          <Box sx={styles.empty}>
            <Package size={32} aria-hidden />
            <Typography variant="body2" sx={styles.emptyIcon}>No sales data to analyse</Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  const maxRevenue = Math.max(...materialStats.map((m) => m.revenue), 1);

  return (
    <Card sx={styles.card}>
      <CardContent>
        <Box sx={styles.header}>
          {title}
          <Typography variant="overline" color="text.secondary">
            {materialStats.reduce((s, m) => s + m.jobCount, 0)} jobs
          </Typography>
        </Box>

        <Box component="ul" sx={[styles.list, { listStyle: "none", m: 0, p: 0 }]}>
          {materialStats.map((mat) => {
            const margin = mat.marginPct;
            const noData = margin === null || !mat.hasCostData;
            const band = noData ? "none" : margin >= 40 ? "good" : margin >= 20 ? "ok" : "bad";
            const tone = styles.tone[band];
            const Icon = band === "good" ? TrendingUp : band === "bad" ? TrendingDown : Minus;

            return (
              <Box component="li" key={mat.name} sx={styles.item}>
                <Box sx={styles.topRow}>
                  <Box sx={styles.nameRow}>
                    <Box sx={[styles.icon, { color: tone.text }]}><Icon size={14} aria-hidden /></Box>
                    <Typography variant="subtitle2" sx={styles.name}>{mat.name}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={styles.noShrink}>
                      {mat.jobCount} job{mat.jobCount !== 1 ? "s" : ""}
                    </Typography>
                  </Box>
                  <Box sx={styles.figures}>
                    <Typography variant="subtitle2">{fmtMoney(mat.revenue)}</Typography>
                    <Typography variant="subtitle2" sx={[styles.margin, { color: tone.text }]}>
                      {noData ? "—%" : `${margin.toFixed(0)}%`}
                    </Typography>
                  </Box>
                </Box>

                <Box sx={styles.track}>
                  <Box sx={[styles.fill, { width: `${(mat.revenue / maxRevenue) * 100}%`, bgcolor: tone.bar }]} />
                </Box>

                <Box sx={styles.detailRow}>
                  <Typography variant="caption" color="text.secondary">
                    {mat.sqftSold > 0 ? `${mat.sqftSold.toFixed(0)} sqft sold` : "no dimension data"}
                    {mat.avgPricePerSqft > 0 && ` · ₦${mat.avgPricePerSqft.toFixed(0)}/sqft avg`}
                  </Typography>
                  {mat.hasCostData && mat.estimatedCost > 0 && (
                    <Typography variant="caption" color="text.secondary">
                      est. cost {fmtMoney(mat.estimatedCost)} · profit {fmtMoney(mat.profit)}
                    </Typography>
                  )}
                  {!mat.hasCostData && (
                    <Typography variant="caption" color="text.secondary" sx={styles.hint}>
                      add material cost to see margin
                    </Typography>
                  )}
                </Box>
              </Box>
            );
          })}
        </Box>

        <Box sx={styles.legend}>
          {[
            { color: styles.tone.good.bar, label: "≥40% margin" },
            { color: styles.tone.ok.bar, label: "20–40%" },
            { color: styles.tone.bad.bar, label: "<20%" },
            { color: styles.tone.none.bar, label: "No cost data" },
          ].map(({ color, label }) => (
            <Box key={label} sx={styles.legendItem}>
              <Box sx={[styles.dot, { bgcolor: color }]} />
              <Typography variant="caption" color="text.secondary">{label}</Typography>
            </Box>
          ))}
        </Box>
      </CardContent>
    </Card>
  );
}

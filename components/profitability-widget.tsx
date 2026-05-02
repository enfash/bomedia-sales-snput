"use client";

import { useMemo } from "react";
import { TrendingUp, TrendingDown, Minus, Package } from "lucide-react";
import { cn } from "@/lib/utils";

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
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-brand-600 dark:text-brand-400" />
          <p className="text-sm font-black uppercase tracking-widest text-gray-700 dark:text-zinc-300">
            Material Profitability
          </p>
        </div>
        <div className="text-center py-8">
          <Package className="w-8 h-8 text-gray-200 dark:text-zinc-700 mx-auto mb-2" />
          <p className="text-xs text-gray-400 dark:text-zinc-600 font-medium">
            No sales data to analyse
          </p>
        </div>
      </div>
    );
  }

  const maxRevenue = Math.max(...materialStats.map((m) => m.revenue), 1);

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-brand-600 dark:text-brand-400" />
          <p className="text-sm font-black uppercase tracking-widest text-gray-700 dark:text-zinc-300">
            Material Profitability
          </p>
        </div>
        <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 dark:text-zinc-600">
          {materialStats.reduce((s, m) => s + m.jobCount, 0)} jobs
        </p>
      </div>

      {/* Per-material rows */}
      <div className="space-y-4">
        {materialStats.map((mat) => {
          const margin = mat.marginPct;
          const isGood = margin !== null && margin >= 40;
          const isOk = margin !== null && margin >= 20 && margin < 40;
          const isBad = margin !== null && margin < 20;
          const noData = margin === null || !mat.hasCostData;

          const barColor = noData
            ? "bg-gray-200 dark:bg-zinc-700"
            : isGood
            ? "bg-emerald-500"
            : isOk
            ? "bg-amber-400"
            : "bg-rose-500";

          const marginColor = noData
            ? "text-gray-400 dark:text-zinc-600"
            : isGood
            ? "text-emerald-600 dark:text-emerald-400"
            : isOk
            ? "text-amber-600 dark:text-amber-400"
            : "text-rose-600 dark:text-rose-400";

          const Icon = noData ? Minus : isGood ? TrendingUp : isBad ? TrendingDown : Minus;

          return (
            <div key={mat.name} className="space-y-2">
              {/* Top row */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Icon className={cn("w-3.5 h-3.5 shrink-0", marginColor)} />
                  <span className="text-xs font-black text-gray-800 dark:text-zinc-200 truncate">
                    {mat.name}
                  </span>
                  <span className="text-[9px] font-bold text-gray-400 dark:text-zinc-600 shrink-0">
                    {mat.jobCount} job{mat.jobCount !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs font-black text-gray-900 dark:text-white">
                    {fmtMoney(mat.revenue)}
                  </span>
                  <span className={cn("text-xs font-black min-w-[46px] text-right", marginColor)}>
                    {noData ? "—%" : `${margin!.toFixed(0)}%`}
                  </span>
                </div>
              </div>

              {/* Revenue bar */}
              <div className="h-2 rounded-full bg-gray-100 dark:bg-zinc-800 overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all duration-500", barColor)}
                  style={{ width: `${(mat.revenue / maxRevenue) * 100}%` }}
                />
              </div>

              {/* Sub-row: sqft & cost detail */}
              <div className="flex items-center justify-between text-[10px] text-gray-400 dark:text-zinc-600 font-medium">
                <span>
                  {mat.sqftSold > 0 ? `${mat.sqftSold.toFixed(0)} sqft sold` : "no dimension data"}
                  {mat.avgPricePerSqft > 0 && ` · ₦${mat.avgPricePerSqft.toFixed(0)}/sqft avg`}
                </span>
                {mat.hasCostData && mat.estimatedCost > 0 && (
                  <span>
                    est. cost {fmtMoney(mat.estimatedCost)} · profit {fmtMoney(mat.profit)}
                  </span>
                )}
                {!mat.hasCostData && (
                  <span className="italic">add material cost to see margin</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-5 pt-4 border-t border-gray-50 dark:border-zinc-800">
        {[
          { color: "bg-emerald-500", label: "≥40% margin" },
          { color: "bg-amber-400", label: "20–40%" },
          { color: "bg-rose-500", label: "<20%" },
          { color: "bg-gray-200 dark:bg-zinc-700", label: "No cost data" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className={cn("w-2 h-2 rounded-full", color)} />
            <span className="text-[9px] text-gray-400 dark:text-zinc-600 font-medium">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

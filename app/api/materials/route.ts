import { NextResponse } from "next/server";
import { getDoc } from "@/lib/google-sheets";

export const dynamic = "force-dynamic";

const MATERIALS_SHEET = "Materials";
const INVENTORY_SHEET = "Inventory";

const parseNum = (v: any) => parseFloat(String(v ?? "0").replace(/[^\d.-]/g, "")) || 0;

export async function GET() {
  try {
    const doc = await getDoc();
    const mSheet = doc.sheetsByTitle[MATERIALS_SHEET];

    if (!mSheet) {
      return NextResponse.json({ data: [] });
    }

    // Load inventory rows alongside materials so we can compute valuation
    // fields server-side. The SUMIF formulas remain in the Google Sheet for
    // manual traceability, but row.get() returns the formula text instead of
    // the computed value — so we aggregate here in JS.
    const iSheet = doc.sheetsByTitle[INVENTORY_SHEET];
    const [materialRows, inventoryRows] = await Promise.all([
      mSheet.getRows(),
      iSheet ? iSheet.getRows() : Promise.resolve([]),
    ]);

    // Pre-aggregate inventory values by Material ID
    const invAgg: Record<string, { totalCost: number; remainingAsset: number; remainingRevenue: number; realisedRevenue: number }> = {};

    for (const r of inventoryRows) {
      const mId = r.get("Material ID");
      if (!mId) continue;

      if (!invAgg[mId]) invAgg[mId] = { totalCost: 0, remainingAsset: 0, remainingRevenue: 0, realisedRevenue: 0 };

      const cost = parseNum(r.get("Cost"));
      const totalLen = parseNum(r.get("Total Length (ft)"));
      const remainLen = parseNum(r.get("Remaining Length (ft)"));
      const width = parseNum(r.get("Width (ft)"));
      const price = parseNum(r.get("Price"));

      // Total Spent = sum of Cost per roll
      invAgg[mId].totalCost += cost;

      // Remaining Asset Value = (Remaining / Total) * Cost per roll
      invAgg[mId].remainingAsset += totalLen > 0 ? (remainLen / totalLen) * cost : 0;

      // Remaining Expected Revenue = Width * Remaining Length * Price per sqft
      invAgg[mId].remainingRevenue += width * remainLen * price;

      // Realised Revenue = Width * Used Length * Price per sqft
      const usedLen = Math.max(0, totalLen - remainLen);
      invAgg[mId].realisedRevenue += width * usedLen * price;
    }

    const data = materialRows
      .map((row) => {
        const matId = row.get("Material ID");
        const agg = invAgg[matId] || { totalCost: 0, remainingAsset: 0, remainingRevenue: 0 };

        return {
          "Material ID": matId,
          "Material Name": row.get("Material Name"),
          "Width (ft)": row.get("Width (ft)"),
          "Selling Price": row.get("Selling Price"),
          "Total Remaining (ft)": row.get("Total Remaining (ft)"),
          "Total Capacity (ft)": row.get("Total Capacity (ft)"),
          "Active Roll ID": row.get("Active Roll ID"),
          "Roll Count": row.get("Roll Count"),
          Status: row.get("Status"),
          "Low Stock Threshold (ft)": row.get("Low Stock Threshold (ft)"),
          "Last Updated": row.get("Last Updated"),
          Notes: row.get("Notes") || "",
          "Total Spent": agg.totalCost,
          "Total Remaining Asset Value": agg.remainingAsset,
          "Total Remaining Revenue": agg.remainingRevenue,
          "Total Realised Revenue": agg.realisedRevenue,
        };
      })
      .filter((r) => r["Material ID"]);

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error("GET Materials Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

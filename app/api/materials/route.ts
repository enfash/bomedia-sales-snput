import { NextResponse } from "next/server";
import { getDoc } from "@/lib/google-sheets";

export const dynamic = "force-dynamic";

const MATERIALS_SHEET = "Materials";

export async function GET() {
  try {
    const doc = await getDoc();
    const mSheet = doc.sheetsByTitle[MATERIALS_SHEET];

    if (!mSheet) {
      return NextResponse.json({ data: [] });
    }

    const materialRows = await mSheet.getRows();
    const data = materialRows
      .map((row) => ({
        "Material ID": row.get("Material ID"),
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
      }))
      .filter((r) => r["Material ID"]);

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error("GET Materials Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

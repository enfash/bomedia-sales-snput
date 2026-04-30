/**
 * lib/inventory-deduction.ts
 * Drop-in utility: deducts job LINEAR FEET from inventory rolls.
 * See bottom of file for integration instructions.
 */

import { GoogleSpreadsheet } from "google-spreadsheet";

const INVENTORY_SHEET = "Inventory";

export async function deductFromInventoryByLength(
  doc: GoogleSpreadsheet,
  rollId: string | undefined,
  itemName: string,
  jobLengthFt: number,
  widthFt?: number
): Promise<{
  success: boolean;
  rollId?: string;
  remainingLength?: number;
  status?: string;
  error?: string;
}> {
  try {
    const sheet = doc.sheetsByTitle[INVENTORY_SHEET];
    if (!sheet) return { success: false, error: "Inventory sheet not found" };

    const rows = await sheet.getRows();
    let row: any = null;

    // Strategy 1: exact Roll ID
    if (rollId?.trim()) {
      row = rows.find((r: any) => r.get("Roll ID") === rollId.trim());
    }

    // Strategy 2: Item Name + Width fallback — use lowest remaining active roll first
    if (!row && itemName) {
      const nameLower = itemName.toLowerCase();
      const candidates = rows.filter((r: any) => {
        const rowName = (r.get("Item Name") || "").toLowerCase();
        const rowStatus = r.get("Status") || "Active";
        const nameMatch = rowName === nameLower || rowName.includes(nameLower) || nameLower.includes(rowName);
        const notDepleted = rowStatus !== "Out of Stock" && rowStatus !== "Depleted";
        if (!nameMatch || !notDepleted) return false;
        if (widthFt) {
          const rowWidth = parseFloat(r.get("Width (ft)") || "0");
          return Math.abs(rowWidth - widthFt) < 0.1;
        }
        return true;
      });
      candidates.sort((a: any, b: any) =>
        parseFloat(a.get("Remaining Length (ft)") || "0") - parseFloat(b.get("Remaining Length (ft)") || "0")
      );
      row = candidates[0] || null;
    }

    if (!row) {
      console.warn(`[Inventory] No roll found for "${rollId || itemName}". Sale recorded but inventory NOT decremented.`);
      return { success: false, error: `No roll found for ${rollId || itemName}` };
    }

    const currentRemaining = parseFloat(row.get("Remaining Length (ft)") || "0") || 0;
    const threshold = parseFloat(row.get("Low Stock Threshold (ft)") || "20") || 20;

    if (jobLengthFt > currentRemaining) {
      return {
        success: false,
        error: `Insufficient stock on roll ${row.get("Roll ID")}. Need ${jobLengthFt.toFixed(1)}ft, have ${currentRemaining.toFixed(1)}ft.`,
      };
    }

    const newRemaining = currentRemaining - jobLengthFt;
    const newStatus = newRemaining <= 0 ? "Out of Stock" : newRemaining <= threshold ? "Low Stock" : "Active";

    row.set("Remaining Length (ft)", newRemaining.toFixed(2));
    row.set("Status", newStatus);
    await row.save();

    console.log(`[Inventory] ${row.get("Roll ID")}: −${jobLengthFt.toFixed(2)}ft → ${newRemaining.toFixed(2)}ft (${newStatus})`);

    return { success: true, rollId: row.get("Roll ID"), remainingLength: newRemaining, status: newStatus };
  } catch (err: any) {
    console.error("[Inventory] deductFromInventoryByLength error:", err);
    return { success: false, error: err.message };
  }
}

/*
 * HOW TO INTEGRATE IN app/api/sales/route.ts
 * ─────────────────────────────────────────────
 * Import at top:
 *   import { deductFromInventoryByLength } from "@/lib/inventory-deduction";
 *
 * Replace the existing sqft-based inventory block with:
 *
 *   const jobLengthFt = parseFloat(item.actualHeight || item.jobLengthFt || item.qty) || 0;
 *   const rollWidthFt = parseFloat(item.rollWidth || item.rollSize) || undefined;
 *
 *   const deductResult = await deductFromInventoryByLength(
 *     doc,
 *     item.canonicalItemName,  // Roll ID if chosen from popover
 *     item.jobDescription,     // fallback material name
 *     jobLengthFt,
 *     rollWidthFt
 *   );
 *
 *   if (!deductResult.success && deductResult.error?.includes("Insufficient")) {
 *     return NextResponse.json({ error: deductResult.error }, { status: 400 });
 *   }
 *   // Non-critical failures (no matching roll) are logged but don't block the sale
 */

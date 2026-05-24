/**
 * lib/inventory-deduction.ts
 * Upgraded to Two-Level Inventory: Materials + Rolls
 */

import { GoogleSpreadsheet } from "google-spreadsheet";
import { ensureHeaders } from "./google-sheets";

const INVENTORY_SHEET = "Inventory";
const MATERIALS_SHEET = "Materials";

const MATERIALS_HEADERS = [
  'Material ID',
  'Material Name',
  'Width (ft)',
  'Selling Price',
  'Total Remaining (ft)',
  'Total Capacity (ft)',
  'Active Roll ID',
  'Roll Count',
  'Status',
  'Low Stock Threshold (ft)',
  'Last Updated',
  'Notes',
  'Total Spent',
  'Total Remaining Asset Value',
  'Total Remaining Revenue'
];

/**
 * Updates the aggregate material profile in the 'Materials' sheet based on its constituent rolls.
 * Handles auto-promotion of the next active roll.
 */
export async function refreshMaterialProfile(doc: GoogleSpreadsheet, materialId: string) {
  const mSheet = doc.sheetsByTitle[MATERIALS_SHEET];
  const iSheet = doc.sheetsByTitle[INVENTORY_SHEET];
  if (!mSheet || !iSheet) return;

  await ensureHeaders(mSheet, MATERIALS_HEADERS);

  const [mRows, iRows] = await Promise.all([mSheet.getRows(), iSheet.getRows()]);

  const rolls = iRows.filter(r => r.get('Material ID') === materialId);
  if (rolls.length === 0) return;

  const totalRemaining = rolls.reduce((sum, r) => sum + (parseFloat(r.get('Remaining Length (ft)')) || 0), 0);
  const totalCapacity = rolls.reduce((sum, r) => sum + (parseFloat(r.get('Total Length (ft)')) || 0), 0);
  const rollCount = rolls.length;

  // Active roll auto-promotion: lowest Roll ID that has stock
  const activeRoll = rolls
    .filter(r => (parseFloat(r.get('Remaining Length (ft)')) || 0) > 0.1)
    .sort((a, b) => (a.get('Roll ID') || '').localeCompare(b.get('Roll ID') || ''))[0]
    || rolls.sort((a, b) => (a.get('Roll ID') || '').localeCompare(b.get('Roll ID') || ''))[0];

  const activeRollId = activeRoll ? activeRoll.get('Roll ID') : '';
  const firstRoll = rolls[0];
  // Price follows the active roll — reflects the most recently purchased/restocked roll
  const priceRoll = activeRoll || firstRoll;
  const mRow = mRows.find(r => r.get('Material ID') === materialId);
  const threshold = parseFloat((mRow ?? firstRoll).get('Low Stock Threshold (ft)') || '20') || 20;

  let status = 'Active';
  if (totalRemaining <= 0.1) status = 'Out of Stock';
  else if (totalRemaining <= threshold) status = 'Low Stock';

  const nextRow = mRow ? mRow.rowNumber : mRows.length + 2;

  const totalSpentFormula = `=SUMIF(Inventory!Q:Q, A${nextRow}, Inventory!K:K)`;
  const remainingAssetFormula = `=SUMIF(Inventory!Q:Q, A${nextRow}, Inventory!S:S)`;
  const remainingRevenueFormula = `=SUMIF(Inventory!Q:Q, A${nextRow}, Inventory!T:T)`;

  if (!mRow) {
    // First roll for this material — create the Materials row
    await mSheet.addRow({
      'Material ID': materialId,
      'Material Name': firstRoll.get('Item Name'),
      'Width (ft)': firstRoll.get('Width (ft)'),
      'Selling Price': priceRoll.get('Price'),
      'Total Remaining (ft)': totalRemaining.toFixed(2),
      'Total Capacity (ft)': totalCapacity.toFixed(2),
      'Active Roll ID': activeRollId,
      'Roll Count': rollCount,
      'Status': status,
      'Low Stock Threshold (ft)': threshold,
      'Last Updated': new Date().toISOString(),
      'Notes': '',
      'Total Spent': totalSpentFormula,
      'Total Remaining Asset Value': remainingAssetFormula,
      'Total Remaining Revenue': remainingRevenueFormula,
    });
    return;
  }

  mRow.set('Total Remaining (ft)', totalRemaining.toFixed(2));
  mRow.set('Total Capacity (ft)', totalCapacity.toFixed(2));
  mRow.set('Active Roll ID', activeRollId);
  mRow.set('Roll Count', rollCount);
  mRow.set('Status', status);
  mRow.set('Selling Price', priceRoll.get('Price'));
  mRow.set('Last Updated', new Date().toISOString());
  mRow.set('Total Spent', totalSpentFormula);
  mRow.set('Total Remaining Asset Value', remainingAssetFormula);
  mRow.set('Total Remaining Revenue', remainingRevenueFormula);

  await mRow.save();
}

/**
 * Deducts consumed length from the active roll of a material.
 * Includes orientation flip logic and unit conversion.
 */
export async function deductFromInventory(
  doc: GoogleSpreadsheet,
  params: {
    materialId?: string;
    rollId?: string;
    jobWidth: number;
    jobHeight: number;
    qty: number;
    unit?: 'ft' | 'in';
  }
): Promise<{
  success: boolean;
  rollId?: string;
  remainingLength?: number;
  status?: string;
  error?: string;
}> {
  const { materialId, rollId, jobWidth, jobHeight, qty, unit = 'ft' } = params;

  try {
    const iSheet = doc.sheetsByTitle[INVENTORY_SHEET];
    const mSheet = doc.sheetsByTitle[MATERIALS_SHEET];
    if (!iSheet || !mSheet) return { success: false, error: "Inventory or Materials sheet not found" };

    const mRows = await mSheet.getRows();
    const iRows = await iSheet.getRows();

    // 1. Conversion to feet
    let jW = jobWidth;
    let jH = jobHeight;
    if (unit === 'in') {
      jW /= 12;
      jH /= 12;
    }

    let materialRow: any = null;
    let rollRow: any = null;

    // Identify the roll to deduct from
    if (rollId) {
      rollRow = iRows.find(r => r.get('Roll ID') === rollId);
      if (rollRow) {
        const mId = rollRow.get('Material ID') || materialId;
        materialRow = mRows.find(r => r.get('Material ID') === mId);
      }
    } else if (materialId) {
      materialRow = mRows.find(r => r.get('Material ID') === materialId);
      if (materialRow) {
        const activeRollId = materialRow.get('Active Roll ID');
        rollRow = iRows.find(r => r.get('Roll ID') === activeRollId);
      }
    }

    if (!rollRow || !materialRow) {
      return { success: false, error: `Could not identify active roll for ${materialId || rollId}` };
    }

    const rollWidth = parseFloat(rollRow.get('Width (ft)') || '0');

    // 2. Tiling/Nesting: calculate rows needed for each orientation, pick the shorter one.
    let normalLen = Infinity;
    if (jW <= rollWidth + 0.01) {
      const itemsPerRow = Math.floor((rollWidth + 0.01) / jW);
      normalLen = Math.ceil(qty / itemsPerRow) * jH;
    }

    let flippedLen = Infinity;
    if (jH <= rollWidth + 0.01) {
      const itemsPerRow = Math.floor((rollWidth + 0.01) / jH);
      flippedLen = Math.ceil(qty / itemsPerRow) * jW;
    }

    if (normalLen === Infinity && flippedLen === Infinity) {
      return {
        success: false,
        error: `Job dimension exceeds roll width (${rollWidth}ft). Requested: ${jW.toFixed(1)}ft x ${jH.toFixed(1)}ft`,
      };
    }

    const isFlipped = flippedLen < normalLen;
    const totalConsumedLength = isFlipped ? flippedLen : normalLen;
    console.log(`[Inventory] Tiling (${isFlipped ? 'flipped' : 'normal'}): ${qty}× ${jW.toFixed(2)}ft×${jH.toFixed(2)}ft → ${totalConsumedLength.toFixed(2)}ft on ${rollWidth}ft roll`);

    // 3. Read current stock (no hard block — sales are always logged; inventory depletes to 0)
    const currentRemaining = parseFloat(rollRow.get("Remaining Length (ft)") || "0") || 0;
    if (totalConsumedLength > currentRemaining + 0.1) {
      console.warn(
        `[Inventory] Over-deduction on ${rollRow.get("Roll ID")}: need ${totalConsumedLength.toFixed(1)}ft, have ${currentRemaining.toFixed(1)}ft. Depleting to 0.`
      );
    }

    // 4. Update Roll (Math.max clamps to 0 when over-consumed)
    const newRemaining = Math.max(0, currentRemaining - totalConsumedLength);
    const threshold = parseFloat(rollRow.get("Low Stock Threshold (ft)") || "20") || 20;
    
    // Status logic: if 0, mark Depleted.
    let newStatus = 'Active';
    if (newRemaining <= 0.1) newStatus = 'Depleted';
    else if (newRemaining <= threshold) newStatus = 'Low Stock';

    rollRow.set("Remaining Length (ft)", newRemaining.toFixed(2));
    rollRow.set("Status", newStatus);
    await rollRow.save();

    // 5. Update Material Profile (handles auto-promotion)
    await refreshMaterialProfile(doc, materialRow.get('Material ID'));

    console.log(`[Inventory] ${rollRow.get("Roll ID")}: −${totalConsumedLength.toFixed(2)}ft → ${newRemaining.toFixed(2)}ft (${newStatus})`);

    return { 
      success: true, 
      rollId: rollRow.get("Roll ID"), 
      remainingLength: newRemaining, 
      status: newStatus 
    };
  } catch (err: any) {
    console.error("[Inventory] deductFromInventory error:", err);
    return { success: false, error: err.message };
  }
}

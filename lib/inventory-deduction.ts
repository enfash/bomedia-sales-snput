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

  await refreshMaterialProfileFromRows(mSheet, materialId, mRows, iRows);
}

/**
 * Same as refreshMaterialProfile, but operates on rows the caller has already
 * loaded. Batch callers pass their rows in so a whole order costs one pair of
 * reads instead of one pair per item.
 */
async function refreshMaterialProfileFromRows(
  mSheet: any,
  materialId: string,
  mRows: any[],
  iRows: any[]
) {
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

export type DeductionRequest = {
  materialId?: string;
  rollId?: string;
  jobWidth: number;
  jobHeight: number;
  qty: number;
  unit?: 'ft' | 'in';
};

export type DeductionResult = {
  success: boolean;
  rollId?: string;
  remainingLength?: number;
  status?: string;
  error?: string;
};

/**
 * Deducts a whole batch of jobs in one pass.
 *
 * The sheets are read ONCE for the entire batch and every deduction is applied
 * to an in-memory ledger, so a 20-item order costs the same handful of API
 * calls as a 1-item order. The previous per-item function issued 5 reads and
 * 2 writes each, which blew straight through the Google Sheets 60-reads-per-
 * minute-per-user quota partway through a large order.
 *
 * Returns one result per request, in the same order as the input.
 */
export async function deductBatchFromInventory(
  doc: GoogleSpreadsheet,
  requests: DeductionRequest[]
): Promise<DeductionResult[]> {
  if (requests.length === 0) return [];

  const fail = (error: string): DeductionResult[] => requests.map(() => ({ success: false, error }));

  try {
    const iSheet = doc.sheetsByTitle[INVENTORY_SHEET];
    const mSheet = doc.sheetsByTitle[MATERIALS_SHEET];
    if (!iSheet || !mSheet) return fail('Inventory or Materials sheet not found');

    await ensureHeaders(mSheet, MATERIALS_HEADERS);
    const [mRows, iRows] = await Promise.all([mSheet.getRows(), iSheet.getRows()]);

    // Working ledger of remaining length per roll. Items later in the batch see
    // the stock consumed by earlier ones, which the old per-item flow only got
    // by re-reading the whole sheet every time.
    const remainingByRoll = new Map<string, number>();
    iRows.forEach((r: any) => {
      const id = r.get('Roll ID');
      if (id) remainingByRoll.set(id, parseFloat(r.get('Remaining Length (ft)') || '0') || 0);
    });

    const touchedRolls = new Set<string>();
    const touchedMaterials = new Set<string>();
    const results: DeductionResult[] = [];

    for (const params of requests) {
      const { materialId, rollId, jobWidth, jobHeight, qty, unit = 'ft' } = params;

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
        rollRow = iRows.find((r: any) => r.get('Roll ID') === rollId);
        if (rollRow) {
          const mId = rollRow.get('Material ID') || materialId;
          materialRow = mRows.find((r: any) => r.get('Material ID') === mId);
        }
      } else if (materialId) {
        materialRow = mRows.find((r: any) => r.get('Material ID') === materialId);
        if (materialRow) {
          const activeRollId = materialRow.get('Active Roll ID');
          rollRow = iRows.find((r: any) => r.get('Roll ID') === activeRollId);
        }
      }

      if (!rollRow || !materialRow) {
        results.push({
          success: false,
          error: `Could not identify active roll for ${materialId || rollId}`,
        });
        continue;
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
        results.push({
          success: false,
          error: `Job dimension exceeds roll width (${rollWidth}ft). Requested: ${jW.toFixed(1)}ft x ${jH.toFixed(1)}ft`,
        });
        continue;
      }

      const isFlipped = flippedLen < normalLen;
      const totalConsumedLength = isFlipped ? flippedLen : normalLen;
      console.log(`[Inventory] Tiling (${isFlipped ? 'flipped' : 'normal'}): ${qty}× ${jW.toFixed(2)}ft×${jH.toFixed(2)}ft → ${totalConsumedLength.toFixed(2)}ft on ${rollWidth}ft roll`);

      // 3. Cascade Logic: Find all rolls for this material, sorted by Roll ID (FIFO)
      const mId = materialRow.get('Material ID');
      let allRolls = iRows.filter((r: any) => r.get('Material ID') === mId);
      allRolls.sort((a: any, b: any) => (a.get('Roll ID') || '').localeCompare(b.get('Roll ID') || ''));

      // If a specific roll was manually selected, start the cascade from there.
      // Otherwise, filter to rolls that actually have stock.
      if (rollId) {
        const startIndex = allRolls.findIndex((r: any) => r.get('Roll ID') === rollId);
        if (startIndex > -1) {
          allRolls = allRolls.slice(startIndex);
        }
      } else {
        allRolls = allRolls.filter(
          (r: any) => (remainingByRoll.get(r.get('Roll ID')) ?? 0) > 0.1
        );
      }

      // 4. Execute the cross-roll deduction against the in-memory ledger
      let remainingToDeduct = totalConsumedLength;
      const modifiedRolls = [];

      for (const currentRoll of allRolls) {
        if (remainingToDeduct <= 0) break;

        const currentRollId = currentRoll.get('Roll ID');
        const currentRemaining = remainingByRoll.get(currentRollId) ?? 0;
        if (currentRemaining <= 0) continue;

        // Take what we need, or exhaust the roll entirely
        const amountToTake = Math.min(currentRemaining, remainingToDeduct);
        remainingToDeduct -= amountToTake;

        remainingByRoll.set(currentRollId, currentRemaining - amountToTake);
        touchedRolls.add(currentRollId);

        modifiedRolls.push({ id: currentRollId, deducted: amountToTake.toFixed(2) });
      }

      touchedMaterials.add(mId);

      if (remainingToDeduct > 0.1) {
        console.warn(`[Inventory] System completely out of stock for ${mId}. ${remainingToDeduct.toFixed(2)}ft unfulfilled.`);
      }

      console.log(`[Inventory] Deduction cascaded:`, modifiedRolls);

      const selectedRollId = rollRow.get('Roll ID');
      results.push({
        success: true,
        rollId: selectedRollId,
        remainingLength: remainingByRoll.get(selectedRollId) ?? 0,
      });
    }

    // 5. Flush — one write per touched roll, not one per item.
    for (const id of touchedRolls) {
      const row = iRows.find((r: any) => r.get('Roll ID') === id);
      if (!row) continue;

      const newRemaining = remainingByRoll.get(id) ?? 0;
      const threshold = parseFloat(row.get('Low Stock Threshold (ft)') || '20') || 20;

      let newStatus = 'Active';
      if (newRemaining <= 0.1) newStatus = 'Depleted';
      else if (newRemaining <= threshold) newStatus = 'Low Stock';

      row.set('Remaining Length (ft)', newRemaining.toFixed(2));
      row.set('Status', newStatus);
      await row.save();

      console.log(`[Inventory] ${id} → ${newRemaining.toFixed(2)}ft (${newStatus})`);
    }

    // Reuse the rows already in memory — they carry the updated values set above.
    for (const matId of touchedMaterials) {
      await refreshMaterialProfileFromRows(mSheet, matId, mRows, iRows);
    }

    // Backfill the per-request status now that rolls carry their final state.
    results.forEach((r) => {
      if (!r.success || !r.rollId) return;
      const row = iRows.find((x: any) => x.get('Roll ID') === r.rollId);
      if (row) r.status = row.get('Status') || 'Active';
    });

    return results;
  } catch (err: any) {
    console.error('[Inventory] deductBatchFromInventory error:', err);
    return fail(err.message);
  }
}

/**
 * Single-item convenience wrapper around deductBatchFromInventory.
 */
export async function deductFromInventory(
  doc: GoogleSpreadsheet,
  params: DeductionRequest
): Promise<DeductionResult> {
  const [result] = await deductBatchFromInventory(doc, [params]);
  return result ?? { success: false, error: 'Deduction produced no result' };
}

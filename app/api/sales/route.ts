import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDoc, ensureHeaders } from '@/lib/google-sheets';
import { deductBatchFromInventory } from '@/lib/inventory-deduction';
import { getCachedRows, invalidateSheet } from '@/lib/sheet-cache';
import { verifyToken } from '@/lib/auth-utils';

export const dynamic = 'force-dynamic';

// Safety net for large multi-item orders. The batched deduction keeps a typical
// order well under this, but a slow Sheets API shouldn't truncate a write that
// is already partway through.
export const maxDuration = 300;

const SHEET_TITLE = 'Sales';
const SALES_HEADERS = [
  'DATE', 'CLIENT NAME', 'JOB DESCRIPTION', 'CONTACT', 'MATERIAL', 'Cost Per SQRFT', 
  '3FT', '4FT', '5FT', '6FT', '8FT', '10FT', 'QTY', 'UNIT COST (₦)', 'INITIAL PAYMENT (₦)', 
  'AMOUNT (₦)', 'ADDITIONAL PAYMENT 1', 'ADDITIONAL PAYMENT 2', 'AMOUNT DIFFERENCES', 'PAYMENT STATUS', 
  'JOB STATUS', 'Logged By', 'Sales ID', 'TIMESTAMP', 'TRANSACTION ID'
];
const INVENTORY_HEADERS = [
  'Roll ID', 'Item Name', 'Category', 'Width (ft)', 'Raw Length (ft)',
  'Total Length (ft)', 'Remaining Length (ft)', 'Waste Logged (ft)', 'Unit',
  'Price', 'Cost', 'Waste Factor', 'Cost per Sqft', 'Low Stock Threshold (ft)',
  'Status', 'Date Added', 'Material ID',
];

export async function GET() {
  try {
    const doc = await getDoc();
    const sheet = doc.sheetsByTitle[SHEET_TITLE] || doc.sheetsByIndex[0];
    const rows = await getCachedRows(SHEET_TITLE, () => sheet.getRows());

    const data = rows.map(row => ({
      ...row.toObject(),
      _rowIndex: row.rowNumber
    }));

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error("GET Sales Error:", error);
    const status = error.status || 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { rowIndex, saleId, additionalPayment1, additionalPayment2, jobStatus } = body;
    
    if (!rowIndex && !saleId) {
      return NextResponse.json({ error: "rowIndex or saleId is required" }, { status: 400 });
    }

    const doc = await getDoc();
    const sheet = doc.sheetsByTitle[SHEET_TITLE] || doc.sheetsByIndex[0];
    await ensureHeaders(sheet, SALES_HEADERS);
    
    let targetRowIndex = rowIndex;
    
    if (saleId) {
      const rows = await sheet.getRows();
      const targetRow = rows.find((r: any) => r.get('Sales ID') === saleId || r.get('TRANSACTION ID') === saleId);
      if (!targetRow) {
        return NextResponse.json({ error: `Sale not found with ID ${saleId}` }, { status: 400 });
      }
      targetRowIndex = targetRow.rowNumber;
    }

    if (!targetRowIndex) {
      return NextResponse.json({ error: "A valid rowIndex or matching saleId is required" }, { status: 400 });
    }

    await sheet.loadCells(`A${targetRowIndex}:W${targetRowIndex}`);
    
    // Role-based Access Control: Cashiers cannot edit records older than 24 hours
    const cookieStore = await cookies();
    const adminToken = cookieStore.get('admin_session')?.value;
    const adminPayload = adminToken ? await verifyToken(adminToken) : null;
    const isAdmin = adminPayload && adminPayload.role === 'admin';
    
    if (!isAdmin) {
      const dateCell = sheet.getCellByA1(`A${targetRowIndex}`);
      const recordDateStr = dateCell.value;
      if (recordDateStr) {
        const recordDate = new Date(recordDateStr.toString()).getTime();
        if (!isNaN(recordDate)) {
          const ageInMs = Date.now() - recordDate;
          if (ageInMs > 24 * 60 * 60 * 1000) {
            return NextResponse.json({ error: "Cashiers cannot edit records older than 24 hours" }, { status: 403 });
          }
        }
      }
    }

    // Update fields if provided
    if (additionalPayment1 !== undefined) {
      sheet.getCellByA1(`Q${targetRowIndex}`).value = additionalPayment1;
    }
    if (additionalPayment2 !== undefined) {
      sheet.getCellByA1(`R${targetRowIndex}`).value = additionalPayment2;
    }
    if (jobStatus !== undefined) {
      sheet.getCellByA1(`U${targetRowIndex}`).value = jobStatus;
    }

    // Re-stamp the balance and payment-status formulas so that old/static rows
    // (Col S previously had =P-O instead of =P-SUM(O,Q,R)) are corrected whenever
    // a payment is recorded.
    if (additionalPayment1 !== undefined || additionalPayment2 !== undefined) {
      sheet.getCellByA1(`S${targetRowIndex}`).formula =
        `=(P${targetRowIndex}-SUM(O${targetRowIndex},Q${targetRowIndex},R${targetRowIndex}))`;
      sheet.getCellByA1(`T${targetRowIndex}`).formula =
        `=IF(P${targetRowIndex}=0,"Unpaid",IF(S${targetRowIndex}<=0,"Paid",IF(S${targetRowIndex}<P${targetRowIndex},"Part-payment","Unpaid")))`;
    }

    await sheet.saveUpdatedCells();
    invalidateSheet(SHEET_TITLE);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("PATCH Sales Error:", error);
    const status = error.status || 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const doc = await getDoc();
    const sheet = doc.sheetsByTitle[SHEET_TITLE] || doc.sheetsByIndex[0];
    
    // Inventory Linkage Logic
    const inventorySheet = doc.sheetsByTitle['Inventory'];
    if (inventorySheet) {
      await ensureHeaders(inventorySheet, INVENTORY_HEADERS);
    }
    if (body.batch && Array.isArray(body.items)) {
      // Validate dimensions and quantity
      for (const item of body.items) {
        if (item.jobWidth !== undefined && parseFloat(item.jobWidth) <= 0) {
          return NextResponse.json({ error: "Job width must be greater than zero" }, { status: 400 });
        }
        if (item.jobHeight !== undefined && parseFloat(item.jobHeight) <= 0) {
          return NextResponse.json({ error: "Job height must be greater than zero" }, { status: 400 });
        }
        if (item.qty !== undefined && parseFloat(item.qty) <= 0) {
          return NextResponse.json({ error: "Quantity must be greater than zero" }, { status: 400 });
        }
      }

      await ensureHeaders(sheet, SALES_HEADERS);
      const rows = await sheet.getRows();
      let nextRow = rows.length + 2; // Assuming 1-based index and row 1 is header

      // --- Deduplication Check ---
      if (body.transactionId) {
        const isDuplicate = rows.some((r: any) => r.get('TRANSACTION ID') === body.transactionId);
        if (isDuplicate) {
          return NextResponse.json({ message: 'Sale already recorded' }, { status: 200 });
        }
      }

      // --- Stock Pre-Validation (read-only — no writes yet) ---
      const mSheet = doc.sheetsByTitle['Materials'];
      if (mSheet) {
        const matRows = await mSheet.getRows();
        const stockMap: Record<string, number> = {};
        matRows.forEach((r: any) => {
          const id = r.get('Material ID');
          if (id) stockMap[id] = parseFloat(r.get('Total Remaining (ft)') || '0') || 0;
        });

        const requiredMap: Record<string, number> = {};
        for (const item of body.items) {
          const matId = item.canonicalItemName;
          if (!matId) continue;
          // Prefer the client-computed tiled length (accounts for items packed side-by-side).
          // Fall back to height×qty only when jobLengthFt is absent (legacy payloads).
          let lengthFt = parseFloat(item.jobLengthFt) || 0;
          if (lengthFt <= 0) {
            const hFt = (item.dimUnit === 'in') ? parseFloat(item.jobHeight) / 12 : parseFloat(item.jobHeight) || 0;
            const qty = parseFloat(item.qty) || 1;
            lengthFt = hFt * qty;
          }
          requiredMap[matId] = (requiredMap[matId] || 0) + lengthFt;
        }

        for (const [matId, required] of Object.entries(requiredMap)) {
          const available = stockMap[matId] ?? 0;
          // 1ft buffer: tiling may use less than the conservative height×qty estimate
          if (required > available + 1) {
            return NextResponse.json({
              error: `Not enough stock for ${matId}. Needed ≈${required.toFixed(1)}ft, available ${available.toFixed(1)}ft. Please restock before recording this sale.`,
            }, { status: 409 });
          }
        }
      }

      // Generate SALES ID server-side: BOM-YYYYMMDD-XXXX
      const dateStr = (body.items[0] && body.items[0].values && body.items[0].values[0]) || new Date().toISOString().split('T')[0];
      const cleanDate = dateStr.replace(/-/g, '');
      const uniqueSuffix = (Date.now() % 9000 + 1000).toString().slice(-4);
      const salesId = `BOM-${cleanDate}-${uniqueSuffix}`;

      const newRows = [];
      const deductions: Array<{
        materialId?: string;
        rollId?: string;
        jobWidth: number;
        jobHeight: number;
        qty: number;
        unit: 'ft' | 'in';
      }> = [];

      for (const item of body.items) {
        // Prefer canonicalItemName (exact name from inventory popover selection) to avoid
        // fragile text matching on the user-edited job description field.
        const matchedItemName = item.canonicalItemName || item.jobDescription || (item.values && item.values[2]) || '';

        // Replace placeholders [ROW] with the actual row number
        const processedValues = item.values.map((val: any) => {
          if (typeof val === "string") {
            // 1. Handle dynamic formulas
            if (val.includes("[ROW]")) {
              let updated = val.replace(/\[ROW\]/g, nextRow.toString());
              const sizeColLetters = ['G', 'H', 'I', 'J', 'K', 'L'];
              const sizeColIndex = item.values.findIndex((v: any, i: number) => {
                if (i < 6 || i > 11) return false;
                if (v === undefined || v === null || v === "") return false;
                const s = v.toString();
                return s.startsWith('=') || parseFloat(s) > 0;
              });
              if (sizeColIndex !== -1) {
                 const colLetter = sizeColLetters[sizeColIndex - 6];
                 updated = updated.replace(/\[COL_G_L\]/g, colLetter);
              }
              return updated;
            }
            
            // 2. Protect standard formulas
            if (val.startsWith("=")) {
              return val;
            }

            // 3. Force numeric strings to actual Numbers
            if (val.trim() !== "" && !isNaN(Number(val))) {
              return Number(val);
            }
          }
          
          // 4. Return everything else as-is
          return val;
        });

        // Append Sales ID (W/22), TIMESTAMP (X/23), and TRANSACTION ID (Y/24)
        while (processedValues.length < 25) {
          processedValues.push("");
        }
        processedValues[22] = processedValues[22] || salesId;
        processedValues[23] = new Date().toISOString();
        processedValues[24] = body.transactionId || "";
        
        newRows.push(processedValues);
        nextRow++;

        // Collect the deduction — it runs after the sale rows are safely written.
        if (matchedItemName && item.jobWidth && item.jobHeight) {
          deductions.push({
            materialId: item.canonicalItemName, // selected material
            rollId: item.rollId,               // specific roll if any
            jobWidth: parseFloat(item.jobWidth),
            jobHeight: parseFloat(item.jobHeight),
            qty: parseFloat(item.qty) || 1,
            unit: item.dimUnit || 'ft',
          });
        }
      }

      // Write the sale FIRST, then adjust stock. Deduction used to run inside the
      // loop above, so a failure partway through a large order left inventory
      // consumed with no sale rows behind it — unrecoverable, and it re-deducted
      // on every retry. A sale recorded against slightly stale stock is the
      // recoverable direction: stock can be reconciled, a lost sale cannot.
      await sheet.addRows(newRows);

      // One batched pass: the sheets are read once for the whole order rather
      // than once per item, which is what used to exhaust the Sheets read quota
      // on orders of ~12 items or more.
      const deductResults = await deductBatchFromInventory(doc, deductions);

      const inventoryWarnings: string[] = [];
      deductResults.forEach((result, i) => {
        if (!result.success) {
          console.error(`[Sales] Inventory deduction failed: ${result.error}`);
          const req = deductions[i];
          inventoryWarnings.push(`${req.materialId || req.rollId}: ${result.error}`);
        }
      });

      if (inventoryWarnings.length > 0) {
        // The sale is recorded — do NOT fail the request, or the client will retry
        // and double-deduct. Surface the discrepancy for manual reconciliation.
        invalidateSheet(SHEET_TITLE, 'Materials', 'Inventory');
        return NextResponse.json({
          success: true,
          salesId,
          inventoryWarnings,
          message: `Sale recorded (${salesId}), but stock could not be updated for ${inventoryWarnings.length} item(s). Please adjust inventory manually.`,
        });
      }

    } else if (body.type === "array" && Array.isArray(body.values)) {
      // Legacy single-item fallback
      const matchedItemName = body.values[2];
      const quantityToSubtract = parseFloat(body.values[12]) || 0;

      await ensureHeaders(sheet, SALES_HEADERS);
      const rows = await sheet.getRows();
      const nextRow = rows.length + 2;
      
      // --- Deduplication Check ---
      if (body.transactionId) {
        const isDuplicate = rows.some((r: any) => r.get('TRANSACTION ID') === body.transactionId);
        if (isDuplicate) {
          return NextResponse.json({ message: 'Sale already recorded' }, { status: 200 });
        }
      }
      
      const processedValues = body.values.map((val: any) => {
        if (typeof val === "string") {
          // 1. Handle dynamic formulas
          if (val.includes("[ROW]")) {
            let updated = val.replace(/\[ROW\]/g, nextRow.toString());
            const sizeColLetters = ['G', 'H', 'I', 'J', 'K', 'L'];
            const sizeColIndex = body.values.findIndex((v: any, i: number) => {
              if (i < 6 || i > 11) return false;
              if (v === undefined || v === null || v === "") return false;
              const s = v.toString();
              return s.startsWith('=') || parseFloat(s) > 0;
            });
            if (sizeColIndex !== -1) {
               const colLetter = sizeColLetters[sizeColIndex - 6];
               updated = updated.replace(/\[COL_G_L\]/g, colLetter);
            }
            return updated;
          }
          
          // 2. Protect standard formulas
          if (val.startsWith("=")) {
            return val;
          }

          // 3. Force numeric strings to actual Numbers
          if (val.trim() !== "" && !isNaN(Number(val))) {
            return Number(val);
          }
        }
        
        // 4. Return everything else as-is
        return val;
      });

      // Provide empty Sales ID for legacy and TIMESTAMP and TRANSACTION ID
      while (processedValues.length < 25) {
        processedValues.push("");
      }
      processedValues[22] = processedValues[22] || "";
      processedValues[23] = new Date().toISOString();
      processedValues[24] = body.transactionId || "";

      await sheet.addRow(processedValues);

      /* Legacy inventory deduction disabled in favor of upgraded batch logic above */
      // if (inventorySheet && matchedItemName && (body.totalArea || quantityToSubtract > 0)) {
      //   ...
      // }
    } else {
      await ensureHeaders(sheet, SALES_HEADERS);
      const rowData = Array.isArray(body) ? [...body, new Date().toISOString()] : { ...body, TIMESTAMP: new Date().toISOString() };
      await sheet.addRow(rowData);
    }

    invalidateSheet(SHEET_TITLE, 'Materials', 'Inventory');
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("POST Sales Error:", error);
    const status = error.status || 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}

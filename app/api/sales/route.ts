import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDoc, ensureHeaders } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';

const SHEET_TITLE = 'Sales';
const SALES_HEADERS = [
  'DATE', 'CLIENT NAME', 'JOB DESCRIPTION', 'CONTACT', 'MATERIAL', 'COST PER SQFT', 
  '3FT', '4FT', '5FT', '6FT', '8FT', '10FT', 'QTY', 'UNIT COST', 'INITIAL PAYMENT', 
  'TOTAL', 'ADDITIONAL PAYMENT 1', 'ADDITIONAL PAYMENT 2', 'BALANCE', 'PAYMENT STATUS', 
  'JOB STATUS', 'LOGGED BY'
];
const INVENTORY_HEADERS = [
  'Item Name', 'Category', 'Price', 'Cost', 'Width (ft)', 'Length', 'Unit', 'Adjustments', 'Stock', 'Waste Factor', 'Cost per Sqft'
];

export async function GET() {
  try {
    const doc = await getDoc();
    const sheet = doc.sheetsByTitle[SHEET_TITLE] || doc.sheetsByIndex[0];
    await ensureHeaders(sheet, SALES_HEADERS);
    const rows = await sheet.getRows();
    
    const data = rows.map(row => ({
      ...row.toObject(),
      _rowIndex: row.rowNumber
    }));

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error("GET Sales Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { rowIndex, additionalPayment1, additionalPayment2, jobStatus } = body;
    
    if (!rowIndex) {
      return NextResponse.json({ error: "rowIndex is required" }, { status: 400 });
    }

    const doc = await getDoc();
    const sheet = doc.sheetsByTitle[SHEET_TITLE] || doc.sheetsByIndex[0];
    await ensureHeaders(sheet, SALES_HEADERS);
    const rows = await sheet.getRows();
    
    // Find the row by its spreadsheet row number
    const row = rows.find(r => r.rowNumber === rowIndex);
    
    if (!row) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    // Role-based Access Control: Cashiers cannot edit records older than 24 hours
    const cookieStore = cookies();
    const isAdmin = cookieStore.get('admin_session');
    
    if (!isAdmin) {
      const recordDateStr = row.get('DATE') || row.get('Date');
      if (recordDateStr) {
        const recordDate = new Date(recordDateStr).getTime();
        if (!isNaN(recordDate)) {
          const ageInMs = Date.now() - recordDate;
          if (ageInMs > 24 * 60 * 60 * 1000) {
            return NextResponse.json({ error: "Cashiers cannot edit records older than 24 hours" }, { status: 403 });
          }
        }
      }
    }

    // Update fields if provided
    if (additionalPayment1 !== undefined) row.set('ADDITIONAL PAYMENT 1', additionalPayment1);
    if (additionalPayment2 !== undefined) row.set('ADDITIONAL PAYMENT 2', additionalPayment2);
    if (jobStatus !== undefined) row.set('JOB STATUS', jobStatus);


    await row.save();
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("PATCH Sales Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
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
    let matchedItemName = '';
    let quantityToSubtract = 0;

    if (body.type === "array" && Array.isArray(body.values)) {
      // Mapping based on fixed columns defined in SalesEntry
      // C: Job Description (Index 2), M: Qty (Index 12)
      matchedItemName = body.values[2];
      quantityToSubtract = parseFloat(body.values[12]) || 0;

      // Calculate the next row number
      await ensureHeaders(sheet, SALES_HEADERS);
      const rows = await sheet.getRows();
      const nextRow = rows.length + 2; // Assuming 1-based index and row 1 is header
      
      // Replace placeholders [ROW] with the actual row number
      const processedValues = body.values.map((val: any) => {
        if (typeof val === "string" && val.includes("[ROW]")) {
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
        return val;
      });

      await sheet.addRow(processedValues);

      // Decrement Inventory if match found
      if (inventorySheet && matchedItemName && (body.totalArea || quantityToSubtract > 0)) {
        const invRows = await inventorySheet.getRows();
        const invRow = invRows.find(r => r.get('Item Name')?.toLowerCase() === matchedItemName.toLowerCase());
        
        if (invRow) {
          const wastePercent = parseFloat(invRow.get('Waste Factor')?.toString() || '0');
          const areaToSubtract = body.totalArea || quantityToSubtract; // Fallback to qty if area missing
          
          const totalDeduction = areaToSubtract * (1 + (wastePercent / 100));
          
          // IMPORTANT: Update Adjustments column instead of Stock to preserve the formula audit trail
          const currentAdjustment = parseFloat(invRow.get('Adjustments')?.toString() || '0');
          invRow.set('Adjustments', currentAdjustment - totalDeduction);
          
          await invRow.save();
          console.log(`Inventory updated for ${matchedItemName}: Adjustment -${totalDeduction.toFixed(2)} sqft (Waste: ${wastePercent}%)`);
        }
      }

    } else {
      await ensureHeaders(sheet, SALES_HEADERS);
      await sheet.addRow(body);
    }
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("POST Sales Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

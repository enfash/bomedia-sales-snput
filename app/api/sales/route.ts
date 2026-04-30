import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDoc, ensureHeaders } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';

const SHEET_TITLE = 'Sales';
const SALES_HEADERS = [
  'DATE', 'CLIENT NAME', 'JOB DESCRIPTION', 'CONTACT', 'MATERIAL', 'COST PER SQFT', 
  '3FT', '4FT', '5FT', '6FT', '8FT', '10FT', 'QTY', 'UNIT COST', 'INITIAL PAYMENT', 
  'TOTAL', 'ADDITIONAL PAYMENT 1', 'ADDITIONAL PAYMENT 2', 'BALANCE', 'PAYMENT STATUS', 
  'JOB STATUS', 'LOGGED BY', 'SALES ID', 'TIMESTAMP'
];
const INVENTORY_HEADERS = [
  'Item Name', 'Width (ft)', 'Length', 'Unit', 'Price', 'Stock'
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
    await sheet.loadCells(`A${rowIndex}:W${rowIndex}`);
    
    // Role-based Access Control: Cashiers cannot edit records older than 24 hours
    const cookieStore = cookies();
    const isAdmin = cookieStore.get('admin_session');
    
    if (!isAdmin) {
      const dateCell = sheet.getCellByA1(`A${rowIndex}`);
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
      sheet.getCellByA1(`Q${rowIndex}`).value = additionalPayment1;
    }
    if (additionalPayment2 !== undefined) {
      sheet.getCellByA1(`R${rowIndex}`).value = additionalPayment2;
    }
    if (jobStatus !== undefined) {
      sheet.getCellByA1(`U${rowIndex}`).value = jobStatus;
    }

    await sheet.saveUpdatedCells();
    
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
    if (body.batch && Array.isArray(body.items)) {
      await ensureHeaders(sheet, SALES_HEADERS);
      const rows = await sheet.getRows();
      let nextRow = rows.length + 2; // Assuming 1-based index and row 1 is header

      // Generate SALES ID server-side: BOM-YYYYMMDD-XXXX
      // Use high-resolution time + process ID bits to avoid collisions when
      // multiple requests land in the same millisecond.
      const dateStr = (body.items[0] && body.items[0].values && body.items[0].values[0]) || new Date().toISOString().split('T')[0];
      const cleanDate = dateStr.replace(/-/g, '');
      const uniqueSuffix = (Date.now() % 9000 + 1000).toString().slice(-4);
      const salesId = `BOM-${cleanDate}-${uniqueSuffix}`;

      const newRows = [];

      for (const item of body.items) {
        // Prefer canonicalItemName (exact name from inventory popover selection) to avoid
        // fragile text matching on the user-edited job description field.
        const matchedItemName = item.canonicalItemName || item.jobDescription || (item.values && item.values[2]) || '';
        const quantityToSubtract = parseFloat(item.qty || (item.values && item.values[12])) || 0;
        const totalArea = item.totalArea || quantityToSubtract; // Fallback to qty if area missing

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

        // Append Sales ID as column W (Index 22) and TIMESTAMP as column X (Index 23)
        while (processedValues.length < 23) {
          processedValues.push("");
        }
        processedValues[22] = processedValues[22] || salesId;
        processedValues[23] = new Date().toISOString();
        
        newRows.push(processedValues);
        nextRow++;

        // Decrement Inventory if match found
        if (inventorySheet && matchedItemName && totalArea > 0) {
          const invRows = await inventorySheet.getRows();
          const invRow = invRows.find(r => r.get('Item Name')?.toLowerCase() === matchedItemName.toLowerCase());
          
          if (invRow) {
            const availableStock = parseFloat(invRow.get('Stock')?.toString().replace(/,/g, '') || '0');
            if (availableStock < totalArea) {
              return NextResponse.json({ error: `Insufficient stock for ${matchedItemName}. Requested: ${totalArea} sqft, Available: ${availableStock} sqft.` }, { status: 400 });
            }
            
            invRow.set('Stock', availableStock - totalArea);
            await invRow.save();
            console.log(`Inventory updated for ${matchedItemName}: -${totalArea.toFixed(2)} sqft`);
          }
        }
      }

      await sheet.addRows(newRows);

    } else if (body.type === "array" && Array.isArray(body.values)) {
      // Legacy single-item fallback
      const matchedItemName = body.values[2];
      const quantityToSubtract = parseFloat(body.values[12]) || 0;

      await ensureHeaders(sheet, SALES_HEADERS);
      const rows = await sheet.getRows();
      const nextRow = rows.length + 2;
      
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

      // Provide empty Sales ID for legacy and TIMESTAMP
      while (processedValues.length < 23) {
        processedValues.push("");
      }
      processedValues[22] = processedValues[22] || "";
      processedValues[23] = new Date().toISOString();

      await sheet.addRow(processedValues);

      if (inventorySheet && matchedItemName && (body.totalArea || quantityToSubtract > 0)) {
        const invRows = await inventorySheet.getRows();
        const invRow = invRows.find(r => r.get('Item Name')?.toLowerCase() === matchedItemName.toLowerCase());
        
        if (invRow) {
          const areaToSubtract = body.totalArea || quantityToSubtract;
          const availableStock = parseFloat(invRow.get('Stock')?.toString().replace(/,/g, '') || '0');
          if (availableStock < areaToSubtract) {
            return NextResponse.json({ error: `Insufficient stock for ${matchedItemName}. Requested: ${areaToSubtract} sqft, Available: ${availableStock} sqft.` }, { status: 400 });
          }
          
          invRow.set('Stock', availableStock - areaToSubtract);
          await invRow.save();
          console.log(`Inventory updated for ${matchedItemName}: -${areaToSubtract.toFixed(2)} sqft`);
        }
      }
    } else {
      await ensureHeaders(sheet, SALES_HEADERS);
      const rowData = Array.isArray(body) ? [...body, new Date().toISOString()] : { ...body, TIMESTAMP: new Date().toISOString() };
      await sheet.addRow(rowData);
    }
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("POST Sales Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

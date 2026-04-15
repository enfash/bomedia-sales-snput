import { NextResponse } from 'next/server';
import { getDoc } from '@/lib/google-sheets';

const SHEET_TITLE = 'Sales';

export async function GET() {
  try {
    const doc = await getDoc();
    const sheet = doc.sheetsByTitle[SHEET_TITLE] || doc.sheetsByIndex[0];
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
    const rows = await sheet.getRows();
    
    // Find the row by its spreadsheet row number
    const row = rows.find(r => r.rowNumber === rowIndex);
    
    if (!row) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
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
    
    if (body.type === "array" && Array.isArray(body.values)) {
      // Calculate the next row number
      const rows = await sheet.getRows();
      const nextRow = rows.length + 2; // Assuming 1-based index and row 1 is header
      
      // Replace placeholders [ROW] with the actual row number
      // We also handle [COL_G_L] which is the first non-empty size column index
      const processedValues = body.values.map((val: any) => {
        if (typeof val === "string" && val.includes("[ROW]")) {
          let updated = val.replace(/\[ROW\]/g, nextRow.toString());
          
          // Locate the size column used (G to L)
          const sizeColLetters = ['G', 'H', 'I', 'J', 'K', 'L'];
          const sizeColIndex = body.values.findIndex((v: any, i: number) => {
            if (i < 6 || i > 11) return false;
            if (v === undefined || v === null || v === "") return false;
            // Check if it's a formula or a non-zero string
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

      // Use positional update to handle duplicate headers
      await sheet.addRow(processedValues);
    } else {
      // Fallback for object-based if needed
      await sheet.addRow(body);
    }
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("POST Sales Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

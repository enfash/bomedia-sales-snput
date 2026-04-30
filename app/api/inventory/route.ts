import { NextResponse } from 'next/server';
import { getDoc, ensureHeaders } from '@/lib/google-sheets';

const SHEET_TITLE = 'Inventory';
const INVENTORY_HEADERS = [
  'Item Name', 'Width (ft)', 'Length', 'Unit', 'Price', 'Stock'
];

export async function GET() {
  try {
    const doc = await getDoc();
    const sheet = doc.sheetsByTitle[SHEET_TITLE];
    
    if (!sheet) {
      return NextResponse.json({ 
        error: `Sheet tab "${SHEET_TITLE}" not found. Please create it first.`,
        suggestedHeaders: INVENTORY_HEADERS
      }, { status: 404 });
    }

    await ensureHeaders(sheet, INVENTORY_HEADERS);

    const rows = await sheet.getRows();
    const data = rows.map(row => ({
      ...row.toObject(),
      _rowIndex: row.rowNumber
    }));

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error("GET Inventory Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const doc = await getDoc();
    const sheet = doc.sheetsByTitle[SHEET_TITLE];

    if (!sheet) {
      return NextResponse.json({ error: `Sheet tab "${SHEET_TITLE}" not found.` }, { status: 404 });
    }

    await ensureHeaders(sheet, INVENTORY_HEADERS);
    const rows = await sheet.getRows();
    const nextRow = rows.length + 2;

    // Process formulas and placeholders
    const processedBody = { ...body };
    
    if (!processedBody['Unit']) {
      processedBody['Unit'] = 'ft';
    }

    Object.keys(processedBody).forEach(key => {
      const val = processedBody[key];
      if (typeof val === 'string' && val.includes('[ROW]')) {
        processedBody[key] = val.replace(/\[ROW\]/g, nextRow.toString());
      }
    });

    await sheet.addRow(processedBody);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("POST Inventory Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { rowIndex, stockChange, ...updates } = body;

    const doc = await getDoc();
    const sheet = doc.sheetsByTitle[SHEET_TITLE];
    if (!sheet) return NextResponse.json({ error: "Inventory sheet not found" }, { status: 404 });

    await ensureHeaders(sheet, INVENTORY_HEADERS);

    const rows = await sheet.getRows();
    const row = rows.find(r => r.rowNumber === rowIndex);

    if (!row) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // Direct updates
    Object.keys(updates).forEach(key => {
      row.set(key, updates[key]);
    });

    // Stock change logic (if provided)
    if (stockChange !== undefined) {
      const currentStock = parseFloat(row.get('Stock')?.toString().replace(/,/g, '') || '0') || 0;
      row.set('Stock', currentStock + stockChange);
    }

    await row.save();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("PATCH Inventory Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

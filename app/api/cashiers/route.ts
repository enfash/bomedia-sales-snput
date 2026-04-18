import { NextResponse } from 'next/server';
import { getDoc, ensureHeaders } from '@/lib/google-sheets';

const SHEET_TITLE = 'Cashiers';
const CASHIER_HEADERS = ['Name', 'Status', 'Last Login'];

export async function GET() {
  try {
    const doc = await getDoc();
    let sheet = doc.sheetsByTitle[SHEET_TITLE];
    
    // Create sheet if missing
    if (!sheet) {
      sheet = await doc.addSheet({ headerValues: CASHIER_HEADERS, title: SHEET_TITLE });
    }

    await ensureHeaders(sheet, CASHIER_HEADERS);
    const rows = await sheet.getRows();
    
    const data = rows.map((row: any) => ({
      ...row.toObject(),
      _rowIndex: row.rowNumber,
      // Ensure defaults for older rows
      Status: row.get('Status') || 'Offline',
      'Last Login': row.get('Last Login') || 'Never'
    }));

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error("GET Cashiers Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { name } = await request.json();
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const doc = await getDoc();
    let sheet = doc.sheetsByTitle[SHEET_TITLE];
    if (!sheet) {
      sheet = await doc.addSheet({ headerValues: CASHIER_HEADERS, title: SHEET_TITLE });
    }
    
    await ensureHeaders(sheet, CASHIER_HEADERS);
    const rows = await sheet.getRows();
    
    if (rows.some((r: any) => r.get('Name')?.toLowerCase() === name.toLowerCase())) {
        return NextResponse.json({ error: "Cashier name already exists" }, { status: 400 });
    }

    await sheet.addRow({
        Name: name,
        Status: 'Offline',
        'Last Login': 'Never'
    });
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("POST Cashiers Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { name, status } = await request.json();
    if (!name || !status) return NextResponse.json({ error: "Name and status are required" }, { status: 400 });

    const doc = await getDoc();
    const sheet = doc.sheetsByTitle[SHEET_TITLE];
    if (!sheet) return NextResponse.json({ error: "Cashiers sheet not found" }, { status: 404 });

    await ensureHeaders(sheet, CASHIER_HEADERS);
    const rows = await sheet.getRows();
    
    const row = rows.find((r: any) => r.get('Name') === name);
    if (!row) return NextResponse.json({ error: "Cashier not found" }, { status: 404 });

    row.set('Status', status);
    if (status === 'Online') {
        const now = new Date();
        row.set('Last Login', now.toLocaleString());
    }
    
    await row.save();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("PATCH Cashiers Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { name } = await request.json();
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const doc = await getDoc();
    const sheet = doc.sheetsByTitle[SHEET_TITLE];
    if (!sheet) return NextResponse.json({ error: "Cashiers sheet not found" }, { status: 404 });

    await ensureHeaders(sheet, CASHIER_HEADERS);
    const rows = await sheet.getRows();
    
    const row = rows.find((r: any) => r.get('Name') === name);
    if (!row) return NextResponse.json({ error: "Cashier not found" }, { status: 404 });

    await row.delete();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("DELETE Cashiers Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

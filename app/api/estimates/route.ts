import { NextResponse } from 'next/server';
import { getDoc, ensureHeaders } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';

const SHEET_TITLE = 'Estimates';
const HEADERS = ['QUOTE ID', 'DATE', 'CLIENT NAME', 'CART DATA'];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const quoteId = searchParams.get('quoteId');

    const doc = await getDoc();
    const sheet = doc.sheetsByTitle[SHEET_TITLE];
    
    if (!sheet) {
      return NextResponse.json({ error: "Estimates sheet not found" }, { status: 404 });
    }

    const rows = await sheet.getRows();
    const data = rows.map(row => row.toObject());

    if (quoteId) {
      const estimate = data.find(r => r['QUOTE ID'] === quoteId);
      if (estimate) {
        return NextResponse.json({ data: estimate });
      }
      return NextResponse.json({ error: "Quote not found" }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error("GET Estimates Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { quoteId, clientName, cartData } = body;

    if (!quoteId || !cartData) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const doc = await getDoc();
    const sheet = doc.sheetsByTitle[SHEET_TITLE];
    
    if (!sheet) {
      return NextResponse.json({ error: "Estimates sheet not found" }, { status: 404 });
    }

    await ensureHeaders(sheet, HEADERS);
    
    await sheet.addRow({
      'QUOTE ID': quoteId,
      'DATE': new Date().toISOString(),
      'CLIENT NAME': clientName || 'Unknown',
      'CART DATA': JSON.stringify(cartData)
    });

    return NextResponse.json({ success: true, quoteId });
  } catch (error: any) {
    console.error("POST Estimates Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

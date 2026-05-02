import { NextResponse } from 'next/server';
import { getDoc, ensureHeaders } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';

const SHEET_TITLE = 'Payments';
const PAYMENTS_HEADERS = [
  'PAYMENT ID', 'SALES ID', 'CLIENT NAME', 'DATE', 'AMOUNT', 'PAYMENT TYPE', 
  'BALANCE BEFORE', 'BALANCE AFTER', 'COLLECTED BY', 'NOTES', 'TIMESTAMP'
];

export async function GET() {
  try {
    const doc = await getDoc();
    const sheet = doc.sheetsByTitle[SHEET_TITLE];
    
    if (!sheet) {
      return NextResponse.json({ data: [] });
    }

    await ensureHeaders(sheet, PAYMENTS_HEADERS);
    const rows = await sheet.getRows();
    
    const data = rows.map(row => ({
      ...row.toObject(),
      _rowIndex: row.rowNumber
    }));

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error("GET Payments Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const doc = await getDoc();
    const sheet = doc.sheetsByTitle[SHEET_TITLE];
    
    if (!sheet) {
      return NextResponse.json({ error: `Sheet "${SHEET_TITLE}" not found.` }, { status: 404 });
    }

    await ensureHeaders(sheet, PAYMENTS_HEADERS);

    // Auto-generate Payment ID: PAY-YYYYMMDD-XXXX
    const now = new Date();
    const cleanDate = now.toISOString().split('T')[0].replace(/-/g, '');
    const uniqueSuffix = (Date.now() % 9000 + 1000).toString().slice(-4);
    const paymentId = `PAY-${cleanDate}-${uniqueSuffix}`;

    const timestamp = now.toISOString();

    const newRow = {
      'PAYMENT ID': paymentId,
      'SALES ID': body.salesId || '',
      'CLIENT NAME': body.clientName || '',
      'DATE': body.date || now.toISOString().split('T')[0],
      'AMOUNT': body.amount || 0,
      'PAYMENT TYPE': body.paymentType || 'Additional Payment',
      'BALANCE BEFORE': body.balanceBefore || 0,
      'BALANCE AFTER': body.balanceAfter || 0,
      'COLLECTED BY': body.collectedBy || 'Unknown',
      'NOTES': body.notes || '',
      'TIMESTAMP': timestamp
    };

    await sheet.addRow(newRow);
    
    return NextResponse.json({ success: true, paymentId });
  } catch (error: any) {
    console.error("POST Payments Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

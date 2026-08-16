import { NextResponse } from 'next/server';
import { getDoc, ensureHeaders } from '@/lib/google-sheets';
import { getCachedRows, invalidateSheet } from '@/lib/sheet-cache';

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

    const rows = await getCachedRows(SHEET_TITLE, () => sheet.getRows());

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

    const now = new Date();
    let paymentId: string;

    if (body.transactionId) {
      paymentId = body.transactionId;
      const rows = await sheet.getRows();
      const isDuplicate = rows.some((row: any) => row.get('PAYMENT ID') === paymentId);
      if (isDuplicate) {
        return NextResponse.json({ success: true, message: 'Payment already logged (duplicate)' });
      }
    } else {
      // Auto-generate Payment ID: PAY-YYYYMMDD-XXXX
      const cleanDate = now.toISOString().split('T')[0].replace(/-/g, '');
      const uniqueSuffix = (Date.now() % 9000 + 1000).toString().slice(-4);
      paymentId = `PAY-${cleanDate}-${uniqueSuffix}`;
    }

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

    invalidateSheet(SHEET_TITLE);
    return NextResponse.json({ success: true, paymentId });
  } catch (error: any) {
    console.error("POST Payments Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

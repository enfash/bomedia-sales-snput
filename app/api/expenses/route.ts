import { NextResponse } from 'next/server';
import { getDoc, ensureHeaders } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';

const SHEET_TITLE = 'Expenses';
const EXPENSES_HEADERS = [
  'DATE', 'AMOUNT', 'CATEGORY', 'DESCRIPTION', 'PAID TO',
  'PAYMENT METHOD', 'RECEIPT URL', 'Logged By', 'STATUS',
  'PAID BY', 'PAID AT', 'TIMESTAMP',
];

export async function GET() {
  try {
    const doc = await getDoc();
    const sheet = doc.sheetsByTitle[SHEET_TITLE] || doc.sheetsByIndex[1];
    const rows = await sheet.getRows();
    const data = rows.map(row => row.toObject());
    return NextResponse.json({ data });
  } catch (error: any) {
    console.error('GET Expenses Error:', error);
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const doc = await getDoc();
    const sheet = doc.sheetsByTitle[SHEET_TITLE] || doc.sheetsByIndex[1];
    await ensureHeaders(sheet, EXPENSES_HEADERS);

    const rowData = Array.isArray(body)
      ? [...body, new Date().toISOString()]
      : { ...body, TIMESTAMP: new Date().toISOString() };
    await sheet.addRow(rowData);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('POST Expenses Error:', error);
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { timestamp, status, paidBy } = await request.json();
    if (!timestamp || !status) {
      return NextResponse.json({ error: 'timestamp and status are required' }, { status: 400 });
    }

    const doc = await getDoc();
    const sheet = doc.sheetsByTitle[SHEET_TITLE] || doc.sheetsByIndex[1];
    await ensureHeaders(sheet, EXPENSES_HEADERS);
    const rows = await sheet.getRows();

    const row = rows.find(r => r.get('TIMESTAMP') === timestamp);
    if (!row) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
    }

    row.set('STATUS', status);
    if (status === 'Paid') {
      row.set('PAID BY', paidBy || 'Unknown');
      row.set('PAID AT', new Date().toISOString());
    } else {
      row.set('PAID BY', '');
      row.set('PAID AT', '');
    }
    await row.save();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('PATCH Expenses Error:', error);
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}

import { NextResponse } from 'next/server';
import { getDoc, ensureHeaders } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';

const SHEET_TITLE = 'Expenses';
const EXPENSES_HEADERS = ['DATE', 'AMOUNT', 'CATEGORY', 'DESCRIPTION', 'PAID TO', 'PAYMENT METHOD', 'RECEIPT URL', 'Logged By'];

export async function GET() {
  try {
    const doc = await getDoc();
    const sheet = doc.sheetsByTitle[SHEET_TITLE] || doc.sheetsByIndex[1];
    await ensureHeaders(sheet, EXPENSES_HEADERS);
    const rows = await sheet.getRows();
    const data = rows.map(row => row.toObject());
    return NextResponse.json({ data });
  } catch (error: any) {
    console.error('GET Expenses Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const doc = await getDoc();
    const sheet = doc.sheetsByTitle[SHEET_TITLE] || doc.sheetsByIndex[1];
    await ensureHeaders(sheet, EXPENSES_HEADERS);
    await sheet.addRow(body);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('POST Expenses Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

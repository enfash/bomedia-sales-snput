import { NextResponse } from 'next/server';
import { getDoc } from '@/lib/google-sheets';

const SHEET_TITLE = 'Expenses';

export async function GET() {
  try {
    const doc = await getDoc();
    const sheet = doc.sheetsByTitle[SHEET_TITLE] || doc.sheetsByIndex[1];
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
    await sheet.addRow(body);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('POST Expenses Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

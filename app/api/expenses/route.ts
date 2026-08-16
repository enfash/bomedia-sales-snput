import { NextResponse } from 'next/server';
import { getDoc, ensureHeaders } from '@/lib/google-sheets';
import { getCachedRows, invalidateSheet } from '@/lib/sheet-cache';

export const dynamic = 'force-dynamic';

const SHEET_TITLE = 'Expenses';
const EXPENSES_HEADERS = [
  'DATE', 'EXPENSE ID', 'AMOUNT', 'CATEGORY', 'DESCRIPTION', 'PAID TO',
  'PAYMENT METHOD', 'RECEIPT URL', 'Logged By', 'STATUS',
  'PAID BY', 'PAID AT', 'TIMESTAMP',
];

export async function GET() {
  try {
    const doc = await getDoc();
    const sheet = doc.sheetsByTitle[SHEET_TITLE] || doc.sheetsByIndex[1];
    const rows = await getCachedRows(SHEET_TITLE, () => sheet.getRows());
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

    // Validate expense amount
    if (body.AMOUNT !== undefined && parseFloat(body.AMOUNT) < 0) {
      return NextResponse.json({ error: "Expense amount cannot be negative" }, { status: 400 });
    }
    if (body.batch === true && Array.isArray(body.items)) {
      for (const it of body.items) {
        if (it.AMOUNT !== undefined && parseFloat(it.AMOUNT) < 0) {
          return NextResponse.json({ error: "Expense amount cannot be negative" }, { status: 400 });
        }
      }
    }

    const doc = await getDoc();
    const sheet = doc.sheetsByTitle[SHEET_TITLE] || doc.sheetsByIndex[1];
    await ensureHeaders(sheet, EXPENSES_HEADERS);

    // --- Deduplication Check ---
    const sheetRows = await sheet.getRows();
    let isDuplicate = false;
    if (body && body.batch === true && Array.isArray(body.items)) {
      const txId = body.transactionId;
      if (txId) {
        isDuplicate = sheetRows.some((r: any) => r.get('EXPENSE ID') === txId);
      }
      if (!isDuplicate) {
        for (const it of body.items) {
          const expenseId = it['EXPENSE ID'] || txId;
          if (expenseId && sheetRows.some((r: any) => r.get('EXPENSE ID') === expenseId)) {
            isDuplicate = true;
            break;
          }
        }
      }
    } else if (body) {
      const expenseId = body['EXPENSE ID'] || body.transactionId;
      if (expenseId) {
        isDuplicate = sheetRows.some((r: any) => r.get('EXPENSE ID') === expenseId);
      }
    }

    if (isDuplicate) {
      return NextResponse.json({ message: "Expense already recorded" }, { status: 200 });
    }

    // Support both single expense objects and batch posts from the client.
    // For batch posts, client sends { batch: true, items: [...], transactionId }
    if (body && body.batch === true && Array.isArray(body.items)) {
      const txId = body.transactionId || new Date().toISOString();
      const rows = body.items.map((it: any) => ({
        // prefer provided EXPENSE ID per-item, otherwise use transaction id
        'EXPENSE ID': it['EXPENSE ID'] || txId,
        ...it,
        TIMESTAMP: new Date().toISOString(),
      }));
      // addRows writes multiple rows at once
      await sheet.addRows(rows);
    } else {
      const rowData = { ...body, TIMESTAMP: new Date().toISOString() };
      // If caller included a transactionId, map it to EXPENSE ID if not present
      if (rowData.transactionId && !rowData['EXPENSE ID']) {
        rowData['EXPENSE ID'] = rowData.transactionId;
      }
      await sheet.addRow(rowData);
    }

    invalidateSheet(SHEET_TITLE);
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

    invalidateSheet(SHEET_TITLE);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('PATCH Expenses Error:', error);
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}

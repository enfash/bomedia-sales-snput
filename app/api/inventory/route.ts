import { NextResponse } from 'next/server';
import { getDoc, ensureHeaders } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';

const SHEET_TITLE = 'Inventory';

const INVENTORY_HEADERS = [
  'Roll ID',
  'Item Name',
  'Category',
  'Width (ft)',
  'Raw Length (ft)',
  'Total Length (ft)',
  'Remaining Length (ft)',
  'Waste Logged (ft)',
  'Unit',
  'Price',
  'Cost',
  'Waste Factor',
  'Cost per Sqft',
  'Low Stock Threshold (ft)',
  'Status',
  'Date Added',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeStatus(remaining: number, threshold: number): string {
  if (remaining <= 0) return 'Out of Stock';
  if (remaining <= threshold) return 'Low Stock';
  return 'Active';
}

async function generateRollId(rows: any[], itemName: string, widthFt: number): Promise<string> {
  const prefix = `${itemName} ${widthFt}ft - Roll `;
  let maxNum = 0;
  rows.forEach((row: any) => {
    const id: string = row.get('Roll ID') || '';
    if (id.startsWith(prefix)) {
      const num = parseInt(id.replace(prefix, ''), 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
  });
  return `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const doc = await getDoc();
    const sheet = doc.sheetsByTitle[SHEET_TITLE];

    if (!sheet) {
      return NextResponse.json({
        error: `Sheet tab "${SHEET_TITLE}" not found. Please create it first.`,
        suggestedHeaders: INVENTORY_HEADERS,
      }, { status: 404 });
    }

    await ensureHeaders(sheet, INVENTORY_HEADERS);
    const rows = await sheet.getRows();
    const data = rows.map((row) => ({ ...row.toObject(), _rowIndex: row.rowNumber }));
    return NextResponse.json({ data });
  } catch (error: any) {
    console.error('GET Inventory Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ─── POST — add a new roll ────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const doc = await getDoc();
    const sheet = doc.sheetsByTitle[SHEET_TITLE];

    if (!sheet) {
      return NextResponse.json({ error: `Sheet tab "${SHEET_TITLE}" not found.` }, { status: 404 });
    }

    await ensureHeaders(sheet, INVENTORY_HEADERS);
    const existingRows = await sheet.getRows();

    const {
      itemName,
      category = 'General',
      widthFt,
      rawLengthFt,
      unit = 'ft',
      price,
      cost,
      lowStockThreshold = 20,
    } = body;

    if (!itemName || !widthFt || !rawLengthFt) {
      return NextResponse.json(
        { error: 'itemName, widthFt, and rawLengthFt are required.' },
        { status: 400 }
      );
    }

    const widthNum = parseFloat(widthFt);
    const rawLength = parseFloat(rawLengthFt);
    const EXPECTED_WASTE_FT = 10;
    const totalUsable = rawLength - EXPECTED_WASTE_FT;
    const threshold = parseFloat(lowStockThreshold) || 20;

    const rollId = await generateRollId(existingRows, itemName, widthNum);

    const priceNum = parseFloat(price) || 0;
    const costNum = parseFloat(cost) || 0;
    const totalAreaSqft = widthNum * totalUsable;
    const costPerSqft = totalAreaSqft > 0 ? costNum / totalAreaSqft : 0;

    await sheet.addRow({
      'Roll ID': rollId,
      'Item Name': itemName,
      'Category': category,
      'Width (ft)': widthNum,
      'Raw Length (ft)': rawLength,
      'Total Length (ft)': totalUsable,
      'Remaining Length (ft)': totalUsable,
      'Waste Logged (ft)': 0,
      'Unit': unit,
      'Price': priceNum,
      'Cost': costNum,
      'Waste Factor': EXPECTED_WASTE_FT,
      'Cost per Sqft': costPerSqft.toFixed(4),
      'Low Stock Threshold (ft)': threshold,
      'Status': computeStatus(totalUsable, threshold),
      'Date Added': new Date().toISOString().split('T')[0],
    });

    return NextResponse.json({ success: true, rollId });
  } catch (error: any) {
    console.error('POST Inventory Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ─── PATCH — update a roll ────────────────────────────────────────────────────

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { rowIndex, rollId, deductLength, wasteLength, adjustment, ...directUpdates } = body;

    const doc = await getDoc();
    const sheet = doc.sheetsByTitle[SHEET_TITLE];

    if (!sheet) {
      return NextResponse.json({ error: 'Inventory sheet not found' }, { status: 404 });
    }

    await ensureHeaders(sheet, INVENTORY_HEADERS);
    const rows = await sheet.getRows();

    let row: any = null;
    if (rowIndex) row = rows.find((r) => r.rowNumber === rowIndex);
    else if (rollId) row = rows.find((r) => r.get('Roll ID') === rollId);

    if (!row) {
      return NextResponse.json({ error: 'Inventory roll not found' }, { status: 404 });
    }

    const threshold = parseFloat(row.get('Low Stock Threshold (ft)') || '20') || 20;

    // ── Sales deduction ───────────────────────────────────────────────────────
    if (deductLength !== undefined) {
      const current = parseFloat(row.get('Remaining Length (ft)') || '0') || 0;
      const deduct = parseFloat(deductLength) || 0;
      if (deduct > current) {
        return NextResponse.json({
          error: `Insufficient stock on roll ${row.get('Roll ID')}. Requested: ${deduct.toFixed(1)}ft, Available: ${current.toFixed(1)}ft`,
        }, { status: 400 });
      }
      const newRemaining = current - deduct;
      row.set('Remaining Length (ft)', newRemaining.toFixed(2));
      row.set('Status', computeStatus(newRemaining, threshold));
    }

    // ── Waste log ─────────────────────────────────────────────────────────────
    if (wasteLength !== undefined) {
      const current = parseFloat(row.get('Remaining Length (ft)') || '0') || 0;
      const currentWaste = parseFloat(row.get('Waste Logged (ft)') || '0') || 0;
      const waste = parseFloat(wasteLength) || 0;
      const newRemaining = Math.max(0, current - waste);
      row.set('Remaining Length (ft)', newRemaining.toFixed(2));
      row.set('Waste Logged (ft)', (currentWaste + waste).toFixed(2));
      row.set('Status', computeStatus(newRemaining, threshold));
    }

    // ── Manual adjustment ─────────────────────────────────────────────────────
    if (adjustment !== undefined) {
      const current = parseFloat(row.get('Remaining Length (ft)') || '0') || 0;
      const adj = parseFloat(adjustment) || 0;
      const newRemaining = Math.max(0, current + adj);
      row.set('Remaining Length (ft)', newRemaining.toFixed(2));
      row.set('Status', computeStatus(newRemaining, threshold));
    }

    // ── Direct field updates ──────────────────────────────────────────────────
    Object.keys(directUpdates).forEach((key) => row.set(key, directUpdates[key]));

    await row.save();

    return NextResponse.json({
      success: true,
      remainingLength: parseFloat(row.get('Remaining Length (ft)') || '0'),
      status: row.get('Status'),
    });
  } catch (error: any) {
    console.error('PATCH Inventory Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

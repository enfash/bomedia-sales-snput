import { NextResponse } from 'next/server';
import { getDoc, ensureHeaders } from '@/lib/google-sheets';
import { refreshMaterialProfile } from '@/lib/inventory-deduction';

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
  'Material ID',
  'Expected Revenue',
  'Remaining Asset Value',
  'Remaining Expected Revenue',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeStatus(remaining: number, threshold: number): string {
  if (remaining <= 0) return 'Out of Stock';
  if (remaining <= threshold) return 'Low Stock';
  return 'Active';
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

    const rows = await sheet.getRows();
    const data = rows.map((row) => ({ ...row.toObject(), _rowIndex: row.rowNumber }));
    return NextResponse.json({ data });
  } catch (error: any) {
    console.error('GET Inventory Error:', error);
    const status = error.status || 500;
    return NextResponse.json({ error: error.message }, { status });
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
      quantity = 1,
      supplier = '—',
      purchaseDate,
      poReference = '—',
      paymentMethod = 'Bank Transfer',
      loggedBy = 'Unknown',
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
    const threshold = Math.max(0, parseFloat(lowStockThreshold) || 20);
    const qty = Math.max(1, parseInt(quantity, 10) || 1);

    if (widthNum <= 0) {
      return NextResponse.json({ error: 'Roll width must be greater than 0.' }, { status: 400 });
    }
    if (rawLength <= EXPECTED_WASTE_FT) {
      return NextResponse.json(
        { error: `Roll length (${rawLength}ft) must exceed the ${EXPECTED_WASTE_FT}ft waste reserve. Usable stock would be zero or negative.` },
        { status: 400 }
      );
    }

    const totalUsable = rawLength - EXPECTED_WASTE_FT;

    const priceNum = parseFloat(price) || 0;
    const costNum = parseFloat(cost) || 0;
    const costPerRoll = qty > 0 ? costNum / qty : costNum;
    const totalAreaSqft = widthNum * totalUsable;
    const costPerSqft = totalAreaSqft > 0 ? costPerRoll / totalAreaSqft : 0;

    const prefix = `${itemName} ${widthNum}ft - Roll `;
    let maxNum = 0;
    existingRows.forEach((row: any) => {
      const id: string = row.get('Roll ID') || '';
      if (id.startsWith(prefix)) {
        const num = parseInt(id.replace(prefix, ''), 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    });

    const materialId = `${itemName.trim().toUpperCase().replace(/\s+/g, '-')}-${parseFloat(widthNum.toString())}FT`;
    const rollIds: string[] = [];

    for (let i = 1; i <= qty; i++) {
      const rollId = `${prefix}${String(maxNum + i).padStart(3, '0')}`;
      rollIds.push(rollId);

      const nextRow = existingRows.length + 2 + (i - 1);

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
        'Cost': costPerRoll,
        'Waste Factor': EXPECTED_WASTE_FT,
        'Cost per Sqft': costPerSqft.toFixed(4),
        'Low Stock Threshold (ft)': threshold,
        'Status': computeStatus(totalUsable, threshold),
        'Date Added': new Date().toISOString().split('T')[0],
        'Material ID': materialId,
        'Expected Revenue': `=(D${nextRow}*F${nextRow})*J${nextRow}`,
        'Remaining Asset Value': `=(G${nextRow}/F${nextRow})*K${nextRow}`,
        'Remaining Expected Revenue': `=(D${nextRow}*G${nextRow})*J${nextRow}`,
      });
    }

    // Automatically log to Expenses sheet if cost > 0
    if (costNum > 0) {
      try {
        const expensesSheet = doc.sheetsByTitle['Expenses'] || doc.sheetsByIndex[1];
        if (expensesSheet) {
          const expenseId = poReference && poReference !== '—'
            ? `EXP-${poReference.trim().toUpperCase()}`
            : `EXP-INV-${Date.now()}`;

          await expensesSheet.addRow({
            'DATE': purchaseDate || new Date().toISOString().split('T')[0],
            'EXPENSE ID': expenseId,
            'AMOUNT': costNum,
            'CATEGORY': 'Inventory Purchase',
            'DESCRIPTION': `[RESTOCK] ${itemName} · ${widthNum}ft x ${rawLength}ft · Qty: ${qty} · Roll ID(s): ${rollIds.join(', ')}`,
            'PAID TO': supplier || '—',
            'PAYMENT METHOD': paymentMethod || '—',
            'RECEIPT URL': '',
            'Logged By': loggedBy || 'Unknown',
            'STATUS': 'Paid',
            'PAID BY': '—',
            'PAID AT': new Date().toISOString(),
            'TIMESTAMP': new Date().toISOString(),
          });
        }
      } catch (expErr) {
        console.error('Failed to log inventory purchase to Expenses sheet:', expErr);
      }
    }

    // Refresh or create material profile
    await refreshMaterialProfile(doc, materialId);

    return NextResponse.json({ success: true, rollIds });
  } catch (error: any) {
    console.error('POST Inventory Error:', error);
    const status = error.status || 500;
    return NextResponse.json({ error: error.message }, { status });
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

    // Refresh material profile
    const mId = row.get('Material ID');
    if (mId) {
      await refreshMaterialProfile(doc, mId);
    }

    return NextResponse.json({
      success: true,
      remainingLength: parseFloat(row.get('Remaining Length (ft)') || '0'),
      status: row.get('Status'),
    });
  } catch (error: any) {
    console.error('PATCH Inventory Error:', error);
    const status = error.status || 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}

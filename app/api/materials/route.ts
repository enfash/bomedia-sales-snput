import { NextResponse } from 'next/server';
import { getDoc, ensureHeaders } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';

const MATERIALS_SHEET = 'Materials';
const INVENTORY_SHEET = 'Inventory';

const MATERIALS_HEADERS = [
  'Material ID',
  'Material Name',
  'Width (ft)',
  'Selling Price',
  'Total Remaining (ft)',
  'Total Capacity (ft)',
  'Active Roll ID',
  'Roll Count',
  'Status',
  'Low Stock Threshold (ft)',
  'Last Updated',
  'Notes',
];

const INVENTORY_HEADERS = [
  'Roll ID', 'Item Name', 'Category', 'Width (ft)', 'Raw Length (ft)', 'Total Length (ft)',
  'Remaining Length (ft)', 'Waste Logged (ft)', 'Unit', 'Price', 'Cost', 'Waste Factor',
  'Cost per Sqft', 'Low Stock Threshold (ft)', 'Status', 'Date Added', 'Material ID'
];

function generateMaterialId(name: string, width: string | number) {
  const cleanName = name.trim().toUpperCase().replace(/\s+/g, '-');
  const w = parseFloat(String(width)) || 0;
  return `${cleanName}-${w}FT`;
}

export async function GET() {
  try {
    const doc = await getDoc();
    let mSheet = doc.sheetsByTitle[MATERIALS_SHEET];
    const iSheet = doc.sheetsByTitle[INVENTORY_SHEET];

    if (!mSheet) {
      // Create the sheet if it doesn't exist
      mSheet = await doc.addSheet({ title: MATERIALS_SHEET, headerValues: MATERIALS_HEADERS });
    } else {
      await ensureHeaders(mSheet, MATERIALS_HEADERS);
    }

    if (!iSheet) {
      return NextResponse.json({ error: 'Inventory sheet not found' }, { status: 404 });
    }

    await ensureHeaders(iSheet, INVENTORY_HEADERS);

    const rolls = await iSheet.getRows();
    const materialRows = await mSheet.getRows();

    // Group rolls by Material ID
    const groups: Record<string, any[]> = {};
    rolls.forEach(roll => {
      const name = roll.get('Item Name') || '';
      const width = roll.get('Width (ft)') || '0';
      if (!name) return;

      let mId = roll.get('Material ID');
      if (!mId) {
        mId = generateMaterialId(name, width);
        roll.set('Material ID', mId);
        // We'll save all updated rolls at the end or lazily
      }

      if (!groups[mId]) groups[mId] = [];
      groups[mId].push(roll);
    });

    // Save updated rolls (those that didn't have Material ID)
    const rollsToSave = rolls.filter(r => r.isDirty);
    for (const r of rollsToSave) {
      await r.save();
    }

    const results = [];

    // For each group, create/update Material entry
    for (const mId in groups) {
      const groupRolls = groups[mId];
      const firstRoll = groupRolls[0];
      
      const totalRemaining = groupRolls.reduce((sum, r) => sum + (parseFloat(r.get('Remaining Length (ft)')) || 0), 0);
      const totalCapacity = groupRolls.reduce((sum, r) => sum + (parseFloat(r.get('Total Length (ft)')) || 0), 0);
      const rollCount = groupRolls.length;
      
      // Find active roll: lowest Roll ID that is not depleted
      const activeRoll = groupRolls
        .filter(r => (parseFloat(r.get('Remaining Length (ft)')) || 0) > 0)
        .sort((a, b) => (a.get('Roll ID') || '').localeCompare(b.get('Roll ID') || ''))[0] 
        || groupRolls.sort((a, b) => (a.get('Roll ID') || '').localeCompare(b.get('Roll ID') || ''))[0];

      const activeRollId = activeRoll ? activeRoll.get('Roll ID') : '';
      const threshold = parseFloat(firstRoll.get('Low Stock Threshold (ft)') || '20') || 20;

      let status = 'Active';
      if (totalRemaining <= 0) status = 'Out of Stock';
      else if (totalRemaining <= threshold) status = 'Low Stock';

      const materialData = {
        'Material ID': mId,
        'Material Name': firstRoll.get('Item Name'),
        'Width (ft)': firstRoll.get('Width (ft)'),
        'Selling Price': firstRoll.get('Price'),
        'Total Remaining (ft)': totalRemaining.toFixed(2),
        'Total Capacity (ft)': totalCapacity.toFixed(2),
        'Active Roll ID': activeRollId,
        'Roll Count': rollCount,
        'Status': status,
        'Low Stock Threshold (ft)': threshold,
        'Last Updated': new Date().toISOString(),
      };

      // Find or Create Material row
      let mRow = materialRows.find(r => r.get('Material ID') === mId);
      if (mRow) {
        Object.entries(materialData).forEach(([key, val]) => mRow!.set(key, val));
        if (mRow.isDirty) await mRow.save();
      } else {
        await mSheet.addRow(materialData);
      }

      results.push(materialData);
    }

    return NextResponse.json({ data: results });
  } catch (error: any) {
    console.error('GET Materials Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

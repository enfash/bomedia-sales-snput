// Numbers and matching for the owner Inventory page. Pure: the page passes in the feed rows and shows what comes back.
export type FeedRow = Record<string, string>;
export type InventorySummary = { active: number; low: number; out: number; spent: number; remainingCost: number; earned: number; stillToEarn: number; total: number };

const num = (value: string | undefined) => parseFloat(String(value ?? '0').replace(/[^\d.-]/g, '')) || 0;

export function summarizeInventory(materials: FeedRow[]): InventorySummary {
  const sum: InventorySummary = { active: 0, low: 0, out: 0, spent: 0, remainingCost: 0, earned: 0, stillToEarn: 0, total: 0 };
  for (const row of materials) {
    if (row.Status === 'Active') sum.active += 1; else if (row.Status === 'Low Stock') sum.low += 1; else sum.out += 1;
    sum.spent += num(row['Total Spent']); sum.remainingCost += num(row['Total Remaining Asset Value']);
    sum.earned += num(row['Total Realised Revenue']); sum.stillToEarn += num(row['Total Remaining Revenue']);
  }
  sum.total = sum.earned + sum.stillToEarn;
  return sum;
}

/** Whole naira with thousands separators, as the summary tiles show them. */
export const nairaWhole = (value: number) => `₦${Math.round(value).toLocaleString('en-NG')}`;
/** Naira with kobo only when there are some, for a roll's own cost. */
export const nairaExact = (value: number) => `₦${value.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
export const feetText = (value: string | number) => `${Number(Number(value).toFixed(1)).toLocaleString('en-NG')} ft`;
export const toNumber = num;

/** Rolls of one size, newest first (the feed lists them oldest first). */
export const rollsOfMaterial = (rolls: FeedRow[], code: string) =>
  rolls.filter((roll) => roll['Material ID'] === code).sort((a, b) => (b['Date Added'] || '').localeCompare(a['Date Added'] || '') || (b['Roll ID'] || '').localeCompare(a['Roll ID'] || ''));

export function searchMaterials(materials: FeedRow[], query: string) {
  const text = query.trim().toLowerCase();
  return text ? materials.filter((row) => (row['Material Name'] || '').toLowerCase().includes(text) || (row['Material ID'] || '').toLowerCase().includes(text)) : materials;
}

/** The stock-list material (database id) for a feed row: same name ignoring case and the same width. */
export function matchStockMaterial<T extends { id: string; name: string; width_ft: string }>(stock: T[], row: FeedRow): T | undefined {
  const name = (row['Material Name'] || '').trim().toLowerCase(), width = Number(row['Width (ft)']);
  return stock.find((item) => item.name.trim().toLowerCase() === name && Number(item.width_ft) === width);
}
/** The stock-list roll for a feed row, matched by its stored roll ID. */
export function matchStockRoll<T extends { id: string; legacy_roll_id: string | null }>(stock: T[], row: FeedRow): T | undefined {
  const id = row['Roll ID'];
  return id ? stock.find((item) => item.legacy_roll_id === id) : undefined;
}

/** Share of a roll still unused, 0 to 100. */
export function rollRemainingPercent(row: FeedRow): number {
  const total = num(row['Total Length (ft)']);
  return total > 0 ? Math.max(0, Math.min(100, Math.round((num(row['Remaining Length (ft)']) / total) * 100))) : 0;
}

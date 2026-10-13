// Small helpers shared by the owner and cashier Price Estimator pages. Pure: no styling, no data access.
export type DimUnit = 'ft' | 'in';

/** The quick-size buttons above the size fields. One list for both pages. */
export const SIZE_SHORTCUTS = [
  { w: 3, h: 2 }, { w: 4, h: 3 }, { w: 6, h: 4 }, { w: 8, h: 4 }, { w: 10, h: 4 }, { w: 12, h: 4 },
] as const;
export const shortcutLabel = (shortcut: { w: number; h: number }) => `${shortcut.w}×${shortcut.h} ft`;
/** The width and height to type into the fields for a shortcut, in the unit the person is using. */
export const shortcutSize = (shortcut: { w: number; h: number }, unit: DimUnit) => ({
  width: String(unit === 'in' ? shortcut.w * 12 : shortcut.w),
  height: String(unit === 'in' ? shortcut.h * 12 : shortcut.h),
});

export const parseNum = (value: unknown) => parseFloat(String(value ?? '0').replace(/[^\d.-]/g, '')) || 0;
export const fmtMoney = (n: number) => `₦${n.toLocaleString(undefined, { minimumFractionDigits: 0 })}`;
export const toFt = (value: string, unit: DimUnit) => (unit === 'in' ? (parseFloat(value) || 0) / 12 : parseFloat(value) || 0);
export const newItemId = () => Math.random().toString(36).slice(2, 8);

/** Which tone a profit margin reads in: healthy, thin, or poor. */
export const marginTone = (percent: number): 'success' | 'warning' | 'error' => (percent >= 40 ? 'success' : percent >= 20 ? 'warning' : 'error');

/** Square feet left on a roll: its Stock column if the sheet has one, otherwise the length left times the roll width. */
export const rollAreaSqft = (roll: Record<string, unknown>) => {
  const stock = parseNum(roll['Stock']);
  return stock > 0 ? stock : parseNum(roll['Remaining Length (ft)']) * parseNum(roll['Width (ft)']);
};

export type RollGroup = { key: string; label: string; widthFt: number; areaSqft: number; capacitySqft: number };
/** One entry per material and roll width ("Flex 10ft", "SAV 4ft"), adding up the area left on every roll of it. */
export const groupRolls = (rolls: Record<string, unknown>[]): RollGroup[] => {
  const groups = new Map<string, RollGroup>();
  for (const roll of rolls) {
    const name = String(roll['Item Name'] ?? '').trim() || 'Other', widthFt = parseNum(roll['Width (ft)']);
    const key = `${name}|${widthFt}`, group = groups.get(key) ?? { key, label: `${name} ${widthFt}ft`, widthFt, areaSqft: 0, capacitySqft: 0 };
    group.areaSqft += rollAreaSqft(roll);
    group.capacitySqft += parseNum(roll['Total Length (ft)']) * widthFt;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
};

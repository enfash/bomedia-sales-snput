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

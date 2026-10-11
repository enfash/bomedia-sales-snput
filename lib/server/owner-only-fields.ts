// What a cashier must never receive. These are the owner's cost and earnings figures; the screens a cashier uses need only the
// selling price and the stock levels. Removing them on the server means they cannot be read from the network response either.
export const OWNER_ONLY_MATERIAL_FEED = ['Total Spent', 'Total Remaining Asset Value', 'Total Remaining Revenue', 'Total Realised Revenue'] as const;
export const OWNER_ONLY_ROLL_FEED = ['Cost', 'Cost per Sqft'] as const;
export const OWNER_ONLY_STOCK_RECORD = ['purchase_cost_kobo', 'cost_per_sqft_kobo_exact'] as const;

export function withoutFields<T extends Record<string, unknown>>(rows: T[], fields: readonly string[]): T[] {
  return rows.map((row) => {
    const copy: Record<string, unknown> = { ...row };
    for (const field of fields) delete copy[field];
    return copy as T;
  });
}

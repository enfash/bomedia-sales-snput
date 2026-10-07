// Once Postgres is in charge, these old entry pages only refuse to save, so
// the proxy sends every link to them to the page that replaced them.
const MOVED_PAGES: Record<string, string> = {
  '/bom03/new-entry': '/bom03/accounting',
  '/bom03/estimator': '/bom03/accounting',
  '/cashier/new-entry': '/cashier/accounting',
  '/cashier/estimator': '/cashier/accounting',
  '/cashier/waste': '/cashier/stock',
};

export function movedPage(pathname: string): string | null {
  if (process.env.POSTGRES_FINANCIAL_API_ENABLED !== 'true') return null;
  return MOVED_PAGES[pathname.replace(/\/+$/, '')] ?? null;
}

/** Menus show the new Stock entry page once the build has the flag. */
export const accountingLive = process.env.NEXT_PUBLIC_ACCOUNTING_LIVE === 'true';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const area = (pathname: string | null) => (pathname?.startsWith("/bom03") ? "/bom03" : "/cashier");

/** Accounting entry's Payment tab, with the customer only when it is a real ID. */
export function paymentHref(pathname: string | null, customerId?: string | null): string {
  const params = new URLSearchParams({ tab: "payments" });
  if (customerId && UUID.test(customerId)) params.set("customer", customerId);
  return `${area(pathname)}/accounting?${params}`;
}

/** The one customer ID behind these rows, or null when none or several share the name. */
export function customerIdOf(rows: Record<string, unknown>[]): string | null {
  const ids = new Set(rows.map(r => r._customerId).filter((id): id is string => typeof id === "string" && id !== ""));
  return ids.size === 1 ? [...ids][0] : null;
}

export type MovedTarget = "stock" | "expenses";
export function movedHref(pathname: string | null, target: MovedTarget): string {
  return target === "stock" ? `${area(pathname)}/stock` : `${area(pathname)}/accounting?tab=expenses`;
}

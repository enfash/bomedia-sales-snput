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

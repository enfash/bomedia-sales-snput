import { buildHistoryPlan } from './sales-history.mjs';
import { formatKobo } from './opening-balances.mjs';

// Builds the opening "who owes what" file (3-customers-who-owe.csv) from the Sheet's Sales export, so it can be rebuilt on cutover day instead of typed.
// It reads the Sales rows through the same history plan the customer history uses, so the opening debts and the history can never disagree:
// owed = amount - initial payment - additional payments 1 and 2 (minus any payment the owner marked as a mistake in ignore-payments.csv).
// A row is a debt when at least 1 naira is owed (smaller leftovers are rounding). The Sales row is the truth; the Payments tab is not used.

const HEADER = ['customer_name', 'phone', 'amount_owed_naira', 'sale_date', 'job_description', 'sales_id', 'sheet_row', 'sheet_status', 'amount', 'paid_so_far'];
const MINIMUM_KOBO = 100n;
const cell = value => { const text = String(value ?? ''); return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; };
const naira = kobo => { const n = BigInt(kobo), neg = n < 0n, abs = neg ? -n : n; return `${neg ? '-' : ''}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`; };

/** `files`: sales (Sales.csv text), names (2-name-decisions.csv text) and ignore (ignore-payments.csv text), as for buildHistoryPlan. */
export function buildOwingFile(files) {
  const plan = buildHistoryPlan(files);
  const debts = plan.rows.filter(row => BigInt(row.owedKobo) >= MINIMUM_KOBO).sort((a, b) => a.sheetRow - b.sheetRow);
  const lines = debts.map(row => [row.clientName, row.contact ?? '', naira(row.owedKobo), row.saleDate, row.jobDescription, row.salesId ?? '', row.sheetRow,
    row.paymentStatus ?? '', naira(row.amountKobo), naira(BigInt(row.amountKobo) - BigInt(row.owedKobo))]);
  const csv = HEADER.join(',') + '\n' + lines.map(line => line.map(cell).join(',')).join('\n') + (lines.length ? '\n' : '');
  const totalKobo = debts.reduce((sum, row) => sum + BigInt(row.owedKobo), 0n);
  const underOneNaira = plan.rows.filter(row => BigInt(row.owedKobo) > 0n && BigInt(row.owedKobo) < MINIMUM_KOBO).map(row => ({ sheetRow: row.sheetRow, owed: formatKobo(row.owedKobo) }));
  const overpaid = plan.rows.filter(row => BigInt(row.owedKobo) < 0n).length;
  return { csv, debts: debts.length, customers: new Set(debts.map(row => row.customerKey)).size, totalKobo: totalKobo.toString(), total: formatKobo(totalKobo),
    withoutSalesId: debts.filter(row => !row.salesId).length, withPhone: debts.filter(row => row.contact).length, underOneNaira, overpaid, ignored: plan.ignored.length, skippedNoName: plan.skipped.length };
}

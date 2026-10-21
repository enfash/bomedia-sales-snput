import { createHash } from 'node:crypto';
import { parseCsv, parseCsvDocument, nairaToKobo, formatKobo } from './opening-balances.mjs';
import { indexCustomers, nameKey, resolveNameDecisions, takeCutoverLock } from './cutover-shared.mjs';

// Customer history: every row of the Google Sheet's Sales tab, kept as READ-ONLY history on the customer ("Before the new app").
// It never touches the books, stock or what a customer owes today. Rules (owner): never merge customers beyond an exact name match that ignores
// spaces and capitals plus the owner's name decisions; the Sales row decides the amounts; the owner's "ignore this payment" decisions are applied and listed.

export class HistoryError extends Error {}

const PAYMENT_COLUMNS = { 1: 'ADDITIONAL PAYMENT 1', 2: 'ADDITIONAL PAYMENT 2' };
const SIZE_COLUMNS = ['3FT', '4FT', '5FT', '6FT', '7FT', '8FT', '10FT', 'custom'];
const clean = value => String(value ?? '').trim();
const money = (value, label, blankIsZero = false) => {
  const t = clean(value);
  if (!t && blankIsZero) return 0n;
  const neg = /^-/.test(t), kobo = BigInt(nairaToKobo(t.replace(/^-/, ''), label));
  return neg ? -kobo : kobo;
};
const requireHeaders = (document, required, file) => {
  const missing = required.filter(header => !document.headers.includes(header));
  if (missing.length) throw new HistoryError(`${file} is missing required headers: ${missing.join(', ')}.`);
};

/**
 * `files`: sales (Sales.csv text), names (2-name-decisions.csv: name_in_sheet,same_person_as), ignore (ignore-payments.csv: sheet_row,payment 1 or 2,expected_amount_naira,reason).
 * Sheet row N is line N of the file (the header is row 1), so a row can always be found in the Sheet again.
 */
export function buildHistoryPlan(files) {
  const names = resolveNameDecisions(parseCsv(files.names ?? ''));
  const ignored = new Map();
  if (clean(files.ignore)) requireHeaders(parseCsvDocument(files.ignore), ['sheet_row', 'payment', 'expected_amount_naira', 'reason'], 'ignore-payments.csv');
  for (const r of parseCsv(files.ignore ?? '')) {
    if (!/^\d+$/.test(r.sheet_row ?? '') || !Number.isSafeInteger(Number(r.sheet_row)) || Number(r.sheet_row) < 2) throw new HistoryError('ignore-payments.csv needs a valid sheet_row of at least 2.');
    if (!PAYMENT_COLUMNS[r.payment]) throw new HistoryError(`ignore-payments.csv row ${r.sheet_row}: payment must be 1 or 2.`);
    const key = `${Number(r.sheet_row)}:${r.payment}`;
    if (ignored.has(key)) throw new HistoryError(`ignore-payments.csv repeats Sheet row ${r.sheet_row} payment ${r.payment}.`);
    ignored.set(key, { expected: money(r.expected_amount_naira, 'expected_amount_naira').toString(), reason: clean(r.reason) });
  }
  const sheet = parseCsvDocument(files.sales);
  requireHeaders(sheet, ['DATE', 'CLIENT NAME', 'Sales ID', 'AMOUNT (₦)', 'INITIAL PAYMENT (₦)', ...Object.values(PAYMENT_COLUMNS)], 'Sales.csv');
  const customers = new Map(); // key -> { name, contact, rows: [] }
  const rows = [], skipped = [], ignoredUsed = [];
  sheet.records.forEach(({ values: r, line: sheetRow }) => {
    const rawName = clean(r['CLIENT NAME']);
    if (!rawName) { skipped.push({ sheetRow, reason: 'no customer name', date: r.DATE, amount: r['AMOUNT (₦)'] }); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.DATE)) throw new HistoryError(`Sheet row ${sheetRow}: date "${r.DATE}" is not YYYY-MM-DD.`);
    const name = names.resolve(rawName);
    const key = nameKey(name);
    const amount = money(r['AMOUNT (₦)'], `Sheet row ${sheetRow} amount`);
    let paid = money(r['INITIAL PAYMENT (₦)'], `Sheet row ${sheetRow} initial payment`, true);
    for (const n of ['1', '2']) {
      const value = money(r[PAYMENT_COLUMNS[n]], `Sheet row ${sheetRow} payment ${n}`, true);
      const ignore = ignored.get(`${sheetRow}:${n}`);
      if (ignore) {
        if (value.toString() !== ignore.expected) throw new HistoryError(`Sheet row ${sheetRow} payment ${n} differs from expected_amount_naira. Nothing was imported.`);
        ignoredUsed.push({ sheetRow, payment: n, amount: value.toString(), reason: ignore.reason }); continue;
      }
      paid += value;
    }
    const sizes = SIZE_COLUMNS.filter(c => clean(r[c])).map(c => `${c}: ${clean(r[c])}`).join(', ');
    const material = clean(r.MATERIAL), description = clean(r['JOB DESCRIPTION']) || material || 'Sale from the Google Sheet';
    const row = { sheetRow, customerKey: key, saleDate: r.DATE, salesId: clean(r['Sales ID']) || null, transactionId: clean(r['TRANSACTION ID']) || null,
      description, material: material || null, quantity: clean(r.QTY) || null, amountKobo: amount.toString(), paidKobo: paid.toString(), owedKobo: (amount - paid).toString(),
      paymentStatus: clean(r['PAYMENT STATUS']) || null, jobStatus: clean(r['JOB STATUS']) || null, loggedBy: clean(r['Logged By']) || null, contact: clean(r.CONTACT) || null,
      note: sizes || null, source: Object.fromEntries(Object.entries(r).filter(([, v]) => v !== '')) };
    if (!customers.has(key)) customers.set(key, { key, name, contact: row.contact, rows: 0 });
    const customer = customers.get(key);
    if (!customer.contact && row.contact) customer.contact = row.contact;
    customer.rows += 1;
    rows.push(row);
  });
  for (const k of ignored.keys()) if (!ignoredUsed.some(u => `${u.sheetRow}:${u.payment}` === k)) throw new HistoryError(`ignore-payments.csv names Sheet row ${k.split(':')[0]}, which is not a row with a customer name. Nothing was imported.`);
  const batch = createHash('sha256').update(JSON.stringify([files.sales, names.decisions, [...ignored]])).digest('hex');
  const sum = field => rows.reduce((t, r) => t + BigInt(r[field]), 0n);
  const orders = new Set(rows.map(r => `${r.customerKey}|${r.salesId ?? `row-${r.sheetRow}`}`));
  return { batch, rows, customers: [...customers.values()], skipped, ignored: ignoredUsed, nameDecisions: names.decisions, nameDecisionsSha256: names.fingerprint,
    totals: { rows: rows.length, customers: customers.size, orders: orders.size, totalKobo: sum('amountKobo').toString(), paidKobo: sum('paidKobo').toString() } };
}

export function summarizeHistory(plan) {
  return { rows: plan.totals.rows, customers: plan.totals.customers, orders: plan.totals.orders, total: formatKobo(plan.totals.totalKobo), paid: formatKobo(plan.totals.paidKobo),
    skippedRows: plan.skipped, ignoredPayments: plan.ignored.map(i => ({ ...i, amount: formatKobo(i.amount) })), batch: plan.batch.slice(0, 16) };
}

/** Existing customers (from the opening balances or the app) are matched by name ignoring spaces and capitals; the rest are created. Safe to repeat. */
export async function importHistory(db, plan) {
  return db.transaction(async tx => {
    await takeCutoverLock(tx, HistoryError);
    const state = (await tx.query('select state from bomedia.bookkeeping_settings where singleton for update')).rows[0]?.state;
    if (state !== 'setup') throw new HistoryError('History requires setup books; they are missing or already active. Nothing was imported.');
    if (!(await tx.query("select 1 from bomedia.journal_entries where kind='opening' and status='posted' limit 1")).rows.length) {
      throw new HistoryError('Post the opening entries before loading history. Nothing was imported.');
    }
    // The same owner decisions must have been used when the opening posted, or one person could end up on two profiles.
    const evidence = (await tx.query("select evidence_reference from bomedia.journal_entries where kind='opening' and status='posted' and evidence_reference like '%name decisions %' limit 1")).rows[0]?.evidence_reference ?? '';
    if (!evidence.includes(`name decisions ${plan.nameDecisionsSha256}`)) {
      throw new HistoryError('The name decisions file differs from the one the opening balances were posted with. Use the same 2-name-decisions.csv. Nothing was imported.');
    }
    const existing = (await tx.query('select batch, count(*)::integer as n from bomedia.legacy_sales group by batch')).rows;
    if (existing.some(e => e.batch !== plan.batch)) throw new HistoryError('History from a different file is already loaded. Nothing was imported.');
    if (existing.length) {
      if (existing[0].n !== plan.totals.rows) throw new HistoryError('Part of this history is already loaded but the count differs. Nothing was imported.');
      await verifyHistory(tx, plan);
      return { replay: true, ...summarizeHistory(plan) };
    }
    const byKey = indexCustomers((await tx.query('select id::text as id, display_name from bomedia.customers')).rows, plan.nameDecisions);
    let created = 0;
    for (const c of plan.customers) {
      if (byKey.has(c.key)) continue;
      byKey.set(c.key, (await tx.query('insert into bomedia.customers(display_name,contact,notes) values($1,$2,$3) returning id::text as id', [c.name, c.contact || null, 'Created from the Google Sheet sales history'])).rows[0].id);
      created++;
    }
    // Sent in batches of 400 rows per statement: one statement per row takes many minutes over a remote connection.
    for (let i = 0; i < plan.rows.length; i += 400) {
      const batch = plan.rows.slice(i, i + 400).map(r => ({ customer_id: byKey.get(r.customerKey), sheet_row: r.sheetRow, sale_date: r.saleDate, sales_id: r.salesId, transaction_id: r.transactionId,
        description: r.description, material: r.material, quantity: r.quantity, amount_kobo: r.amountKobo, paid_kobo: r.paidKobo, owed_kobo: r.owedKobo, payment_status: r.paymentStatus,
        job_status: r.jobStatus, logged_by: r.loggedBy, contact: r.contact, note: r.note, source: r.source }));
      await tx.query(`insert into bomedia.legacy_sales(customer_id,sheet_row,sale_date,sales_id,transaction_id,description,material,quantity,amount_kobo,paid_kobo,owed_kobo,
        payment_status,job_status,logged_by,contact,note,batch,source)
        select x.customer_id,x.sheet_row,x.sale_date,x.sales_id,x.transaction_id,x.description,x.material,x.quantity,x.amount_kobo,x.paid_kobo,x.owed_kobo,x.payment_status,
          x.job_status,x.logged_by,x.contact,x.note,$2,x.source
        from jsonb_to_recordset($1::text::jsonb) as x(customer_id uuid,sheet_row integer,sale_date date,sales_id text,transaction_id text,description text,material text,quantity text,
          amount_kobo bigint,paid_kobo bigint,owed_kobo bigint,payment_status text,job_status text,logged_by text,contact text,note text,source jsonb)`, [JSON.stringify(batch), plan.batch]);
    }
    return { replay: false, customersCreated: created, ...summarizeHistory(plan) };
  });
}

/** Reads the database back and compares it with the plan. Throws on any difference; changes nothing. */
export async function verifyHistory(db, plan) {
  const got = (await db.query(`select count(*)::integer as rows, count(distinct customer_id)::integer as customers, coalesce(sum(amount_kobo),0)::text as total, coalesce(sum(paid_kobo),0)::text as paid,
    count(*) filter (where batch <> $1)::integer as other_batch from bomedia.legacy_sales`, [plan.batch])).rows[0];
  const problems = [];
  if (got.rows !== plan.totals.rows) problems.push(`rows: file ${plan.totals.rows}, database ${got.rows}`);
  if (got.customers !== plan.totals.customers) problems.push(`customers: file ${plan.totals.customers}, database ${got.customers}`);
  if (got.total !== plan.totals.totalKobo) problems.push(`total: file ${formatKobo(plan.totals.totalKobo)}, database ${formatKobo(got.total)}`);
  if (got.paid !== plan.totals.paidKobo) problems.push(`paid: file ${formatKobo(plan.totals.paidKobo)}, database ${formatKobo(got.paid)}`);
  if (got.other_batch) problems.push(`${got.other_batch} rows came from a different file`);
  const byKey = indexCustomers((await db.query('select id::text as id, display_name from bomedia.customers')).rows, plan.nameDecisions);
  const actual = (await db.query(`select customer_id::text, sheet_row, sale_date::text, sales_id, amount_kobo::text, paid_kobo::text, owed_kobo::text, batch
    from bomedia.legacy_sales order by sheet_row`)).rows;
  const byRow = new Map(actual.map(row => [row.sheet_row, row]));
  for (const row of plan.rows) {
    const have = byRow.get(row.sheetRow);
    if (!have || have.customer_id !== byKey.get(row.customerKey) || have.sale_date !== row.saleDate || have.sales_id !== row.salesId ||
      have.amount_kobo !== row.amountKobo || have.paid_kobo !== row.paidKobo || have.owed_kobo !== row.owedKobo || have.batch !== plan.batch) {
      problems.push(`Sheet row ${row.sheetRow}: customer, sale, amount, paid, owed or fingerprint differs`);
    }
  }
  if (problems.length) throw new HistoryError(`History does not match the file: ${problems.join('; ')}.`);
  return { verified: true, ...summarizeHistory(plan) };
}

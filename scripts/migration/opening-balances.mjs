import { createHash } from 'node:crypto';

// Opening balances for the cutover: customer debts and one loan, taken from the owner-approved CSV files.
// Pure planning first (no database), then three database steps: post, verify, activate.
// Rules (owner, 14 Oct 2026): the Sales row decides what a customer owes; never merge customers by name beyond an exact match
// that ignores spaces and capitals; never treat an unknown balance as zero; no invented payments; no opening cash or bank counts.

export class OpeningError extends Error {}

const LOCK = "select pg_advisory_xact_lock(hashtextextended('bomedia:opening-balances',0))";

/** Minimal CSV reader: quoted fields, doubled quotes, CRLF and a leading byte-order mark. Returns rows as objects keyed by the header. */
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  const input = String(text).replace(/^﻿/, '');
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && input[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(cell => cell.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (quoted) throw new OpeningError('A CSV file has an unclosed quote.');
  row.push(field);
  if (row.some(cell => cell.trim() !== '')) rows.push(row);
  if (!rows.length) return [];
  const header = rows[0].map(h => h.trim());
  return rows.slice(1).map(cells => Object.fromEntries(header.map((h, i) => [h, (cells[i] ?? '').trim()])));
}

/** Exact money in naira (up to two decimals, commas and a naira sign allowed) to a kobo string. Anything else is refused, never guessed. */
export function nairaToKobo(value, label = 'amount') {
  const text = String(value ?? '').replace(/[₦\s,]/g, '');
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new OpeningError(`${label} "${value}" is not an exact naira amount.`);
  return (BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0') || '0')).toString();
}

const isoDate = (value, label) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
    throw new OpeningError(`${label} "${value}" must be a real date written YYYY-MM-DD.`);
  }
  return value;
};
const nextDay = date => new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
const nameKey = name => name.trim().replace(/\s+/g, ' ').toLowerCase();
const phoneDigits = phone => String(phone ?? '').replace(/\D/g, '');
const sha = text => createHash('sha256').update(text).digest('hex');

/**
 * Turns the approved files into a plan. `files` holds the text of: startDate (1-start-date.csv), owing (3-customers-who-owe.csv),
 * credits (4-customers-paid-in-advance.csv), loans (6-loans-and-owner-money.csv) and, optionally, names (2-name-decisions.csv:
 * name_in_sheet,same_person_as, the owner's decisions that two spellings are one person). Throws on anything unclear instead of guessing.
 */
export function buildOpeningPlan(files) {
  const problems = [];
  const start = parseCsv(files.startDate).find(r => r.item === 'opening_date');
  if (!start?.value) throw new OpeningError('1-start-date.csv needs opening_date (the last day before the new books start).');
  const openingDate = isoDate(start.value, 'opening_date');
  const startsOn = nextDay(openingDate);

  if (parseCsv(files.credits).some(r => Object.values(r).some(v => v))) {
    throw new OpeningError('4-customers-paid-in-advance.csv has rows, but the app cannot use customer credits yet. Ask Claude before going further; nothing was posted.');
  }

  // The owner's decisions that two spellings are one person. Only these merge names that differ beyond spaces and capitals.
  const aliases = new Map();
  for (const [index, row] of parseCsv(files.names ?? '').entries()) {
    const from = (row.name_in_sheet ?? '').trim().replace(/\s+/g, ' '), to = (row.same_person_as ?? '').trim().replace(/\s+/g, ' ');
    if (!from && !to) continue;
    if (!from || !to) { problems.push(`2-name-decisions.csv line ${index + 2}: both name_in_sheet and same_person_as are needed.`); continue; }
    if (nameKey(from) === nameKey(to)) continue; // already the same name once spaces and capitals are ignored
    if (aliases.has(nameKey(from)) && aliases.get(nameKey(from)).name !== to) { problems.push(`2-name-decisions.csv: "${from}" is mapped to two different names.`); continue; }
    aliases.set(nameKey(from), { name: to, used: 0 });
  }
  for (const [key, alias] of aliases) if (aliases.has(nameKey(alias.name))) problems.push(`2-name-decisions.csv: "${alias.name}" is itself renamed (from "${key}"). Point both spellings at the final name.`);
  const customers = new Map();
  const identical = new Map();
  const owing = parseCsv(files.owing).filter(r => Object.values(r).some(v => v));
  owing.forEach((row, index) => {
    const line = index + 2;
    let name = (row.customer_name ?? '').trim().replace(/\s+/g, ' ');
    if (!name) { problems.push(`3-customers-who-owe.csv line ${line}: customer_name is empty.`); return; }
    const alias = aliases.get(nameKey(name));
    if (alias) { name = alias.name; alias.used++; }
    let owed;
    try { owed = nairaToKobo(row.amount_owed_naira, 'amount_owed_naira'); } catch (error) { problems.push(`line ${line} (${name}): ${error.message} Leave nothing blank: an unknown balance must be resolved first.`); return; }
    if (BigInt(owed) <= 0n) { problems.push(`line ${line} (${name}): the amount owed must be more than zero.`); return; }
    let saleDate;
    try { saleDate = isoDate(row.sale_date, 'sale_date'); } catch (error) { problems.push(`line ${line} (${name}): ${error.message}`); return; }
    if (saleDate > openingDate) { problems.push(`line ${line} (${name}): sale_date ${saleDate} is after the opening date ${openingDate}.`); return; }
    const salesId = (row.sales_id || row.sheet_row_or_receipt || (row.sheet_row ? `Sheet row ${row.sheet_row}` : '')).trim();
    if (!salesId) { problems.push(`line ${line} (${name}): needs a sales_id or sheet_row_or_receipt so the debt can be traced to the Sheet.`); return; }
    const key = nameKey(name);
    const phone = phoneDigits(row.phone);
    const customer = customers.get(key) ?? { key, name, phone: '', jobs: [] };
    if (phone) {
      if (customer.phone && customer.phone !== phone) { problems.push(`${name}: two different phone numbers (${customer.phone} and ${phone}). The owner must say whether these are different people and rename one.`); return; }
      customer.phone = phone;
    }
    // One Sales ID can cover several items (a multi-item order), so a repeated ID is normal. Rows identical in every figure are only reported.
    const same = `${key}|${salesId}|${saleDate}|${owed}|${(row.job_description ?? '').trim()}`;
    identical.set(same, (identical.get(same) ?? 0) + 1);
    customer.jobs.push({ salesId, saleDate, description: (row.job_description || 'Sheet sale').trim(), owedKobo: owed, note: (row.note ?? '').trim() });
    customers.set(key, customer);
  });

  const loans = [];
  for (const [index, row] of parseCsv(files.loans).entries()) {
    if (!(row.who ?? '').trim() && !(row.amount_naira ?? '').trim()) continue; // the template's explanation row
    const line = index + 2;
    const who = (row.who ?? '').trim();
    if ((row.type ?? '').trim().toLowerCase() !== 'loan you owe') { problems.push(`6-loans-and-owner-money.csv line ${line} (${who}): only "loan you owe" is supported. Money owed to you, or owner capital, must be handled separately; ask Claude.`); continue; }
    try { loans.push({ who, amountKobo: nairaToKobo(row.amount_naira, 'amount_naira'), date: isoDate(row.date, 'date'), evidence: (row.evidence ?? '').trim() }); }
    catch (error) { problems.push(`6-loans-and-owner-money.csv line ${line} (${who}): ${error.message}`); }
  }
  for (const loan of loans) if (BigInt(loan.amountKobo) <= 0n) problems.push(`Loan ${loan.who}: the amount must be more than zero.`);
  if (problems.length) {
    const shown = problems.slice(0, 25);
    throw new OpeningError(`The approved files cannot be used yet (${problems.length} problem${problems.length === 1 ? '' : 's'}):\n- ${shown.join('\n- ')}${problems.length > shown.length ? `\n- ...and ${problems.length - shown.length} more` : ''}`);
  }

  const list = [...customers.values()].sort((a, b) => a.key.localeCompare(b.key));
  for (const customer of list) customer.jobs.sort((a, b) => a.saleDate.localeCompare(b.saleDate) || a.salesId.localeCompare(b.salesId));
  const debtsKobo = list.reduce((sum, c) => sum + c.jobs.reduce((s, j) => s + BigInt(j.owedKobo), 0n), 0n);
  const loansKobo = loans.reduce((sum, l) => sum + BigInt(l.amountKobo), 0n);
  const jobCount = list.reduce((n, c) => n + c.jobs.length, 0);
  if (!jobCount && !loans.length) throw new OpeningError('There is nothing to post: no owing customers and no loans.');
  if (jobCount > 998) throw new OpeningError(`${jobCount} debts do not fit in one opening entry (limit 998). Ask Claude to split it.`);
  const repeatedRows = [...identical.values()].filter(n => n > 1).reduce((sum, n) => sum + n - 1, 0);
  const nameDecisions = [...aliases.entries()].map(([from, a]) => ({ from, to: a.name, rowsChanged: a.used })).sort((a, b) => a.from.localeCompare(b.from));
  const digest = sha(JSON.stringify({ openingDate, list, loans }));
  return {
    openingDate, startsOn, customers: list, loans, digest, repeatedRows, nameDecisions,
    totals: { customers: list.length, orders: list.reduce((n, c) => n + new Set(c.jobs.map(j => j.salesId)).size, 0), jobs: jobCount, debtsKobo: debtsKobo.toString(), loansKobo: loansKobo.toString(),
      // What is left for the owner's capital account so both entries balance: debts less the loan owed.
      capitalKobo: (debtsKobo - loansKobo).toString() },
    inputSha256: sha(`${files.startDate}\n${files.owing}\n${files.credits}\n${files.loans}\n${files.names ?? ''}`),
  };
}

export const formatKobo = value => { const n = BigInt(value), neg = n < 0n, abs = neg ? -n : n; return `${neg ? '-' : ''}₦${(abs / 100n).toLocaleString('en-NG')}.${(abs % 100n).toString().padStart(2, '0')}`; };

/** What the command will do, in plain numbers, without touching a database. */
export function summarizeOpening(plan) {
  return { openingDate: plan.openingDate, booksStartOn: plan.startsOn, customers: plan.totals.customers, orders: plan.totals.orders, debts: plan.totals.jobs,
    rowsIdenticalToAnotherRow: plan.repeatedRows,
    nameDecisionsApplied: plan.nameDecisions.filter(d => d.rowsChanged > 0).map(d => `${d.from} -> ${d.to} (${d.rowsChanged} rows)`),
    nameDecisionsNotUsed: plan.nameDecisions.filter(d => d.rowsChanged === 0).map(d => d.from),
    totalOwed: formatKobo(plan.totals.debtsKobo), loansOwed: formatKobo(plan.totals.loansKobo), ownerCapitalEntry: formatKobo(plan.totals.capitalKobo),
    planSha256: plan.digest, inputFilesSha256: plan.inputSha256 };
}

const evidenceFor = plan => `Owner-approved opening files, sha256 ${plan.inputSha256.slice(0, 16)}, plan ${plan.digest.slice(0, 16)}`;
const debtsKey = plan => `opening-debts-${plan.digest}`;
const loansKey = plan => `opening-loans-${plan.digest}`;

/**
 * Creates the customers, one opening job per debt (for the amount still owed), and the opening entries. Does NOT start the books:
 * `activateOpening` does that after `verifyOpening` passes. Safe to repeat with the same files; refuses if anything else was posted.
 */
export async function postOpening(db, plan, { actorId }) {
  if (!/^[0-9a-f-]{36}$/.test(String(actorId))) throw new OpeningError('The owner staff id is required.');
  return db.transaction(async tx => {
    await tx.query(LOCK);
    const staff = (await tx.query('select id from bomedia.staff where id=$1 and disabled_at is null', [actorId])).rows;
    if (!staff.length) throw new OpeningError('The owner staff account was not found or is disabled.');
    const settings = (await tx.query('select starts_on::text as starts_on, state from bomedia.bookkeeping_settings where singleton')).rows;
    if (settings.length && (settings[0].state !== 'setup' || settings[0].starts_on !== plan.startsOn)) {
      throw new OpeningError('The books are already active or start on a different date. Nothing was posted.');
    }
    const replay = (await tx.query("select 1 from bomedia.idempotency_requests where operation='journal' and request_key = any($1::text[])", [[debtsKey(plan), loansKey(plan)]])).rows;
    if (replay.length) return { replay: true, ...summarizeOpening(plan) };
    if ((await tx.query('select count(*)::integer as n from bomedia.journal_entries')).rows[0].n) {
      throw new OpeningError('Other journal entries already exist, so opening balances cannot be posted. Nothing was posted.');
    }
    if (!settings.length) await tx.query("insert into bomedia.bookkeeping_settings(starts_on,state) values($1,'setup')", [plan.startsOn]);

    const lines = [];
    for (const customer of plan.customers) {
      const customerId = (await tx.query('insert into bomedia.customers(display_name,contact,notes) values($1,$2,$3) returning id::text as id',
        [customer.name, customer.phone || null, 'Opening balance from the Google Sheet'])).rows[0].id;
      const orders = new Map();
      for (const job of customer.jobs) {
        if (!orders.has(job.salesId)) {
          orders.set(job.salesId, (await tx.query('insert into bomedia.orders(customer_id,legacy_sales_id,created_by) values($1,$2,$3) returning id::text as id',
            [customerId, job.salesId, actorId])).rows[0].id);
        }
        const orderId = orders.get(job.salesId);
        const description = `Opening balance from Sheet: ${job.description} (${job.salesId}, sold ${job.saleDate})`;
        const jobId = (await tx.query(`insert into bomedia.jobs(order_id,customer_id,description,client_name_snapshot,contact_snapshot,quantity,unit_price_kobo,amount_kobo,
          job_status,business_date,logged_by_snapshot) values($1,$2,$3,$4,$5,1,$6,$6,'Delivered',$7,'Sheet opening balance') returning id::text as id`,
          [orderId, customerId, description, customer.name, customer.phone || null, job.owedKobo, job.saleDate])).rows[0].id;
        lines.push({ account_code: '1100', debit_kobo: job.owedKobo, customer_id: customerId, job_id: jobId, memo: `${job.salesId}` });
      }
    }
    const evidence = evidenceFor(plan);
    if (lines.length) {
      const debts = BigInt(plan.totals.debtsKobo);
      await tx.query("select bomedia.post_journal($1,$2::jsonb)", [debtsKey(plan), JSON.stringify({ actor_id: actorId, business_date: plan.openingDate,
        kind: 'opening', memo: 'Opening customer balances from the Google Sheet', opening_confirmed: true, evidence_reference: evidence,
        lines: [...lines, { account_code: '3000', credit_kobo: debts.toString(), memo: 'Owner capital: opening position' }] })]);
    }
    if (plan.loans.length) {
      const loans = BigInt(plan.totals.loansKobo);
      await tx.query("select bomedia.post_journal($1,$2::jsonb)", [loansKey(plan), JSON.stringify({ actor_id: actorId, business_date: plan.openingDate,
        kind: 'opening', memo: `Loan owed: ${plan.loans.map(l => l.who).join(', ')}`, opening_confirmed: true, evidence_reference: `${evidence}; ${plan.loans.map(l => l.evidence).filter(Boolean).join('; ')}`,
        lines: [{ account_code: '3000', debit_kobo: loans.toString(), memo: 'Owner capital: loan owed at opening' },
          { account_code: '2200', credit_kobo: loans.toString(), memo: plan.loans.map(l => l.who).join(', ') }] })]);
    }
    // The app takes the cost of material out of the Inventory account on every sale and refuses when that account holds too little, so the counted stock must be
    // valued here (each roll's remaining length x its cost per foot, by the same function the app uses later). Load prices and the count first (stock-opening.mjs).
    const stock = (await tx.query(`select coalesce(sum(bomedia.roll_value(r, r.remaining_length_ft)),0)::text as value, count(*)::integer as rolls,
      encode(sha256(convert_to(coalesce(string_agg(r.id::text||':'||r.remaining_length_ft::text||':'||r.purchase_cost_kobo::text, ',' order by r.id),''),'UTF8')),'hex') as fingerprint
      from bomedia.inventory_rolls r where r.remaining_length_ft>0`)).rows[0];
    if (BigInt(stock.value) > 0n) {
      await tx.query("select bomedia.post_journal($1,$2::jsonb)", [`opening-stock-${plan.digest}-${stock.fingerprint.slice(0, 16)}`, JSON.stringify({ actor_id: actorId, business_date: plan.openingDate,
        kind: 'opening', memo: `Opening stock value: ${stock.rolls} rolls with counted length`, opening_confirmed: true, evidence_reference: `${evidence}; stock fingerprint ${stock.fingerprint.slice(0, 16)}`,
        lines: [{ account_code: '1200', debit_kobo: stock.value, memo: 'Counted stock at cost' }, { account_code: '3000', credit_kobo: stock.value, memo: 'Owner capital: opening stock' }] })]);
    }
    return { replay: false, ...summarizeOpening(plan), stockValue: formatKobo(stock.value), stockRolls: stock.rolls };
  });
}

/** Reads the database back and compares it with the plan. Throws on any difference; changes nothing. */
export async function verifyOpening(db, plan) {
  const checks = [];
  const check = (name, ok, detail) => { checks.push({ name, ok, detail }); };
  const q = async (text, params = []) => (await db.query(text, params)).rows;
  const settings = (await q('select starts_on::text as starts_on, state from bomedia.bookkeeping_settings where singleton'))[0];
  check('books start on the planned date', settings?.starts_on === plan.startsOn, settings?.starts_on ?? 'no settings row');
  const customers = (await q("select count(*)::integer as n from bomedia.customers where notes='Opening balance from the Google Sheet'"))[0].n;
  check('customers created', customers === plan.totals.customers, `${customers} of ${plan.totals.customers}`);
  const jobs = (await q("select count(*)::integer as n, coalesce(sum(amount_kobo),0)::text as total from bomedia.jobs where logged_by_snapshot='Sheet opening balance'"))[0];
  check('opening jobs created', jobs.n === plan.totals.jobs && jobs.total === plan.totals.debtsKobo, `${jobs.n} jobs, ${formatKobo(jobs.total)}`);
  const net = async code => (await q(`select coalesce(sum(l.debit_kobo-l.credit_kobo),0)::text as n from bomedia.journal_lines l join bomedia.journal_entries e on e.id=l.entry_id
    where e.status='posted' and l.account_code=$1`, [code]))[0].n;
  check('customer receivables equal the approved total owed', (await net('1100')) === plan.totals.debtsKobo, formatKobo(await net('1100')));
  check('loan payable equals the approved loan', BigInt(await net('2200')) === -BigInt(plan.totals.loansKobo), formatKobo(await net('2200')));
  const stock = (await q('select coalesce(sum(bomedia.roll_value(r, r.remaining_length_ft)),0)::text as value from bomedia.inventory_rolls r where r.remaining_length_ft>0'))[0].value;
  check('inventory equals the counted stock valued at cost', (await net('1200')) === stock, `${formatKobo(await net('1200'))} in the books, ${formatKobo(stock)} in stock`);
  check('owner capital balances the entries', BigInt(await net('3000')) === -(BigInt(plan.totals.capitalKobo) + BigInt(stock)), formatKobo(await net('3000')));
  const unbalanced = (await q(`select count(*)::integer as n from (select entry_id from bomedia.journal_lines group by entry_id having sum(debit_kobo)<>sum(credit_kobo)) x`))[0].n;
  check('every entry balances', unbalanced === 0, `${unbalanced} unbalanced`);
  const unposted = (await q("select count(*)::integer as n from bomedia.journal_entries where status<>'posted' or not opening_confirmed or coalesce(btrim(evidence_reference),'')=''"))[0].n;
  check('every entry is posted, confirmed and has evidence', unposted === 0, `${unposted} not ready`);
  const perJob = (await q(`select count(*)::integer as n from bomedia.jobs j where j.logged_by_snapshot='Sheet opening balance'
    and (select coalesce(sum(l.debit_kobo-l.credit_kobo),0) from bomedia.journal_lines l join bomedia.journal_entries e on e.id=l.entry_id where e.status='posted' and l.account_code='1100' and l.job_id=j.id)<>j.amount_kobo`))[0].n;
  check('each debt matches its own opening job', perJob === 0, `${perJob} differ`);
  return { ok: checks.every(c => c.ok), state: settings?.state ?? null, checks };
}

/** Starts the books, but only when every check above passes. One way: active books cannot return to setup. */
export async function activateOpening(db, plan) {
  return db.transaction(async tx => {
    await tx.query(LOCK);
    const report = await verifyOpening(tx, plan);
    if (!report.ok) throw new OpeningError(`Not activated. Failed checks: ${report.checks.filter(c => !c.ok).map(c => c.name).join('; ')}`);
    await tx.query("update bomedia.bookkeeping_settings set state='active' where singleton and state='setup'");
    return { activated: true, booksStartOn: plan.startsOn };
  });
}

/**
 * The owner needs a staff record before anything is posted (journals and orders are created by a staff member, and SUPABASE_ADMIN_STAFF_ID points at it).
 * The 4 October import loaded only the cashiers. Creates "Owner" with no PIN if it does not exist; safe to repeat. Returns the id to use as SUPABASE_ADMIN_STAFF_ID.
 */
export async function createOwner(db) {
  return db.transaction(async tx => {
    await tx.query(LOCK);
    const existing = (await tx.query("select id::text as id from bomedia.staff where login_name='owner'")).rows[0];
    if (existing) return { created: false, ownerStaffId: existing.id };
    const row = (await tx.query("insert into bomedia.staff(display_name,login_name) values('Owner','owner') returning id::text as id")).rows[0];
    return { created: true, ownerStaffId: row.id };
  });
}

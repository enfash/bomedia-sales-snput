import { cellValue, moneyToKobo, sha256, snapshotDigest, validateSnapshot } from './snapshot.mjs';

// Verified against app/api routes. Unknown tabs remain preserved, never deleted.
export const APP_TABS = Object.freeze({
  Sales: ['orders', 'jobs', 'customers'], Payments: ['payments', 'payment_allocations'],
  Expenses: ['expenses', 'receipt_references'], Inventory: ['inventory_rolls', 'inventory_movements'],
  Materials: ['materials'], Cashiers: ['staff'], Estimates: ['estimates'],
});
const clean = value => String(value ?? '').trim();
const key = value => clean(value).toLowerCase().replace(/\s+/g, ' ');
const empty = value => value === null || value === undefined || clean(value) === '';
const sum = values => values.reduce((total, value) => total + BigInt(value), 0n).toString();
const referencedTabs = formula => [...formula.matchAll(/(?:'((?:[^']|'')+)'|([A-Za-z_][A-Za-z_0-9]*))!/g)]
  .map(m => (m[1] ?? m[2]).replaceAll("''", "'"));

// IDs are scoped to a snapshot and source coordinate, never a repeated legacy ID.
export function sourceCandidateId(digest, sheetId, rowNumber) {
  const hex = sha256(`${digest}:${sheetId}:${rowNumber}`).slice(0, 32).split('');
  hex[12] = '8'; hex[16] = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
  const s = hex.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

export function businessDate(value, timeZone) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 2 || value > 2958465) throw new Error('Invalid Sheets date');
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000).toISOString().slice(0, 10);
  }
  const text = clean(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const date = new Date(`${text}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== text) throw new Error('Invalid date');
    return text;
  }
  if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(text) && timeZone) {
    businessDate(text.slice(0, 10), timeZone);
    if (!Number.isFinite(Date.parse(text))) throw new Error('Invalid timestamp');
    const parts = new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date(text));
    const part = type => parts.find(p => p.type === type).value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  }
  throw new Error('Missing or ambiguous date');
}

export function buildMigrationPlan(snapshot) {
  validateSnapshot(snapshot);
  const digest = snapshotDigest(snapshot), rows = [], scope = [], dependencyReviews = [];
  const seen = new Set();
  for (const sheet of snapshot.sheets) {
    if (seen.has(sheet.title)) throw new Error('Duplicate tab names require scope review');
    seen.add(sheet.title);
    const active = Object.hasOwn(APP_TABS, sheet.title);
    const references = [...new Set(sheet.rows.flatMap(row => row.cells.flatMap(cell => referencedTabs(cell?.entered?.formulaValue ?? ''))))];
    scope.push({ title: sheet.title, sheetId: sheet.sheetId, rows: sheet.rows.length,
      treatment: active ? 'map_to_business_tables' : 'manual_workflow_review', targets: APP_TABS[sheet.title] ?? [],
      references, appDataDependencies: active ? [] : references.filter(title => Object.hasOwn(APP_TABS, title)) });
    if (!active) continue;
    const headers = sheet.rows.find(r => r.rowNumber === 1)?.cells.map(c => key(cellValue(c))) ?? [];
    const duplicateHeaders = new Set(headers.filter(Boolean)).size !== headers.filter(Boolean).length;
    for (const row of sheet.rows.filter(r => r.rowNumber !== 1)) {
      const candidate = { id: sourceCandidateId(digest, sheet.sheetId, row.rowNumber), sheet: sheet.title,
        sheetId: sheet.sheetId, rowNumber: row.rowNumber, fields: {}, blockers: [], warnings: [],
        candidateJobIds: /** @type {string[]} */ ([]) };
      rows.push(candidate);
      const block = code => { if (!candidate.blockers.includes(code)) candidate.blockers.push(code); };
      if (!headers.length || duplicateHeaders) block('invalid_headers');
      const cell = name => row.cells[headers.indexOf(key(name))];
      const get = name => cellValue(cell(name));
      const text = name => clean(get(name)) || null;
      const requiredText = name => { const value = text(name); if (!value) block(`missing:${name}`); return value; };
      const money = (name, optional = false, signed = false) => {
        if (!headers.includes(key(name))) { block(`missing_column:${name}`); return null; }
        if (cell(name)?.effective?.errorValue || (cell(name)?.entered?.formulaValue && empty(get(name)))) {
          block(`invalid_money:${name}`); return null;
        }
        if (empty(get(name)) && optional) return '0';
        try { const value = moneyToKobo(get(name)); if (!signed && BigInt(value) < 0n) block(`negative_money:${name}`); return value; }
        catch { block(`invalid_money:${name}`); return null; }
      };
      const date = name => { try { return businessDate(get(name), snapshot.timeZone); }
        catch { block(`invalid_date:${name}`); return null; } };
      const measure = (name, positive = false) => {
        const value = clean(get(name));
        if (!/^\d{1,12}(?:\.\d{1,6})?$/.test(value) || (positive && Number(value) <= 0)) {
          block(`invalid_measurement:${name}`); return null;
        }
        return value;
      };
      row.cells.forEach((c, index) => {
        if (c?.effective?.errorValue) candidate.warnings.push(`source_formula_error:column_${index + 1}`);
        const formula = c?.entered?.formulaValue ?? '';
        for (const target of new Set(referencedTabs(formula))) if (!Object.hasOwn(APP_TABS, target)) {
          dependencyReviews.push({ sheet: sheet.title, rowNumber: row.rowNumber, column: index + 1, target });
          block('formula_depends_on_manual_or_unknown_tab');
        }
        if (/\b(?:INDIRECT|IMPORTRANGE)\s*\(/i.test(formula)) {
          dependencyReviews.push({ sheet: sheet.title, rowNumber: row.rowNumber, column: index + 1, target: 'dynamic_or_external_reference' });
          block('dynamic_formula_dependency');
        }
      });
      const f = candidate.fields;
      if (sheet.title === 'Sales') {
        Object.assign(f, { legacy_sales_id: text('Sales ID'), legacy_transaction_id: text('TRANSACTION ID'),
          client_name_snapshot: requiredText('CLIENT NAME'), contact_snapshot: text('CONTACT'),
          description: requiredText('JOB DESCRIPTION'), material_name_snapshot: text('MATERIAL'),
          business_date: date('DATE'), quantity: measure('QTY', true), unit_price_kobo: money('UNIT COST (₦)'),
          amount_kobo: money('AMOUNT (₦)'), initial_payment_kobo: money('INITIAL PAYMENT (₦)', true),
          additional_payment_1_kobo: money('ADDITIONAL PAYMENT 1', true), additional_payment_2_kobo: money('ADDITIONAL PAYMENT 2', true),
          job_status: requiredText('JOB STATUS'), logged_by_snapshot: text('Logged By'), occurred_at_raw: text('TIMESTAMP') });
        const amounts = [f.amount_kobo, f.initial_payment_kobo, f.additional_payment_1_kobo, f.additional_payment_2_kobo];
        if (amounts.every(v => v !== null)) {
          f.balance_kobo = (BigInt(amounts[0]) - BigInt(sum(amounts.slice(1)))).toString();
          const displayed = get('AMOUNT DIFFERENCES');
          if (!empty(displayed)) { try { if (moneyToKobo(displayed) !== f.balance_kobo) candidate.warnings.push('stored_balance_differs_from_payment_columns'); }
            catch { candidate.warnings.push('invalid_stored_balance'); } }
        }
        if (f.quantity !== null && f.unit_price_kobo !== null && f.amount_kobo !== null) {
          const [whole, decimal = ''] = f.quantity.split('.');
          const units = BigInt(whole) * 1000000n + BigInt(decimal.padEnd(6, '0'));
          if ((units * BigInt(f.unit_price_kobo) + 500000n) / 1000000n !== BigInt(f.amount_kobo)) {
            candidate.warnings.push('historical_quantity_price_differs_from_amount');
          }
        }
        candidate.warnings.push('customer_identity_and_order_grouping_pending');
      } else if (sheet.title === 'Payments') {
        Object.assign(f, { legacy_payment_id: text('PAYMENT ID'), legacy_sales_id: text('SALES ID'),
          legacy_batch_id: text('BATCH ID'), batch_total_kobo: empty(get('BATCH TOTAL')) ? null : money('BATCH TOTAL'),
          client_name_snapshot: requiredText('CLIENT NAME'), business_date: date('DATE'), amount_kobo: money('AMOUNT'),
          kind: requiredText('PAYMENT TYPE'), collected_by_snapshot: text('COLLECTED BY'), occurred_at_raw: text('TIMESTAMP'),
          balance_before_kobo: money('BALANCE BEFORE', false, true), balance_after_kobo: money('BALANCE AFTER', false, true),
          notes: text('NOTES') });
        if (f.amount_kobo === '0') block('zero_payment_amount');
      } else if (sheet.title === 'Expenses') {
        Object.assign(f, { legacy_expense_id: text('EXPENSE ID'), business_date: date('DATE'), amount_kobo: money('AMOUNT'),
          category: requiredText('CATEGORY'), description: text('DESCRIPTION'), paid_to: text('PAID TO'),
          payment_method: text('PAYMENT METHOD'), receipt_url: text('RECEIPT URL'), status: requiredText('STATUS'),
          logged_by_snapshot: text('Logged By'), paid_by_snapshot: text('PAID BY'),
          paid_at_raw: text('PAID AT'), occurred_at_raw: text('TIMESTAMP') });
      } else if (sheet.title === 'Materials') {
        Object.assign(f, { legacy_material_id: requiredText('Material ID'), name: requiredText('Material Name'),
          width_ft: measure('Width (ft)', true), selling_price_per_sqft_kobo: money('Selling Price'),
          active_roll_legacy_id: text('Active Roll ID'), low_stock_threshold_ft: measure('Low Stock Threshold (ft)'), notes: text('Notes') });
      } else if (sheet.title === 'Inventory') {
        Object.assign(f, { legacy_roll_id: requiredText('Roll ID'), material_legacy_id: requiredText('Material ID'),
          item_name: requiredText('Item Name'), width_ft: measure('Width (ft)', true),
          total_length_ft: measure('Total Length (ft)'), remaining_length_ft: measure('Remaining Length (ft)'),
          purchase_cost_kobo: money('Cost'), selling_price_kobo: money('Price'), business_date: date('Date Added') });
        if (f.remaining_length_ft !== null && f.total_length_ft !== null && Number(f.remaining_length_ft) > Number(f.total_length_ft)) block('remaining_stock_exceeds_capacity');
      } else if (sheet.title === 'Cashiers') {
        Object.assign(f, { display_name: requiredText('Name'), credentials: 'separate_secure_migration_required' });
        candidate.warnings.push('login_status_is_not_account_enabled_status');
      } else if (sheet.title === 'Estimates') {
        Object.assign(f, { legacy_quote_id: requiredText('QUOTE ID'), client_name_snapshot: text('CLIENT NAME'), business_date: date('DATE') });
        try { f.cart_data = JSON.parse(get('CART DATA')); if (!f.cart_data || typeof f.cart_data !== 'object') throw new Error(); }
        catch { block('invalid_cart_json'); }
      }
    }
  }
  const byTab = title => rows.filter(row => row.sheet === title);
  const index = (items, field) => {
    const result = new Map();
    for (const item of items) { const value = item.fields[field]; if (!value) continue;
      result.set(value, [...(result.get(value) ?? []), item]); }
    return result;
  };
  for (const [title, field] of [['Payments', 'legacy_payment_id'], ['Inventory', 'legacy_roll_id'], ['Materials', 'legacy_material_id'], ['Estimates', 'legacy_quote_id']]) {
    for (const group of index(byTab(title), field).values()) if (group.length > 1) group.forEach(row => row.blockers.push(`duplicate:${field}`));
  }
  const sales = byTab('Sales'), payments = byTab('Payments'), materials = byTab('Materials'), rolls = byTab('Inventory');
  const salesIds = index(sales, 'legacy_sales_id'), materialIds = index(materials, 'legacy_material_id'), rollIds = index(rolls, 'legacy_roll_id');
  for (const payment of payments) {
    const candidates = salesIds.get(payment.fields.legacy_sales_id) ?? [];
    payment.candidateJobIds = candidates.map(row => row.id);
    if (candidates.length !== 1) payment.blockers.push(candidates.length ? 'ambiguous_job_reference' : 'unmatched_job_reference');
    else if (key(candidates[0].fields.client_name_snapshot) !== key(payment.fields.client_name_snapshot)) payment.blockers.push('job_customer_name_mismatch');
  }
  for (const roll of rolls) {
    const candidates = materialIds.get(roll.fields.material_legacy_id) ?? [];
    if (candidates.length !== 1) roll.blockers.push('unresolved_material_reference');
    else { roll.candidateMaterialId = candidates[0].id;
      if (roll.fields.width_ft !== null && candidates[0].fields.width_ft !== null && Number(roll.fields.width_ft) !== Number(candidates[0].fields.width_ft)) roll.blockers.push('material_width_mismatch'); }
  }
  for (const material of materials) {
    if (!material.fields.active_roll_legacy_id) continue;
    const candidates = rollIds.get(material.fields.active_roll_legacy_id) ?? [];
    if (candidates.length !== 1 || candidates[0].fields.material_legacy_id !== material.fields.legacy_material_id) material.blockers.push('unresolved_active_roll_reference');
    else material.candidateActiveRollId = candidates[0].id;
  }
  const paymentGroups = [...index(payments, 'legacy_batch_id').values()].map(group => {
    const codes = [], totals = group.map(r => r.fields.batch_total_kobo), amounts = group.map(r => r.fields.amount_kobo);
    const total = totals[0], allocated = amounts.every(a => a !== null) ? sum(amounts) : null;
    if (total === null || totals.some(t => t !== total)) codes.push('missing_or_inconsistent_batch_total');
    else if (allocated !== total) codes.push('batch_allocations_do_not_equal_receipt');
    if (new Set(group.map(r => key(r.fields.client_name_snapshot))).size !== 1) codes.push('batch_has_multiple_customer_names');
    if (new Set(group.map(r => r.fields.business_date)).size !== 1) codes.push('batch_has_multiple_dates');
    group.forEach(row => row.blockers.push(...codes));
    return { candidateReceiptId: sourceCandidateId(digest, 'batch', group[0].fields.legacy_batch_id), sourceRowIds: group.map(r => r.id),
      declaredCashKobo: total, allocatedKobo: allocated, blockers: codes };
  });
  // Audit entries describe additional payments already reflected in Sales.
  // This compares totals at legacy-ID group level; it does not guess which job
  // a payment belongs to when multiple rows share that ID.
  const paymentsBySale = index(payments, 'legacy_sales_id');
  const auditComparisons = [...salesIds].map(([legacyId, group]) => {
    const audit = paymentsBySale.get(legacyId) ?? [];
    const additions = group.flatMap(r => [r.fields.additional_payment_1_kobo, r.fields.additional_payment_2_kobo]);
    const amounts = audit.map(r => r.fields.amount_kobo);
    const sameCustomer = new Set([...group, ...audit].map(r => key(r.fields.client_name_snapshot))).size === 1;
    const comparable = sameCustomer && [...additions, ...amounts].every(v => v !== null);
    const salesAdditionalKobo = additions.every(v => v !== null) ? sum(additions) : null;
    const auditKobo = amounts.every(v => v !== null) ? sum(amounts) : null;
    return { salesSourceIds: group.map(r => r.id), paymentSourceIds: audit.map(r => r.id),
      salesAdditionalKobo, auditKobo,
      differenceKobo: comparable ? (BigInt(salesAdditionalKobo) - BigInt(auditKobo)).toString() : null,
      status: !comparable ? 'ambiguous_customer_or_amount' : salesAdditionalKobo === auditKobo ? 'group_totals_match' : 'difference_requires_review' };
  });
  const totalColumn = (items, field) => ({ sumKnownKobo: sum(items.map(r => r.fields[field]).filter(v => v !== null && v !== undefined)),
    unknownRows: items.filter(r => r.fields[field] === null || r.fields[field] === undefined).length });
  const balances = sales.filter(r => r.fields.balance_kobo !== undefined).map(r => BigInt(r.fields.balance_kobo));
  const blockerCounts = {};
  for (const row of rows) for (const code of new Set(row.blockers)) blockerCounts[code] = (blockerCounts[code] ?? 0) + 1;
  const summary = { activeTabs: scope.filter(s => s.treatment === 'map_to_business_tables').length,
    manualWorkflowTabs: scope.filter(s => s.treatment === 'manual_workflow_review').length,
    activeSourceRows: scope.filter(s => s.treatment === 'map_to_business_tables').reduce((n, s) => n + s.rows, 0),
    candidateRows: rows.length, blockedRows: rows.filter(r => r.blockers.length).length,
    missingAppTabs: Object.keys(APP_TABS).filter(title => !seen.has(title)), dependencyReviews: dependencyReviews.length, blockerCounts,
    manualTabsDependingOnAppData: scope.filter(s => s.appDataDependencies.length).map(s => s.title),
    paymentBatches: paymentGroups.length, paymentBatchesWithDiscrepancies: paymentGroups.filter(g => g.blockers.length).length,
    auditGroups: auditComparisons.length, auditGroupsWithDifferences: auditComparisons.filter(g => g.status === 'difference_requires_review').length,
    auditGroupsNotComparable: auditComparisons.filter(g => g.status === 'ambiguous_customer_or_amount').length,
    perTab: Object.keys(APP_TABS).map(title => ({ title, candidates: byTab(title).length, blocked: byTab(title).filter(r => r.blockers.length).length })) };
  return { version: 1, snapshotSha256: digest, status: 'mapping_review_required', readyForBusinessImport: false,
    scope, summary, dependencyReviews, rows, paymentGroups, auditComparisons,
    finance: { status: 'source_arithmetic_only_not_certified',
      salesAmounts: totalColumn(sales, 'amount_kobo'), initialPayments: totalColumn(sales, 'initial_payment_kobo'),
      additionalPayment1: totalColumn(sales, 'additional_payment_1_kobo'), additionalPayment2: totalColumn(sales, 'additional_payment_2_kobo'),
      paymentAuditAllocations: totalColumn(payments, 'amount_kobo'), expenses: totalColumn(byTab('Expenses'), 'amount_kobo'),
      exactPositiveDebtKobo: sum(balances.filter(v => v > 0n)), displayedCollectableDebtKobo: sum(balances.filter(v => v > 50n)),
      overpaymentsKobo: sum(balances.filter(v => v < 0n).map(v => -v)), unknownBalanceRows: sales.length - balances.length,
      note: 'Payment audit rows may describe money already in Sales payment columns. Never add these totals together or repeat BATCH TOTAL per allocation. Customer merges, receipt identity and legacy opening adjustments remain unresolved.' } };
}

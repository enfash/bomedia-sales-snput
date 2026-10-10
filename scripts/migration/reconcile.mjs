// Source-only reconstruction. No database writes, balance adjustments, customer
// merging or invented receipts. A unique reconstruction remains review evidence.
const normalize = value => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const integer = value => typeof value === 'string' && /^-?\d+$/.test(value);
const nonnegative = value => integer(value) && BigInt(value) >= 0n;
const total = values => values.reduce((n, value) => n + BigInt(value), 0n);
const timestamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;

function operation(fields) {
  const note = String(fields.notes ?? '');
  const match = note.match(/\[slot:([12]) (set|append)\]/);
  if (match) return { slot: Number(match[1]) - 1, mode: match[2] };
  if (fields.kind === 'Additional Payment 1') return { slot: 0, mode: 'set' };
  if (fields.kind === 'Additional Payment 2') return { slot: 1, mode: 'set' };
  return null;
}

function eventsFromRows(rows) {
  const ordered = [...rows].sort((a, b) => timestamp(a.fields.occurred_at_raw) - timestamp(b.fields.occurred_at_raw) || a.rowNumber - b.rowNumber);
  const events = [];
  for (let i = 0; i < ordered.length; i++) {
    const row = ordered[i], f = row.fields, op = operation(f);
    if (!op) return { reason: 'missing_slot_evidence' };
    const before = BigInt(f.balance_before_kobo), after = BigInt(f.balance_after_kobo);
    let amount = BigInt(f.amount_kobo), paired = [row];
    if (f.kind === 'Settlement' && before - after !== amount) {
      const next = ordered[i + 1], g = next?.fields;
      // Current writer emits Settlement then Rounding for one step, with
      // consecutive IDs and the SAME before/after balances. Never apply both
      // as separate balance transitions or pair merely on matching amounts.
      const suffix = f.legacy_batch_id && f.legacy_payment_id?.startsWith(`${f.legacy_batch_id}-`)
        ? f.legacy_payment_id.slice(f.legacy_batch_id.length + 1) : '';
      if (!g || !/^\d+$/.test(suffix) || g.kind !== 'Rounding' || g.legacy_batch_id !== f.legacy_batch_id
        || g.legacy_payment_id !== `${f.legacy_batch_id}-${Number(suffix) + 1}`
        || g.balance_before_kobo !== f.balance_before_kobo || g.balance_after_kobo !== f.balance_after_kobo
        || g.occurred_at_raw !== f.occurred_at_raw || g.notes !== f.notes
        || g.collected_by_snapshot !== f.collected_by_snapshot || g.business_date !== f.business_date
        || before - after !== amount + BigInt(g.amount_kobo)) return { reason: 'unreconciled_balance_transition' };
      amount += BigInt(g.amount_kobo); paired.push(next); i++;
    }
    const exact = before - amount === after;
    const clamped = /^Additional Payment [12]$/.test(f.kind) && after === 0n && before - amount < 0n;
    if (!exact && !clamped) return { reason: 'unreconciled_balance_transition' };
    if (amount <= 0n) return { reason: 'nonpositive_payment' };
    events.push({ rows: paired, before, amount, slot: op.slot, mode: op.mode, date: f.business_date,
      time: timestamp(f.occurred_at_raw), clamped });
  }
  return { events };
}

export function reconstructPaymentGroup(jobs, payments, { maxStates = 50000 } = {}) {
  const result = { salesSourceIds: jobs.map(r => r.id), paymentSourceIds: payments.map(r => r.id),
    status: 'review_required', reason: '', exploredStates: 0, assignments: [] };
  const fail = reason => ({ ...result, reason });
  if (!jobs.length) return fail('unmatched_sales_reference');
  const names = new Set([...jobs, ...payments].map(r => normalize(r.fields.client_name_snapshot)));
  if (names.size !== 1 || names.has('')) return fail('customer_identity_conflict');
  if (jobs.some(r => !['amount_kobo','initial_payment_kobo','additional_payment_1_kobo','additional_payment_2_kobo'].every(k => nonnegative(r.fields[k]))
    || !r.fields.business_date)) return fail('invalid_sales_values');
  if (payments.some(r => !nonnegative(r.fields.amount_kobo) || !integer(r.fields.balance_before_kobo) || !integer(r.fields.balance_after_kobo)
    || !r.fields.business_date || timestamp(r.fields.occurred_at_raw) === null)) return fail('invalid_payment_values');
  if (payments.some(r => r.blockers?.some(code => code.startsWith('duplicate:') || code.startsWith('batch_') || code === 'zero_payment_amount'
    || code === 'missing_or_inconsistent_batch_total'))) return fail('payment_identity_or_batch_review');
  const desired = jobs.map(r => [BigInt(r.fields.additional_payment_1_kobo), BigInt(r.fields.additional_payment_2_kobo)]);
  if (total(payments.map(r => r.fields.amount_kobo)) !== desired.reduce((n, pair) => n + pair[0] + pair[1], 0n)) return fail('audit_total_differs_from_sales');
  if (!payments.length) return { ...result, status: 'no_additional_payments', reason: 'zero_additional_balance' };
  const parsed = eventsFromRows(payments);
  if (!parsed.events) return fail(parsed.reason);
  const events = parsed.events;
  // Conservative ceiling bounds both combinatorial work and recursion depth.
  if (events.length > 200 || jobs.length > 100) return fail('history_exceeds_search_limit');
  const opening = jobs.map(r => BigInt(r.fields.amount_kobo) - BigInt(r.fields.initial_payment_kobo));
  const slots = jobs.map(() => [0n, 0n]);
  const assignment = [], solutions = [];
  let exhausted = false;
  function search(index) {
    if (solutions.length > 1 || exhausted) return;
    if (++result.exploredStates > maxStates) { exhausted = true; return; }
    if (index === events.length) {
      if (slots.every((pair, j) => pair[0] === desired[j][0] && pair[1] === desired[j][1])) solutions.push([...assignment]);
      return;
    }
    const event = events[index];
    for (let j = 0; j < jobs.length; j++) {
      const prior = slots[j][event.slot];
      const jobTime = timestamp(jobs[j].fields.occurred_at_raw);
      if (jobs[j].fields.business_date > event.date || (jobTime !== null && jobTime > event.time)) continue;
      if (opening[j] - slots[j][0] - slots[j][1] !== event.before) continue;
      if (event.mode === 'set' && prior !== 0n) continue;
      if (event.mode === 'append' && (event.slot !== 1 || slots[j][0] <= 0n || slots[j][1] <= 0n)) continue;
      if (prior + event.amount > desired[j][event.slot]) continue;
      slots[j][event.slot] = prior + event.amount;
      assignment.push(j); search(index + 1); assignment.pop();
      slots[j][event.slot] = prior;
      if (solutions.length > 1 || exhausted) break;
    }
  }
  search(0);
  if (exhausted) return fail('search_limit_reached');
  if (solutions.length === 0) return fail('no_complete_history_matches');
  if (solutions.length > 1) return fail('multiple_histories_match');
  result.status = 'unique_history_candidate';
  result.reason = 'exact_balance_transitions_and_final_slots';
  result.assignments = events.flatMap((event, i) => event.rows.map(row => ({ paymentSourceId: row.id,
    jobSourceId: jobs[solutions[0][i]].id, amountKobo: row.fields.amount_kobo,
    kind: row.fields.kind === 'Rounding' ? 'rounding' : row.fields.kind === 'Settlement' ? 'settlement' : 'legacy_unsplit', slot: event.slot + 1,
    legacyAfterWasClamped: event.clamped })));
  return result;
}

export function buildPaymentReconciliation(plan, options) {
  const grouped = new Map();
  for (const row of plan.rows.filter(r => r.sheet === 'Sales' || r.sheet === 'Payments')) {
    // Missing IDs cannot be used to join unrelated legacy rows.
    const key = row.fields.legacy_sales_id || `missing:${row.sheet}:${row.id}`;
    const group = grouped.get(key) ?? { jobs: [], payments: [] };
    group[row.sheet === 'Sales' ? 'jobs' : 'payments'].push(row); grouped.set(key, group);
  }
  const groups = [...grouped.values()].map(group => reconstructPaymentGroup(group.jobs, group.payments, options));
  const reasons = {};
  for (const group of groups.filter(g => g.status === 'review_required')) {
    const entry = reasons[group.reason] ?? { groups: 0, paymentRows: 0 };
    entry.groups++; entry.paymentRows += group.paymentSourceIds.length; reasons[group.reason] = entry;
  }
  const assignments = groups.flatMap(g => g.assignments);
  const payments = plan.rows.filter(r => r.sheet === 'Payments');
  const byId = new Map(plan.rows.map(r => [r.id, r]));
  return { version: 1, snapshotSha256: plan.snapshotSha256, status: 'review_evidence_only', readyForBusinessImport: false,
    summary: { paymentRows: payments.length, uniqueHistoryCandidates: assignments.length,
      formerlyAmbiguousCandidates: assignments.filter(a => byId.get(a.paymentSourceId).candidateJobIds.length > 1).length,
      unresolvedPaymentRows: payments.length - assignments.length, uniqueHistoryGroups: groups.filter(g => g.status === 'unique_history_candidate').length,
      noAdditionalPaymentGroups: groups.filter(g => g.status === 'no_additional_payments').length, reasons },
    groups,
    limitations: ['Unique means one assignment satisfies the recorded balance, slot and final-amount constraints. It is not independent confirmation that the source records are correct.',
      'Customer identity, initial cash receipt grouping, no-batch receipt identity and clamped legacy overpayment classifications still require review.',
      'No balances, source rows or database records were modified. Missing or inconsistent history is never filled with invented adjustments.'] };
}

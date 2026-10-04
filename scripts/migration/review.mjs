import { sha256 } from './snapshot.mjs';
import { buildPaymentReconciliation } from './reconcile.mjs';

// This is a review packet, never an import authorization or an adjustment ledger.
const sum = values => values.every(v => typeof v === 'string' && /^-?\d+$/.test(v))
  ? values.reduce((n, v) => n + BigInt(v), 0n).toString() : null;
const difference = (a, b) => a === null || b === null ? null : (BigInt(a) - BigInt(b)).toString();
const unique = values => [...new Set(values)];
const labels = {
  audit_total_differs_from_sales: 'Sales and payment records show different totals',
  customer_identity_conflict: 'Customer names are missing or disagree',
  no_complete_history_matches: 'The recorded balances do not form a complete matching history',
  payment_identity_or_batch_review: 'Payment identity, zero amount or receipt total needs review',
  multiple_histories_match: 'More than one job allocation fits the records',
  unmatched_sales_reference: 'Payment has no matching Sales ID',
  incomplete_sales_fields: 'Sales details are incomplete',
};
const questions = {
  audit_total_differs_from_sales: 'Which additional-payment amounts are correct for these jobs? Supply a receipt or collection record for the difference, or identify a confirmed source-entry error. Initial payments are excluded from this comparison.',
  customer_identity_conflict: 'Who owns each job and payment shown here? Confirm whether the names refer to the same customer or different customers. A missing name needs identification, not an automatic merge.',
  no_complete_history_matches: 'Which job received each payment? Check the dates, before/after balances and payment slots against receipts or collection records; identify any confirmed edits or missing entries.',
  payment_identity_or_batch_review: 'Check each listed blocker and the linked receipt/duplicate-ID evidence. Confirm whether zero entries are placeholders, and whether repeated payment IDs describe distinct collections. Do not remove a row solely because its ID repeats.',
  multiple_histories_match: 'Which individual job received each payment? The amounts fit more than one allocation, so a receipt, job description or other business evidence is needed.',
  unmatched_sales_reference: 'Which Sales row/job does this payment belong to? If the sale is absent, provide the original sale evidence; a customer-name match alone is insufficient.',
  incomplete_sales_fields: 'Provide the missing customer name or job description for the listed Sales rows. If an original value cannot be recovered, record that explicitly for a separate migration decision.',
};
const rowCopy = row => ({ sourceId: row.id, sheet: row.sheet, rowNumber: row.rowNumber,
  fields: { ...row.fields }, blockers: [...row.blockers], warnings: [...row.warnings],
  candidateJobIds: [...row.candidateJobIds] });

export function buildPaymentReview(plan, { capturedAt = /** @type {string | null} */ (null) } = {}) {
  const reconciliation = buildPaymentReconciliation(plan);
  const rows = plan.rows.filter(r => ['Sales', 'Payments'].includes(r.sheet));
  const byId = new Map(rows.map(r => [r.id, r]));
  if (byId.size !== rows.length) throw new Error('Duplicate source identity in review plan');
  const cases = reconciliation.groups.filter(g => g.status === 'review_required'
    || g.salesSourceIds.some(id => byId.get(id).blockers.length)).map(group => {
    const sales = group.salesSourceIds.map(id => byId.get(id));
    const payments = group.paymentSourceIds.map(id => byId.get(id));
    const reason = group.status === 'review_required' ? group.reason : 'incomplete_sales_fields';
    const sourceIds = [...group.salesSourceIds, ...group.paymentSourceIds].sort();
    const id = `CASE-${sha256(`${plan.snapshotSha256}:${sourceIds.join(':')}`).slice(0, 12)}`;
    const additions = sum(sales.flatMap(r => [r.fields.additional_payment_1_kobo, r.fields.additional_payment_2_kobo]));
    const audit = sum(payments.map(r => r.fields.amount_kobo));
    return { id, reason, title: labels[reason] ?? reason.replaceAll('_', ' '),
      question: questions[reason] ?? 'Review the original evidence for this history before proposing any correction.',
      status: 'awaiting_review', historyStatus: group.status,
      legacySalesIds: unique([...sales, ...payments].map(r => r.fields.legacy_sales_id).filter(Boolean)),
      customerNames: unique([...sales, ...payments].map(r => r.fields.client_name_snapshot).filter(Boolean)),
      totals: { salesAdditionalKobo: additions, paymentAuditKobo: audit,
        salesMinusAuditKobo: difference(additions, audit),
        meaning: 'Additional-payment columns minus payment-audit allocations; not an amount to collect or a proposed adjustment.' },
      sales: sales.map(rowCopy), payments: payments.map(rowCopy),
      batchReceiptIds: [], duplicateEvidenceIds: [],
      response: { confirmedFacts: '', supportingEvidence: '', proposedCorrection: '', reviewer: '', reviewedAt: null } };
  });
  const caseByRow = new Map(cases.flatMap(c => [...c.sales, ...c.payments].map(r => [r.sourceId, c.id])));
  const receipts = plan.paymentGroups.filter(g => g.sourceRowIds.some(id => caseByRow.has(id))).map(g => {
    const payments = g.sourceRowIds.map(id => byId.get(id));
    const receipt = { id: `BATCH-${g.candidateReceiptId}`, legacyBatchId: payments[0].fields.legacy_batch_id,
      declaredCashKobo: g.declaredCashKobo, allocatedKobo: g.allocatedKobo,
      declaredMinusAllocatedKobo: difference(g.declaredCashKobo, g.allocatedKobo), blockers: g.blockers,
      caseIds: unique(g.sourceRowIds.map(id => caseByRow.get(id)).filter(Boolean)), payments: payments.map(rowCopy) };
    for (const c of cases) if (receipt.caseIds.includes(c.id)) c.batchReceiptIds.push(receipt.id);
    return receipt;
  });
  const paymentIds = new Map();
  for (const row of rows.filter(r => r.sheet === 'Payments' && r.fields.legacy_payment_id)) {
    const id = row.fields.legacy_payment_id;
    paymentIds.set(id, [...(paymentIds.get(id) ?? []), row]);
  }
  const duplicates = [...paymentIds].filter(([, group]) => group.length > 1).map(([legacyId, group]) => {
    const item = { id: `DUPLICATE-${sha256(`${plan.snapshotSha256}:${legacyId}`).slice(0, 12)}`,
      legacyPaymentId: legacyId, caseIds: unique(group.map(r => caseByRow.get(r.id)).filter(Boolean)), payments: group.map(rowCopy) };
    for (const c of cases) if (item.caseIds.includes(c.id)) c.duplicateEvidenceIds.push(item.id);
    return item;
  });
  const priority = c => c.reason === 'unmatched_sales_reference' ? 0 : c.duplicateEvidenceIds.length ? 1
    : c.reason === 'customer_identity_conflict' ? 2 : c.reason === 'audit_total_differs_from_sales' ? 3
    : c.reason === 'incomplete_sales_fields' ? 4 : 5;
  cases.sort((a, b) => priority(a) - priority(b) || a.sales.length + a.payments.length - b.sales.length - b.payments.length
    || a.id.localeCompare(b.id));
  const unresolved = cases.filter(c => c.historyStatus === 'review_required').flatMap(c => c.payments.map(r => r.sourceId));
  if (new Set(unresolved).size !== unresolved.length || unresolved.length !== reconciliation.summary.unresolvedPaymentRows) {
    throw new Error('Review packet does not cover every unresolved payment exactly once');
  }
  return { version: 1, snapshotSha256: plan.snapshotSha256, capturedAt, status: 'review_evidence_only', readyForBusinessImport: false,
    summary: { ...reconciliation.summary, reviewCases: cases.length,
      paymentHistoryCases: cases.filter(c => c.historyStatus === 'review_required').length,
      additionalSalesDetailCases: cases.filter(c => c.historyStatus !== 'review_required').length,
      blockedSalesRows: cases.flatMap(c => c.sales).filter(r => r.blockers.length).length,
      relatedReceipts: receipts.length, duplicatePaymentIdGroups: duplicates.length },
    cases, receipts, duplicates,
    candidateHistories: reconciliation.groups.filter(g => g.status === 'unique_history_candidate'),
    limitations: [...reconciliation.limitations,
      'Cases are grouped by the original Sales ID, not by customer name. Missing Sales IDs remain separate.',
      'Linked receipt and duplicate-ID evidence can repeat source rows for context. Count each payment once using its source ID.',
      'This packet covers the saved snapshot only. Answers are review notes, not executable corrections or approval to import.',
      'Sales field blockers are included even when a group has no additional payments. Other mapping warnings and initial receipt/customer grouping remain separate work.'] };
}

// Escape source text so it stays text even when it contains Markdown/HTML.
const escape = value => String(value ?? '—').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replace(/[\\`*_{}\[\]()#+.!|~]/g, '\\$&').replaceAll('\r', ' ').replaceAll('\n', ' ');
export function formatNaira(kobo) {
  if (kobo === null || kobo === undefined) return 'Unknown';
  const amount = BigInt(kobo), absolute = amount < 0n ? -amount : amount;
  const whole = (absolute / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${amount < 0n ? '-' : ''}₦${whole}.${(absolute % 100n).toString().padStart(2, '0')}`;
}
const table = (headers, rows) => [`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`,
  ...rows.map(row => `| ${row.map(escape).join(' | ')} |`)].join('\n');
const paymentTable = rows => table(['Payments row', 'Date', 'Customer', 'Sales ID', 'Payment ID', 'Amount', 'Before → after', 'Type / note', 'Blockers'],
  rows.map(r => [r.rowNumber, r.fields.business_date, r.fields.client_name_snapshot, r.fields.legacy_sales_id,
    r.fields.legacy_payment_id, formatNaira(r.fields.amount_kobo),
    `${formatNaira(r.fields.balance_before_kobo)} → ${formatNaira(r.fields.balance_after_kobo)}`,
    `${r.fields.kind ?? ''} / ${r.fields.notes ?? ''}`, r.blockers.join('; ')]));
const context = report => `Snapshot captured: ${escape(report.capturedAt)} (UTC). Snapshot SHA-256: ${report.snapshotSha256}.\n\nAmounts are exact naira/kobo. Row numbers refer to the saved October 3 snapshot, not a sheet that may since have been sorted or edited. This packet changes no records and does not certify balances.\n`;

function caseMarkdown(c) {
  const sales = table(['Sales row', 'Date', 'Customer', 'Job', 'Sale amount', 'Initial payment', 'Additional 1', 'Additional 2', 'Calculated balance', 'Blockers'],
    c.sales.map(r => [r.rowNumber, r.fields.business_date, r.fields.client_name_snapshot, r.fields.description,
      ...['amount_kobo', 'initial_payment_kobo', 'additional_payment_1_kobo', 'additional_payment_2_kobo', 'balance_kobo'].map(k => formatNaira(r.fields[k])), r.blockers.join('; ')]));
  return `## ${c.id}\n\n**${escape(c.title)}**\n\nSales ID: ${escape(c.legacySalesIds.join(', ') || 'Missing')}. Customers: ${escape(c.customerNames.join(' / ') || 'Missing')}.\n\n${c.question}\n\nSales additional payments: **${formatNaira(c.totals.salesAdditionalKobo)}**. Payment audit allocations: **${formatNaira(c.totals.paymentAuditKobo)}**. Difference (Sales minus audit): **${formatNaira(c.totals.salesMinusAuditKobo)}**. This difference is not an instruction to collect or adjust money.\n\n${c.sales.length ? sales : 'No Sales row has this Sales ID in the snapshot.'}\n\n${c.payments.length ? paymentTable(c.payments) : 'No payment-audit rows have this Sales ID in the snapshot.'}\n\nRelated evidence: ${[...c.batchReceiptIds, ...c.duplicateEvidenceIds].map(id => `[${id}](#${id.toLowerCase()})`).join(', ') || 'None'}.\n\nResponse — confirmed facts: ___; supporting receipt/record: ___; proposed correction, if any: ___; reviewer/date: ___.\n`;
}

export function renderPaymentReview(report) {
  const s = report.summary;
  const intro = `# Sales and payment review\n\n${context(report)}\n**${s.unresolvedPaymentRows} unresolved payment rows in ${s.paymentHistoryCases} history cases**, plus **${s.additionalSalesDetailCases} additional cases for incomplete Sales details**. Total: **${s.reviewCases} cases**. ${s.blockedSalesRows} Sales rows have blocking field issues across these cases.\n\nAnother ${s.uniqueHistoryCandidates} payment rows have a unique candidate history. Those are retained in evidence.json for final validation; they are not approved for import.\n`;
  const batchIssues = report.receipts.filter(r => r.blockers.length);
  const batchSummary = batchIssues.map(r => `- [${r.id}](review.md#${r.id.toLowerCase()}): ${r.payments.length} allocations total **${formatNaira(r.allocatedKobo)}**; recorded receipt total **${formatNaira(r.declaredCashKobo)}**; recorded minus allocated **${formatNaira(r.declaredMinusAllocatedKobo)}**. Confirm the actual receipt amount and which entry, if any, is wrong. Do not spread the difference automatically.`).join('\n');
  const first = report.cases.slice(0, 5);
  const start = `${intro}\n## Start here\n\nUse the case ID when replying. Give the correct job/row and any supporting receipt or collection record. If you do not know, say so; we will leave the case unresolved. Do not edit the snapshot files.\n\n${batchSummary || 'No batch-total discrepancy was detected.'}\n\nFirst five small cases:\n\n${table(['Case', 'Question', 'Customer', 'Source rows', 'Audit allocations'], first.map(c => [c.id, c.title, c.customerNames.join(' / ') || 'Missing', `Sales: ${c.sales.map(r => r.rowNumber).join(', ') || 'none'}; Payments: ${c.payments.map(r => r.rowNumber).join(', ') || 'none'}`, formatNaira(c.totals.paymentAuditKobo)]))}\n\n${first.map(c => `- [Open ${c.id}](review.md#${c.id.toLowerCase()})`).join('\n')}\n\n[Open all ${s.reviewCases} cases and receipt evidence](review.md). The accompanying evidence.json retains full mapped fields, source IDs, warnings and candidate assignments. Responses require verification before any separate import or correction.\n`;
  const index = report.cases.map(c => `- [${c.id}](#${c.id.toLowerCase()}): ${escape(c.title)} — ${c.sales.length} Sales rows, ${c.payments.length} payment rows.`).join('\n');
  const receipts = report.receipts.map(r => `## ${r.id}\n\nOriginal batch ID: ${escape(r.legacyBatchId)}. Recorded total counted once: **${formatNaira(r.declaredCashKobo)}**. All allocations: **${formatNaira(r.allocatedKobo)}**. Difference: **${formatNaira(r.declaredMinusAllocatedKobo)}**.\n\nFlags: ${escape(r.blockers.join('; ') || 'None')}. Includes the entire batch, even rows outside unresolved cases; do not add these rows again to case totals.\n\n${paymentTable(r.payments)}\n`);
  const duplicates = report.duplicates.map(d => `## ${d.id}\n\nRepeated payment ID: ${escape(d.legacyPaymentId)}. These are separate source rows pending confirmation; an ID collision alone does not prove duplicate cash.\n\n${paymentTable(d.payments)}\n`);
  const full = `${intro}\n## Case index\n\n${index}\n\n${report.cases.map(caseMarkdown).join('\n')}\n# Receipt and duplicate-ID evidence\n\n${receipts.join('\n')}\n${duplicates.join('\n')}\n## Limits\n\n${report.limitations.map(l => `- ${l}`).join('\n')}\n`;
  return { start, full };
}

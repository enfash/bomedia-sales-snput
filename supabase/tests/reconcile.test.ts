import { expect, it } from 'vitest';
import { reconstructPaymentGroup, buildPaymentReconciliation } from '../../scripts/migration/reconcile.mjs';

const job = (id: string, amount: string, a1: string, a2 = '0', initial = '0') => ({ id, rowNumber: Number(id.replace(/\D/g, '')) || 1,
  fields: { amount_kobo: amount, initial_payment_kobo: initial, additional_payment_1_kobo: a1, additional_payment_2_kobo: a2,
    client_name_snapshot: 'Test Customer', business_date: '2026-10-01', occurred_at_raw: '2026-10-01T08:00:00Z' } });
const payment = (id: string, amount: string, before: string, after: string, kind = 'Additional Payment 1', notes = '') => ({
  id, rowNumber: Number(id.replace(/\D/g, '')) || 1, blockers: [] as string[], candidateJobIds: ['J1','J2'],
  fields: { amount_kobo: amount, balance_before_kobo: before, balance_after_kobo: after, kind, notes,
    legacy_payment_id: id, legacy_batch_id: '', client_name_snapshot: 'Test Customer', collected_by_snapshot: 'Test Staff',
    business_date: '2026-10-02', occurred_at_raw: '2026-10-02T08:00:00Z' },
});

it('finds the unique complete history using exact balances and final slot amounts', () => {
  const result = reconstructPaymentGroup([job('J1','10000','3000'),job('J2','20000','6000')],
    [payment('P1','3000','10000','7000'),payment('P2','6000','20000','14000')]);
  expect(result.status).toBe('unique_history_candidate');
  expect(result.assignments.map((a: { jobSourceId: string }) => a.jobSourceId)).toEqual(['J1','J2']);
});

it('does not break ties by sheet order when two full histories fit', () => {
  const result = reconstructPaymentGroup([job('J1','10000','3000'),job('J2','10000','3000')],
    [payment('P1','3000','10000','7000'),payment('P2','3000','10000','7000')]);
  expect(result.reason).toBe('multiple_histories_match');
  expect(result.assignments).toEqual([]);
});

it('pairs settlement and rounding into one transition, including a later slot-2 append', () => {
  const p1 = payment('B-0','2000','9000','7000','Settlement','[slot:1 set]');
  const p2 = payment('B-1','5000','7000','2000','Settlement','[slot:2 set]');
  const p3 = payment('B-2','2000','2000','-2000','Settlement','[slot:2 append]');
  const p4 = payment('B-3','2000','2000','-2000','Rounding','[slot:2 append]');
  const rows = [p1,p2,p3,p4].map((p, i) => ({ ...p, rowNumber: i + 2, fields: { ...p.fields, legacy_batch_id: 'B' } }));
  const result = reconstructPaymentGroup([job('J1','10000','2000','9000','1000')], rows);
  expect(result.status).toBe('unique_history_candidate');
  expect(result.assignments).toHaveLength(4);
  expect(result.assignments[3]).toMatchObject({ kind: 'rounding', amountKobo: '2000', jobSourceId: 'J1' });
});

it('refuses pairing when matching amounts lack consecutive IDs and receipt metadata', () => {
  const p1 = payment('B-0','10000','10000','-2000','Settlement','[slot:1 set]');
  const p2 = payment('B-2','2000','10000','-2000','Rounding','[slot:1 set]');
  p1.fields.legacy_batch_id = 'B'; p2.fields.legacy_batch_id = 'B';
  expect(reconstructPaymentGroup([job('J1','10000','12000')],[p1,p2]).reason).toBe('unreconciled_balance_transition');
});

it('records legacy clamped overpayments without misclassifying the unsplit row as settlement', () => {
  const result = reconstructPaymentGroup([job('J1','10000','11000')],[payment('P1','11000','10000','0')]);
  expect(result.status).toBe('unique_history_candidate');
  expect(result.assignments[0]).toMatchObject({ legacyAfterWasClamped: true, kind: 'legacy_unsplit' });
});

it('leaves incomplete audit totals and impossible balance chains unresolved', () => {
  expect(reconstructPaymentGroup([job('J1','10000','3000')],[payment('P1','2000','10000','8000')]).reason).toBe('audit_total_differs_from_sales');
  expect(reconstructPaymentGroup([job('J1','10000','3000')],[payment('P1','3000','9000','6000')]).reason).toBe('no_complete_history_matches');
});

it('rejects wrong customers, duplicate payment IDs and payments before the job', () => {
  const p = payment('P1','3000','10000','7000');
  p.fields.client_name_snapshot = 'Different Customer';
  expect(reconstructPaymentGroup([job('J1','10000','3000')],[p]).reason).toBe('customer_identity_conflict');
  p.fields.client_name_snapshot = 'Test Customer'; p.blockers.push('duplicate:legacy_payment_id');
  expect(reconstructPaymentGroup([job('J1','10000','3000')],[p]).reason).toBe('payment_identity_or_batch_review');
  p.blockers = []; p.fields.business_date = '2026-09-30';
  expect(reconstructPaymentGroup([job('J1','10000','3000')],[p]).reason).toBe('no_complete_history_matches');
});

it('refuses missing slot evidence and invalid amounts instead of inventing allocations', () => {
  expect(reconstructPaymentGroup([job('J1','10000','3000')],[payment('P1','3000','10000','7000','Additional Payment')]).reason).toBe('missing_slot_evidence');
  expect(reconstructPaymentGroup([job('J1','10000','3000')],[payment('P1','bad','10000','7000')]).reason).toBe('invalid_payment_values');
});

it('reports search exhaustion without returning a partially found mapping', () => {
  const result = reconstructPaymentGroup([job('J1','10000','3000')],[payment('P1','3000','10000','7000')],{ maxStates: 1 });
  expect(result.reason).toBe('search_limit_reached');
  expect(result.assignments).toEqual([]);
});

it('keeps orphan payments and missing sales IDs separate in the summary', () => {
  const j = { ...job('J1','10000','0'), sheet: 'Sales', fields: { ...job('J1','10000','0').fields, legacy_sales_id: null } };
  const p = { ...payment('P1','3000','10000','7000'), sheet: 'Payments', fields: { ...payment('P1','3000','10000','7000').fields, legacy_sales_id: null } };
  const report = buildPaymentReconciliation({ snapshotSha256: 'synthetic', rows: [j,p] });
  expect(report.summary).toMatchObject({ paymentRows: 1, uniqueHistoryCandidates: 0, unresolvedPaymentRows: 1, noAdditionalPaymentGroups: 1 });
  expect(report.readyForBusinessImport).toBe(false);
});

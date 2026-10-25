import { expect, it } from 'vitest';
import { buildPaymentReview, formatNaira, renderPaymentReview } from '../../scripts/migration/review.mjs';

const sale = (id: string, legacyId: string | null, additional = '0', blockers: string[] = []) => ({
  id, sheet: 'Sales', rowNumber: Number(id.replace(/\D/g, '')) || 2, blockers, warnings: [], candidateJobIds: [],
  fields: { legacy_sales_id: legacyId, client_name_snapshot: 'Test customer', description: 'Print job',
    amount_kobo: '10000', initial_payment_kobo: '0', additional_payment_1_kobo: additional, additional_payment_2_kobo: '0',
    balance_kobo: (BigInt(10000) - BigInt(additional)).toString(), business_date: '2026-10-01', occurred_at_raw: '2026-10-01T08:00:00Z' },
});
const payment = (id: string, legacyId: string | null, amount = '3000', blockers: string[] = []) => ({
  id, sheet: 'Payments', rowNumber: Number(id.replace(/\D/g, '')) || 2, blockers, warnings: [], candidateJobIds: ['S2'],
  fields: { legacy_sales_id: legacyId, legacy_payment_id: id, legacy_batch_id: '', client_name_snapshot: 'Test customer',
    amount_kobo: amount, balance_before_kobo: '10000', balance_after_kobo: (BigInt(10000) - BigInt(amount)).toString(),
    business_date: '2026-10-02', occurred_at_raw: '2026-10-02T08:00:00Z', kind: 'Additional Payment 1', notes: '' },
});
const plan = (rows: unknown[], paymentGroups: unknown[] = []) => ({ snapshotSha256: 'test-snapshot', rows, paymentGroups });

it('covers unresolved payment rows once, with separate sales-only cases and candidate evidence', () => {
  const report = buildPaymentReview(plan([
    sale('S2', 'one', '3000'), payment('P2', 'one'),
    sale('S3', 'two', '5000'), payment('P3', 'two'),
    sale('S4', 'three', '0', ['missing:JOB DESCRIPTION']), payment('P4', 'orphan'),
  ]));
  expect(report.summary).toMatchObject({ reviewCases: 3, paymentHistoryCases: 2, additionalSalesDetailCases: 1,
    unresolvedPaymentRows: 2, uniqueHistoryCandidates: 1, blockedSalesRows: 1 });
  expect(report.cases.flatMap((c: { payments: { sourceId: string }[] }) => c.payments.map(r => r.sourceId)).sort()).toEqual(['P3', 'P4']);
  expect(report.candidateHistories[0].assignments).toMatchObject([{ paymentSourceId: 'P2' }]);
  expect(report.readyForBusinessImport).toBe(false);
});

it('keeps missing IDs separate despite matching customer names and generates stable snapshot-bound case IDs', () => {
  const rows = [payment('P2', null), payment('P3', null)];
  const a = buildPaymentReview(plan(rows)), b = buildPaymentReview(plan([...rows].reverse()));
  expect(a.cases).toHaveLength(2);
  expect(a.cases.map((c: { id: string }) => c.id)).toEqual(b.cases.map((c: { id: string }) => c.id));
  expect(buildPaymentReview({ ...plan(rows), snapshotSha256: 'other-snapshot' }).cases[0].id).not.toBe(a.cases[0].id);
});

it('includes the entire related receipt, counts its declared total once and links duplicate IDs across cases', () => {
  const a = payment('P2', 'missing', '3000', ['duplicate:legacy_payment_id']);
  const b = payment('P3', 'missing2', '2000', ['duplicate:legacy_payment_id']);
  const c = payment('P4', 'valid', '3000');
  a.fields.legacy_payment_id = b.fields.legacy_payment_id = 'repeated';
  a.fields.legacy_batch_id = b.fields.legacy_batch_id = c.fields.legacy_batch_id = 'batch';
  const report = buildPaymentReview(plan([a, b, c, sale('S2', 'valid', '3000')], [
    { candidateReceiptId: 'receipt', sourceRowIds: ['P2', 'P3', 'P4'], declaredCashKobo: '8001', allocatedKobo: '8000', blockers: ['batch_allocations_do_not_equal_receipt'] },
  ]));
  expect(report.receipts).toHaveLength(1);
  expect(report.receipts[0]).toMatchObject({ declaredCashKobo: '8001', declaredMinusAllocatedKobo: '1' });
  expect(report.receipts[0].payments).toHaveLength(3);
  expect(report.duplicates[0].payments).toHaveLength(2);
  expect(report.cases.every((c: { batchReceiptIds: string[]; duplicateEvidenceIds: string[] }) => c.batchReceiptIds.length === 1 && c.duplicateEvidenceIds.length === 1)).toBe(true);
});

it('preserves exact money beyond JS safe integers and keeps an unknown amount unknown', () => {
  expect(formatNaira('900719925474099301')).toBe('₦9,007,199,254,740,993.01');
  expect(formatNaira('-1')).toBe('-₦0.01');
  expect(formatNaira(null)).toBe('Unknown');
  const p = payment('P2', 'missing');
  const report = buildPaymentReview(plan([{ ...p, fields: { ...p.fields, amount_kobo: null } }]));
  expect(report.cases[0].totals).toMatchObject({ paymentAuditKobo: null, salesMinusAuditKobo: null });
});

it('renders source content as inert text and retains full source lineage without modifying the plan', () => {
  const p = payment('P2', 'missing');
  p.fields.client_name_snapshot = '<script>alert(1)</script> | [click](https://example.com)';
  p.fields.notes = 'line\n# heading';
  const input = plan([p]);
  const before = JSON.stringify(input);
  const report = buildPaymentReview(input, { capturedAt: '2026-10-03T22:19:01.958Z' });
  const output = renderPaymentReview(report);
  expect(output.full).not.toContain('<script>');
  expect(output.full).toContain('&lt;script&gt;');
  expect(output.full).toContain('\\| \\[click\\]\\(https://example\\.com\\)');
  expect(output.full).toContain('line \\# heading');
  expect(report.cases[0].payments[0].sourceId).toBe('P2');
  expect(report.cases[0].payments[0].fields.notes).toBe(p.fields.notes);
  expect(JSON.stringify(input)).toBe(before);
});

it('rejects duplicate source identities instead of hiding a source row in a map', () => {
  expect(() => buildPaymentReview(plan([payment('P2', 'one'), payment('P2', 'two')]))).toThrow('Duplicate source identity');
});

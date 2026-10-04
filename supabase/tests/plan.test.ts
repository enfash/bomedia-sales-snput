import { expect, it } from 'vitest';
import { APP_TABS, buildMigrationPlan, businessDate } from '../../scripts/migration/plan.mjs';
import { snapshotFromSpreadsheet } from '../../scripts/migration/snapshot.mjs';

const salesHeaders = ['DATE','CLIENT NAME','JOB DESCRIPTION','Sales ID','TRANSACTION ID','QTY','UNIT COST (₦)','AMOUNT (₦)','INITIAL PAYMENT (₦)','ADDITIONAL PAYMENT 1','ADDITIONAL PAYMENT 2','JOB STATUS'];
const paymentHeaders = ['PAYMENT ID','SALES ID','CLIENT NAME','DATE','AMOUNT','PAYMENT TYPE','BATCH ID','BATCH TOTAL'];
const sale = (id: string, amount = 100, initial = 0, additional = 0) => ['2026-10-04','Test Client','Test Job',id,'TX',1,amount,amount,initial,additional,0,'Done'];
const payment = (id: string, salesId: string, amount: number, batch = '', total: number | string = '') => [id,salesId,'Test Client','2026-10-04',amount,'Settlement',batch,total];
function snapshot(tabs: Record<string, (string | number | null)[][]>) {
  return snapshotFromSpreadsheet({ spreadsheetId: 'synthetic-plan', properties: { timeZone: 'Africa/Lagos' },
    sheets: Object.entries(tabs).map(([title, values], sheetId) => ({ properties: { title, sheetId }, data: [{ rowData: values.map(row => ({ values: row.map(value => {
      const v = typeof value === 'number' ? { numberValue: value } : { stringValue: value ?? '' };
      return { userEnteredValue: v, effectiveValue: v, formattedValue: String(value ?? '') };
    }) })) }] })),
  }, '2026-10-04T00:00:00.000Z');
}

it('keeps manual workflows preserved and limits app mapping to the seven actual app tabs', () => {
  expect(Object.keys(APP_TABS)).toHaveLength(7);
  const plan = buildMigrationPlan(snapshot({ Sales: [salesHeaders, sale('S1')], Assets: [['Asset Name'],['Test Asset']] }));
  expect(plan.scope[1]).toMatchObject({ treatment: 'manual_workflow_review', rows: 2 });
  expect(plan.rows).toHaveLength(1);
  expect(plan.summary.missingAppTabs).toContain('Payments');
  expect(plan.readyForBusinessImport).toBe(false);
});

it('preserves repeated sale IDs as separate jobs and refuses to guess payment allocation', () => {
  const source = snapshot({ Sales: [salesHeaders,sale('S1'),sale('S1')], Payments: [paymentHeaders,payment('P1','S1',30)] });
  const plan = buildMigrationPlan(source);
  expect(new Set(plan.rows.map((r: { id: string }) => r.id)).size).toBe(3);
  expect(plan.rows[2].candidateJobIds).toHaveLength(2);
  expect(plan.rows[2].blockers).toContain('ambiguous_job_reference');
  expect(buildMigrationPlan(source)).toEqual(plan);
});

it('counts batch cash once, retains allocation rows and compares audits without double-counting collections', () => {
  const plan = buildMigrationPlan(snapshot({ Sales: [salesHeaders,sale('S1',200,0,100),sale('S2',100,0,50)],
    Payments: [paymentHeaders,payment('P1','S1',100,'B1',150),payment('P2','S2',50,'B1',150)] }));
  expect(plan.paymentGroups).toHaveLength(1);
  expect(plan.paymentGroups[0]).toMatchObject({ declaredCashKobo: '15000', allocatedKobo: '15000', blockers: [] });
  expect(plan.finance.paymentAuditAllocations.sumKnownKobo).toBe('15000');
  expect(plan.finance.additionalPayment1.sumKnownKobo).toBe('15000');
  expect(plan.summary.auditGroupsWithDifferences).toBe(0);
});

it('flags inconsistent batches and duplicate payment IDs without dropping source records', () => {
  const plan = buildMigrationPlan(snapshot({ Sales: [salesHeaders,sale('S1')],
    Payments: [paymentHeaders,payment('P1','S1',30,'B1',100),payment('P1','S1',20,'B1',100)] }));
  expect(plan.rows).toHaveLength(3);
  expect(plan.summary.paymentBatchesWithDiscrepancies).toBe(1);
  expect(plan.rows[1].blockers).toContain('duplicate:legacy_payment_id');
  expect(plan.rows[2].blockers).toContain('batch_allocations_do_not_equal_receipt');
  expect(plan.finance.paymentAuditAllocations.sumKnownKobo).toBe('5000');
  expect(plan.summary.auditGroupsWithDifferences).toBe(1);
});

it('keeps overpayment separate from another job debt and reports display tolerance separately', () => {
  const plan = buildMigrationPlan(snapshot({ Sales: [salesHeaders,sale('S1',100,110),sale('S2',50),sale('S3',0.5)] }));
  expect(plan.finance).toMatchObject({ exactPositiveDebtKobo: '5050', displayedCollectableDebtKobo: '5000', overpaymentsKobo: '1000' });
});

it('does not turn missing formula results or missing optional payment columns into zero', () => {
  const source = snapshot({ Sales: [salesHeaders,sale('S1')] });
  source.sheets[0].rows[1].cells[9] = { entered: { formulaValue: '=1/0' }, effective: null, formatted: null };
  const plan = buildMigrationPlan(source);
  expect(plan.rows[0].blockers).toContain('invalid_money:ADDITIONAL PAYMENT 1');
  expect(plan.finance.unknownBalanceRows).toBe(1);
  const missing = snapshot({ Sales: [salesHeaders.slice(0, 10),sale('S1').slice(0, 10)] });
  expect(buildMigrationPlan(missing).rows[0].blockers).toContain('missing_column:ADDITIONAL PAYMENT 2');
});

it('detects app formulas depending on manually maintained tabs and dynamic references', () => {
  const source = snapshot({ Sales: [salesHeaders,sale('S1')], Assets: [['Cost'],[100]] });
  source.sheets[0].rows[1].cells[7].entered = { formulaValue: "='Assets'!A2+INDIRECT(\"A1\")" };
  source.sheets[1].rows[1].cells[0].entered = { formulaValue: '=Sales!H2' };
  const plan = buildMigrationPlan(source);
  expect(plan.summary.dependencyReviews).toBe(2);
  expect(plan.rows[0].blockers).toContain('formula_depends_on_manual_or_unknown_tab');
  expect(plan.scope[1].appDataDependencies).toEqual(['Sales']);
});

it('converts Sheets serial dates and explicit timestamps without guessing ambiguous text dates', () => {
  expect(businessDate(25569.75, 'Africa/Lagos')).toBe('1970-01-01');
  expect(businessDate('2026-10-03T23:30:00Z', 'Africa/Lagos')).toBe('2026-10-04');
  for (const value of ['04/10/2026','2026-02-30','2026-02-30T12:00:00Z',null]) expect(() => businessDate(value, 'Africa/Lagos')).toThrow();
});

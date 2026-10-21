import { describe, expect, it } from 'vitest';
import { buildOpeningPlan } from '../../scripts/migration/opening-balances.mjs';
import { buildHistoryPlan } from '../../scripts/migration/sales-history.mjs';
import { decisionsFingerprint, indexCustomers } from '../../scripts/migration/cutover-shared.mjs';

const opening = (names: string) => buildOpeningPlan({
  startDate: 'item,value\nopening_date,2026-10-25\n', credits: 'customer_name,amount_in_credit_naira\n', loans: 'who,type,amount_naira,date\n', names,
  owing: 'customer_name,amount_owed_naira,sale_date,sales_id,sheet_row\nAB,100,2026-10-01,S1,2\nA B,200,2026-10-01,S2,3\n a\u00a0\u2003B ,300,2026-10-01,S3,4\nAlias,400,2026-10-01,S4,5\n',
});
const history = (names: string) => buildHistoryPlan({ names, ignore: 'sheet_row,sales_id,payment,expected_amount_naira,reason\n', sales:
  'DATE,CLIENT NAME,AMOUNT (₦),INITIAL PAYMENT (₦),ADDITIONAL PAYMENT 1,ADDITIONAL PAYMENT 2,Sales ID\n2026-10-01,AB,100,0,,,S1\n2026-10-01,A B,200,0,,,S2\n2026-10-01, a\u00a0\u2003B ,300,0,,,S3\n2026-10-01,Alias,400,0,,,S4\n' });

describe('one cutover name rule', () => {
  for (const [label, plan] of [['opening', opening], ['history', history]] as const) {
    it(`${label}: keeps AB separate from A B, normalizes Unicode whitespace and applies explicit decisions`, () => {
      expect(plan('name_in_sheet,same_person_as\nAlias,A B\n').customers.map((c: { key: string }) => c.key).sort()).toEqual(['a b', 'ab']);
    });
    it(`${label}: refuses conflicting targets, chains and incomplete decisions`, () => {
      expect(() => plan('name_in_sheet,same_person_as\nAlias,AB\n alias ,A B\n')).toThrow(/two different/);
      expect(() => plan('name_in_sheet,same_person_as\nAlias,AB\nAB,Final\n')).toThrow(/itself renamed/);
      expect(() => plan('name_in_sheet,same_person_as\nAlias,\n')).toThrow(/both/);
      expect(plan('name_in_sheet,same_person_as\nAlias,A B\nAlias, a  b \n').customers).toHaveLength(2);
    });
  }
  it('refuses ambiguous existing identities, including an alias and its exact target', () => {
    expect(() => indexCustomers([{ id: '1', display_name: 'A B' }, { id: '2', display_name: ' a\u00a0B ' }])).toThrow(/Ambiguous/);
    expect(() => indexCustomers([{ id: '1', display_name: 'Alias' }, { id: '2', display_name: 'A B' }], [{ from: 'alias', to: 'A B' }])).toThrow(/Ambiguous/);
    expect(indexCustomers([{ id: '1', display_name: 'AB' }, { id: '2', display_name: 'A B' }]).size).toBe(2);
  });
});

describe('name decisions file safety', () => {
  it('refuses a decisions file with the wrong headers instead of silently ignoring it', () => {
    expect(() => opening('from,to\nAlias,AB\n')).toThrow(/name_in_sheet, same_person_as/);
    expect(() => history('from,to\nAlias,AB\n')).toThrow(/name_in_sheet, same_person_as/);
  });
  it('gives opening and history the same fingerprint for the same decisions, and a different one otherwise', () => {
    const names = 'name_in_sheet,same_person_as\nAlias,A B\n';
    expect(opening(names).nameDecisionsSha256).toBe(history(names).nameDecisionsSha256);
    expect(opening(names).nameDecisionsSha256).not.toBe(opening('name_in_sheet,same_person_as\nAlias,AB\n').nameDecisionsSha256);
    expect(opening('').nameDecisionsSha256).toBe(decisionsFingerprint([]));
  });
});

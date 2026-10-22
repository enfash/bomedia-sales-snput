import { describe, expect, it } from 'vitest';

import { buildOwingFile } from '../../scripts/migration/owing-file.mjs';
import { buildOpeningPlan, parseCsv } from '../../scripts/migration/opening-balances.mjs';

const SALES_HEADER = 'DATE,CLIENT NAME,JOB DESCRIPTION,CONTACT,MATERIAL,AMOUNT (₦),INITIAL PAYMENT (₦),ADDITIONAL PAYMENT 1,ADDITIONAL PAYMENT 2,PAYMENT STATUS,Sales ID\n';
const IGNORE_HEADER = 'sheet_row,sales_id,payment,expected_amount_naira,reason\n';
const NAMES = 'name_in_sheet,same_person_as\no square,Old square\n';
const sales = (...rows: string[]) => SALES_HEADER + rows.join('\n') + '\n';
const build = (rows: string[], ignore = IGNORE_HEADER) => buildOwingFile({ sales: sales(...rows), names: NAMES, ignore });

describe('opening owing file from the Sales export', () => {
  const rows = [
    '2026-09-01,Kay,[5x4ft],0803 111,Flex,₦10000.00,₦4000.00,₦1000.00,,Part-payment,BOM-1',   // owes 5,000
    '2026-09-02,o square,,,SAV,₦500.00,₦0.00,,,Unpaid,BOM-2',                                      // owes 500; raw name kept, blank description stays blank
    '2026-09-03,Paid Co,Banner,,Flex,₦800.00,₦800.00,,,Paid,BOM-3',                               // paid
    '2026-09-04,Rounding,Sticker,,SAV,₦100.99,₦100.00,,,Part-payment,BOM-4',                       // owes 0.99: left out (rounding)
    '2026-09-05,Exactly One,Sticker,,SAV,₦101.00,₦100.00,,,Part-payment,BOM-5',                    // owes exactly 1: a debt
    '2026-09-06,Over Paid,Sticker,,SAV,₦100.00,₦150.00,,,Paid,BOM-6',                              // overpaid: not a debt
  ];

  it('lists a row only when at least one naira is owed, in Sheet row order, and counts what it leaves out', () => {
    const built = build(rows);
    expect(built.debts).toBe(3);
    expect(built.total).toBe('₦5,501.00');
    expect(built.underOneNaira).toEqual([{ sheetRow: 5, owed: '₦0.99' }]);
    expect(built.overpaid).toBe(1);
    const parsed = parseCsv(built.csv);
    expect(parsed.map((r: Record<string, string>) => [r.sheet_row, r.customer_name, r.amount_owed_naira, r.amount, r.paid_so_far])).toEqual([
      ['2', 'Kay', '5000.00', '10000.00', '5000.00'], ['3', 'o square', '500.00', '500.00', '0.00'], ['6', 'Exactly One', '1.00', '101.00', '100.00']]);
    expect(parsed[0]).toMatchObject({ phone: '0803 111', job_description: '[5x4ft]', sales_id: 'BOM-1', sheet_status: 'Part-payment', sale_date: '2026-09-01' });
    expect(parsed[1].job_description).toBe('');
  });

  it('leaves out a payment the owner called a mistake, so the debt it hid comes back, and refuses a wrong Sales ID', () => {
    const mistaken = '2026-09-07,Hidden,Flex,,Flex,₦3000.00,₦0.00,₦3000.00,,Paid,BOM-7';
    const built = build([...rows, mistaken], IGNORE_HEADER + '8,BOM-7,1,3000.00,owner says this payment is a mistake\n');
    expect(built.debts).toBe(4);
    expect(built.ignored).toBe(1);
    expect(parseCsv(built.csv).at(-1)).toMatchObject({ sheet_row: '8', amount_owed_naira: '3000.00' });
    expect(() => build([...rows, mistaken], IGNORE_HEADER + '8,BOM-WRONG,1,3000.00,x\n')).toThrow(/Sales ID/);
  });

  it('feeds the opening plan with the same totals and applies the owner name decisions', () => {
    const built = build(rows);
    const plan = buildOpeningPlan({ startDate: 'item,value\nopening_date,2026-10-24\n', owing: built.csv, credits: 'customer_name,amount_in_credit_naira\n',
      loans: 'who,type,amount_naira,date\n', names: NAMES });
    expect(plan.totals).toMatchObject({ customers: 3, jobs: 3, debtsKobo: built.totalKobo });
    expect(plan.customers.map((c: { name: string }) => c.name).sort()).toEqual(['Exactly One', 'Kay', 'Old square']);
  });
});

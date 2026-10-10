import { expect,it } from 'vitest';
import { lagosBusinessDate,nairaToKobo,quotedUnitPrice } from './accounting-entry';
it('converts actual naira received without floating-point rounding or discarding one kobo',()=>{
  expect(nairaToKobo('173449.99')).toBe('17344999');expect(nairaToKobo('173000')).toBe('17300000');
  expect(nairaToKobo('0.01')).toBe('1');expect(nairaToKobo('90071992547409.93')).toBe('9007199254740993');
  for(const value of ['1.001','1e3','-1','1,000','', '92233720368547758.08'])expect(nairaToKobo(value)).toBeNull();
});
it('matches PostgreSQL positive half-up unit pricing before multiplying quantity',()=>{
  expect(quotedUnitPrice('2','3','10000')).toBe('60000');
  expect(quotedUnitPrice('0.5','1','1')).toBe('1');
  expect(quotedUnitPrice('0.499999','1','1')).toBeNull();
  expect(quotedUnitPrice('2.0000001','3','10000')).toBeNull();
  expect(quotedUnitPrice('0','3','10000')).toBeNull();
});
it('uses the Lagos business day around UTC midnight',()=>{
  expect(lagosBusinessDate(new Date('2026-10-04T23:01:00Z'))).toBe('2026-10-05');
});

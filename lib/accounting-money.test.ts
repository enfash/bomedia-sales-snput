import {expect,it} from 'vitest';
import {describeKoboBalance,formatKobo,hasOutstandingKobo,collectableKobo,parseKobo} from './accounting-money';
it('displays every unpaid kobo and the exact stated underpayment examples',()=>{
  expect(describeKoboBalance('1')).toMatchObject({tone:'debt',label:'₦0.01'});
  expect(hasOutstandingKobo('1')).toBe(true);expect(collectableKobo('1')).toBe('1');
  expect(formatKobo('44999')).toBe('₦449.99');expect(formatKobo('35999')).toBe('₦359.99');
});
it('formats beyond JavaScript safe integers without floating point conversion',()=>{
  expect(formatKobo('9007199254740993')).toBe('₦90,071,992,547,409.93');
});
it('keeps zero and customer credit distinct without offsetting unrelated debt',()=>{
  expect(describeKoboBalance('0')).toMatchObject({tone:'settled',label:'₦0.00'});
  expect(describeKoboBalance('-1')).toMatchObject({tone:'credit',label:'₦0.01 credit'});
  expect(collectableKobo('-100')).toBe('0');expect(hasOutstandingKobo('-1')).toBe(false);
});
it.each(['1.5','NaN','1e3','01',''])('rejects noncanonical integer amounts: %s',value=>expect(()=>parseKobo(value)).toThrow());

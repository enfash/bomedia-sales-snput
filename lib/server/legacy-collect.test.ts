import { expect,it } from 'vitest';
import { jobRef,legacyBatchPayment } from './legacy-collect';
const batch=(extra:Record<string,unknown>={})=>({transactionId:'t-1',clientName:'Grace Chapel',lumpSum:15000,paymentMethod:'Cash',notes:'Auto-distributed lump sum',
  steps:[{rowIndex:4,salesId:'S-1001',toApply:10000},{rowIndex:9,salesId:'',toApply:5000}],...extra});
it('names a job by Sales ID, else by row number',()=>{
  expect(jobRef('S-1',3)).toBe('S-1');expect(jobRef('',3)).toBe('3');expect(jobRef(undefined,'12')).toBe('12');expect(jobRef('',0.5)).toBe('');
});
it('turns the debtor box batch into one payment by method',()=>{
  expect(legacyBatchPayment(batch())).toEqual({requestId:'t-1',refs:['S-1001','9'],amountKobo:'1500000',method:'cash',notes:'Auto-distributed lump sum'});
});
it('refuses a batch without a method, an ID, jobs or an amount',()=>{
  expect(()=>legacyBatchPayment(batch({paymentMethod:undefined}))).toThrow(/how the customer paid/);
  expect(()=>legacyBatchPayment(batch({transactionId:''}))).toThrow(/request ID/);
  expect(()=>legacyBatchPayment(batch({steps:[]}))).toThrow(/No unpaid jobs/);
  expect(()=>legacyBatchPayment(batch({lumpSum:0}))).toThrow(/amount/);
  expect(()=>legacyBatchPayment(batch({steps:[{toApply:5}]}))).toThrow(/still syncing/);
});

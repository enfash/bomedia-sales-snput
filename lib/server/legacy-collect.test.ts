import { expect,it } from 'vitest';
import { jobRef,legacyBatchPayment } from './legacy-collect';
import { paymentKobo } from '../payment-contract';
const id='00000000-0000-4000-8000-000000000001';
const payment={version:2,backend:'postgres',requestId:id,expectedStaffId:id,businessDate:'2026-10-07',jobIds:[id],amountKobo:'1500000',paymentMethod:'cash'};
it('retains row references only for the legacy status path',()=>{
  expect(jobRef('BOM-20261007-0001',3)).toBe('3');expect(jobRef('BOM-20261007-0001',undefined)).toBe('BOM-20261007-0001');
});
it('keeps exact payment data and refuses old or incomplete queued payments',()=>{
  expect(legacyBatchPayment(payment)).toEqual(payment);
  for(const patch of [{businessDate:undefined},{expectedStaffId:undefined},{jobIds:['4']},{amountKobo:'1.1'},{paymentMethod:''},{version:1},{backend:'sheets'},{businessDate:'2026-02-30'}]) {
    expect(()=>legacyBatchPayment({...payment,...patch})).toThrow(/review/);
  }
  expect(()=>legacyBatchPayment({transactionId:'old',steps:[{rowIndex:4}],lumpSum:20})).toThrow(/review/);
});
it('converts typed money exactly and refuses rounding away input precision',()=>{
  expect(paymentKobo('173,449.99')).toBe('17344999');expect(paymentKobo('0.01')).toBe('1');
  expect(()=>paymentKobo('1.001')).toThrow();expect(()=>paymentKobo('0')).toThrow();
});

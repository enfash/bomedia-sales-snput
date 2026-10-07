import { expect,it } from 'vitest';
import { customerIdOf,paymentHref } from './payment-handoff';
const id='00000000-0000-4000-8000-000000000001';
it('opens the Payment tab in the same area, with the customer only when it is a real ID',()=>{
  expect(paymentHref('/bom03/records',id)).toBe(`/bom03/accounting?tab=payments&customer=${id}`);
  expect(paymentHref('/cashier',null)).toBe('/cashier/accounting?tab=payments');
  expect(paymentHref('/cashier','S-1001')).toBe('/cashier/accounting?tab=payments');
});
it('names a customer only when every row agrees',()=>{
  expect(customerIdOf([{_customerId:id},{_customerId:id}])).toBe(id);
  expect(customerIdOf([{_customerId:id},{_customerId:'other'}])).toBeNull();
  expect(customerIdOf([{'CLIENT NAME':'Old sheet row'}])).toBeNull();
});

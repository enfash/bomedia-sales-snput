import { expect, it } from 'vitest';
import { koboToAmountText, serviceAmountKobo } from './service-pricing';
import { quoteCart } from './order-cart';
import { orderTotal } from './order-contract';

it('keeps typed amounts exact and rejects empty, zero, negative and fractional-kobo charges', () => {
  expect(serviceAmountKobo('1500.25')).toBe('150025');
  expect(serviceAmountKobo('0.01')).toBe('1');
  for (const value of ['', '0', '-1', '1.001', 'NaN', '1e3', '100000000000000']) {
    expect(serviceAmountKobo(value)).toBeNull();
  }
});

it('loads the exact quoted charge for a service with no catalog price', () => {
  const id='00000000-0000-4000-8000-000000000001';
  const rows=quoteCart({found:true,estimate_id:id,quote_number:'QT-00001',client_name:'Customer',total_kobo:'300050',
    items:[{service_id:id,description:'Delivery',quantity:'2',unit_price_kobo:'150025'}]},
    {customers:[],materials:[],services:[{id,name:'Delivery',pricing:'variable',priceKobo:null}]});
  expect(rows[0].orderItem?.priceKobo).toBe('150025');
  expect(orderTotal(rows.map(row=>row.orderItem!))).toBe('300050');
});

it('turns kobo back into the text the amount box takes, so an edited service shows what was typed', () => {
  expect(koboToAmountText('150000')).toBe('1500');
  expect(koboToAmountText('150050')).toBe('1500.50');
  expect(koboToAmountText('5')).toBe('0.05');
  expect(koboToAmountText('')).toBe('');
  expect(serviceAmountKobo(koboToAmountText('150025'))).toBe('150025');
});

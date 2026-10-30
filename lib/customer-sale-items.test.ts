import { describe, expect, it } from 'vitest';
import { inSheetOrder, itemCount, plainDescription, recordSaleItem, saleItem } from './customer-sale-items';

const opening = (text: string, kobo: string) => ({ description: text, amount_kobo: kobo });

describe('an order item in plain words', () => {
  it('drops the Sheet row, the sales ID and the sold date from an opening debt, and reads the size from the brackets', () => {
    expect(saleItem(opening('Opening balance from Sheet row 3833: SAV print job [5x2.5ft] (BOM-20261024-6171, sold 2026-10-24)', '250000')))
      .toEqual({ name: 'SAV print job', size: '5 × 2.5 ft', amount: '₦2,500' });
    expect(saleItem(opening('Opening balance from Sheet row 3836: SAV print job [4.2x4.2in] (BOM-20261024-1003, sold 2026-10-24)', '490000')))
      .toEqual({ name: 'SAV print job', size: '4.2 × 4.2 in', amount: '₦4,900' });
    expect(saleItem(opening('Opening balance from Sheet row 3817: Flex print job [16x8ft] (BOM-20261023-8568, sold 2026-10-23)', '3317111')).amount).toBe('₦33,171.11');
  });

  it('takes the size of a new sale from its width and height, and shows how many pieces when more than one', () => {
    expect(saleItem({ description: 'Banner', quantity: '2', width_ft: '8.00', height_ft: '4', amount_kobo: '960000' }))
      .toEqual({ name: 'Banner', size: '8 × 4 ft · 2 pieces', amount: '₦9,600' });
    expect(saleItem({ description: 'Delivery', quantity: '1', amount_kobo: '150000' })).toEqual({ name: 'Delivery', size: '', amount: '₦1,500' });
  });

  it('gives Records and invoices the same readable details from the legacy feed fields', () => {
    expect(recordSaleItem({ description: 'Flex print job', amount: 10800, raw: { custom: '3x4', QTY: '2' } }))
      .toEqual({ name: 'Flex print job', size: '3 × 4 ft · 2 pieces', amount: '₦10,800' });
    expect(recordSaleItem({ description: 'Delivery', amount: 1500, raw: { QTY: '1' } }))
      .toEqual({ name: 'Delivery', size: '', amount: '₦1,500' });
  });

  it('leaves unfamiliar wording as it was typed, and never returns an empty name', () => {
    expect(saleItem(opening('Opening balance from Sheet row 7: Poster [A1 size]', '100'))).toMatchObject({ name: 'Poster', size: 'A1 size' });
    expect(plainDescription('Opening balance from Sheet row 7:')).toBe('Opening balance from Sheet row 7:');
    expect(saleItem(opening('Flyers', '100'))).toMatchObject({ name: 'Flyers', size: '' });
  });

  it('puts opening debts back in the Sheet row order, and leaves new sales as they were made', () => {
    const rows = [3834, 3832, 3833].map((n) => opening(`Opening balance from Sheet row ${n}: SAV print job [1x1ft]`, '100'));
    expect(inSheetOrder(rows).map((i) => i.description.match(/row (\d+)/)![1])).toEqual(['3832', '3833', '3834']);
    const sale = [{ description: 'Poster', amount_kobo: '1' }, { description: 'Banner', amount_kobo: '1' }];
    expect(inSheetOrder(sale)).toEqual(sale);
  });

  it('counts items in words', () => { expect(itemCount(1)).toBe('1 item'); expect(itemCount(12)).toBe('12 items'); });
});

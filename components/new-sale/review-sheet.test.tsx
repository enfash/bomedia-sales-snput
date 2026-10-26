import React, { type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
vi.mock('@/components/responsive-sheet',()=>({ResponsiveSheet:({children,footer}:{children:ReactNode;footer:ReactNode})=><section>{children}{footer}</section>}));
import { ReviewSheet } from './review-sheet';

const render=(amount:string,method:'transfer'|'',total='302323000')=>renderToStaticMarkup(<ReviewSheet open onClose={()=>{}} saving={false}
  meta={{clientName:'Synthetic customer',contact:'08031112222',date:'2026-10-26',initialPayment:amount,jobStatus:'Delivered'}}
  cart={[]} grandTotal={Number(total)/100} totalKobo={total} balance={Number(total)/100-Number(amount)} paymentStatus="Paid"
  stages={['Delivered']} onStage={()=>{}} onPaid={()=>{}} onContact={()=>{}} paidBy={method} onPaidBy={()=>{}} changes={[]} onSave={()=>{}} />);

it('updates the split and save eligibility when the payment is edited on the review sheet',()=>{
  const exact=render('3023230','transfer');
  expect(exact).toContain('Balance left ₦0.00');
  const excess=render('3024000','transfer');
  expect(excess).toContain('₦770.00 extra income (non-refundable)');
  expect(excess.match(/<button[^>]*>Save sale<\/button>/)?.[0]).not.toContain('disabled');
  expect(excess).toContain('Save sale');
  const missingMethod=render('3024000','');
  expect(missingMethod).toContain('Choose how the customer paid');
  expect(missingMethod).toMatch(/<button[^>]*disabled[^>]*>Save sale<\/button>/);
  expect(render('1.001','transfer','100')).toContain('nearest kobo');
});

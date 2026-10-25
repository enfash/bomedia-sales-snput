import { expect,it } from 'vitest';
import { legacySalePayload,nairaToKoboText } from './legacy-sale';
const actor='00000000-0000-4000-8000-000000000001';
const row=(price:unknown,paid:unknown)=>['2026-10-07','Grace Chapel','Banner [8x4ft]','0803','Flex',price,'','','','','','','=(8*4)','',2,'',paid,'','','','','','Printing','Ada',''];
const queued=(extra:Record<string,unknown>={})=>({batch:true,transactionId:'q-1',items:[{values:row(150,5000),jobDescription:'Banner',qty:2,materialId:'MAT-FLEX',jobWidth:'8',jobHeight:'4',dimUnit:'ft'},
  {values:row('120.5',0),jobDescription:'Sticker',qty:1,materialId:'MAT-SAV',jobWidth:'24',jobHeight:'12',dimUnit:'in'}],paymentMethod:'Transfer',...extra});
it('converts naira as typed to whole kobo',()=>{
  expect(nairaToKoboText(150)).toBe('15000');expect(nairaToKoboText('1,200.5')).toBe('120050');expect(nairaToKoboText('₦0')).toBe('0');
  expect(nairaToKoboText('abc')).toBeNull();expect(nairaToKoboText(-5)).toBeNull();expect(nairaToKoboText('1.234')).toBeNull();
});
it('turns the old queued batch into one sale with a payment method',()=>{
  expect(legacySalePayload(queued(),actor)).toEqual({requestId:'q-1',payload:{actor_id:actor,business_date:'2026-10-07',client_name:'Grace Chapel',contact:'0803',
    job_status:'Printing',initial_payment_kobo:'500000',payment_method:'transfer',items:[
      {material_ref:'MAT-FLEX',quantity:'2',width:'8',height:'4',unit:'ft',price_per_sqft_kobo:'15000',description:'Banner [8x4ft]'},
      {material_ref:'MAT-SAV',quantity:'1',width:'24',height:'12',unit:'in',price_per_sqft_kobo:'12050',description:'Sticker [24x12in]'}]}});
});
it('refuses money without a method, and unreadable batches',()=>{
  expect(()=>legacySalePayload(queued({paymentMethod:undefined}),actor)).toThrow(/how the customer paid/);
  expect(()=>legacySalePayload(queued({transactionId:''}),actor)).toThrow(/request ID/);
  expect(()=>legacySalePayload({...queued(),items:[]},actor)).toThrow(/at least one job/);
});

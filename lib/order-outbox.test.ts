import { expect, it, vi } from 'vitest';
import { deliverOrder, persistOrder, readOrders, ORDER_HELD, ORDER_PREFIX } from './order-outbox';
import { confirmedOrder, heldOrder, orderContract, orderItemTotal, type ScreenOrder } from './order-contract';
import type { OutboxStorage } from './payment-outbox';
class MemoryStorage implements OutboxStorage {
  data=new Map<string,string>();
  get length(){return this.data.size;}
  key(i:number){return [...this.data.keys()][i]??null;}
  getItem(k:string){return this.data.get(k)??null;}
  setItem(k:string,v:string){this.data.set(k,v);}
  removeItem(k:string){this.data.delete(k);}
}
const id='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const context={backend:'postgres' as const,staffId:id};
const order=():ScreenOrder=>({version:3,backend:'postgres',operation:'sale',requestId:id,expectedStaffId:id,businessDate:'2026-10-08',clientName:'Ada',contact:'0803',jobStatus:'Quoted',initialPaymentKobo:'99',paymentMethod:'pos',totalKobo:'100',items:[{kind:'service',ref:id,description:'Design',quantity:'1',priceKobo:'100'}]});
const result=()=>({request_id:id,actor_id:id,business_date:'2026-10-08',total_kobo:'100',initial_payment_kobo:'99',order_id:id,sales_id:'BOM-20261008-10000',job_ids:[id],journal_entry_ids:[id],initial_payment:{payment_id:id,journal_entry_id:id}});
it('retains excess payments through a lost response and requires confirmation of the full amount and income split',async()=>{
 const storage=new MemoryStorage(),extra={...order(),initialPaymentKobo:'101'},saved=persistOrder(storage,extra);
 const receipt={...result(),initial_payment_kobo:'101',initial_payment:{payment_id:id,journal_entry_id:id,amount_kobo:'101',extra_income_kobo:'1'}};
 const send=vi.fn<typeof fetch>().mockRejectedValueOnce(new Error('lost response')).mockResolvedValueOnce(Response.json({...receipt,initial_payment:{...receipt.initial_payment,extra_income_kobo:'0'}})).mockResolvedValueOnce(Response.json(receipt));
 expect(await deliverOrder(storage,saved,context,send)).toBeNull();
 expect(await deliverOrder(storage,readOrders(storage)[0],context,send)).toBeNull();
 expect(readOrders(storage)).toHaveLength(1);
 expect(await deliverOrder(storage,readOrders(storage)[0],context,send)).toEqual(receipt);
 expect(new Set(send.mock.calls.map(call=>call[1]?.body)).size).toBe(1);
 expect(readOrders(storage)).toEqual([]);
});
it('stores before sending and retries exactly the original payload after a lost confirmation and midnight restart',async()=>{
 const storage=new MemoryStorage(),saved=persistOrder(storage,order());
 const send=vi.fn<typeof fetch>().mockImplementationOnce(async()=>{expect(readOrders(storage)).toHaveLength(1);throw new Error('lost confirmation');}).mockImplementationOnce(async()=>Response.json(result()));
 expect(await deliverOrder(storage,saved,context,send)).toBeNull();
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-09T01:00:00Z'));
 try {expect(await deliverOrder(storage,readOrders(storage)[0],context,send)).toEqual(result());}finally{vi.useRealTimers();}
 expect(send.mock.calls[0][1]?.body).toBe(send.mock.calls[1][1]?.body);expect(readOrders(storage)).toEqual([]);
});
it('repeated saves reuse a pending request and quote conversion cannot be queued twice',()=>{
 const storage=new MemoryStorage(),saved=persistOrder(storage,order());
 expect(persistOrder(storage,order())).toEqual(saved);
 const second=persistOrder(storage,{...order(),requestId:other});
 expect(second.order.requestId).toBe(other);expect(readOrders(storage)).toHaveLength(2);
 expect(()=>persistOrder(storage,{...order(),contact:'changed'})).toThrow(/different values/);
 const quoted=new MemoryStorage();persistOrder(quoted,{...order(),quoteId:id});
 expect(()=>persistOrder(quoted,{...order(),requestId:other,quoteId:id,initialPaymentKobo:'0'})).toThrow(/already pending/);
});
it('never sends an unpersisted order and preserves storage failures and corrupt entries',async()=>{
 const storage=new MemoryStorage(),send=vi.fn();
 await expect(deliverOrder(storage,{order:order(),state:'pending'},context,send)).rejects.toThrow(/saved order changed/);
 storage.setItem(ORDER_PREFIX+id,'{broken');expect(()=>persistOrder(storage,order())).toThrow(/preserved/);
 expect(storage.getItem(ORDER_PREFIX+id)).toBe('{broken');
 const full=new MemoryStorage();full.setItem=()=>{throw new Error('full');};expect(()=>persistOrder(full,order())).toThrow('full');expect(send).not.toHaveBeenCalled();
});
it('holds the originating backend and staff identity; auth and business refusals remain available for review',async()=>{
 const storage=new MemoryStorage(),saved=persistOrder(storage,order()),send=vi.fn();
 await deliverOrder(storage,saved,{backend:'sheets'},send);expect(readOrders(storage)[0].state).toBe('review');
 await deliverOrder(storage,saved,{...context,staffId:other},send);expect(readOrders(storage)[0].state).toBe('auth');expect(send).not.toHaveBeenCalled();
 for(const [status,state] of [[401,'auth'],[403,'auth'],[409,'review'],[429,'pending'],[503,'pending']] as const){
   send.mockResolvedValueOnce(Response.json({error:'Held'},{status}));await deliverOrder(storage,saved,context,send);expect(readOrders(storage)[0].state).toBe(state);
 }
});
it('only removes entries after complete matching confirmations, including the saved payment identity',async()=>{
 for(const change of [{request_id:other},{actor_id:other},{business_date:'2026-10-09'},{total_kobo:'101'},{initial_payment_kobo:'100'},{job_ids:[]},{initial_payment:null},{sales_id:'unknown'}]){
  const storage=new MemoryStorage(),saved=persistOrder(storage,order());
  expect(await deliverOrder(storage,saved,context,vi.fn().mockResolvedValue(Response.json({...result(),...change})))).toBeNull();expect(readOrders(storage)).toHaveLength(1);
 }
 expect(confirmedOrder({...result(),estimate_id:id,quote_number:'QT-100000',initial_payment_kobo:'0'},{...order(),operation:'quote',initialPaymentKobo:'0'})).toBe(true);
});
it('rounds inch dimensions per piece in exact kobo and rejects missing method and fractional quantities',()=>{
 expect(orderItemTotal({kind:'print',ref:'Flex',description:'Print',width:'26',height:'26',unit:'in',quantity:'3',priceKobo:'15000'})).toBe('211251');
 for(const change of [{paymentMethod:undefined},{totalKobo:'101'},{items:[{...order().items[0],quantity:'1.5'}]}])expect(()=>orderContract({...order(),...change})).toThrow();
});
it('confirms a free service with a business record and no payment or journal, and permits extra income but refuses free print',()=>{
 const free={...order(),initialPaymentKobo:'0',totalKobo:'0',items:[{...order().items[0],priceKobo:'0'}]};
 expect(orderContract(free)).toEqual(free);
 expect(confirmedOrder({...result(),total_kobo:'0',initial_payment_kobo:'0',initial_payment:null,journal_entry_ids:[]},free)).toBe(true);
 expect(orderContract({...free,initialPaymentKobo:'1'}).initialPaymentKobo).toBe('1');
 expect(()=>orderContract({...free,items:[{kind:'print',ref:'Flex',description:'Not free',quantity:'1',width:'2',height:'3',unit:'ft',priceKobo:'0'}]})).toThrow();
});
it('hands a held sale to the server, clears the device queue and keeps a note of what happened',async()=>{
 const storage=new MemoryStorage(),saved=persistOrder(storage,order());
 const held={status:'awaiting_approval',approval_request_id:id,kinds:['date'],request_id:id};
 const out=await deliverOrder(storage,saved,context,vi.fn<typeof fetch>().mockResolvedValue(Response.json(held)));
 expect(out).toMatchObject({held:true,status:'awaiting_approval'});
 expect(readOrders(storage)).toEqual([]);
 expect(JSON.parse(storage.getItem(ORDER_HELD)!)).toMatchObject({staffId:id,status:'awaiting_approval',kinds:['date']});
 expect(heldOrder({status:'posted'})).toBeNull();
 expect(heldOrder({status:'declined',approval_request_id:id,decision_note:'No'})).toMatchObject({status:'declined',decision_note:'No'});
});

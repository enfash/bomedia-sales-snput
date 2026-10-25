import { expect,it,vi } from 'vitest';
import { createPaymentMethodSettings } from './payment-method-settings';
const actor={staffId:'00000000-0000-4000-8000-000000000001'} as never;
const make=(impl=async()=>({method:'cash',changed:[]}))=>{const call=vi.fn(impl) as never;return {call,service:createPaymentMethodSettings(call)};};
const good={requestId:'r1',method:'transfer',label:' Bank transfer ',enabled:true};
it('trims the name and sends the actor',async()=>{
  const {call,service}=make();
  await service.save(actor,good);
  expect(call).toHaveBeenCalledWith('api_payment_method_save','r1',{actor_id:'00000000-0000-4000-8000-000000000001',method:'transfer',label:'Bank transfer',enabled:true});
});
it.each([[{method:'cheque'}],[{label:'  '}],[{label:'x'.repeat(41)}],[{enabled:'yes'}],[{requestId:''}],[{extra:1}]])('refuses %j before the database',async(change)=>{
  const {call,service}=make();
  await expect(service.save(actor,{...good,...change})).rejects.toMatchObject({status:400});
  expect(call).not.toHaveBeenCalled();
});
it('turns database rejections into readable errors',async()=>{
  const code=(c:string)=>make(async()=>{throw Object.assign(new Error('x'),{code:c});}).service.save(actor,good);
  await expect(code('42501')).rejects.toMatchObject({status:403});
  await expect(code('23505')).rejects.toMatchObject({status:409,message:expect.stringMatching(/already uses/)});
  await expect(code('23514')).rejects.toMatchObject({status:409,message:expect.stringMatching(/at least one/i)});
});

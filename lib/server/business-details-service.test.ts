import { expect,it,vi } from 'vitest';
import { createBusinessDetailsService } from './business-details-service';
const actor={staffId:'00000000-0000-4000-8000-000000000001'} as never;
const good={requestId:'r1',accountName:' Broad Options Media ',accountNumber:'5236650819',bank:'Moniepoint MFB',phone:'+234 802 224 7567',email:'info@bomedia.com.ng',address:'65, New Ipaja Road, Lagos.'};
const make=(impl=async()=>({changed:[]}))=>{const call=vi.fn(impl) as never;return {call,service:createBusinessDetailsService(call)};};
it('trims, maps to snake_case and sends the actor with the request id',async()=>{
  const {call,service}=make();
  await service.save(actor,good);
  expect(call).toHaveBeenCalledWith('api_business_details_save','r1',{actor_id:'00000000-0000-4000-8000-000000000001',account_name:'Broad Options Media',account_number:'5236650819',bank:'Moniepoint MFB',phone:'+234 802 224 7567',email:'info@bomedia.com.ng',address:'65, New Ipaja Road, Lagos.'});
});
it.each([
  [{accountNumber:'12345'},/10 digits/],
  [{accountNumber:'12345678ab'},/10 digits/],
  [{phone:'abc'},/phone number/],
  [{phone:'123'},/phone number/],
  [{email:'nope'},/valid email/],
  [{bank:''},/Bank is required/],
  [{address:'x'.repeat(301)},/too long/],
  [{requestId:''},/Request ID/],
])('refuses %j before touching the database',async(change,message)=>{
  const {call,service}=make();
  await expect(service.save(actor,{...good,...change})).rejects.toMatchObject({status:400,message:expect.stringMatching(message)});
  expect(call).not.toHaveBeenCalled();
});
it('refuses unknown fields and a missing actor',async()=>{
  const {service}=make();
  await expect(service.save(actor,{...good,role:'admin'})).rejects.toMatchObject({status:400});
  await expect(service.save({staffId:'nope'} as never,good)).rejects.toMatchObject({status:403});
});
it('turns database rejections into readable errors',async()=>{
  const disabled=make(async()=>{throw Object.assign(new Error('x'),{code:'42501'});});
  await expect(disabled.service.save(actor,good)).rejects.toMatchObject({status:403,code:'ACTOR_DISABLED'});
  const review=make(async()=>{throw Object.assign(new Error('x'),{code:'23514'});});
  await expect(review.service.save(actor,good)).rejects.toMatchObject({status:409,code:'BUSINESS_DETAILS_REVIEW_REQUIRED'});
});

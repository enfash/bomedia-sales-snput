import { expect,it,vi } from 'vitest';
import { createExpenseCategorySettings } from './expense-category-settings';
const actor={staffId:'00000000-0000-4000-8000-000000000001'} as never;
const make=(impl=async()=>({name:'Packaging',changed:['added']}))=>{const call=vi.fn(impl) as never;return {call,service:createExpenseCategorySettings(call)};};
const add={requestId:'r1',action:'add',name:' Packaging ',kind:'everyday'};
const toggle={requestId:'r2',action:'set_enabled',name:'Ink',enabled:false};
it('trims the name and sends the actor when adding',async()=>{
  const {call,service}=make();
  await service.save(actor,add);
  expect(call).toHaveBeenCalledWith('api_expense_category_save','r1',{actor_id:'00000000-0000-4000-8000-000000000001',action:'add',name:'Packaging',kind:'everyday'});
});
it('sends only the on/off choice when toggling',async()=>{
  const {call,service}=make();
  await service.save(actor,toggle);
  expect(call).toHaveBeenCalledWith('api_expense_category_save','r2',{actor_id:'00000000-0000-4000-8000-000000000001',action:'set_enabled',name:'Ink',enabled:false});
});
it.each([
  [add,{kind:'other'}],[add,{kind:undefined}],[add,{name:'  '}],[add,{name:'x'.repeat(101)}],[add,{enabled:true}],[add,{requestId:''}],[add,{extra:1}],[add,{action:'rename'}],
  [toggle,{enabled:'no'}],[toggle,{enabled:undefined}],[toggle,{kind:'capital'}],
])('refuses %j with %j before the database',async(base,change)=>{
  const {call,service}=make();
  await expect(service.save(actor,{...base,...change})).rejects.toMatchObject({status:400});
  expect(call).not.toHaveBeenCalled();
});
it('turns database rejections into readable errors',async()=>{
  const code=(c:string)=>make(async()=>{throw Object.assign(new Error('x'),{code:c});}).service.save(actor,add);
  await expect(code('42501')).rejects.toMatchObject({status:403});
  await expect(code('23505')).rejects.toMatchObject({status:409,message:expect.stringMatching(/already uses/)});
  await expect(code('23514')).rejects.toMatchObject({status:409,message:expect.stringMatching(/at least one/i)});
  await expect(code('22023')).rejects.toMatchObject({status:409});
});
const staffA='00000000-0000-4000-8000-0000000000aa',staffB='00000000-0000-4000-8000-0000000000bb';
it('passes who can log a category when adding and when changing it later',async()=>{
  const {call,service}=make();
  const me='00000000-0000-4000-8000-000000000001';
  await service.save(actor,{...add,access:'owner'});
  expect(call).toHaveBeenLastCalledWith('api_expense_category_save','r1',{actor_id:me,action:'add',name:'Packaging',kind:'everyday',access:'owner'});
  await service.save(actor,{requestId:'r3',action:'set_access',name:'Ink',access:'chosen',staffIds:[staffA.toUpperCase(),staffB,staffA]});
  expect(call).toHaveBeenLastCalledWith('api_expense_category_save','r3',{actor_id:me,action:'set_access',name:'Ink',access:'chosen',staff_ids:[staffA,staffB]});
  await service.save(actor,{requestId:'r4',action:'set_access',name:'Ink',access:'everyone',staffIds:[]});
  expect(call).toHaveBeenLastCalledWith('api_expense_category_save','r4',{actor_id:me,action:'set_access',name:'Ink',access:'everyone'});
});
it.each([
  [{...add,access:'sometimes'}],[{...add,access:'chosen'}],[{...add,access:'chosen',staffIds:[]}],[{...add,access:'chosen',staffIds:['nope']}],
  [{...add,access:'owner',staffIds:[staffA]}],[{...add,staffIds:[staffA]}],
  [{requestId:'r',action:'set_access',name:'Ink'}],[{requestId:'r',action:'set_access',name:'Ink',access:'owner',kind:'capital'}],[{...toggle,access:'owner'}],
])('refuses the bad access request %j',async(body)=>{
  const {call,service}=make();
  await expect(service.save(actor,body)).rejects.toMatchObject({status:400});
  expect(call).not.toHaveBeenCalled();
});

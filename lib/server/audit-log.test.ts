import { expect,it,vi } from 'vitest';
import { createAuditLog,sinceFor } from './audit-log';
const id='00000000-0000-4000-8000-000000000001';
const now=new Date('2026-10-10T16:30:00Z'); // 5:30 pm in Lagos
const make=(impl=async()=>({data:[],next_before:null,people:[]}))=>{const call=vi.fn(impl) as never;return {call,service:createAuditLog(call,()=>now)};};
it('starts "today" at midnight in Lagos and defaults to the last 7 days',()=>{
  expect(sinceFor('today',now)).toBe('2026-10-09T23:00:00.000Z');
  expect(sinceFor('today',new Date('2026-10-10T23:30:00Z'))).toBe('2026-10-10T23:00:00.000Z');
  expect(sinceFor('7d',now)).toBe('2026-10-03T16:30:00.000Z');
  expect(sinceFor('30d',now)).toBe('2026-09-10T16:30:00.000Z');
  expect(sinceFor('all',now)).toBeNull();
});
it('sends validated filters and a 50 entry page',async()=>{
  const {call,service}=make();
  await service.list({category:'staff',staffId:id.toUpperCase(),range:'30d',beforeAt:'2026-10-09T10:00:00Z',beforeId:id});
  expect(call).toHaveBeenCalledWith('api_audit_log','',{limit:50,category:'staff',staff_id:id,since:'2026-09-10T16:30:00.000Z',before_at:'2026-10-09T10:00:00Z',before_id:id});
  await service.list({});
  expect(call).toHaveBeenLastCalledWith('api_audit_log','',{limit:50,since:'2026-10-03T16:30:00.000Z'});
});
it.each([[{category:'all'}],[{staffId:'not-a-uuid'}],[{range:'year'}],[{beforeAt:'2026-10-09T10:00:00Z'}],[{beforeAt:'nope',beforeId:id}],[{beforeAt:'2026-10-09T10:00:00Z',beforeId:'x'}],[{sort:'asc'}]])('refuses %j before the database',async(input)=>{
  const {call,service}=make();
  await expect(service.list(input)).rejects.toMatchObject({status:400});
  expect(call).not.toHaveBeenCalled();
});
it('turns database rejections into a readable error and passes others through',async()=>{
  await expect(make(async()=>{throw Object.assign(new Error('x'),{code:'22007'});}).service.list({})).rejects.toMatchObject({status:400});
  await expect(make(async()=>{throw new Error('down');}).service.list({})).rejects.toThrow('down');
});

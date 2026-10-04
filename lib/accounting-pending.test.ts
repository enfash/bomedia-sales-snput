import { beforeEach,expect,it,vi } from 'vitest';
import { readPendingAccounting,sendAccountingEntry,type PendingAccountingEntry,type PendingStorage } from './accounting-pending';
let values:Map<string,string>,storage:PendingStorage;
const entry:PendingAccountingEntry={version:1,staffId:'staff-one',operation:'payments',requestId:'request-one',summary:'Synthetic collection',payload:{method:'pos',amountKobo:'17300000'}};
beforeEach(()=>{values=new Map();storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,value);},removeItem:key=>{values.delete(key);}};});
it('persists before sending and retains method, amount, actor and request ID after a lost response',async()=>{
  const send=vi.fn(async()=>{expect(readPendingAccounting(storage,entry.staffId)).toEqual(entry);throw new Error('Connection lost');});
  await expect(sendAccountingEntry(storage,entry,send)).rejects.toThrow('Connection lost');
  expect(readPendingAccounting(storage,entry.staffId)).toEqual(entry);
  const retry=vi.fn(async()=>Response.json({success:true,payment_id:'receipt-one'}));
  await sendAccountingEntry(storage,readPendingAccounting(storage,entry.staffId)!,retry);
  expect(retry.mock.calls).toHaveLength(1);
  expect(JSON.parse((retry.mock.calls as unknown as [string,RequestInit][])[0][1].body as string)).toEqual({method:'pos',amountKobo:'17300000',requestId:'request-one',expectedStaffId:'staff-one'});
  expect(readPendingAccounting(storage,entry.staffId)).toBeNull();
});
it.each([401,403,409,503])('keeps the saved request after status %s for reauthentication or review',async status=>{
  await expect(sendAccountingEntry(storage,entry,async()=>Response.json({error:'Review required'},{status}))).rejects.toThrow('Review required');
  expect(readPendingAccounting(storage,entry.staffId)).toEqual(entry);
});
it('does not submit a replacement payload over an unresolved entry, even from another tab',async()=>{
  await expect(sendAccountingEntry(storage,entry,async()=>{throw Error('Lost');})).rejects.toThrow();
  const send=vi.fn();await expect(sendAccountingEntry(storage,{...entry,payload:{...entry.payload,method:'cash'}},send)).rejects.toThrow('Finish the saved entry');
  expect(send).not.toHaveBeenCalled();expect(readPendingAccounting(storage,entry.staffId)).toEqual(entry);
  expect(readPendingAccounting(storage,'another-staff')).toBeNull();
});
it('refuses dispatch when local persistence fails and preserves entries after malformed confirmations',async()=>{
  const send=vi.fn();const unavailable={...storage,setItem:()=>{throw Error('Storage full');}};
  await expect(sendAccountingEntry(unavailable,entry,send)).rejects.toThrow('Storage full');expect(send).not.toHaveBeenCalled();
  await expect(sendAccountingEntry(storage,entry,async()=>Response.json({success:true}))).rejects.toThrow('Confirmation was incomplete');
  expect(readPendingAccounting(storage,entry.staffId)).toEqual(entry);
});

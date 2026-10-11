import { expect,it,vi } from 'vitest';
import { persistExpense,deliverExpense,readExpenses,EXPENSE_PREFIX } from './expense-outbox';
import { expenseContract,type ExpenseRequest } from './expense-contract';
class Store {
 data=new Map<string,string>();get length(){return this.data.size;}key(i:number){return [...this.data.keys()][i]??null;}getItem(k:string){return this.data.get(k)??null;}setItem(k:string,v:string){this.data.set(k,v);}removeItem(k:string){this.data.delete(k);}
}
const id='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const context={backend:'postgres' as const,staffId:id};
const request=():ExpenseRequest=>({version:1,backend:'postgres',requestId:id,expectedStaffId:id,operation:'log',items:[{businessDate:'2026-10-08',amountKobo:'123451',category:'Transport',description:'Test',paidTo:'Vendor',status:'paid',paymentMethod:'pos'}]});
const result=()=>({request_id:id,actor_id:id,operation:'log',expenses:[{expense_id:other,journal_entry_id:id,reference:'EXP-20261008-10000',amount_kobo:'123451',business_date:'2026-10-08',status:'Paid',receipt_id:null}]});
it('persists before dispatch, reuses repeated Save, and retains original date/amount through lost responses and reload',async()=>{
 const s=new Store(),entry=persistExpense(s,request());expect(persistExpense(s,{...request(),requestId:other})).toEqual(entry);
 const send=vi.fn().mockRejectedValueOnce(new Error('lost')).mockResolvedValueOnce(Response.json(result()));
 expect(await deliverExpense(s,entry,context,send)).toBeNull();
 const reloaded=readExpenses(s)[0];expect(reloaded.expense).toEqual(request());
 expect(await deliverExpense(s,reloaded,context,send)).toEqual(result());expect(readExpenses(s)).toHaveLength(0);
 expect(JSON.parse(send.mock.calls[1][1].body)).toEqual(request());
});
it('preserves expenses on auth/backend/review errors and incomplete or altered confirmation',async()=>{
 const s=new Store(),entry=persistExpense(s,request()),send=vi.fn();
 await deliverExpense(s,entry,{backend:'sheets'},send);expect(readExpenses(s)[0].state).toBe('review');
 await deliverExpense(s,entry,{...context,staffId:other},send);expect(send).not.toHaveBeenCalled();expect(readExpenses(s)[0].state).toBe('auth');
 for(const response of [{...result(),actor_id:other},{...result(),expenses:[]},{...result(),expenses:[{...result().expenses[0],amount_kobo:'1'}]},{...result(),expenses:[{...result().expenses[0],journal_entry_id:''}]}]){
  send.mockResolvedValueOnce(Response.json(response));await deliverExpense(s,entry,context,send);expect(readExpenses(s)).toHaveLength(1);
 }
 for(const [status,state] of [[401,'auth'],[403,'auth'],[409,'review'],[503,'pending']] as const){send.mockResolvedValueOnce(Response.json({error:'Held'},{status}));await deliverExpense(s,entry,context,send);expect(readExpenses(s)[0].state).toBe(state);}
});
it('blocks corrupt/full storage and conflicting payments without deleting entries',()=>{
 const s=new Store();s.setItem(EXPENSE_PREFIX+id,'broken');expect(()=>readExpenses(s)).toThrow();expect(s.length).toBe(1);
 const full=new Store();full.setItem=()=>{throw new Error('quota');};expect(()=>persistExpense(full,request())).toThrow('quota');
 const pay:ExpenseRequest={version:1,backend:'postgres',requestId:id,expectedStaffId:id,operation:'pay',expenseId:other,amountKobo:'100',businessDate:'2026-10-09',paymentMethod:'cash'};
 const storage=new Store();persistExpense(storage,pay);expect(()=>persistExpense(storage,{...pay,requestId:other,paymentMethod:'pos'})).toThrow('already pending');
});
it('rejects ambiguous amounts, dates and unpaid methods before sending',()=>{
 const r=request();if(r.operation!=='log')throw new Error();
 for(const patch of [{amountKobo:'0'},{amountKobo:'1.5'},{businessDate:'2026-02-30'},{status:'unpaid',paymentMethod:'cash'},{status:'paid',paymentMethod:undefined},{receiptId:'legacy-url'}])expect(()=>expenseContract({...r,items:[{...r.items[0],...patch}]})).toThrow();
});

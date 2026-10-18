import {afterEach,expect,it,vi} from 'vitest';
vi.mock('next/navigation',()=>({usePathname:()=>'/cashier'}));
afterEach(()=>{vi.unstubAllGlobals();vi.resetModules();});
it('clears personal read caches on sign-out without dropping a persisted queue that was not hydrated yet',async()=>{
 const data=new Map<string,string>();const storage={get length(){return data.size;},key:(i:number)=>[...data.keys()][i]??null,getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);},removeItem:(k:string)=>{data.delete(k);}};
 const pending={id:'frozen',type:'sale',data:{customer:'Customer',amountKobo:'100000'},timestamp:1};
 storage.setItem('bomedia-sync-storage',JSON.stringify({state:{pendingQueue:[pending],cachedSales:[{customer:'Private'}],cachedExpenses:[{paidTo:'Private'}],cachedPayments:[{}],cachedInventory:[],cachedMaterials:[]},version:0}));
 storage.setItem('bomedia-sale-draft:old','Personal draft');storage.setItem('bomedia-payment-context-v1','old-context');storage.setItem('bomedia-order-catalog','customer contacts');
 vi.stubGlobal('localStorage',storage);vi.stubGlobal('window',{});
 const {clearSavedPages}=await import('./session-guard');await clearSavedPages();
 const saved=JSON.parse(storage.getItem('bomedia-sync-storage')!).state;
 expect(saved.pendingQueue).toEqual([pending]);expect(saved.cachedSales).toEqual([]);expect(saved.cachedExpenses).toEqual([]);expect(saved.cachedPayments).toEqual([]);
 expect(storage.getItem('bomedia-sale-draft:old')).toBeNull();expect(storage.getItem('bomedia-payment-context-v1')).toBeNull();expect(storage.getItem('bomedia-order-catalog')).toBeNull();
});

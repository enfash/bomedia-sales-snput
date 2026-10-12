"use client";
import { useEffect, useState } from 'react';
import { useFloatingNotice } from '@/components/floating-notice';
import { usePathname, useRouter } from 'next/navigation';
import { deliverExpense, readExpenses, EXPENSE_EVENT, EXPENSE_PREFIX, EXPENSE_RECEIPT } from '@/lib/expense-outbox';
import { useSyncStore } from '@/lib/store';
import { paymentContext } from '@/lib/payment-outbox';
const SEEN=EXPENSE_RECEIPT+':seen';
const retryExpenses=()=>window.dispatchEvent(new CustomEvent(EXPENSE_EVENT,{detail:{retry:true}}));

export function ExpenseSync() {
  const [message,setMessage]=useState('');
  const [reference,setReference]=useState('');
  const [held,setHeld]=useState('');
  const pathname=usePathname(),router=useRouter();
  useEffect(()=>{
    if(pathname.includes('/login'))return;
    let active=true,busy=false;
    const sync=async(event?:Event)=>{
      if(busy)return;busy=true;
      try {
        const entries=readExpenses(localStorage);
        if(active)setMessage(entries.length?`${entries.length} expense submission(s) saved on this device. ${entries.find(e=>e.error)?.error||'Waiting to sync.'}`:'');
        if(!navigator.onLine||!navigator.locks||!entries.length)return;
        const context=await paymentContext();
        const retry=event instanceof CustomEvent && event.detail?.retry;
        await navigator.locks.request('bomedia-expense-outbox',async()=>{
          let refreshMessage='';
          for(const entry of readExpenses(localStorage)) {
            if(entry.state!=='pending'&&!retry)continue;
            const result=await deliverExpense(localStorage,entry,context,fetch);
            if(result&&'held' in result){
              const text=result.status==='awaiting_approval'?'Sent to the owner for approval. The expense is recorded once approved.':result.status==='declined'?`The owner declined this expense.${result.decision_note?` ${result.decision_note}`:''}`:'This approval request expired. Enter the expense again.';
              if(active)setHeld(text);
              window.dispatchEvent(new Event('bomedia-data-changed'));continue;
            }
            if(result){
              if(active){const shown=result.expenses.map(e=>e.reference).join(', ');setReference(shown);localStorage.setItem(SEEN,shown);}
              window.dispatchEvent(new CustomEvent('bomedia-expense-confirmed',{detail:result}));
              try {
                const responses=await Promise.all(['expenses'].map(resource=>fetch(`/api/${resource}`,{cache:'no-store'})));
                if(responses.some(r=>!r.ok))throw new Error();
                const [expenses]=await Promise.all(responses.map(r=>r.json()));
                if(![expenses].every(r=>Array.isArray(r.data)))throw new Error();
                useSyncStore.setState({cachedExpenses:expenses.data});
              } catch { refreshMessage='Expense confirmed. Refresh Expenses when the connection returns.'; }

              window.dispatchEvent(new Event('bomedia-data-changed'));window.dispatchEvent(new Event('online'));router.refresh();
            }
          }
          const left=readExpenses(localStorage);
          if(active)setMessage(left.length?`${left.length} expense submission(s) saved. ${left.find(e=>e.error)?.error||'Waiting to sync.'}`:refreshMessage);
        });
      }catch(e){if(active)setMessage(e instanceof Error?e.message:'Saved expenses need review.');}
      finally{busy=false;}
    };
    // The last confirmed reference survives a page reload, without showing a raw ID.
    void paymentContext().then(context=>{
      const saved=JSON.parse(localStorage.getItem(EXPENSE_RECEIPT)||'null');
      if(active&&context.backend==='postgres'&&saved?.staffId===context.staffId){
        const shown=saved.expenses?.map((e:{reference:string})=>e.reference).join(', ')||'';
        // Show it once after a reload, then leave it alone: it used to sit on the page until closed.
        if(shown&&localStorage.getItem(SEEN)!==shown){setReference(shown);localStorage.setItem(SEEN,shown);}
      }
    }).catch(()=>{});
    const changed=(event:StorageEvent)=>{if(event.key?.startsWith(EXPENSE_PREFIX))void sync();};
    void sync();const timer=setInterval(()=>void sync(),15000);
    window.addEventListener(EXPENSE_EVENT,sync);window.addEventListener('online',sync);window.addEventListener('storage',changed);
    return()=>{active=false;clearInterval(timer);window.removeEventListener(EXPENSE_EVENT,sync);window.removeEventListener('online',sync);window.removeEventListener('storage',changed);};
  },[pathname,router]);
  useFloatingNotice('expense-pending',message?{tone:'warning',text:message,action:{label:'Retry saved expenses',run:retryExpenses}}:null);
  useFloatingNotice('expense-confirmed',reference?{tone:'success',text:`Saved and confirmed: ${reference}`}:null);
  useFloatingNotice('expense-held',held?{tone:'warning',text:held}:null);
  return null;
}

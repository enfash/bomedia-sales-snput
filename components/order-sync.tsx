"use client";
import { useEffect, useState } from 'react';
import { Alert, Button, Stack } from '@mui/material';
import { usePathname, useRouter } from 'next/navigation';
import { deliverOrder, readOrders, ORDER_EVENT, ORDER_PREFIX, ORDER_RECEIPT } from '@/lib/order-outbox';
import { useSyncStore } from '@/lib/store';
import { paymentContext } from '@/lib/payment-outbox';
export function OrderSync() {
  const [message,setMessage]=useState('');
  const [reference,setReference]=useState('');
  const pathname=usePathname(),router=useRouter();
  useEffect(()=>{
    if(pathname.includes('/login'))return;
    let active=true,busy=false;
    const sync=async(event?:Event)=>{
      if(busy)return;busy=true;
      try {
        const entries=readOrders(localStorage);
        if(active)setMessage(entries.length?`${entries.length} order/quote(s) saved on this device. ${entries.find(e=>e.error)?.error||'Waiting to sync.'}`:'');
        if(!navigator.onLine||!navigator.locks||!entries.length)return;
        const context=await paymentContext();
        const retry=event instanceof CustomEvent && event.detail?.retry;
        await navigator.locks.request('bomedia-order-outbox',async()=>{
          let refreshMessage='';
          for(const entry of readOrders(localStorage)) {
            if(entry.state!=='pending'&&!retry)continue;
            const result=await deliverOrder(localStorage,entry,context,fetch);
            if(result){
              if(active)setReference(String(result.quote_number||result.sales_id));
              window.dispatchEvent(new CustomEvent('bomedia-order-confirmed',{detail:result}));
              try {
                const responses=await Promise.all(['sales','payments','materials','inventory'].map(resource=>fetch(`/api/${resource}`,{cache:'no-store'})));
                if(responses.some(r=>!r.ok))throw new Error();
                const [sales,payments,materials,inventory]=await Promise.all(responses.map(r=>r.json()));
                if(![sales,payments,materials,inventory].every(r=>Array.isArray(r.data)))throw new Error();
                useSyncStore.setState({cachedSales:sales.data,cachedPayments:payments.data,cachedMaterials:materials.data,cachedInventory:inventory.data});
              } catch { refreshMessage='Order confirmed. Refresh Records and stock when the connection returns.'; }

              window.dispatchEvent(new Event('bomedia-data-changed'));window.dispatchEvent(new Event('online'));router.refresh();
            }
          }
          const left=readOrders(localStorage);
          if(active)setMessage(left.length?`${left.length} order/quote(s) saved. ${left.find(e=>e.error)?.error||'Waiting to sync.'}`:refreshMessage);
        });
      }catch(e){if(active)setMessage(e instanceof Error?e.message:'Saved orders need review.');}
      finally{busy=false;}
    };
    // The last confirmed reference survives a page reload, without showing a raw ID.
    void paymentContext().then(context=>{
      const saved=JSON.parse(localStorage.getItem(ORDER_RECEIPT)||'null');
      if(active&&context.backend==='postgres'&&saved?.staffId===context.staffId)setReference(saved.quote_number||saved.sales_id||'');
    }).catch(()=>{});
    const changed=(event:StorageEvent)=>{if(event.key?.startsWith(ORDER_PREFIX))void sync();};
    void sync();const timer=setInterval(()=>void sync(),15000);
    window.addEventListener(ORDER_EVENT,sync);window.addEventListener('online',sync);window.addEventListener('storage',changed);
    return()=>{active=false;clearInterval(timer);window.removeEventListener(ORDER_EVENT,sync);window.removeEventListener('online',sync);window.removeEventListener('storage',changed);};
  },[pathname,router]);
  if(pathname.includes('/login'))return null;
  return <Stack spacing={1}>
    {message&&<Alert severity="warning" action={<Button color="inherit" onClick={()=>window.dispatchEvent(new CustomEvent(ORDER_EVENT,{detail:{retry:true}}))}>Retry saved orders</Button>}>{message}</Alert>}
    {reference&&<Alert severity="success" onClose={()=>setReference('')}>Saved and confirmed: {reference}</Alert>}
  </Stack>;
}

"use client";
import { useState } from 'react';
import { Alert, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import type { OrderCatalog } from '@/lib/order-contract';
import { serviceCartItem, type OrderCartRow } from '@/lib/order-cart';
import { formatKobo } from '@/lib/accounting-money';
/** The "Service" half of Add an item: pick a service, describe it, add it to the order. */
export function ServiceOrderEntry({services,onAdd}:{services:OrderCatalog['services'];onAdd:(item:OrderCartRow)=>void}) {
 const [selected,setSelected]=useState(''),[description,setDescription]=useState(''),[quantity,setQuantity]=useState('1');
 const service=services.find(s=>s.id===selected);
 return <Stack spacing={2}>
  <TextField select label="Service" value={selected} onChange={e=>setSelected(e.target.value)}>
   {services.map(s=><MenuItem key={s.id} value={s.id}>{s.name}{s.pricing==='per_job'?' · owner-approved quote required':s.priceKobo==='0'?' · Free':''}</MenuItem>)}
  </TextField>
  {service?.pricing==='per_job'?<Alert severity="info">Load the owner-approved quote above to sell this service.</Alert>:<>
   <TextField label="Service details" value={description} onChange={e=>setDescription(e.target.value)}/>
   <TextField label="Quantity" value={quantity} onChange={e=>setQuantity(e.target.value)} slotProps={{htmlInput:{inputMode:'numeric'}}}/>
   {service?.priceKobo&&<Typography color="text.secondary">{service.priceKobo==='0'?'Free':`${formatKobo(service.priceKobo)} each`} · Uses no rolls</Typography>}
   <Button variant="contained" size="large" disabled={!service?.priceKobo||!description.trim()||!/^[1-9][0-9]{0,3}$/.test(quantity)} onClick={()=>{
    if(!service?.priceKobo)return;
    onAdd(serviceCartItem({kind:'service',ref:service.id,description:description.trim(),quantity,priceKobo:service.priceKobo},service.name));setDescription('');setQuantity('1');
   }}>Add service to order</Button>
  </>}
 </Stack>;
}

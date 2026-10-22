"use client";
import { useState } from 'react';
import { Alert, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import type { OrderCatalog } from '@/lib/order-contract';
import { serviceCartItem, type OrderCartRow } from '@/lib/order-cart';
import { formatKobo } from '@/lib/accounting-money';
import { serviceAmountKobo } from '@/lib/service-pricing';
/** The "Service" half of Add an item: pick a service, describe it, add it to the order. */
export function ServiceOrderEntry({services,onAdd}:{services:OrderCatalog['services'];onAdd:(item:OrderCartRow)=>void}) {
 const [selected,setSelected]=useState(''),[description,setDescription]=useState(''),[quantity,setQuantity]=useState('1'),[amount,setAmount]=useState('');
 const service=services.find(s=>s.id===selected);
 const variable=service?.pricing==='variable';
 const priceKobo=variable?serviceAmountKobo(amount):service?.priceKobo;
 const amountError=variable&&amount!==''&&!priceKobo;
 const quantityValid=/^[1-9][0-9]{0,3}$/.test(quantity);
 return <Stack spacing={2}>
  <TextField select label="Service" value={selected} onChange={e=>{setSelected(e.target.value);setAmount('');}}>
   {services.map(s=><MenuItem key={s.id} value={s.id}>{s.name}{s.pricing==='variable'?' · Enter amount':s.pricing==='per_job'?' · Owner approves':s.priceKobo==='0'?' · Free':' · Fixed price'}</MenuItem>)}
  </TextField>
  {service?.pricing==='per_job'?<Alert severity="info">Load the owner-approved quote above to sell this service.</Alert>:<>
   <TextField label="Service details" value={description} onChange={e=>setDescription(e.target.value)}/>
   <TextField label="Quantity" value={quantity} onChange={e=>setQuantity(e.target.value)} slotProps={{htmlInput:{inputMode:'numeric'}}}/>
   {variable&&<TextField label="Amount each (₦)" value={amount} error={amountError} helperText={amountError?'Enter a positive amount with no more than two decimal places.':'Enter the charge for one item. No price approval needed.'} onChange={e=>setAmount(e.target.value)} slotProps={{htmlInput:{inputMode:'decimal'}}}/>}
   {priceKobo&&<Typography color="text.secondary">{variable?(quantityValid?`Total: ${formatKobo((BigInt(priceKobo)*BigInt(quantity)).toString())}`:`${formatKobo(priceKobo)} each`):priceKobo==='0'?'Free':`Fixed price: ${formatKobo(priceKobo)} each`} · Uses no rolls</Typography>}
   <Button variant="contained" size="large" disabled={!priceKobo||!description.trim()||!quantityValid} onClick={()=>{
    if(!service||!priceKobo)return;
    onAdd(serviceCartItem({kind:'service',ref:service.id,description:description.trim(),quantity,priceKobo},service.name));setDescription('');setQuantity('1');setAmount('');
   }}>Add service to order</Button>
  </>}
 </Stack>;
}

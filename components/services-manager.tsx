"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import NextLink from 'next/link';
import { Alert, Box, Button, IconButton, Paper, Skeleton, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { ArrowDown, ArrowLeft, ArrowUp, ArchiveRestore, Plus, RefreshCw } from 'lucide-react';
import { settingsStyles as styles } from '@/app/theme';
import { formatKobo } from '@/lib/accounting-money';
import { nairaToKobo } from '@/lib/accounting-entry';
import { readPendingAccounting, sendAccountingEntry, type PendingAccountingEntry } from '@/lib/accounting-pending';
import type { JobService } from '@/lib/job-items';
import { ResponsiveSheet } from './responsive-sheet';

type ServiceForm={id?:string;name:string;pricing:'fixed'|'per_job';price:string;visible:boolean;free:boolean};
const blank:ServiceForm={name:'',pricing:'fixed',price:'',visible:true,free:false};
const message=(error:unknown)=>error instanceof Error?error.message:'Services could not be loaded. Try again.';
const priceLabel=(service:JobService)=>service.pricing==='fixed'?(service.unit_price_kobo==='0'?'Free':`${formatKobo(service.unit_price_kobo!)} each`):'Priced per job · owner approval required';
const priceInput=(kobo:string|null)=>kobo?`${BigInt(kobo)/BigInt(100)}.${(BigInt(kobo)%BigInt(100)).toString().padStart(2,'0')}`:'';

/** Owner catalog control; uses the existing service API and durable accounting queue. */
export function ServicesManager({staffId}:{staffId:string|null}) {
  const [services,setServices]=useState<JobService[]>([]),[ready,setReady]=useState(false);
  const [error,setError]=useState(''),[success,setSuccess]=useState('');
  const [pending,setPending]=useState<PendingAccountingEntry|null>(null),[busy,setBusy]=useState(false);
  const [drafts,setDrafts]=useState<Record<string,ServiceForm>>({}),[editing,setEditing]=useState('new'),[open,setOpen]=useState(false);
  const [storageBlocked,setStorageBlocked]=useState(false),[reordering,setReordering]=useState(false),[moving,setMoving]=useState(false);
  const sending=useRef(false);
  const form=drafts[editing]||blank;
  const locked=busy||pending!==null||storageBlocked;
  const offered=services.filter(service=>service.visible),removed=services.filter(service=>!service.visible);
  // Staff see services in this order. Each tap saves straight away; the list is put back if the save fails.
  async function move(index:number,by:-1|1) {
    const target=index+by;
    if(moving||locked||target<0||target>=offered.length)return;
    const previous=services,next=[...offered];
    [next[index],next[target]]=[next[target],next[index]];
    setServices([...next,...removed]);setMoving(true);setError('');setSuccess('');
    try {
      const response=await fetch('/api/accounting/services',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({requestId:crypto.randomUUID(),serviceIds:next.map(service=>service.id)})});
      const result=await response.json().catch(()=>null);
      if(!response.ok)throw new Error(result?.error||'The new order was not saved. Try again.');
    }catch(cause){
      setServices(previous);setError(message(cause));
      try {await reload();}catch{setReady(false);}
    }finally{setMoving(false);}
  }
  function setVisible(service:JobService,visible:boolean) {
    if(!staffId||locked)return;
    void dispatch({version:1,staffId,operation:'services',requestId:crypto.randomUUID(),payload:{serviceId:service.id,name:service.name,pricing:service.pricing,visible,...(service.pricing==='fixed'?{unitPriceKobo:service.unit_price_kobo}:{})},summary:`${visible?'Put back':'Remove'} service: ${service.name}`},visible?false:true);
  }
  const reload=useCallback(async()=>{
    const response=await fetch('/api/accounting/services',{cache:'no-store'}),result=await response.json();
    if(!response.ok||!Array.isArray(result.data))throw new Error(result.error||'Services could not be loaded.');
    setServices(result.data);setReady(true);
  },[]);
  useEffect(()=>{
    if(!staffId)return;
    let active=true;
    void Promise.resolve().then(async()=>{
      if(!active)return;
      try {setPending(readPendingAccounting(localStorage,staffId));}
      catch(cause){setStorageBlocked(true);setError(message(cause));return;}
      try {await reload();}catch(cause){if(active)setError(message(cause));}
    });
    return()=>{active=false;};
  },[staffId,reload]);
  function edit(service?:JobService) {
    const key=service?.id||'new';setEditing(key);
    setDrafts(previous=>previous[key]?previous:{...previous,[key]:service?{id:service.id,name:service.name,pricing:service.pricing,price:priceInput(service.unit_price_kobo),visible:service.visible,free:service.unit_price_kobo==='0'}:{...blank}});
    setError('');setOpen(true);
  }
  const change=(patch:Partial<ServiceForm>)=>setDrafts(previous=>({...previous,[editing]:{...(previous[editing]||blank),...patch}}));
  async function dispatch(entry:PendingAccountingEntry,clearDraft=true) {
    if(sending.current||entry.operation!=='services'||!staffId)return;
    if(!navigator.locks){setError('Use an updated browser that supports safe saving.');return;}
    sending.current=true;setBusy(true);setError('');setSuccess('');
    try {
      await navigator.locks.request(`bomedia-accounting:${staffId}`,()=>sendAccountingEntry(localStorage,entry));
      setPending(null);setOpen(false);
      const savedKey=typeof entry.payload.serviceId==='string'?entry.payload.serviceId:'new';
      setDrafts(previous=>{const next={...previous};if(clearDraft)delete next[savedKey];else if(next[savedKey])next[savedKey]={...next[savedKey],visible:entry.payload.visible===true};return next;});
      setSuccess(entry.summary.startsWith('Remove service')?'Service removed from the list. Past sales keep it.':'Service saved. Staff will see the updated list when they open New Sale.');
      try {await reload();}catch{setReady(false);setError('Service saved, but the list could not refresh. Reload the list before making another change.');}
    }catch(cause){
      setError(message(cause));
      try {setPending(readPendingAccounting(localStorage,staffId));}catch{setStorageBlocked(true);}
    }finally{sending.current=false;setBusy(false);}
  }
  function save() {
    if(!staffId||!ready||locked)return;
    const price=form.free?'0':nairaToKobo(form.price);
    if(!form.name.trim()){setError('Name the service.');return;}
    if(form.pricing==='fixed'&&(!price||(!form.free&&price==='0'))){setError('Enter a positive price, or choose Free.');return;}
    void dispatch({version:1,staffId,operation:'services',requestId:crypto.randomUUID(),
      payload:{...(form.id?{serviceId:form.id}:{}),name:form.name.trim(),pricing:form.pricing,visible:form.visible,...(form.pricing==='fixed'?{unitPriceKobo:price}:{})},
      summary:`Save service: ${form.name.trim()}`});
  }
  return <Box sx={styles.page}>
    <Button color="inherit" component={NextLink} href="/bom03/settings" startIcon={<ArrowLeft size={18}/>}>Settings</Button>
    <Stack spacing={1} sx={styles.heading}>
      <Typography variant="h3" component="h1">Services</Typography>
      <Typography color="text.secondary">What staff can sell besides printing. Services use no roll stock.</Typography>
    </Stack>
    {!staffId?<Alert severity="info">Service management will be available when the new database is active. Use the separate sandbox to review it.</Alert>:<>
      <Stack spacing={2}>
        {error&&<Alert severity="error">{error}</Alert>}
        {success&&<Alert severity="success">{success}</Alert>}
        {pending&&<Alert severity="warning"><Typography>{pending.summary}</Typography><Typography variant="body2">This saved entry is waiting for confirmation. It remains on this device.</Typography>
          {pending.operation==='services'?<Button disabled={busy} onClick={()=>void dispatch(pending)}>Retry saved service</Button>:<Button component={NextLink} href="/bom03/accounting">Open saved accounting entry</Button>}
        </Alert>}
        <Box sx={styles.toolbar}>
          <Button variant="contained" startIcon={<Plus size={18}/>} disabled={!ready||locked} onClick={()=>edit()}>Add a service</Button>
          <Stack direction="row" spacing={1}>
            {offered.length>1&&<Button color="inherit" variant={reordering?'contained':'outlined'} disabled={!ready||locked} onClick={()=>setReordering(value=>!value)}>{reordering?'Done':'Reorder'}</Button>}
            <Button color="inherit" startIcon={<RefreshCw size={18}/>} disabled={busy||moving} onClick={()=>void reload().catch(cause=>setError(message(cause)))}>Refresh</Button>
          </Stack>
        </Box>
        {!ready&&!error&&[0,1,2].map(i=><Skeleton key={i} variant="rounded" height={86}/>)}
        {reordering&&<Alert severity="info">Use the arrows to put services in the order staff should see them. Each tap saves.</Alert>}
        {ready&&!services.length&&<Paper variant="outlined" sx={styles.row}><Typography color="text.secondary">No services yet. Add the first service your team offers.</Typography></Paper>}
        {offered.map((service,index)=><Paper key={service.id} variant="outlined" sx={styles.row}>
          {reordering&&<Typography sx={styles.orderNumber} aria-hidden>{index+1}</Typography>}
          <Box sx={styles.grow}>
            <Typography variant="h6" component="h2">{service.name}</Typography>
            <Typography variant="body2" color="text.secondary">{priceLabel(service)}</Typography>
          </Box>
          {reordering?<Box sx={styles.moveButtons}>
            <IconButton aria-label={`Move ${service.name} up`} disabled={moving||index===0} onClick={()=>void move(index,-1)} sx={styles.moveButton}><ArrowUp size={20}/></IconButton>
            <IconButton aria-label={`Move ${service.name} down`} disabled={moving||index===offered.length-1} onClick={()=>void move(index,1)} sx={styles.moveButton}><ArrowDown size={20}/></IconButton>
          </Box>:<Button color="inherit" variant="outlined" aria-label={`Edit ${service.name}`} disabled={!ready||locked} onClick={()=>edit(service)}>Edit</Button>}
        </Paper>)}
        {!reordering&&removed.length>0&&<>
          <Typography variant="overline" component="h2" color="text.secondary" sx={styles.removedHeading}>Removed from the list ({removed.length})</Typography>
          {removed.map(service=><Paper key={service.id} variant="outlined" sx={[styles.row,styles.hiddenRow]}>
            <Box sx={styles.grow}>
              <Typography variant="h6" component="h3">{service.name}</Typography>
              <Typography variant="body2" color="text.secondary">{priceLabel(service)}</Typography>
              <Typography variant="caption" color="warning.main">Hidden from staff · past sales keep it</Typography>
            </Box>
            <Button color="inherit" variant="outlined" startIcon={<ArchiveRestore size={18}/>} aria-label={`Put back ${service.name}`} disabled={!ready||locked} onClick={()=>setVisible(service,true)}>Put back</Button>
          </Paper>)}
        </>}
        <Typography variant="body2" color="text.secondary">Price changes apply to new quotes and jobs. Removing a service only hides it from new sales; every past sale and record keeps it.</Typography>
      </Stack>
      <ResponsiveSheet open={open} onClose={()=>setOpen(false)} title={form.id?'Edit service':'Add a service'} busy={busy}
        footer={<Box sx={styles.footer}><Button color="inherit" disabled={busy} onClick={()=>setOpen(false)}>Close</Button><Button variant="contained" disabled={!ready||locked} onClick={save}>{busy?'Saving…':'Save service'}</Button></Box>}>
        <Stack spacing={2.5} sx={styles.form}>
          {error&&<Alert severity="error">{error}</Alert>}
          <TextField label="Service name" value={form.name} disabled={locked} onChange={event=>change({name:event.target.value})} slotProps={{htmlInput:{maxLength:100}}}/>
          <Box component="fieldset" sx={styles.fieldset}>
            <Typography component="legend" sx={styles.legend}>How is it priced?</Typography>
            <ToggleButtonGroup fullWidth exclusive color="primary" sx={styles.pricingToggle} value={form.pricing==='fixed'&&form.free?'free':form.pricing} disabled={locked} onChange={(_,value:'free'|'fixed'|'per_job'|null)=>{if(value)change({pricing:value==='free'?'fixed':value,free:value==='free'});}}>
              <ToggleButton value="free">Free</ToggleButton><ToggleButton value="fixed">Fixed price</ToggleButton><ToggleButton value="per_job">Owner approves</ToggleButton>
            </ToggleButtonGroup>
          </Box>
          {form.pricing==='fixed'?(form.free?<Alert severity="info">This service is free. It adds no charge to the order.</Alert>:<TextField label="Price each (₦)" value={form.price} disabled={locked} onChange={event=>change({price:event.target.value})} slotProps={{htmlInput:{inputMode:'decimal'}}}/>):<Alert severity="info">Staff must use an owner-approved quote to sell this service.</Alert>}
          {form.id&&<Box sx={styles.removeZone}>
            <Typography variant="subtitle2" color="warning.main">Remove from the list</Typography>
            <Typography variant="body2" color="text.secondary">Staff stop seeing <strong>{form.name||'this service'}</strong> when they make a sale. Every past sale and record keeps it, and you can put it back any time.</Typography>
            <Button color="warning" variant="outlined" disabled={locked} onClick={()=>{const service=services.find(item=>item.id===form.id);if(service)setVisible(service,false);}}>Remove {form.name||'service'}</Button>
          </Box>}
        </Stack>
      </ResponsiveSheet>
    </>}
  </Box>;
}

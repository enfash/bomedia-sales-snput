"use client";

import { useCallback,useEffect,useRef,useState } from 'react';
import { Alert,Box,Button,Checkbox,FormControlLabel,MenuItem,Paper,Stack,TextField,Typography } from '@mui/material';
import { formatKobo,hasOutstandingKobo } from '@/lib/accounting-money';
import { lagosBusinessDate,nairaToKobo,quotedUnitPrice } from '@/lib/accounting-entry';
import { normalizePaymentMethod,type PaymentMethod } from '@/lib/payment-methods';
import { readPendingAccounting,sendAccountingEntry,type AccountingOperation,type PendingAccountingEntry } from '@/lib/accounting-pending';

type Customer={id:string;display_name:string;contact:string|null};
type Material={id:string;name:string;width_ft:string;selling_price_per_sqft_kobo:string};
type Job={id:string;description:string;balance_kobo:string;business_date:string};
type Method={method:PaymentMethod;label:string};
async function records<T>(resource:string,customerId?:string):Promise<T[]> {
  const result:T[]=[];let cursor:string|null=null;
  const seen=new Set<string>();
  do {
    const params=new URLSearchParams({resource});
    if(customerId)params.set('customer_id',customerId);
    if(cursor)params.set('after_id',cursor);
    const response=await fetch(`/api/accounting/records?${params}`,{cache:'no-store'});
    const page=await response.json();
    if(!response.ok || !Array.isArray(page.data))throw new Error(page.error || 'Records could not be loaded.');
    result.push(...page.data);cursor=page.next_after_id;
    if(cursor) {if(seen.has(cursor))throw new Error('Records could not be completely loaded.');seen.add(cursor);}
  }while(cursor);
  return result;
}
const message=(error:unknown)=>error instanceof Error ? error.message : 'The entry is saved on this device. Retry when connected.';

export function AccountingEntry({staffId}:{staffId:string}) {
  const [operation,setOperation]=useState<AccountingOperation>('sales');
  const [customers,setCustomers]=useState<Customer[]>([]),[materials,setMaterials]=useState<Material[]>([]),[methods,setMethods]=useState<Method[]>([]);
  const [customerId,setCustomerId]=useState(''),[materialId,setMaterialId]=useState('');
  const [jobs,setJobs]=useState<Job[]>([]),[jobIds,setJobIds]=useState<string[]>([]);
  const [name,setName]=useState(''),[contact,setContact]=useState(''),[description,setDescription]=useState('');
  const [width,setWidth]=useState(''),[height,setHeight]=useState(''),[quantity,setQuantity]=useState('1');
  const [businessDate,setBusinessDate]=useState(()=>lagosBusinessDate()),[amount,setAmount]=useState('0'),[method,setMethod]=useState<PaymentMethod|''>('');
  const [pending,setPending]=useState<PendingAccountingEntry|null>(null),[busy,setBusy]=useState(false),[ready,setReady]=useState(false),[jobsReady,setJobsReady]=useState(false);
  const [error,setError]=useState(''),[success,setSuccess]=useState('');
  const requestId=useRef<string|null>(null);
  const reload=useCallback(async()=>{
    const [nextCustomers,nextMaterials,nextMethods]=await Promise.all([records<Customer>('customers'),records<Material>('materials'),records<Method>('payment_methods')]);
    setCustomers(nextCustomers);setMaterials(nextMaterials);setMethods(nextMethods);setReady(true);
  },[]);
  useEffect(()=>{
    // Hydrate private device storage after SSR; submissions stay disabled until records load.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try {setPending(readPendingAccounting(localStorage,staffId));}catch(cause){setError(message(cause));return;}
    void reload().catch(cause=>setError(message(cause)));
  },[staffId,reload]);
  useEffect(()=>{
    let current=true;
    if(!customerId)return;
    void records<Job>('jobs',customerId).then(rows=>{if(current){setJobs(rows.filter(j=>hasOutstandingKobo(j.balance_kobo)));setJobsReady(true);}}).catch(cause=>{if(current)setError(message(cause));});
    return ()=>{current=false;};
  },[customerId,success]);
  const material=materials.find(m=>m.id===materialId),customer=customers.find(c=>c.id===customerId);
  const unitPrice=material ? quotedUnitPrice(width,height,material.selling_price_per_sqft_kobo) : null;
  const validQuantity=/^[1-9][0-9]{0,4}$/.test(quantity)&&Number(quantity)<=10000;
  const total=unitPrice&&validQuantity ? (BigInt(unitPrice)*BigInt(quantity)).toString() : null;
  const selectedDebt=jobs.filter(j=>jobIds.includes(j.id)).reduce((sum,j)=>sum+BigInt(j.balance_kobo),BigInt(0));
  const locked=busy||pending!==null;

  async function dispatch(entry:PendingAccountingEntry) {
    if(!navigator.locks){setError('This browser cannot safely submit entries. Use an updated browser on this device.');return;}
    setBusy(true);setError('');setSuccess('');
    try {
      await navigator.locks.request(`bomedia-accounting:${staffId}`,async()=>{
        // Another tab may have saved an entry after this page loaded.
        const result=await sendAccountingEntry(localStorage,entry);
        setPending(null);requestId.current=null;
        const confirmedId=String(result.customer_id||result.order_id||result.payment_id);
        setSuccess(`${entry.operation==='customers' ? 'Customer created' : 'Recorded'} successfully. Reference: ${confirmedId}`);
        setAmount('0');setMethod('');setDescription('');setWidth('');setHeight('');setQuantity('1');setJobIds([]);setName('');setContact('');
        if(entry.operation==='customers') {setCustomerId(String(result.customer_id));setOperation('sales');setJobsReady(false);setJobs([]);}
        try {await reload();}catch {setError('The entry was recorded, but the list could not refresh. Refresh before entering another transaction.');setReady(false);}
      });
    } catch(cause) {
      setError(message(cause));
      try {setPending(readPendingAccounting(localStorage,staffId));}catch {setReady(false);}
    } finally {setBusy(false);}
  }
  function submit(event:React.FormEvent) {
    event.preventDefault();setError('');
    if(!ready || locked)return;
    let payload:Record<string,unknown>,summary:string;
    if(operation==='customers') {
      if(!name.trim()){setError('Enter the customer name.');return;}
      payload={name:name.trim(),...(contact.trim() ? {contact:contact.trim()} : {})};summary=`New customer: ${name.trim()}`;
    } else {
      const kobo=nairaToKobo(amount);
      if(!customer || kobo===null){setError('Choose a customer and enter an amount with up to two decimal places.');return;}
      if(kobo!=='0' && (!normalizePaymentMethod(method)||!methods.some(m=>m.method===method))){setError('Choose Cash, Transfer or POS.');return;}
      if(operation==='payments') {
        if(!jobsReady || !jobIds.length || kobo==='0' || BigInt(kobo)>selectedDebt){setError('Choose unpaid jobs and an amount no greater than the selected debt.');return;}
        payload={customerId,jobIds:[...jobIds].sort(),amountKobo:kobo,businessDate,method};
        summary=`${customer.display_name}: ${formatKobo(kobo)} collected by ${methods.find(m=>m.method===method)?.label} on ${businessDate}`;
      } else {
        if(!material || !unitPrice || !total || !description.trim() || !validQuantity || BigInt(kobo)>BigInt(total)) {setError('Check the print job dimensions, quantity and initial payment.');return;}
        payload={customerId,businessDate,jobs:[{materialId,description:description.trim(),quantity,widthFt:width,heightFt:height,expectedUnitPriceKobo:unitPrice}],initialPaymentKobo:kobo,...(kobo!=='0' ? {paymentMethod:method} : {})};
        summary=`${customer.display_name}: ${description.trim()}, ${formatKobo(total)} sale; ${formatKobo(kobo)} received${kobo!=='0' ? ` by ${methods.find(m=>m.method===method)?.label}` : ''} on ${businessDate}`;
      }
    }
    requestId.current??=crypto.randomUUID();
    void dispatch({version:1,staffId,operation,requestId:requestId.current,payload,summary});
  }
  return <Box sx={{p:{xs:2,md:4},pb:12,maxWidth:780,mx:'auto'}}>
    <Typography variant="h4" component="h1" sx={{mb:1,fontWeight:800}}>Accounting entry</Typography>
    <Typography color="text.secondary" sx={{mb:3}}>Record a print job or collect payment against existing jobs.</Typography>
    <Stack spacing={2}>
      {error&&<Alert severity="error">{error}</Alert>}
      {success&&<Alert severity="success">{success}</Alert>}
      {pending&&<Alert severity="warning"><Typography>{pending.summary}</Typography><Typography variant="body2">Confirmation is pending. Keep this entry on this device and retry it before adding another.</Typography><Button disabled={busy} onClick={()=>void dispatch(pending)}>Retry saved entry</Button></Alert>}
      {!ready&&!pending&&<Button disabled={busy} onClick={()=>void reload().catch(cause=>setError(message(cause)))}>Reload records</Button>}
      <Paper variant="outlined" sx={{p:{xs:2,md:3}}}>
        <Box component="form" onSubmit={submit}>
          <Stack spacing={2.5}>
            <TextField select label="What are you recording?" value={operation} disabled={locked} onChange={event=>{setOperation(event.target.value as AccountingOperation);setAmount('0');setMethod('');setSuccess('');}}>
              <MenuItem value="sales">New print job</MenuItem><MenuItem value="payments">Customer payment</MenuItem><MenuItem value="customers">New customer</MenuItem>
            </TextField>
            {operation==='customers' ? <>
              <TextField label="Customer name" value={name} required disabled={locked} onChange={event=>setName(event.target.value)} slotProps={{htmlInput:{maxLength:200}}}/>
              <TextField label="Phone or contact (optional)" value={contact} disabled={locked} onChange={event=>setContact(event.target.value)} slotProps={{htmlInput:{maxLength:200}}}/>
              <Typography variant="body2" color="text.secondary">Use the existing customer when possible. Creating a new customer keeps their jobs and payments separate, even when names match.</Typography>
            </> : <>
              <TextField select label="Customer" value={customerId} required disabled={!ready||locked} onChange={event=>{setCustomerId(event.target.value);setJobs([]);setJobIds([]);setJobsReady(false);}}>
                {customers.map(c=><MenuItem key={c.id} value={c.id}>{c.display_name} · {c.contact||c.id.slice(0,8)}</MenuItem>)}
              </TextField>
              <TextField type="date" label="Business date" value={businessDate} required disabled={locked} onChange={event=>setBusinessDate(event.target.value)} slotProps={{inputLabel:{shrink:true}}}/>
              {operation==='sales' ? <>
                <TextField select label="Material" value={materialId} required disabled={!ready||locked} onChange={event=>setMaterialId(event.target.value)}>
                  {materials.map(m=><MenuItem key={m.id} value={m.id}>{m.name} · {Number(m.width_ft)} ft roll</MenuItem>)}
                </TextField>
                <TextField label="Job description" value={description} required disabled={locked} onChange={event=>setDescription(event.target.value)} slotProps={{htmlInput:{maxLength:1000}}}/>
                <Stack direction={{xs:'column',sm:'row'}} spacing={2}>
                  <TextField label="Width (ft)" value={width} required disabled={locked} onChange={event=>setWidth(event.target.value)} slotProps={{htmlInput:{inputMode:'decimal'}}}/>
                  <TextField label="Height (ft)" value={height} required disabled={locked} onChange={event=>setHeight(event.target.value)} slotProps={{htmlInput:{inputMode:'decimal'}}}/>
                  <TextField label="Quantity" value={quantity} required disabled={locked} onChange={event=>setQuantity(event.target.value)} slotProps={{htmlInput:{inputMode:'numeric'}}}/>
                </Stack>
                <Typography sx={{fontWeight:700}}>Job total: {total ? formatKobo(total) : 'Enter the job dimensions'}</Typography>
              </> : <Box component="fieldset" sx={{border:1,borderColor:'divider',borderRadius:1,p:2}}>
                <Typography component="legend">Jobs being paid</Typography>
                {jobs.map(job=><FormControlLabel key={job.id} sx={{display:'flex'}} control={<Checkbox checked={jobIds.includes(job.id)} disabled={locked} onChange={(_,checked)=>setJobIds(ids=>checked ? [...ids,job.id] : ids.filter(id=>id!==job.id))}/>} label={`${job.description} · ${job.business_date} · ${formatKobo(job.balance_kobo)}`}/>)}
                {!jobs.length&&<Typography color="text.secondary">{!customerId ? 'Choose a customer.' : !jobsReady ? 'Loading jobs…' : 'No unpaid jobs.'}</Typography>}
                <Typography sx={{mt:1,fontWeight:700}}>Selected debt: {formatKobo(selectedDebt.toString())}</Typography>
              </Box>}
              <TextField label={operation==='sales' ? 'Initial payment (₦)' : 'Amount received (₦)'} helperText={operation==='sales' ? 'Enter 0 if no money has been received.' : 'Enter the actual amount received. Any unpaid amount remains due.'} value={amount} required disabled={locked} onChange={event=>setAmount(event.target.value)} slotProps={{htmlInput:{inputMode:'decimal'}}}/>
              {(operation==='payments'||(nairaToKobo(amount)!==null&&nairaToKobo(amount)!=='0'))&&<TextField select label="Payment method" value={method} required disabled={!ready||locked} onChange={event=>setMethod(normalizePaymentMethod(event.target.value)||'')}>
                <MenuItem value="" disabled>Choose a method</MenuItem>{methods.map(m=><MenuItem key={m.method} value={m.method}>{m.label}</MenuItem>)}
              </TextField>}
            </>}
            <Button type="submit" variant="contained" disabled={!ready||locked}>{busy ? 'Saving…' : operation==='customers' ? 'Create customer' : operation==='sales' ? 'Record job' : 'Record payment'}</Button>
          </Stack>
        </Box>
      </Paper>
    </Stack>
  </Box>;
}

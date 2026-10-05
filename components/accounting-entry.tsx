"use client";

import { useCallback,useEffect,useRef,useState } from 'react';
import { Alert,Box,Button,Checkbox,FormControlLabel,Link,MenuItem,Paper,Stack,TextField,ToggleButton,ToggleButtonGroup,Typography } from '@mui/material';
import { formatKobo,hasOutstandingKobo } from '@/lib/accounting-money';
import { lagosBusinessDate,nairaToKobo } from '@/lib/accounting-entry';
import { normalizePaymentMethod,type PaymentMethod } from '@/lib/payment-methods';
import { readPendingAccounting,sendAccountingEntry,type AccountingOperation,type PendingAccountingEntry } from '@/lib/accounting-pending';
import { JobEntry } from '@/components/job-entry';
import type { JobService } from '@/lib/job-items';

type Customer={id:string;display_name:string;contact:string|null};
type Material={id:string;name:string;width_ft:string;selling_price_per_sqft_kobo:string;remaining_length_ft:string};
type Job={id:string;description:string;balance_kobo:string;business_date:string};
type Method={method:PaymentMethod;label:string};
type Category={name:string;capital:boolean};
type PriceRequest={id:string;status:string;pending:boolean;quote_number:string;client_name:string;description:string;material_name:string;is_service:boolean;width_ft:string|null;height_ft:string|null;quantity:string;
  list_total_kobo:string|null;requested_total_kobo:string;reason:string;requested_by:string;decision_note:string|null;decided_at:string|null;created_at:string};
type AwaitingExpense={id:string;amount_kobo:string;business_date:string|null;category:string;description:string|null;paid_to:string|null;logged_by:string|null;payable:boolean};
export async function records<T>(resource:string,customerId?:string):Promise<T[]> {
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

export function AccountingEntry({staffId,isOwner=false}:{staffId:string;isOwner?:boolean}) {
  const [operation,setOperation]=useState<AccountingOperation>('sales');
  const [customers,setCustomers]=useState<Customer[]>([]),[materials,setMaterials]=useState<Material[]>([]),[methods,setMethods]=useState<Method[]>([]);
  const [customerId,setCustomerId]=useState('');
  const [jobs,setJobs]=useState<Job[]>([]),[jobIds,setJobIds]=useState<string[]>([]);
  const [name,setName]=useState(''),[contact,setContact]=useState('');
  const [priceRequests,setPriceRequests]=useState<PriceRequest[]>([]),[decisionNotes,setDecisionNotes]=useState<Record<string,string>>({});
  const [services,setServices]=useState<JobService[]>([]),[serviceForm,setServiceForm]=useState<{id?:string;name:string;pricing:'fixed'|'per_job';price:string;visible:boolean}|null>(null);
  const [businessDate,setBusinessDate]=useState(()=>lagosBusinessDate()),[amount,setAmount]=useState('0'),[method,setMethod]=useState<PaymentMethod|''>('');
  const [pending,setPending]=useState<PendingAccountingEntry|null>(null),[busy,setBusy]=useState(false),[ready,setReady]=useState(false),[jobsReady,setJobsReady]=useState(false);
  const [error,setError]=useState(''),[success,setSuccess]=useState('');
  const [categories,setCategories]=useState<Category[]>([]),[category,setCategory]=useState(''),[expenseStatus,setExpenseStatus]=useState<'paid'|'unpaid'>('paid');
  const [payee,setPayee]=useState(''),[expenseNote,setExpenseNote]=useState('');
  const [awaiting,setAwaiting]=useState<AwaitingExpense[]>([]),[payingId,setPayingId]=useState(''),[payMethod,setPayMethod]=useState<PaymentMethod|''>(''),[payDate,setPayDate]=useState(()=>lagosBusinessDate());
  const requestId=useRef<string|null>(null);
  const reload=useCallback(async()=>{
    const [nextCustomers,nextMaterials,nextMethods,nextCategories,nextAwaiting,nextRequests]=await Promise.all([records<Customer>('customers'),records<Material>('materials'),
      records<Method>('payment_methods'),records<Category>('expense_categories'),isOwner ? records<AwaitingExpense>('expenses_awaiting') : Promise.resolve([]),
      isOwner ? fetch('/api/accounting/price-requests',{cache:'no-store'}).then(async response=>{const page=await response.json();
        if(!response.ok || !Array.isArray(page.data))throw new Error(page.error || 'Price requests could not be loaded.');return page.data as PriceRequest[];}) : Promise.resolve([])]);
    const serviceResponse=await fetch('/api/accounting/services',{cache:'no-store'}),servicePage=await serviceResponse.json();
    if(!serviceResponse.ok || !Array.isArray(servicePage.data))throw new Error(servicePage.error || 'Services could not be loaded.');
    setCustomers(nextCustomers);setMaterials(nextMaterials);setMethods(nextMethods);setCategories(nextCategories);setAwaiting(nextAwaiting);setPriceRequests(nextRequests);
    setServices(servicePage.data as JobService[]);setReady(true);
  },[isOwner]);
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
  const customer=customers.find(c=>c.id===customerId);
  const selectedDebt=jobs.filter(j=>jobIds.includes(j.id)).reduce((sum,j)=>sum+BigInt(j.balance_kobo),BigInt(0));
  const locked=busy||pending!==null;

  async function dispatch(entry:PendingAccountingEntry):Promise<Record<string,unknown>|null> {
    if(!navigator.locks){setError('This browser cannot safely submit entries. Use an updated browser on this device.');return null;}
    setBusy(true);setError('');setSuccess('');
    try {
      return await navigator.locks.request(`bomedia-accounting:${staffId}`,async()=>{
        // Another tab may have saved an entry after this page loaded.
        const result=await sendAccountingEntry(localStorage,entry);
        setPending(null);requestId.current=null;
        const confirmedId=String(result.quote_number||result.customer_id||result.order_id||result.payment_id||result.expense_id||result.price_request_id||result.service_id);
        if(entry.operation==='services')setServiceForm(null);
        setSuccess(entry.operation==='quotes' ? `Quote ${confirmedId} saved.` : entry.operation==='price-requests' ? `Price ${String(result.status)}.` : entry.operation==='services' ? 'Service saved.'
          : `${entry.operation==='customers' ? 'Customer created' : entry.operation==='expense-payments' ? 'Expense marked paid' : 'Recorded'} successfully. Reference: ${confirmedId}`);
        setPayee('');setExpenseNote('');setPayingId('');setPayMethod('');
        setAmount('0');setMethod('');setJobIds([]);setName('');setContact('');
        if(entry.operation==='customers') {setOperation('sales');setJobsReady(false);setJobs([]);}
        try {await reload();}catch {setError('The entry was recorded, but the list could not refresh. Refresh before entering another transaction.');setReady(false);}
        return result;
      });
    } catch(cause) {
      setError(message(cause));
      try {setPending(readPendingAccounting(localStorage,staffId));}catch {setReady(false);}
      return null;
    } finally {setBusy(false);}
  }
  function decidePrice(request:PriceRequest,decision:'approve'|'decline') {
    if(!ready || locked)return;
    const note=(decisionNotes[request.id] ?? '').trim();
    void dispatch({version:1,staffId,operation:'price-requests',requestId:crypto.randomUUID(),payload:{priceRequestId:request.id,decision,...(note ? {note} : {})},
      summary:`${decision==='approve' ? 'Approve' : 'Decline'} ${formatKobo(request.requested_total_kobo)} for ${request.description} (${request.quote_number})`});
  }
  function saveServiceForm() {
    if(!serviceForm || !ready || locked)return;
    const price=nairaToKobo(serviceForm.price);
    if(!serviceForm.name.trim()){setError('Name the service.');return;}
    if(serviceForm.pricing==='fixed'&&(!price||price==='0')){setError('Enter the price each.');return;}
    void dispatch({version:1,staffId,operation:'services',requestId:crypto.randomUUID(),
      payload:{...(serviceForm.id ? {serviceId:serviceForm.id} : {}),name:serviceForm.name.trim(),pricing:serviceForm.pricing,visible:serviceForm.visible,
        ...(serviceForm.pricing==='fixed' ? {unitPriceKobo:price} : {})},summary:`Save service: ${serviceForm.name.trim()}`});
  }
  function expenseSummary(kobo:string) {
    const how=expenseStatus==='paid' ? `paid by ${methods.find(m=>m.method===method)?.label ?? '…'}` : 'not yet paid';
    return `${formatKobo(kobo)} ${category || '…'}, ${how} on ${businessDate}`;
  }
  function payExpense(expense:AwaitingExpense) {
    setError('');
    if(!ready || locked || !expense.payable)return;
    if(!normalizePaymentMethod(payMethod)||!methods.some(m=>m.method===payMethod)){setError('Choose how the expense was paid.');return;}
    if(expense.business_date && payDate<expense.business_date){setError('The payment date cannot be before the expense date.');return;}
    requestId.current??=crypto.randomUUID();
    void dispatch({version:1,staffId,operation:'expense-payments',requestId:requestId.current,
      payload:{expenseId:expense.id,businessDate:payDate,paymentMethod:payMethod},
      summary:`Paid ${formatKobo(expense.amount_kobo)} ${expense.category} by ${methods.find(m=>m.method===payMethod)?.label} on ${payDate}`});
  }
  function submit(event:React.FormEvent) {
    event.preventDefault();setError('');
    if(!ready || locked)return;
    let payload:Record<string,unknown>,summary:string;
    if(operation==='expenses') {
      const kobo=nairaToKobo(amount);
      if(kobo===null || kobo==='0'){setError('Enter the amount spent, with up to two decimal places.');return;}
      if(!categories.some(c=>c.name===category)){setError('Choose a category. Roll and material purchases go through Restock.');return;}
      if(expenseStatus==='paid' && (!normalizePaymentMethod(method)||!methods.some(m=>m.method===method))){setError('Choose Cash, Transfer or POS.');return;}
      payload={businessDate,amountKobo:kobo,category,status:expenseStatus,...(payee.trim() ? {paidTo:payee.trim()} : {}),
        ...(expenseNote.trim() ? {description:expenseNote.trim()} : {}),...(expenseStatus==='paid' ? {paymentMethod:method} : {})};
      summary=expenseSummary(kobo);
    } else if(operation==='customers') {
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
      } else return;
    }
    requestId.current??=crypto.randomUUID();
    void dispatch({version:1,staffId,operation,requestId:requestId.current,payload,summary});
  }
  return <Box sx={{p:{xs:2,md:4},pb:12,maxWidth:780,mx:'auto'}}>
    <Typography variant="h4" component="h1" sx={{mb:1,fontWeight:800}}>Accounting entry</Typography>
    <Typography color="text.secondary" sx={{mb:3}}>Record a print job or quote, a customer payment or an expense.</Typography>
    <Stack spacing={2}>
      {error&&<Alert severity="error">{error}</Alert>}
      {success&&<Alert severity="success">{success}</Alert>}
      {pending&&<Alert severity="warning"><Typography>{pending.summary}</Typography><Typography variant="body2">Confirmation is pending. Keep this entry on this device and retry it before adding another.</Typography><Button disabled={busy} onClick={()=>void dispatch(pending)}>Retry saved entry</Button></Alert>}
      {!ready&&!pending&&<Button disabled={busy} onClick={()=>void reload().catch(cause=>setError(message(cause)))}>Reload records</Button>}
      <Paper variant="outlined" sx={{p:{xs:2,md:3}}}>
        <ToggleButtonGroup exclusive fullWidth color="primary" aria-label="What are you recording?" value={operation} disabled={locked} sx={{mb:2.5}}
          onChange={(_,value:AccountingOperation|null)=>{if(!value)return;setOperation(value);setAmount('0');setMethod('');setSuccess('');}}>
          <ToggleButton value="sales">Job</ToggleButton><ToggleButton value="payments">Payment</ToggleButton>
          <ToggleButton value="expenses">Expense</ToggleButton><ToggleButton value="customers">Customer</ToggleButton>
        </ToggleButtonGroup>
        {operation==='sales' ? <JobEntry staffId={staffId} customers={customers} materials={materials} services={services.filter(x=>x.visible)} methods={methods} ready={ready} locked={locked}
          businessDate={businessDate} setBusinessDate={setBusinessDate} dispatch={dispatch} onError={setError}/> :
        <Box component="form" onSubmit={submit}>
          <Stack spacing={2.5}>
            {operation==='expenses' ? <>
              <TextField label="Amount spent (₦)" value={amount} required disabled={locked} onChange={event=>setAmount(event.target.value)} slotProps={{htmlInput:{inputMode:'decimal'}}}/>
              <TextField select label="Category" value={category} required disabled={!ready||locked} onChange={event=>setCategory(event.target.value)}
                helperText={<>Buying SAV, flex or other rolls? Record it in <Link href={isOwner ? '/bom03/inventory' : '/cashier/inventory'}>Inventory → Restock</Link> so the stock count stays right.</>}>
                {categories.map(c=><MenuItem key={c.name} value={c.name}>{c.name}{c.capital ? ' (asset)' : ''}</MenuItem>)}
              </TextField>
              <Box component="fieldset" sx={{border:0,m:0,p:0}}>
                <Typography component="legend" sx={{fontWeight:600,mb:1}}>Has it been paid?</Typography>
                <ToggleButtonGroup exclusive fullWidth color="primary" value={expenseStatus} disabled={locked} onChange={(_,value:'paid'|'unpaid'|null)=>{if(value){setExpenseStatus(value);setMethod('');}}}>
                  <ToggleButton value="paid">Paid now</ToggleButton><ToggleButton value="unpaid">Not yet paid</ToggleButton>
                </ToggleButtonGroup>
                {expenseStatus==='unpaid'&&<Typography variant="body2" color="text.secondary" sx={{mt:1}}>The owner marks it paid later and chooses Cash, Transfer or POS then.</Typography>}
              </Box>
              {expenseStatus==='paid'&&<Box component="fieldset" sx={{border:0,m:0,p:0}}>
                <Typography component="legend" sx={{fontWeight:600,mb:1}}>Paid from</Typography>
                <ToggleButtonGroup exclusive fullWidth color="primary" value={method} disabled={!ready||locked} onChange={(_,value:PaymentMethod|null)=>setMethod(value||'')}>
                  {methods.map(m=><ToggleButton key={m.method} value={m.method}>{m.label}</ToggleButton>)}
                </ToggleButtonGroup>
              </Box>}
              <Stack direction={{xs:'column',sm:'row'}} spacing={2}>
                <TextField type="date" label="Date" value={businessDate} required disabled={locked} onChange={event=>setBusinessDate(event.target.value)} slotProps={{inputLabel:{shrink:true}}} fullWidth/>
                <TextField label={expenseStatus==='paid' ? 'Paid to (optional)' : 'Owed to (optional)'} value={payee} disabled={locked} onChange={event=>setPayee(event.target.value)} slotProps={{htmlInput:{maxLength:200}}} fullWidth/>
              </Stack>
              <TextField label="What was it for? (optional)" value={expenseNote} disabled={locked} onChange={event=>setExpenseNote(event.target.value)} slotProps={{htmlInput:{maxLength:1000}}}/>
              {nairaToKobo(amount)!==null&&nairaToKobo(amount)!=='0'&&<Alert severity="info" icon={false}>You are recording {expenseSummary(nairaToKobo(amount)!)}</Alert>}
            </> : operation==='customers' ? <>
              <TextField label="Customer name" value={name} required disabled={locked} onChange={event=>setName(event.target.value)} slotProps={{htmlInput:{maxLength:200}}}/>
              <TextField label="Phone or contact (optional)" value={contact} disabled={locked} onChange={event=>setContact(event.target.value)} slotProps={{htmlInput:{maxLength:200}}}/>
              <Typography variant="body2" color="text.secondary">Use the existing customer when possible. Creating a new customer keeps their jobs and payments separate, even when names match.</Typography>
            </> : <>
              <TextField select label="Customer" value={customerId} required disabled={!ready||locked} onChange={event=>{setCustomerId(event.target.value);setJobs([]);setJobIds([]);setJobsReady(false);}}>
                {customers.map(c=><MenuItem key={c.id} value={c.id}>{c.display_name} · {c.contact||c.id.slice(0,8)}</MenuItem>)}
              </TextField>
              <TextField type="date" label="Business date" value={businessDate} required disabled={locked} onChange={event=>setBusinessDate(event.target.value)} slotProps={{inputLabel:{shrink:true}}}/>
              <Box component="fieldset" sx={{border:1,borderColor:'divider',borderRadius:1,p:2}}>
                <Typography component="legend">Jobs being paid</Typography>
                {jobs.map(job=><FormControlLabel key={job.id} sx={{display:'flex'}} control={<Checkbox checked={jobIds.includes(job.id)} disabled={locked} onChange={(_,checked)=>setJobIds(ids=>checked ? [...ids,job.id] : ids.filter(id=>id!==job.id))}/>} label={`${job.description} · ${job.business_date} · ${formatKobo(job.balance_kobo)}`}/>)}
                {!jobs.length&&<Typography color="text.secondary">{!customerId ? 'Choose a customer.' : !jobsReady ? 'Loading jobs…' : 'No unpaid jobs.'}</Typography>}
                <Typography sx={{mt:1,fontWeight:700}}>Selected debt: {formatKobo(selectedDebt.toString())}</Typography>
              </Box>
              <TextField label="Amount received (₦)" helperText="Enter the actual amount received. Any unpaid amount remains due." value={amount} required disabled={locked} onChange={event=>setAmount(event.target.value)} slotProps={{htmlInput:{inputMode:'decimal'}}}/>
              {(operation==='payments'||(nairaToKobo(amount)!==null&&nairaToKobo(amount)!=='0'))&&<TextField select label="Payment method" value={method} required disabled={!ready||locked} onChange={event=>setMethod(normalizePaymentMethod(event.target.value)||'')}>
                <MenuItem value="" disabled>Choose a method</MenuItem>{methods.map(m=><MenuItem key={m.method} value={m.method}>{m.label}</MenuItem>)}
              </TextField>}
            </>}
            <Button type="submit" variant="contained" disabled={!ready||locked}>{busy ? 'Saving…' : pending ? 'Finish the saved entry first' : operation==='customers' ? 'Create customer' : operation==='expenses' ? 'Record expense' : 'Record payment'}</Button>
          </Stack>
        </Box>}
      </Paper>
      {isOwner&&<Paper variant="outlined" sx={{p:{xs:2,md:3}}}>
        <Typography variant="h6" component="h2" sx={{fontWeight:800}}>Services</Typography>
        <Typography color="text.secondary" sx={{mb:2}}>What staff can sell besides printing. A price change applies to new quotes and jobs only. Services use no roll stock.</Typography>
        <Stack spacing={1.25}>
          {services.map(x=><Paper key={x.id} variant="outlined" sx={{p:2,display:'flex',justifyContent:'space-between',alignItems:'center',gap:2,...(x.visible ? {} : {borderStyle:'dashed',bgcolor:'action.hover'})}}>
            <Box><Typography sx={{fontWeight:700}} color={x.visible ? undefined : 'text.secondary'}>{x.name}</Typography>
              <Typography variant="body2" color="text.secondary">{!x.visible ? 'Hidden from staff' : x.pricing==='fixed' ? `Fixed · ${formatKobo(x.unit_price_kobo!)} each` : 'Priced per job · needs your approval'}</Typography></Box>
            <Button variant="outlined" disabled={locked} onClick={()=>setServiceForm({id:x.id,name:x.name,pricing:x.pricing,price:x.unit_price_kobo ? (Number(x.unit_price_kobo)/100).toString() : '',visible:x.visible})}>Edit</Button>
          </Paper>)}
          {!services.length&&<Typography color="text.secondary">{ready ? 'No services yet.' : 'Loading…'}</Typography>}
          {serviceForm ? <Paper variant="outlined" sx={{p:2,borderColor:'primary.main',borderWidth:2}}><Stack spacing={1.5}>
            <Typography sx={{fontWeight:800}}>{serviceForm.id ? 'Edit service' : 'Add a service'}</Typography>
            <TextField label="Name" value={serviceForm.name} disabled={locked} onChange={event=>setServiceForm({...serviceForm,name:event.target.value})} slotProps={{htmlInput:{maxLength:100}}}/>
            <Box component="fieldset" sx={{border:0,m:0,p:0}}>
              <Typography component="legend" sx={{fontWeight:600,mb:1}}>How is it priced?</Typography>
              <ToggleButtonGroup exclusive fullWidth color="primary" value={serviceForm.pricing} disabled={locked} onChange={(_,value:'fixed'|'per_job'|null)=>{if(value)setServiceForm({...serviceForm,pricing:value});}}>
                <ToggleButton value="fixed">Fixed price</ToggleButton><ToggleButton value="per_job">Per job, I approve</ToggleButton>
              </ToggleButtonGroup>
            </Box>
            {serviceForm.pricing==='fixed'&&<TextField label="Price each (₦)" value={serviceForm.price} disabled={locked} onChange={event=>setServiceForm({...serviceForm,price:event.target.value})} slotProps={{htmlInput:{inputMode:'decimal'}}}/>}
            <FormControlLabel control={<Checkbox checked={serviceForm.visible} disabled={locked} onChange={(_,checked)=>setServiceForm({...serviceForm,visible:checked})}/>} label="Staff can use it"/>
            <Stack direction="row" spacing={1}>
              <Button fullWidth variant="outlined" disabled={locked} onClick={()=>setServiceForm(null)}>Cancel</Button>
              <Button fullWidth variant="contained" disabled={!ready||locked} onClick={saveServiceForm}>Save service</Button>
            </Stack>
          </Stack></Paper> : <Button variant="outlined" disabled={!ready||locked} onClick={()=>setServiceForm({name:'',pricing:'fixed',price:'',visible:true})}>+ Add a service</Button>}
        </Stack>
      </Paper>}
      {isOwner&&<Paper variant="outlined" sx={{p:{xs:2,md:3}}}>
        <Typography variant="h6" component="h2" sx={{fontWeight:800}}>Price requests</Typography>
        <Typography color="text.secondary" sx={{mb:2}}>{priceRequests.filter(r=>r.pending).length} waiting</Typography>
        <Stack spacing={1.5}>
          {!priceRequests.some(r=>r.pending)&&<Typography color="text.secondary">{ready ? 'No price is waiting for you.' : 'Loading…'}</Typography>}
          {priceRequests.filter(r=>r.pending).map(r=><Paper key={r.id} variant="outlined" sx={{p:2,borderColor:'primary.main',borderWidth:2}}>
            <Stack direction="row" spacing={2} sx={{justifyContent:'space-between'}}>
              <Typography variant="body2" sx={{fontWeight:700}} color="primary">{r.quote_number} · {r.client_name}</Typography>
              <Typography variant="body2" color="text.secondary">{new Date(r.created_at).toLocaleString('en-NG',{timeZone:'Africa/Lagos',hour:'2-digit',minute:'2-digit',day:'numeric',month:'short'})} · {r.requested_by}</Typography>
            </Stack>
            <Typography sx={{fontWeight:700,mt:1}}>{r.description}</Typography>
            <Typography variant="body2" color="text.secondary">{r.is_service ? `${r.material_name} · ${r.quantity}` : `${r.material_name} · ${r.width_ft} × ${r.height_ft} ft · ${r.quantity} piece${r.quantity==='1' ? '' : 's'}`}</Typography>
            <Box sx={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:1,my:1.5}}>
              <Paper variant="outlined" sx={{p:1.25,bgcolor:'action.hover'}}><Typography variant="caption" color="text.secondary">List price</Typography><Typography sx={{fontWeight:800}}>{r.list_total_kobo ? formatKobo(r.list_total_kobo) : 'Priced per job'}</Typography></Paper>
              <Paper variant="outlined" sx={{p:1.25,borderColor:'warning.main'}}><Typography variant="caption">Asked</Typography><Typography sx={{fontWeight:800}}>{formatKobo(r.requested_total_kobo)}</Typography>
                {r.list_total_kobo&&<Typography variant="caption">{Math.abs(Math.round((1-Number(r.requested_total_kobo)/Number(r.list_total_kobo))*100))}% {Number(r.requested_total_kobo)<Number(r.list_total_kobo) ? 'less' : 'more'}</Typography>}</Paper>
            </Box>
            <Typography sx={{mb:1.5}}>“{r.reason}”</Typography>
            <TextField label="Note to staff (optional)" size="small" fullWidth value={decisionNotes[r.id] ?? ''} disabled={locked} onChange={event=>setDecisionNotes(notes=>({...notes,[r.id]:event.target.value}))} slotProps={{htmlInput:{maxLength:500}}}/>
            <Stack direction="row" spacing={1} sx={{mt:1.5}}>
              <Button fullWidth variant="outlined" color="error" disabled={!ready||locked} onClick={()=>decidePrice(r,'decline')}>Decline</Button>
              <Button fullWidth variant="contained" disabled={!ready||locked} onClick={()=>decidePrice(r,'approve')}>Approve</Button>
            </Stack>
          </Paper>)}
          {priceRequests.some(r=>!r.pending)&&<>
            <Typography variant="subtitle2" color="text.secondary" sx={{mt:1}}>Decided in the last 30 days</Typography>
            {priceRequests.filter(r=>!r.pending).map(r=><Stack key={r.id} direction="row" spacing={2} sx={{justifyContent:'space-between',py:.5}}>
              <Typography variant="body2">{r.quote_number} · {r.description} · {formatKobo(r.requested_total_kobo)}</Typography>
              <Typography variant="body2" sx={{fontWeight:700}} color={r.status==='declined' ? 'error.main' : 'success.main'}>{r.status==='declined' ? 'Declined' : r.status==='used' ? 'Approved, used' : 'Approved'}</Typography>
            </Stack>)}
          </>}
        </Stack>
      </Paper>}
      {isOwner&&<Paper variant="outlined" sx={{p:{xs:2,md:3}}}>
        <Typography variant="h6" component="h2" sx={{fontWeight:800}}>Expenses awaiting payment</Typography>
        <Typography color="text.secondary" sx={{mb:2}}>Still to pay: {formatKobo(awaiting.filter(e=>e.payable).reduce((sum,e)=>sum+BigInt(e.amount_kobo),BigInt(0)).toString())}</Typography>
        <Stack spacing={1.5}>
          {!awaiting.some(e=>e.payable)&&<Typography color="text.secondary">{ready ? 'Nothing waiting to be paid.' : 'Loading…'}</Typography>}
          {awaiting.filter(e=>e.payable).map(e=><Paper key={e.id} variant="outlined" sx={{p:2}}>
            <Stack direction="row" spacing={2} sx={{justifyContent:"space-between"}}>
              <Box><Typography sx={{fontWeight:700}}>{e.category}</Typography>
                <Typography variant="body2" color="text.secondary">{[e.paid_to,e.description,e.business_date,e.logged_by ? `logged by ${e.logged_by}` : null].filter(Boolean).join(' · ')}</Typography></Box>
              <Typography sx={{fontWeight:800,whiteSpace:'nowrap'}}>{formatKobo(e.amount_kobo)}</Typography>
            </Stack>
            {payingId===e.id ? <Stack spacing={1.5} sx={{mt:2}}>
              <ToggleButtonGroup exclusive fullWidth color="primary" aria-label="Paid from" value={payMethod} disabled={locked} onChange={(_,value:PaymentMethod|null)=>setPayMethod(value||'')}>
                {methods.map(m=><ToggleButton key={m.method} value={m.method}>{m.label}</ToggleButton>)}
              </ToggleButtonGroup>
              <TextField type="date" label="Payment date" value={payDate} disabled={locked} onChange={event=>setPayDate(event.target.value)} slotProps={{inputLabel:{shrink:true}}}/>
              <Stack direction="row" spacing={1}>
                <Button fullWidth variant="outlined" disabled={locked} onClick={()=>{setPayingId('');setPayMethod('');}}>Cancel</Button>
                <Button fullWidth variant="contained" disabled={!ready||locked} onClick={()=>payExpense(e)}>Confirm paid</Button>
              </Stack>
            </Stack> : <Button sx={{mt:1.5}} variant="outlined" disabled={locked} onClick={()=>{requestId.current=null;setPayingId(e.id);setPayMethod('');setError('');}}>Mark paid</Button>}
          </Paper>)}
          {awaiting.some(e=>!e.payable)&&<>
            <Typography variant="subtitle2" color="text.secondary" sx={{mt:1}}>From before the new books</Typography>
            {awaiting.filter(e=>!e.payable).map(e=><Paper key={e.id} variant="outlined" sx={{p:2,borderStyle:'dashed',bgcolor:'action.hover'}}>
              <Stack direction="row" spacing={2} sx={{justifyContent:"space-between"}}><Typography sx={{fontWeight:700}}>{e.category}</Typography><Typography sx={{fontWeight:800}}>{formatKobo(e.amount_kobo)}</Typography></Stack>
              <Typography variant="body2" color="text.secondary">Logged in Sheets{e.business_date ? ` on ${e.business_date}` : ''}. Settle it through the opening balances, not here, so it is not counted twice.</Typography>
            </Paper>)}
          </>}
        </Stack>
      </Paper>}
    </Stack>
  </Box>;
}

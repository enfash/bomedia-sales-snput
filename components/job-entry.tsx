"use client";

import { useState } from 'react';
import { Alert,Box,Button,Checkbox,Chip,Dialog,DialogContent,DialogTitle,FormControlLabel,IconButton,MenuItem,Paper,Stack,TextField,ToggleButton,ToggleButtonGroup,Typography } from '@mui/material';
import { X } from 'lucide-react';
import { formatKobo } from '@/lib/accounting-money';
import { nairaToKobo } from '@/lib/accounting-entry';
import type { PendingAccountingEntry } from '@/lib/accounting-pending';
import { askedUnitKobo,billing,itemFigures,type JobItem,type JobMaterial } from '@/lib/job-items';
import type { PaymentMethod } from '@/lib/payment-methods';

type Customer={id:string;display_name:string;contact:string|null};
type Method={method:PaymentMethod;label:string};
type QuoteItem={material_id:string;material_name:string;description:string;width_ft:string;height_ft:string;quantity:string;unit_price_kobo:string;amount_kobo:string;
  current_unit_price_kobo:string|null;price_request:{id:string;status:string;requested_unit_price_kobo:string;decision_note:string|null}|null};
type Lookup={found:boolean;legacy?:boolean;estimate_id?:string;quote_number?:string;customer_id?:string|null;client_name?:string;used?:boolean;items?:QuoteItem[]};
type Saved={quoteNumber:string;estimateId:string;totalKobo:string;pending:number;clientName:string;lines:string[]};
const SIZES=[[3,2],[4,3],[6,4],[8,4],[10,4],[12,4]];
const key=()=>Math.random().toString(36).slice(2,9);
const emptyItem=():JobItem=>({key:key(),materialId:'',description:'',width:'',height:'',unit:'ft',quantity:'1'});
const trimFt=(value:string)=>String(Number(value));

export function JobEntry({staffId,customers,materials,methods,ready,locked,businessDate,setBusinessDate,dispatch,onError}:{
  staffId:string;customers:Customer[];materials:JobMaterial[];methods:Method[];ready:boolean;locked:boolean;businessDate:string;setBusinessDate:(v:string)=>void;
  dispatch:(entry:PendingAccountingEntry)=>Promise<Record<string,unknown>|null>;onError:(message:string)=>void}) {
  const [customerId,setCustomerId]=useState(''),[clientName,setClientName]=useState('');
  const [items,setItems]=useState<JobItem[]>([]),[editing,setEditing]=useState<JobItem|null>(null),[asking,setAsking]=useState(false);
  const [askTotal,setAskTotal]=useState(''),[askReason,setAskReason]=useState('');
  const [paid,setPaid]=useState('0'),[method,setMethod]=useState<PaymentMethod|''>('');
  const [quoteInput,setQuoteInput]=useState(''),[quote,setQuote]=useState<{id:string;number:string}|null>(null),[agreed,setAgreed]=useState(false);
  const [saved,setSaved]=useState<Saved|null>(null),[looking,setLooking]=useState(false);
  const material=(id:string)=>materials.find(m=>m.id===id);
  const customer=customers.find(c=>c.id===customerId);
  const bills=items.map(item=>billing(item,material(item.materialId)));
  const total=bills.reduce((sum,b)=>sum+(b ? BigInt(b.totalKobo) : BigInt(0)),BigInt(0));
  const waiting=bills.some(b=>b?.waiting),changed=bills.some(b=>b?.priceChanged),asks=items.filter(i=>i.ask);
  const paidKobo=nairaToKobo(paid);
  const methodLabel=(value:string)=>methods.find(m=>m.method===value)?.label ?? '…';
  const usedFt=(materialId:string,except?:string)=>items.filter(i=>i.materialId===materialId&&i.key!==except)
    .reduce((sum,i)=>sum+(itemFigures(i,material(i.materialId))?.rollLengthFt ?? 0),0);

  function reset() {setItems([]);setPaid('0');setMethod('');setQuote(null);setAgreed(false);setQuoteInput('');setClientName('');}
  async function loadQuote(number:string) {
    onError('');setLooking(true);
    try {
      const response=await fetch(`/api/accounting/quotes?number=${encodeURIComponent(number.trim().toUpperCase())}`,{cache:'no-store'});
      const found=await response.json() as Lookup&{error?:string};
      if(!response.ok)throw new Error(found.error || 'The quote could not be loaded.');
      if(!found.found)throw new Error('No quote with that number.');
      if(found.legacy)throw new Error('This is an old Sheets quote. Enter its items again.');
      if(found.used)throw new Error('This quote has already been used for a job.');
      setSaved(null);setCustomerId(found.customer_id ?? '');setClientName(found.customer_id ? '' : found.client_name ?? '');
      setItems((found.items ?? []).map(q=>({key:key(),materialId:q.material_id,description:q.description,width:trimFt(q.width_ft),height:trimFt(q.height_ft),unit:'ft',
        quantity:trimFt(q.quantity),quoted:{unitPriceKobo:q.unit_price_kobo,currentUnitPriceKobo:q.current_unit_price_kobo,
          request:q.price_request ? {id:q.price_request.id,status:q.price_request.status,requestedUnitPriceKobo:q.price_request.requested_unit_price_kobo,note:q.price_request.decision_note} : undefined}})));
      setQuote({id:found.estimate_id!,number:found.quote_number!});setAgreed(false);setQuoteInput(found.quote_number!);
    } catch(cause) {onError(cause instanceof Error ? cause.message : 'The quote could not be loaded.');}
    finally {setLooking(false);}
  }
  function saveItem() {
    if(!editing)return;
    const figures=itemFigures(editing,material(editing.materialId));
    if(!editing.description.trim()||!figures){onError('Enter what it is, the material, the size and the pieces.');return;}
    if(!figures.fits){onError('This size does not fit the roll either way round.');return;}
    let next:JobItem={...editing,description:editing.description.trim()};
    const original=items.find(i=>i.key===editing.key);
    // Any change to a quoted item drops its quoted/approved price.
    if(original?.quoted && (['materialId','width','height','unit','quantity'] as const).some(k=>original[k]!==editing[k]))next={...next,quoted:undefined};
    if(asking) {
      const kobo=nairaToKobo(askTotal),unit=kobo ? askedUnitKobo(kobo,next.quantity) : null;
      if(!unit||askReason.trim().length<3){onError('Enter the price the customer wants and why.');return;}
      if(unit===figures.listUnitKobo){onError('That is already the list price.');return;}
      next={...next,ask:{totalKobo:(BigInt(unit)*BigInt(next.quantity)).toString(),reason:askReason.trim()}};
    } else next={...next,ask:undefined};
    setItems(list=>original ? list.map(i=>i.key===next.key ? next : i) : [...list,next]);
    setEditing(null);setAsking(false);onError('');
  }
  async function saveQuote() {
    onError('');
    if(!items.length||bills.some(b=>!b)){onError('Add at least one complete item.');return;}
    if(!customer&&!clientName.trim()){onError('Choose a customer or type a name for this quote.');return;}
    if(asks.length&&!customer){onError('Choose the customer before asking the owner for a price.');return;}
    const payload={...(customer ? {customerId} : {clientName:clientName.trim()}),businessDate,
      items:items.map(i=>({materialId:i.materialId,description:i.description,quantity:i.quantity,widthFt:bills[items.indexOf(i)]!.widthFt,heightFt:bills[items.indexOf(i)]!.heightFt})),
      ...(asks.length ? {priceRequests:items.flatMap((i,index)=>i.ask ? [{itemIndex:index,requestedUnitPriceKobo:askedUnitKobo(i.ask.totalKobo,i.quantity)!,reason:i.ask.reason}] : [])} : {})};
    const name=customer?.display_name ?? clientName.trim();
    const result=await dispatch({version:1,staffId,operation:'quotes',requestId:crypto.randomUUID(),payload,summary:`Quote for ${name}: ${items.length} item${items.length===1 ? '' : 's'}`});
    if(!result)return;
    const quoted=(result.items as {description:string;material_name:string;width_ft:string;height_ft:string;quantity:string;amount_kobo:string}[]) ?? [];
    setSaved({quoteNumber:String(result.quote_number),estimateId:String(result.estimate_id),totalKobo:String(result.total_kobo),pending:Number(result.pending_price_requests ?? 0),clientName:name,
      lines:quoted.map((q,n)=>`${n+1}. ${q.description}, ${q.material_name} ${trimFt(q.width_ft)} × ${trimFt(q.height_ft)} ft × ${trimFt(q.quantity)}: ${formatKobo(q.amount_kobo)}`)});
    reset();
  }
  async function recordJob() {
    onError('');
    if(!customer){onError('Choose the customer.');return;}
    if(!items.length||bills.some(b=>!b)){onError('Add at least one complete item.');return;}
    if(waiting){onError('A price is still waiting for the owner.');return;}
    if(asks.length){onError('Send the price request to the owner first, or remove it.');return;}
    if(changed&&!agreed){onError('Confirm the customer agreed to today\'s total.');return;}
    if(paidKobo===null||BigInt(paidKobo)>total){onError('Enter what was paid now, no more than the total.');return;}
    if(paidKobo!=='0'&&!methods.some(m=>m.method===method)){onError('Choose Cash, Transfer or POS for the payment.');return;}
    const payload={customerId,businessDate,...(quote ? {quoteId:quote.id} : {}),initialPaymentKobo:paidKobo,...(paidKobo!=='0' ? {paymentMethod:method} : {}),
      jobs:items.map((i,n)=>({materialId:i.materialId,description:i.description,quantity:i.quantity,widthFt:bills[n]!.widthFt,heightFt:bills[n]!.heightFt,
        expectedUnitPriceKobo:bills[n]!.unitKobo,...(bills[n]!.approvedRequestId ? {priceRequestId:bills[n]!.approvedRequestId} : {})}))};
    const result=await dispatch({version:1,staffId,operation:'sales',requestId:crypto.randomUUID(),payload,
      summary:`${customer.display_name}: ${items.length} item${items.length===1 ? '' : 's'}, ${formatKobo(total.toString())}; ${formatKobo(paidKobo)} paid${paidKobo!=='0' ? ` by ${methodLabel(method)}` : ''}${quote ? ` (${quote.number})` : ''}`});
    if(result)reset();
  }

  if(saved)return <Stack spacing={2}>
    <Paper variant="outlined" sx={{p:3,textAlign:'center',borderColor:'success.main',borderWidth:2}}>
      <Typography color="text.secondary">Quote number</Typography>
      <Typography sx={{fontSize:34,fontWeight:800,letterSpacing:1}}>{saved.quoteNumber}</Typography>
      <Typography>{saved.clientName} · {formatKobo(saved.totalKobo)}</Typography>
      {saved.pending>0&&<Alert severity="warning" sx={{mt:2,textAlign:'left'}}>Waiting for the owner to decide {saved.pending === 1 ? 'a price' : `${saved.pending} prices`}. Nothing is billed and no stock is used. Load this quote again to see the answer.</Alert>}
    </Paper>
    <Paper variant="outlined" sx={{p:2}}>
      <Typography sx={{fontWeight:700,mb:1}}>Message to the customer</Typography>
      <Typography sx={{whiteSpace:'pre-line'}}>{[`BOMedia quote ${saved.quoteNumber} for ${saved.clientName}`,...saved.lines,`Total: ${formatKobo(saved.totalKobo)}`,'Prices may change; we confirm before printing.'].join('\n')}</Typography>
    </Paper>
    <Stack direction="row" spacing={1}>
      <Button fullWidth variant="outlined" onClick={()=>void navigator.clipboard?.writeText([`BOMedia quote ${saved.quoteNumber} for ${saved.clientName}`,...saved.lines,`Total: ${formatKobo(saved.totalKobo)}`].join('\n'))}>Copy</Button>
      <Button fullWidth variant="contained" color="success" href={`https://wa.me/?text=${encodeURIComponent([`BOMedia quote ${saved.quoteNumber} for ${saved.clientName}`,...saved.lines,`Total: ${formatKobo(saved.totalKobo)}`].join('\n'))}`} target="_blank" rel="noopener">Send on WhatsApp</Button>
    </Stack>
    {saved.pending===0&&<Button variant="contained" size="large" onClick={()=>void loadQuote(saved.quoteNumber)}>Customer agreed: record job now</Button>}
    <Button onClick={()=>setSaved(null)}>Start a new entry</Button>
  </Stack>;

  return <Stack spacing={2.5}>
    <Stack direction="row" spacing={1} sx={{alignItems:'flex-end'}}>
      <TextField label="Start from a quote (optional)" placeholder="QT-00042" value={quoteInput} disabled={locked||looking} onChange={event=>setQuoteInput(event.target.value)} fullWidth
        slotProps={{htmlInput:{style:{textTransform:'uppercase'}}}}/>
      <Button variant="outlined" disabled={!ready||locked||looking||!quoteInput.trim()} onClick={()=>void loadQuote(quoteInput)} sx={{height:56}}>{looking ? 'Loading…' : 'Load'}</Button>
    </Stack>
    {quote&&<Alert severity={waiting ? 'warning' : changed ? 'warning' : 'info'} action={<Button color="inherit" disabled={locked||looking} onClick={()=>void loadQuote(quote.number)}>Check again</Button>}>
      {waiting ? `Quote ${quote.number}: a price is waiting for the owner.` : changed ? `Quote ${quote.number}: a price has changed since this quote. The job is billed at today's price.` : `Loaded quote ${quote.number}.`}
    </Alert>}
    <TextField select label="Customer" value={customerId} disabled={!ready||locked||(!!quote&&bills.some(b=>b?.approvedRequestId))} onChange={event=>setCustomerId(event.target.value)}
      helperText="Needed to record the job or ask for a price. New customer? Use the Customer tab first.">
      <MenuItem value="">No customer yet</MenuItem>
      {customers.map(c=><MenuItem key={c.id} value={c.id}>{c.display_name} · {c.contact||c.id.slice(0,8)}</MenuItem>)}
    </TextField>
    {!customer&&<TextField label="Name for the quote" value={clientName} disabled={locked} onChange={event=>setClientName(event.target.value)} slotProps={{htmlInput:{maxLength:200}}}
      helperText="Only for a quote. Choose a real customer to record the job."/>}
    <Stack spacing={1.25}>
      {items.map((item,n)=>{const b=bills[n],m=material(item.materialId);return <Paper key={item.key} variant="outlined" sx={{p:2,borderColor:b?.waiting||b?.priceChanged ? 'warning.main' : b?.approvedRequestId ? 'success.main' : undefined,borderWidth:b?.waiting||b?.priceChanged||b?.approvedRequestId ? 2 : 1}}>
        <Stack direction="row" spacing={2} sx={{justifyContent:'space-between'}}>
          <Typography sx={{fontWeight:700}}>{item.description}</Typography>
          <Typography sx={{fontWeight:800,whiteSpace:'nowrap'}}>{b ? formatKobo(b.totalKobo) : '—'}</Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary">{m ? `${m.name} ${Number(m.width_ft)} ft` : 'Material missing'} · {item.width} × {item.height} {item.unit} · {item.quantity} piece{item.quantity==='1' ? '' : 's'}</Typography>
        {b?.priceChanged&&b.quotedTotalKobo&&<Typography variant="body2" sx={{mt:.5}}><s>Quoted {formatKobo(b.quotedTotalKobo)}</s> · today {formatKobo(b.totalKobo)}</Typography>}
        {b?.approvedRequestId&&<Typography variant="body2" color="success.main" sx={{mt:.5}}>Price approved by the owner{item.quoted?.request?.note ? `: “${item.quoted.request.note}”` : ''}</Typography>}
        {b?.waiting&&<Chip size="small" color="warning" label="Waiting for owner" sx={{mt:.5}}/>}
        {b?.declined&&<Typography variant="body2" color="error.main" sx={{mt:.5}}>Owner declined{item.quoted?.request?.note ? `: “${item.quoted.request.note}”` : ''}. List price applies.</Typography>}
        {item.ask&&<Chip size="small" color="warning" label={`Asking ${formatKobo(item.ask.totalKobo)}`} sx={{mt:.5}}/>}
        <Stack direction="row" spacing={1} sx={{mt:.5}}>
          <Button size="small" disabled={locked} onClick={()=>{setEditing({...item});setAsking(!!item.ask);setAskTotal(item.ask ? (Number(item.ask.totalKobo)/100).toString() : '');setAskReason(item.ask?.reason ?? '');}}>Edit</Button>
          <Button size="small" color="inherit" disabled={locked} onClick={()=>setItems(list=>list.filter(i=>i.key!==item.key))}>Remove</Button>
        </Stack>
      </Paper>;})}
      <Button variant="outlined" size="large" disabled={!ready||locked} onClick={()=>{setEditing(emptyItem());setAsking(false);setAskTotal('');setAskReason('');}} sx={{borderStyle:'dashed'}}>+ Add {items.length ? 'another ' : 'an '}item</Button>
    </Stack>
    <TextField type="date" label="Date" value={businessDate} required disabled={locked} onChange={event=>setBusinessDate(event.target.value)} slotProps={{inputLabel:{shrink:true}}}/>
    {items.length>0&&<Paper variant="outlined" sx={{p:2}}>
      <Stack direction="row" sx={{justifyContent:'space-between',alignItems:'baseline'}}>
        <Typography sx={{fontWeight:600}}>Total{changed ? ' today' : ''}</Typography>
        <Typography sx={{fontSize:22,fontWeight:800}}>{formatKobo(total.toString())}</Typography>
      </Stack>
      <Stack spacing={1.5} sx={{mt:1.5}}>
        <TextField label="Paid now (₦)" value={paid} disabled={locked} onChange={event=>setPaid(event.target.value)} slotProps={{htmlInput:{inputMode:'decimal'}}}
          helperText="Enter 0 if nothing has been paid. Whatever is unpaid stays as the customer's balance."/>
        {paidKobo!==null&&paidKobo!=='0'&&<ToggleButtonGroup exclusive fullWidth color="primary" aria-label="Paid by" value={method} disabled={locked} onChange={(_,value:PaymentMethod|null)=>setMethod(value||'')}>
          {methods.map(m=><ToggleButton key={m.method} value={m.method}>{m.label}</ToggleButton>)}
        </ToggleButtonGroup>}
      </Stack>
    </Paper>}
    {changed&&!waiting&&<FormControlLabel control={<Checkbox checked={agreed} disabled={locked} onChange={(_,checked)=>setAgreed(checked)}/>} label="The customer has agreed to today's total"/>}
    <Stack direction={{xs:'column',sm:'row'}} spacing={1.25}>
      <Button fullWidth size="large" variant="outlined" disabled={!ready||locked||!items.length} onClick={()=>void saveQuote()}>{asks.length ? 'Send to owner' : 'Save as quote'}</Button>
      <Button fullWidth size="large" variant="contained" disabled={!ready||locked||!items.length||waiting||asks.length>0||(changed&&!agreed)} onClick={()=>void recordJob()}>
        {waiting ? 'Waiting for owner' : changed&&!agreed ? 'Confirm the new price first' : 'Record job'}</Button>
    </Stack>
    <Typography variant="body2" color="text.secondary" sx={{textAlign:'center'}}>A quote uses no stock and owes nothing. Recording the job takes the rolls and adds the bill.</Typography>

    <Dialog open={!!editing} onClose={()=>setEditing(null)} fullWidth maxWidth="sm">
      {editing&&(()=>{const m=material(editing.materialId),f=itemFigures(editing,m),left=m?.remaining_length_ft!==undefined&&f?.rollLengthFt!=null ? Number(m.remaining_length_ft)-usedFt(m.id,editing.key)-f.rollLengthFt : null;
        const set=(patch:Partial<JobItem>)=>setEditing({...editing,...patch});
        const askKobo=nairaToKobo(askTotal),askUnit=askKobo ? askedUnitKobo(askKobo,editing.quantity) : null;
        return <>
        <DialogTitle sx={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>{items.some(i=>i.key===editing.key) ? 'Edit item' : 'New item'}
          <IconButton aria-label="Close" onClick={()=>setEditing(null)}><X size={20}/></IconButton></DialogTitle>
        <DialogContent><Stack spacing={2} sx={{pt:1}}>
          <TextField label="What is it?" value={editing.description} onChange={event=>set({description:event.target.value})} slotProps={{htmlInput:{maxLength:1000}}}/>
          <TextField select label="Material" value={editing.materialId} onChange={event=>set({materialId:event.target.value})}>
            {materials.map(x=><MenuItem key={x.id} value={x.id}>{x.name} · {Number(x.width_ft)} ft roll · {formatKobo(x.selling_price_per_sqft_kobo)}/sq ft{x.remaining_length_ft!==undefined ? ` · ${Number(x.remaining_length_ft)} ft in stock` : ''}</MenuItem>)}
          </TextField>
          <Stack direction="row" sx={{flexWrap:'wrap',gap:1}}>
            {SIZES.map(([w,h])=><Chip key={`${w}x${h}`} label={`${w}×${h}`} clickable color={editing.unit==='ft'&&editing.width===String(w)&&editing.height===String(h) ? 'primary' : 'default'}
              onClick={()=>set({width:String(w),height:String(h),unit:'ft'})} sx={{height:44,px:1}}/>)}
          </Stack>
          <Stack direction="row" spacing={1}>
            <TextField label="Width" value={editing.width} onChange={event=>set({width:event.target.value})} slotProps={{htmlInput:{inputMode:'decimal'}}}/>
            <TextField label="Height" value={editing.height} onChange={event=>set({height:event.target.value})} slotProps={{htmlInput:{inputMode:'decimal'}}}/>
            <ToggleButtonGroup exclusive aria-label="Unit" value={editing.unit} onChange={(_,value:'ft'|'in'|null)=>{if(value)set({unit:value});}}>
              <ToggleButton value="ft">ft</ToggleButton><ToggleButton value="in">in</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
          <Stack direction="row" spacing={1} sx={{alignItems:'center'}}>
            <Button variant="outlined" aria-label="One fewer" onClick={()=>set({quantity:String(Math.max(1,(Number(editing.quantity)||1)-1))})} sx={{minWidth:52,height:52}}>−</Button>
            <TextField label="Pieces" value={editing.quantity} onChange={event=>set({quantity:event.target.value})} slotProps={{htmlInput:{inputMode:'numeric',style:{textAlign:'center'}}}} fullWidth/>
            <Button variant="outlined" aria-label="One more" onClick={()=>set({quantity:String((Number(editing.quantity)||0)+1)})} sx={{minWidth:52,height:52}}>+</Button>
          </Stack>
          {f&&!f.fits&&<Alert severity="error">This size does not fit a {m ? Number(m.width_ft) : ''} ft roll either way round.</Alert>}
          {f&&f.fits&&f.listUnitKobo&&<Box sx={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:1}}>
            <Paper variant="outlined" sx={{p:1.5}}><Typography variant="caption" color="text.secondary">Area per piece</Typography><Typography sx={{fontWeight:800}}>{Number(f.areaSqft.toFixed(2))} sq ft</Typography></Paper>
            <Paper variant="outlined" sx={{p:1.5}}><Typography variant="caption" color="text.secondary">Roll used</Typography><Typography sx={{fontWeight:800}}>{Number(f.rollLengthFt!.toFixed(2))} ft</Typography>
              {f.rotated&&<Typography variant="caption" color="text.secondary">turned sideways</Typography>}</Paper>
            <Paper variant="outlined" sx={{p:1.5}}><Typography variant="caption" color="text.secondary">Stock after</Typography>
              <Typography sx={{fontWeight:800}} color={left!==null&&left<0 ? 'error.main' : 'success.dark'}>{left===null ? '—' : `${Number(left.toFixed(2))} ft`}</Typography></Paper>
            <Paper sx={{p:1.5,bgcolor:'text.primary',color:'background.paper'}}><Typography variant="caption">Item total</Typography>
              <Typography sx={{fontWeight:800}}>{formatKobo((BigInt(f.listUnitKobo)*BigInt(editing.quantity)).toString())}</Typography>
              <Typography variant="caption">{editing.quantity} × {formatKobo(f.listUnitKobo)}</Typography></Paper>
          </Box>}
          {left!==null&&left<0&&<Alert severity="warning">Not enough of this material in stock to record the job. You can still save a quote.</Alert>}
          <Typography variant="body2" color="text.secondary">Price comes from the material list. Turned sideways automatically when that uses less roll.</Typography>
          {!asking ? <Button onClick={()=>setAsking(true)}>Customer wants a different price? Ask the owner</Button> : <Paper variant="outlined" sx={{p:2}}><Stack spacing={1.5}>
            <TextField label="Price the customer wants for this item (₦)" value={askTotal} onChange={event=>setAskTotal(event.target.value)} slotProps={{htmlInput:{inputMode:'decimal'}}}
              helperText={askUnit&&f?.listUnitKobo ? `${formatKobo(askUnit)} per piece · total ${formatKobo((BigInt(askUnit)*BigInt(editing.quantity)).toString())} · ${Math.round((1-Number(askUnit)/Number(f.listUnitKobo))*100)}% ${Number(askUnit)<Number(f.listUnitKobo) ? 'below' : 'above'} list` : `For all ${editing.quantity} pieces together`}/>
            <TextField label="Why?" value={askReason} multiline minRows={2} onChange={event=>setAskReason(event.target.value)} slotProps={{htmlInput:{maxLength:500}}}/>
            <Typography variant="body2" color="text.secondary">This is saved as a quote waiting for the owner. Nothing is billed and no stock is used. Once approved, load the quote and record the job at the approved price.</Typography>
            <Button color="inherit" onClick={()=>{setAsking(false);setAskTotal('');setAskReason('');}}>Use the list price instead</Button>
          </Stack></Paper>}
          <Button variant="contained" size="large" onClick={saveItem}>{items.some(i=>i.key===editing.key) ? 'Save item' : 'Add to job'}</Button>
        </Stack></DialogContent></>;})()}
    </Dialog>
  </Stack>;
}

"use client";

import { useCallback,useEffect,useRef,useState } from 'react';
import { Alert,Box,Button,MenuItem,Paper,Stack,TextField,ToggleButton,ToggleButtonGroup,Typography } from '@mui/material';
import { records } from '@/components/accounting-entry';
import { formatKobo } from '@/lib/accounting-money';
import { lagosBusinessDate,nairaToKobo } from '@/lib/accounting-entry';
import { readPendingAccounting,sendAccountingEntry,type PendingAccountingEntry } from '@/lib/accounting-pending';
import { normalizePaymentMethod,type PaymentMethod } from '@/lib/payment-methods';
import { WASTE_REASONS } from '@/lib/constants';

type Material={id:string;name:string;width_ft:string;remaining_length_ft:string;roll_count:number};
type Roll={id:string;material_id:string;legacy_roll_id:string|null;item_name:string;width_ft:string;total_length_ft:string;
  remaining_length_ft:string;purchase_cost_kobo:string|null;status:string};
type Method={method:PaymentMethod;label:string};
type Tab='restocks'|'waste'|'stock-counts';
const SETUP_RESERVE_FT=10;
const feetPattern=/^(0|[1-9][0-9]{0,5})(\.[0-9]{1,6})?$/;
const ft=(value:string)=>`${Number(value).toLocaleString('en-NG',{maximumFractionDigits:2})} ft`;
const rollName=(roll:Roll)=>roll.legacy_roll_id || `${roll.item_name} ${Number(roll.width_ft)}ft`;
const inStock=(roll:Roll)=>['active','low stock'].includes(roll.status.toLowerCase()) && Number(roll.remaining_length_ft)>0;
// Display estimate only; the server computes the exact kobo from the roll's cost.
function valueChange(roll:Roll,newRemaining:number):number|null {
  if(!roll.purchase_cost_kobo || Number(roll.total_length_ft)<=0)return null;
  const value=(remaining:number)=>Math.round(remaining/Number(roll.total_length_ft)*Number(roll.purchase_cost_kobo));
  return value(newRemaining)-value(Number(roll.remaining_length_ft));
}
const message=(error:unknown)=>error instanceof Error ? error.message : 'The entry is saved on this device. Retry when connected.';

export function StockEntry({staffId,isOwner=false}:{staffId:string;isOwner?:boolean}) {
  const [tab,setTab]=useState<Tab>(isOwner ? 'restocks' : 'waste');
  const [materials,setMaterials]=useState<Material[]>([]),[rolls,setRolls]=useState<Roll[]>([]),[methods,setMethods]=useState<Method[]>([]);
  const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[pending,setPending]=useState<PendingAccountingEntry|null>(null);
  const [error,setError]=useState(''),[success,setSuccess]=useState('');
  const [businessDate,setBusinessDate]=useState(()=>lagosBusinessDate());
  const [materialId,setMaterialId]=useState(''),[rollCount,setRollCount]=useState('1'),[rawLength,setRawLength]=useState(''),[cost,setCost]=useState('');
  const [method,setMethod]=useState<PaymentMethod|''>(''),[supplier,setSupplier]=useState(''),[reference,setReference]=useState('');
  const [rollId,setRollId]=useState(''),[length,setLength]=useState(''),[reason,setReason]=useState(''),[responsible,setResponsible]=useState(''),[note,setNote]=useState('');
  const [counted,setCounted]=useState(''),[countReason,setCountReason]=useState('');
  const requestId=useRef<string|null>(null);
  const reload=useCallback(async()=>{
    const [nextMaterials,nextRolls,nextMethods]=await Promise.all([records<Material>('materials'),records<Roll>('inventory'),records<Method>('payment_methods')]);
    setMaterials(nextMaterials);setRolls(nextRolls);setMethods(nextMethods);setReady(true);
  },[]);
  useEffect(()=>{
    // Hydrate private device storage after SSR; submissions stay disabled until records load.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try {setPending(readPendingAccounting(localStorage,staffId));}catch(cause){setError(message(cause));return;}
    void reload().catch(cause=>setError(message(cause)));
  },[staffId,reload]);
  const locked=busy||pending!==null;
  const material=materials.find(m=>m.id===materialId);
  const roll=rolls.find(r=>r.id===rollId);
  const count=/^[1-9][0-9]?$/.test(rollCount) ? Number(rollCount) : 0;
  const usablePerRoll=feetPattern.test(rawLength) && Number(rawLength)>SETUP_RESERVE_FT ? Number(rawLength)-SETUP_RESERVE_FT : 0;
  const costKobo=nairaToKobo(cost);
  const methodLabel=(value:string)=>methods.find(m=>m.method===value)?.label ?? '…';
  const wasteFt=feetPattern.test(length) ? Number(length) : 0;
  const wasteValue=roll && wasteFt>0 && wasteFt<=Number(roll.remaining_length_ft) ? valueChange(roll,Number(roll.remaining_length_ft)-wasteFt) : null;
  const countedFt=feetPattern.test(counted) ? Number(counted) : null;
  const countValue=roll && countedFt!==null && countedFt<=Number(roll.total_length_ft) ? valueChange(roll,countedFt) : null;
  const countDiff=roll && countedFt!==null ? countedFt-Number(roll.remaining_length_ft) : 0;

  async function dispatch(entry:PendingAccountingEntry) {
    if(!navigator.locks){setError('This browser cannot safely submit entries. Use an updated browser on this device.');return;}
    setBusy(true);setError('');setSuccess('');
    try {
      await navigator.locks.request(`bomedia-accounting:${staffId}`,async()=>{
        const result=await sendAccountingEntry(localStorage,entry);
        setPending(null);requestId.current=null;
        setSuccess(`Saved. Reference: ${String(result.stock_entry_id)}`);
        setRollCount('1');setRawLength('');setCost('');setMethod('');setSupplier('');setReference('');
        setLength('');setReason('');setResponsible('');setNote('');setCounted('');setCountReason('');
        try {await reload();}catch {setError('Saved, but the stock list could not refresh. Refresh before the next entry.');setReady(false);}
      });
    } catch(cause) {
      setError(message(cause));
      try {setPending(readPendingAccounting(localStorage,staffId));}catch {setReady(false);}
    } finally {setBusy(false);}
  }
  function submit(event:React.FormEvent) {
    event.preventDefault();setError('');
    if(!ready||locked)return;
    let payload:Record<string,unknown>,summary:string;
    if(tab==='restocks') {
      if(!material || !count || !usablePerRoll || costKobo===null || BigInt(costKobo)<BigInt(Math.max(count,1))){setError('Choose the material and enter the rolls, length per roll and total paid.');return;}
      if(!normalizePaymentMethod(method)){setError('Choose Cash, Transfer or POS.');return;}
      payload={materialId,rollCount,rawLengthFt:rawLength,totalCostKobo:costKobo,paymentMethod:method,businessDate,
        ...(supplier.trim() ? {supplier:supplier.trim()} : {}),...(reference.trim() ? {reference:reference.trim()} : {})};
      summary=`Restock ${count} x ${material.name} ${Number(material.width_ft)}ft, ${formatKobo(costKobo)} by ${methodLabel(method)} on ${businessDate}`;
    } else if(tab==='waste') {
      if(!roll || !inStock(roll) || wasteFt<=0 || wasteFt>Number(roll.remaining_length_ft) || !reason){setError('Choose a roll, a waste length no more than it has left, and a reason.');return;}
      payload={rollId,lengthFt:length,reason,businessDate,...(responsible.trim() ? {responsible:responsible.trim()} : {}),...(note.trim() ? {note:note.trim()} : {})};
      summary=`Waste ${ft(length)} from ${rollName(roll)} on ${businessDate}: ${reason}`;
    } else {
      if(!roll || countedFt===null || countedFt>Number(roll.total_length_ft) || countDiff===0 || countReason.trim().length<3){setError('Choose the roll, enter a measured length that differs, and explain why.');return;}
      payload={rollId,countedLengthFt:counted,reason:countReason.trim(),businessDate};
      summary=`Count ${rollName(roll)}: ${ft(roll.remaining_length_ft)} to ${ft(counted)} on ${businessDate}`;
    }
    requestId.current??=crypto.randomUUID();
    void dispatch({version:1,staffId,operation:tab,requestId:requestId.current,payload,summary});
  }
  const rollChoices=tab==='waste' ? rolls.filter(inStock) : rolls;
  return <Box sx={{p:{xs:2,md:4},pb:12,maxWidth:780,mx:'auto'}}>
    <Typography variant="h4" component="h1" sx={{mb:1,fontWeight:800}}>Stock</Typography>
    <Typography color="text.secondary" sx={{mb:3}}>{isOwner ? 'Restock rolls, log waste or correct a roll after measuring it.' : 'Log material wasted from a roll.'}</Typography>
    <Stack spacing={2}>
      {error&&<Alert severity="error">{error}</Alert>}
      {success&&<Alert severity="success">{success}</Alert>}
      {pending&&<Alert severity="warning"><Typography>{pending.summary}</Typography><Typography variant="body2">Saved on this device, not yet confirmed. Retry it before recording anything else. It will not be counted twice.</Typography><Button disabled={busy} onClick={()=>void dispatch(pending)}>Retry saved entry</Button></Alert>}
      {!ready&&!pending&&<Button disabled={busy} onClick={()=>void reload().catch(cause=>setError(message(cause)))}>Reload stock</Button>}
      <Paper variant="outlined" sx={{p:{xs:2,md:3}}}>
        <Box component="form" onSubmit={submit}>
          <Stack spacing={2.5}>
            {isOwner&&<ToggleButtonGroup exclusive fullWidth color="primary" aria-label="What are you recording?" value={tab} disabled={locked}
              onChange={(_,value:Tab|null)=>{if(value){setTab(value);setRollId('');setSuccess('');requestId.current=null;}}}>
              <ToggleButton value="restocks">Restock</ToggleButton><ToggleButton value="waste">Waste</ToggleButton><ToggleButton value="stock-counts">Count</ToggleButton>
            </ToggleButtonGroup>}
            {tab==='restocks' ? <>
              <TextField select label="Material" value={materialId} required disabled={!ready||locked} onChange={event=>setMaterialId(event.target.value)}
                helperText={material ? `In stock now: ${ft(material.remaining_length_ft)} on ${material.roll_count} rolls. A new material or width must be added first.` : 'A new material or width must be added first.'}>
                {materials.map(m=><MenuItem key={m.id} value={m.id}>{m.name} · {Number(m.width_ft)} ft wide</MenuItem>)}
              </TextField>
              <Stack direction={{xs:'column',sm:'row'}} spacing={2}>
                <TextField label="Rolls bought" value={rollCount} required disabled={locked} onChange={event=>setRollCount(event.target.value)} slotProps={{htmlInput:{inputMode:'numeric'}}} fullWidth/>
                <TextField label="Length per roll (ft)" value={rawLength} required disabled={locked} onChange={event=>setRawLength(event.target.value)} slotProps={{htmlInput:{inputMode:'decimal'}}} fullWidth
                  helperText={usablePerRoll ? `${SETUP_RESERVE_FT} ft kept back for setup; ${ft(String(usablePerRoll))} usable per roll.` : `Must be more than ${SETUP_RESERVE_FT} ft.`}/>
              </Stack>
              <TextField label="Total paid for all rolls (₦)" value={cost} required disabled={locked} onChange={event=>setCost(event.target.value)} slotProps={{htmlInput:{inputMode:'decimal'}}}/>
              <Box component="fieldset" sx={{border:0,m:0,p:0}}>
                <Typography component="legend" sx={{fontWeight:600,mb:1}}>Paid from</Typography>
                <ToggleButtonGroup exclusive fullWidth color="primary" value={method} disabled={!ready||locked} onChange={(_,value:PaymentMethod|null)=>setMethod(value||'')}>
                  {methods.map(m=><ToggleButton key={m.method} value={m.method}>{m.label}</ToggleButton>)}
                </ToggleButtonGroup>
              </Box>
              <Stack direction={{xs:'column',sm:'row'}} spacing={2}>
                <TextField type="date" label="Date" value={businessDate} required disabled={locked} onChange={event=>setBusinessDate(event.target.value)} slotProps={{inputLabel:{shrink:true}}} fullWidth/>
                <TextField label="Supplier (optional)" value={supplier} disabled={locked} onChange={event=>setSupplier(event.target.value)} slotProps={{htmlInput:{maxLength:200}}} fullWidth/>
              </Stack>
              <TextField label="Invoice or receipt number (optional)" value={reference} disabled={locked} onChange={event=>setReference(event.target.value)} slotProps={{htmlInput:{maxLength:100}}}/>
              {material&&count>0&&usablePerRoll>0&&costKobo&&costKobo!=='0'&&<Alert severity="info" icon={false}>
                <Typography sx={{fontWeight:700}}>{count} roll{count===1 ? '' : 's'} of {material.name} {Number(material.width_ft)} ft · {ft(String(usablePerRoll*count))} usable</Typography>
                <Typography variant="body2">{formatKobo(costKobo)}{method ? ` by ${methodLabel(method)}` : ''} · about {formatKobo((BigInt(costKobo)/BigInt(count)).toString())} per roll</Typography>
              </Alert>}
            </> : <>
              <TextField select label={tab==='waste' ? 'Which roll?' : 'Roll counted'} value={rollId} required disabled={!ready||locked} onChange={event=>setRollId(event.target.value)}>
                {rollChoices.map(r=><MenuItem key={r.id} value={r.id}>{rollName(r)} · {ft(r.remaining_length_ft)} left</MenuItem>)}
              </TextField>
              {tab==='waste' ? <>
                <TextField label="Length wasted (ft)" value={length} required disabled={locked} onChange={event=>setLength(event.target.value)} slotProps={{htmlInput:{inputMode:'decimal'}}}
                  helperText={roll&&wasteFt>0 ? (wasteFt<=Number(roll.remaining_length_ft) ? `Roll will have ${ft(String(Number(roll.remaining_length_ft)-wasteFt))} left.` : `This roll only has ${ft(roll.remaining_length_ft)} left.`) : ' '}/>
                <TextField select label="Reason" value={reason} required disabled={locked} onChange={event=>setReason(event.target.value)}>
                  {WASTE_REASONS.map(r=><MenuItem key={r} value={r}>{r}</MenuItem>)}
                </TextField>
                <Stack direction={{xs:'column',sm:'row'}} spacing={2}>
                  <TextField type="date" label="Date" value={businessDate} required disabled={locked} onChange={event=>setBusinessDate(event.target.value)} slotProps={{inputLabel:{shrink:true}}} fullWidth/>
                  <TextField label="Responsible (optional)" value={responsible} disabled={locked} onChange={event=>setResponsible(event.target.value)} slotProps={{htmlInput:{maxLength:100}}} fullWidth/>
                </Stack>
                <TextField label="Job or note (optional)" value={note} disabled={locked} onChange={event=>setNote(event.target.value)} slotProps={{htmlInput:{maxLength:500}}}/>
                {roll&&wasteValue!==null&&<Alert severity="info" icon={false}>
                  <Typography sx={{fontWeight:700}}>{ft(length)} of {rollName(roll)} wasted</Typography>
                  <Typography variant="body2">About {formatKobo(String(-wasteValue))} of material, counted as waste</Typography>
                </Alert>}
              </> : <>
                <Stack direction="row" spacing={2}>
                  <Paper variant="outlined" sx={{p:1.5,flex:1,bgcolor:'action.hover'}}>
                    <Typography variant="body2" color="text.secondary">App says</Typography>
                    <Typography sx={{fontWeight:800,fontSize:20}}>{roll ? ft(roll.remaining_length_ft) : '—'}</Typography>
                  </Paper>
                  <TextField label="Measured on the roll (ft)" value={counted} required disabled={locked} onChange={event=>setCounted(event.target.value)} slotProps={{htmlInput:{inputMode:'decimal'}}} sx={{flex:1}}/>
                </Stack>
                {roll&&countedFt!==null&&countDiff!==0&&(countValue!==null ? <Alert severity={countDiff<0 ? 'error' : 'success'} icon={false}>
                  <Typography sx={{fontWeight:700}}>{ft(String(Math.abs(countDiff)))} {countDiff<0 ? 'missing' : 'more than recorded'} · {countValue<0 ? '−' : '+'}{formatKobo(String(Math.abs(countValue)))}</Typography>
                </Alert> : <Alert severity="warning">The measured length cannot be more than this roll&apos;s usable length ({ft(roll.total_length_ft)}).</Alert>)}
                <TextField label="Why is it different?" value={countReason} required multiline minRows={3} disabled={locked} onChange={event=>setCountReason(event.target.value)}
                  helperText="Required. A correction cannot be edited later; a mistake is fixed with another correction." slotProps={{htmlInput:{maxLength:500}}}/>
                <TextField type="date" label="Count date" value={businessDate} required disabled={locked} onChange={event=>setBusinessDate(event.target.value)} slotProps={{inputLabel:{shrink:true}}}/>
              </>}
            </>}
            <Button type="submit" variant="contained" size="large" disabled={!ready||locked}>
              {busy ? 'Saving…' : pending ? 'Finish the saved entry first' : tab==='restocks' ? `Add ${count||''} roll${count===1 ? '' : 's'} to stock` : tab==='waste' ? 'Log waste' : 'Save correction'}
            </Button>
          </Stack>
        </Box>
      </Paper>
    </Stack>
  </Box>;
}

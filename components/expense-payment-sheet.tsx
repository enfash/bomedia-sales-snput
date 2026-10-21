"use client";
import { DateField } from '@/components/date-field';
import { useRef, useState } from 'react';
import { Alert, Box, Button, Stack, TextField, Typography } from '@mui/material';
import { ResponsiveSheet } from './responsive-sheet';
import { PaidBy } from './paid-by';
import { lagosBusinessDate } from '@/lib/accounting-entry';
import { saveExpenseRequest } from '@/lib/expense-outbox';
import type { PaymentMethod } from '@/lib/payment-methods';
import type { Expense } from '@/lib/expense-list';
import { settingsStyles } from '@/app/theme';
import { toast } from 'sonner';
export function ExpensePaymentSheet({expense,onClose}:{expense:Expense|null;onClose:()=>void}) {
  const [drafts,setDrafts]=useState<Record<string,{date:string;method:PaymentMethod|''}>>({});
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const saving=useRef(false),id=expense?._expenseId||'';
  const draft=drafts[id]||{date:lagosBusinessDate(),method:''};
  const change=(patch:Partial<typeof draft>)=>setDrafts(old=>({...old,[id]:{...draft,...patch}}));
  async function save(){
    if(!expense||!id||!expense._amountKobo||!draft.method||saving.current)return;
    saving.current=true;setBusy(true);setError('');
    try {
      await saveExpenseRequest({operation:'pay',expenseId:id,amountKobo:expense._amountKobo,businessDate:draft.date,paymentMethod:draft.method});
      toast.info('Expense payment saved on this device. Wait for its confirmed reference.');onClose();
      setDrafts(old=>{const next={...old};delete next[id];return next;});
    }catch(e){setError(e instanceof Error?e.message:'Payment could not be saved.');}
    finally{saving.current=false;setBusy(false);}
  }
  return <ResponsiveSheet open={!!expense} onClose={onClose} title="Mark expense as paid" busy={busy}
    footer={<Box sx={settingsStyles.footer}><Button color="inherit" disabled={busy} onClick={onClose}>Close</Button><Button variant="contained" disabled={busy||!draft.method||!draft.date} onClick={()=>void save()}>Confirm payment</Button></Box>}>
    <Stack spacing={2} sx={settingsStyles.form}>
      {error&&<Alert severity="error">{error}</Alert>}
      <Typography>{expense?.['EXPENSE ID']} · ₦{expense?.AMOUNT} · {expense?.['PAID TO']||expense?.CATEGORY}</Typography>
      <DateField label="Payment date" value={draft.date} onChange={date=>change({date})}/>
      <PaidBy value={draft.method} onChange={method=>change({method})} required/>
      <Typography variant="body2" color="text.secondary">This records the payment against the existing expense. It does not record the cost again.</Typography>
    </Stack>
  </ResponsiveSheet>;
}

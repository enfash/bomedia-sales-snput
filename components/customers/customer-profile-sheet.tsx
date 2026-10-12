"use client";

import { useEffect, useRef, useState } from 'react';
import NextLink from 'next/link';
import { Alert, Box, Button, ButtonBase, Skeleton, TextField, Typography } from '@mui/material';
import { Phone } from 'lucide-react';

import { customerStyles as styles } from '@/app/theme';
import { DebtorPaymentModal } from '@/components/debtor-payment-modal';
import { useFloatingNotice } from '@/components/floating-notice';
import { ResponsiveSheet } from '@/components/responsive-sheet';
import { StatTile } from '@/components/stat-tile';
import { WhatsAppReminder } from '@/components/whatsapp-reminder';
import { koboNaira } from '@/lib/approvals-view';
import { FIELD_LABEL, dayLabel, shortNaira, timeLabel, type CustomerItem } from '@/lib/customers-view';
import type { CustomerProfile } from '@/lib/server/customers';

type Tab = 'sales' | 'payments' | 'changes';
const money = (kobo: string | number) => koboNaira(Number(kobo) || 0);
const message = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Try again.');

/** One customer: who they are, what they owe, their sales and payments, and everything staff changed on the profile. */
export function CustomerProfileSheet({ customer, role, onClose, onChanged }: {
  customer: CustomerItem & { id: string }; role: 'owner' | 'cashier'; onClose: () => void; onChanged: () => void;
}) {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('sales');
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState(false);
  const [version, setVersion] = useState(0);
  const [saved, setSaved] = useState('');
  const owner = role === 'owner';
  const base = owner ? '/bom03' : '/cashier';

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      try {
        const response = await fetch(`/api/accounting/customer-profile?id=${encodeURIComponent(customer.id)}`, { cache: 'no-store' });
        const result = await response.json().catch(() => null);
        if (!response.ok || !result?.customer) throw new Error(result?.error || 'This customer could not be loaded.');
        if (active) { setProfile(result); setError(''); }
      } catch (cause) { if (active) setError(message(cause)); }
    });
    return () => { active = false; };
  }, [customer.id, version]);
  useFloatingNotice('customer-saved', saved ? { tone: 'success', text: saved } : null);

  const refresh = () => { setVersion((v) => v + 1); onChanged(); };
  const c = profile?.customer;
  const shown = c ?? { ...customer, total_kobo: String(customer.totalKobo), owed_kobo: String(customer.owedKobo), orders: customer.orders, last_order_date: customer.lastOrderDate, created_at: customer.createdAt ?? '' };
  const owed = Number(c ? c.owed_kobo : customer.owedKobo) || 0;
  const contact = (c?.contact ?? customer.contact) || '';
  const notes = (c?.notes ?? customer.notes) || '';
  const phone = contact.replace(/[^\d+]/g, '');

  return <>
    <ResponsiveSheet open onClose={onClose} title={customer.name} description={`${customer.reference ?? ''}${shown.created_at ? ` · customer since ${dayLabel(shown.created_at)}` : ''}`}>
      <Box sx={styles.formBody}>
        {error && <Alert severity="error">{error}</Alert>}
        <Box sx={styles.actions}>
          {phone && <Button variant="contained" component="a" href={`tel:${phone}`} startIcon={<Phone size={18} />} sx={styles.actionGrow}>Call</Button>}
          {owed > 0 && phone && <WhatsAppReminder clientName={customer.name} contact={contact} balance={owed / 100} variant="full" />}
          {owed > 0 && <Button variant="outlined" color="inherit" onClick={() => setPaying(true)}>Collect payment</Button>}
          <Button variant="outlined" color="inherit" onClick={() => setEditing(true)}>Edit</Button>
        </Box>

        <Box sx={styles.tiles}>
          <StatTile tone={owed > 0 ? 'error' : 'neutral'} label="Owes" value={shortNaira(owed)} />
          <StatTile label="Spent" value={shortNaira(Number(shown.total_kobo) || 0)} />
          <StatTile label="Orders" value={shown.orders} />
        </Box>

        <Box sx={styles.details}>
          <Box sx={styles.detailLine}><Typography color="text.secondary">Phone</Typography>
            <Typography sx={contact ? styles.detailValue : [styles.detailValue, styles.noPhone]}>{contact || 'No phone number'}</Typography></Box>
          <Box sx={styles.detailLine}><Typography color="text.secondary">Notes</Typography><Typography sx={styles.detailValue}>{notes || '—'}</Typography></Box>
          <Box sx={styles.detailLine}><Typography color="text.secondary">Last order</Typography><Typography sx={styles.detailValue}>{dayLabel(shown.last_order_date)}</Typography></Box>
        </Box>

        <Box role="group" aria-label="Show" sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {([['sales', `Sales · ${profile?.sales.length ?? shown.orders}`], ['payments', `Payments · ${profile?.payments.length ?? 0}`], ['changes', `Changes · ${profile?.changes.length ?? 0}`]] as [Tab, string][]).map(([id, label]) =>
            <Button key={id} variant={tab === id ? 'contained' : 'outlined'} color={tab === id ? 'primary' : 'inherit'} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</Button>)}
        </Box>

        {!profile && !error && <Skeleton variant="rounded" height={120} />}
        {profile && tab === 'sales' && (profile.sales.length ? <Box>
          {profile.sales.map((sale) => <ButtonBase key={sale.sales_id} component={NextLink} href={`${base}/records?open=${encodeURIComponent(sale.sales_id)}`} sx={[styles.line, { width: '100%', textAlign: 'left', justifyContent: 'space-between' }]}>
            <Box sx={styles.lineMain}>
              <Typography sx={styles.lineName}>{sale.what || 'Sale'}</Typography>
              <Typography variant="body2" color="text.secondary"><Box component="span" sx={styles.ref}>{sale.sales_id}</Box> · {dayLabel(sale.date)} · {sale.jobs} item{sale.jobs === 1 ? '' : 's'}</Typography>
            </Box>
            <Box sx={styles.lineEnd}>
              <Typography sx={{ fontWeight: 700 }}>{money(sale.total_kobo)}</Typography>
              <Box component="span" sx={[styles.tag, Number(sale.owed_kobo) > 0 ? styles.tagOwes : styles.tagPaid]}>{Number(sale.owed_kobo) > 0 ? `Owes ${shortNaira(Number(sale.owed_kobo))}` : 'Paid'}</Box>
            </Box>
          </ButtonBase>)}
        </Box> : <Typography color="text.secondary">No sales yet.</Typography>)}
        {profile && tab === 'payments' && (profile.payments.length ? <Box>
          {profile.payments.map((payment, index) => <Box key={`${payment.reference}-${index}`} sx={styles.line}>
            <Box sx={styles.lineMain}>
              <Typography sx={styles.lineName}><Box component="span" sx={styles.ref}>{payment.reference}</Box></Typography>
              <Typography variant="body2" color="text.secondary">{dayLabel(payment.date)}{payment.method ? ` · ${payment.method}` : ''}{payment.by ? ` · ${payment.by}` : ''}</Typography>
            </Box>
            <Typography sx={{ fontWeight: 700 }}>{money(payment.amount_kobo)}</Typography>
          </Box>)}
        </Box> : <Typography color="text.secondary">No payments recorded.</Typography>)}
        {profile && tab === 'changes' && (profile.changes.length ? <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Typography variant="body2" color="text.secondary">Everything staff changed on this profile, newest first.</Typography>
          {profile.changes.map((entry, index) => <Box key={index} sx={styles.change}>
            <Box sx={styles.changeHead}><Typography sx={{ fontWeight: 700 }}>{entry.by}</Typography><Typography variant="body2" color="text.secondary">{timeLabel(entry.at)}</Typography></Box>
            {Object.entries(entry.changes).map(([field, change]) => <Box key={field}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>Changed the {FIELD_LABEL[field] ?? field}</Typography>
              <Box sx={styles.diff}>
                {change.from ? <Box component="span" sx={styles.diffOld}>{change.from}</Box> : <Box component="span" sx={styles.diffEmpty}>Empty</Box>}
                <Box component="span" aria-hidden>→</Box>
                {change.to ? <Box component="span" sx={styles.diffNew}>{change.to}</Box> : <Box component="span" sx={styles.diffEmpty}>Empty</Box>}
              </Box>
            </Box>)}
          </Box>)}
        </Box> : <Typography color="text.secondary">Nothing has been changed on this profile yet.</Typography>)}
      </Box>
    </ResponsiveSheet>

    {editing && <EditSheet key={`${c?.contact}|${c?.notes}|${c?.name}`} customer={customer} contact={contact} notes={notes} owner={owner}
      onClose={() => setEditing(false)} onSaved={(text) => { setEditing(false); setSaved(text); refresh(); }} />}
    <DebtorPaymentModal clientName={customer.name} isOpen={paying} onClose={() => setPaying(false)} onUpdate={refresh} />
  </>;
}

function EditSheet({ customer, contact, notes, owner, onClose, onSaved }: {
  customer: CustomerItem & { id: string }; contact: string; notes: string; owner: boolean; onClose: () => void; onSaved: (text: string) => void;
}) {
  const [name, setName] = useState(customer.name), [phone, setPhone] = useState(contact), [note, setNote] = useState(notes);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  // One id per unsaved edit, so a double tap or a retry after a dropped connection saves once.
  const requestId = useRef<string | null>(null);
  const changed = phone.trim() !== contact.trim() || note.trim() !== notes.trim() || (owner && name.trim() !== customer.name);
  const change = (setter: (value: string) => void) => (event: { target: { value: string } }) => { requestId.current = null; setter(event.target.value); };

  async function save() {
    if (busy || !changed) return;
    requestId.current ??= crypto.randomUUID();
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/accounting/customer-profile', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestId: requestId.current, customerId: customer.id, contact: phone, notes: note, ...(owner && name.trim() !== customer.name ? { name } : {}) }) });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'The change was not saved. Try again.');
      requestId.current = null;
      onSaved(result?.changed ? 'Saved. The change is recorded on the profile.' : 'Nothing was different, so nothing changed.');
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  }

  return <ResponsiveSheet open onClose={onClose} busy={busy} title="Edit customer" description={`${customer.reference ?? ''} · ${customer.name}`}
    footer={<Box sx={styles.formFooter}>
      <Button variant="contained" size="large" disabled={busy || !changed || (owner && !name.trim())} onClick={() => void save()}>{busy ? 'Saving…' : 'Save changes'}</Button>
      <Button color="inherit" variant="outlined" disabled={busy} onClick={onClose}>Cancel</Button>
    </Box>}>
    <Box sx={styles.formBody}>
      {error && <Alert severity="error">{error}</Alert>}
      <TextField label="Name" value={name} disabled={!owner || busy} onChange={change(setName)} helperText={owner ? undefined : 'Only the owner can change the name.'} slotProps={{ htmlInput: { maxLength: 200 } }} />
      <TextField label="Phone number" type="tel" value={phone} disabled={busy} onChange={change(setPhone)} slotProps={{ htmlInput: { maxLength: 100 } }} />
      <TextField label="Notes" multiline minRows={3} value={note} disabled={busy} onChange={change(setNote)} slotProps={{ htmlInput: { maxLength: 2000 } }} />
      <Box sx={styles.note}>Every change is saved with your name and the time. The owner sees it on the customer’s profile and in the activity log.</Box>
    </Box>
  </ResponsiveSheet>;
}

"use client";

import { Alert, Box, Button, IconButton, Menu, MenuItem, Typography } from '@mui/material';
import { EllipsisVertical } from 'lucide-react';
import { recordsStyles as styles, settingsStyles } from '@/app/theme';
import { ManageBatchAction } from '@/components/manage-batch-action';
import { ManageSaleAction, type UnifiedRecord } from '@/components/manage-sale-action';
import { MaterialBadge } from '@/components/material-badge';
import { ResponsiveSheet } from '@/components/responsive-sheet';
import { StatTile } from '@/components/stat-tile';
import { StatusBadge } from '@/components/status-badge';
import { WhatsAppReminder } from '@/components/whatsapp-reminder';
import { describeBalance } from '@/lib/balance-display';
import { naira } from '@/lib/expense-list';
import { groupStatus } from '@/lib/records-view';
import { useState } from 'react';
import { saleChangeStyles as changeStyles } from '@/app/theme';
import { CancelSaleSheet } from '@/components/sale-corrections/cancel-sale-sheet';
import { CorrectSaleSheet } from '@/components/sale-corrections/correct-sale-sheet';
import { SaleHistory } from '@/components/sale-corrections/sale-history';
import { useCorrectionAccess } from '@/components/sale-corrections/use-correction-access';
import { lagosBusinessDate } from '@/lib/accounting-entry';
import { canChangeSale } from '@/lib/sale-corrections-view';
import { recordSaleItem } from '@/lib/customer-sale-items';

function Fact({ label, children, muted = false }: { label: string; children: string; muted?: boolean }) {
  return <Box>
    <Typography variant="overline" sx={styles.factLabel}>{label}</Typography>
    <Typography sx={muted ? styles.factMuted : styles.factValue}>{children}</Typography>
  </Box>;
}

const exact = (record: UnifiedRecord) => !!record.raw?._jobId;

/** One sale or expense, opened from the Records list. Payments and receipts use the existing dialogs. */
export function RecordDetailsSheet({ record, onClose, onUpdate, onReceipt }: {
  record: UnifiedRecord | null;
  onClose: () => void;
  onUpdate: () => void;
  onReceipt: (records: UnifiedRecord[], salesId: string) => void;
}) {
  const sale = record?.type === 'Sale';
  const balance = record ? describeBalance(record.balance, false, exact(record)) : null;
  const owes = balance?.tone === 'debt';
  const refresh = () => { onUpdate(); onClose(); };
  const access = useCorrectionAccess();
  const [changing, setChanging] = useState<'correct' | 'cancel' | null>(null);
  const [changes, setChanges] = useState(0);
  const cancelled = record?.jobStatus === 'Cancelled';
  const job = record && sale ? recordSaleItem(record) : null;
  const mayChange = !!record && sale && !record.isPending && !cancelled && !!record.raw?._jobId && canChangeSale(access, record.raw?.DATE, lagosBusinessDate());
  return <ResponsiveSheet open={!!record} onClose={onClose} title={record?.client || 'Record'} description={record ? `${record.date}${record.salesId ? ` · ${record.salesId}` : ''}` : undefined}
    footer={<Box sx={settingsStyles.footer}><Button color="inherit" onClick={onClose}>Close</Button></Box>}>
    {record && <Box sx={styles.sheetBody}>
      {record.isPending && <Alert severity="warning">This {sale ? 'sale' : 'expense'} is still waiting on this phone. It will save by itself when the phone is online.</Alert>}

      {sale && !record.isPending && <Box sx={owes ? styles.amountOwed : styles.amountPaid}>
        <Box>
          <Typography variant="overline" sx={owes ? styles.amountLabelOwed : styles.amountLabel}>{owes ? 'STILL OWED' : 'PAID IN FULL'}</Typography>
          <Typography variant="h5" component="p" sx={styles.amountValue}>{owes ? naira(record.balance || 0) : naira(record.amount)}</Typography>
        </Box>
        <StatusBadge status={record.status} />
      </Box>}
      {!sale && <Box sx={styles.amountPaid}>
        <Box>
          <Typography variant="overline" sx={styles.amountLabel}>EXPENSE</Typography>
          <Typography variant="h5" component="p" sx={styles.amountValue}>{naira(record.amount)}</Typography>
        </Box>
        <StatusBadge status={record.status} />
      </Box>}

      {sale && !record.isPending && <Box sx={styles.miniTiles}>
        <StatTile label="Total" value={naira(record.amount)} />
        <StatTile label="Paid" value={naira(Math.max(0, record.amount - (record.balance || 0)))} />
      </Box>}

      <Box sx={styles.facts}>
        <Fact label={sale ? 'CUSTOMER' : 'PAID TO'}>{record.client}</Fact>
        {sale ? <Fact label="CONTACT" muted={!record.contact}>{record.contact || 'Not given'}</Fact> : <Fact label="CATEGORY" muted={!record.material}>{record.material || '—'}</Fact>}
        {sale && <Box>
          <Typography variant="overline" sx={styles.factLabel}>MATERIAL</Typography>
          {record.material ? <Box><MaterialBadge material={record.material} /></Box> : <Typography sx={styles.factMuted}>—</Typography>}
        </Box>}
        <Fact label="LOGGED BY">{record.loggedBy}</Fact>
        {sale && <Fact label="JOB STAGE">{record.jobStatus || 'Quoted'}</Fact>}
      </Box>

      <Box>
        <Typography variant="overline" sx={styles.factLabel}>{sale ? 'JOB' : 'NOTE'}</Typography>
        <Typography sx={sale ? { fontWeight: 600 } : undefined}>{job?.name ?? record.description}</Typography>
        {job?.size && <Typography variant="body2" color="text.secondary">{job.size}</Typography>}
      </Box>

      {sale && (cancelled ? <Box component="span" sx={changeStyles.cancelled}>Cancelled</Box> : changes > 0 && <Box component="span" sx={changeStyles.corrected}>Corrected {changes === 1 ? '1 time' : `${changes} times`}</Box>)}

      {sale && !record.isPending && !cancelled && <Box sx={styles.actions}>
        <ManageSaleAction record={record} variant="button" onUpdate={refresh}
          trigger={(open) => <Button variant="contained" sx={styles.fullWidth} onClick={open}>Record a payment or update</Button>} />
        <Box sx={styles.actionPair}>
          <Button variant="outlined" color="primary" sx={styles.fullWidth} onClick={() => onReceipt([record], record.salesId || '')}>Print receipt</Button>
          {owes && <Box sx={styles.whatsapp}><WhatsAppReminder clientName={record.client} contact={record.contact || ''} balance={record.balance || 0} jobDescription={record.description} variant="full" /></Box>}
        </Box>
      </Box>}
      {mayChange && <Box sx={changeStyles.actionsRow}>
        <Button variant="outlined" color="inherit" onClick={() => setChanging('correct')}>Correct this sale</Button>
        <Button variant="outlined" color="error" onClick={() => setChanging('cancel')}>Cancel sale</Button>
      </Box>}
      {sale && record.salesId && <SaleHistory salesId={record.salesId} onLoaded={setChanges} />}
    </Box>}
    {changing === 'correct' && record && <CorrectSaleSheet jobId={String(record.raw._jobId)} description={record.description} owner={!!access?.isOwner} onClose={() => setChanging(null)} onDone={() => { setChanging(null); refresh(); }} />}
    {changing === 'cancel' && record && <CancelSaleSheet salesId={record.salesId || ''} client={record.client} owner={!!access?.isOwner} onClose={() => setChanging(null)} onDone={() => { setChanging(null); refresh(); }} />}
  </ResponsiveSheet>;
}

/** A batch (sales sharing one Sales ID), opened from the Records list. */
export function BatchDetailsSheet({ items, salesId, onClose, onUpdate, onReceipt }: {
  items: UnifiedRecord[] | null;
  salesId: string;
  onClose: () => void;
  onUpdate: () => void;
  onReceipt: (records: UnifiedRecord[], salesId: string) => void;
}) {
  const first = items?.[0];
  const total = items ? items.reduce((sum, item) => sum + item.amount, 0) : 0;
  const balance = items ? items.reduce((sum, item) => sum + (item.balance || 0), 0) : 0;
  const owes = !!first && describeBalance(balance, false, exact(first)).tone === 'debt';
  const refresh = () => { onUpdate(); onClose(); };
  const access = useCorrectionAccess();
  const [changing, setChanging] = useState<{ mode: 'correct'; item: UnifiedRecord } | { mode: 'cancel' } | null>(null);
  const [changes, setChanges] = useState(0);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; item: UnifiedRecord } | null>(null);
  const cancelled = !!first && first.jobStatus === 'Cancelled';
  const today = lagosBusinessDate();
  const mayChange = (item: UnifiedRecord) => !cancelled && !item.isPending && !!item.raw?._jobId && canChangeSale(access, item.raw?.DATE, today);
  const mayCancel = !!items && items.length > 0 && items.every((item) => mayChange(item));
  return <ResponsiveSheet open={!!items} onClose={onClose} title={first?.client || 'Batch'} description={items && first ? `${first.date} · ${items.length} ${items.length === 1 ? 'item' : 'items'} · ${salesId}` : undefined}
    footer={<Box sx={settingsStyles.footer}><Button color="inherit" onClick={onClose}>Close</Button></Box>}>
    {items && first && <Box sx={styles.sheetBody}>
      <Box sx={owes ? styles.amountOwed : styles.amountPaid}>
        <Box>
          <Typography variant="overline" sx={owes ? styles.amountLabelOwed : styles.amountLabel}>{owes ? 'STILL OWED ON THE BATCH' : 'BATCH PAID IN FULL'}</Typography>
          <Typography variant="h5" component="p" sx={styles.amountValue}>{naira(owes ? balance : total)}</Typography>
        </Box>
        <StatusBadge status={groupStatus(items)} />
      </Box>
      <Box sx={styles.miniTiles}>
        <StatTile label="Batch total" value={naira(total)} />
        <StatTile label="Paid so far" value={naira(Math.max(0, total - balance))} />
      </Box>

      <Box>
        <Typography variant="overline" sx={styles.factLabel}>ITEMS IN THIS BATCH</Typography>
        <Box sx={styles.group}>
          {items.map((item) => {
            const itemBalance = describeBalance(item.balance, false, exact(item));
            const job = recordSaleItem(item);
            return <Box key={item.id} sx={styles.itemRow}>
              <Box sx={styles.rowMain}>
                <Typography sx={styles.category}>{job.name || 'No description'}</Typography>
                <Typography variant="body2" component="span" sx={styles.meta}>
                  {[job.size, item.material || 'No material'].filter(Boolean).join(' · ')}{itemBalance.tone === 'debt' && <> · <Box component="span" sx={styles.owes}>Owes {naira(item.balance || 0)}</Box></>}
                </Typography>
              </Box>
              <Box component="span" sx={styles.rowEnd}>
                <Typography component="span" sx={styles.amount}>{naira(item.amount)}</Typography>
                <StatusBadge status={item.status} />
              </Box>
              {mayChange(item) && <IconButton aria-label={`More actions for ${item.description || 'this item'}`} sx={styles.itemMore} onClick={(event) => setMenu({ anchor: event.currentTarget, item })}><EllipsisVertical size={20} /></IconButton>}
            </Box>;
          })}
        </Box>
      </Box>

      {cancelled ? <Box component="span" sx={changeStyles.cancelled}>Cancelled</Box> : changes > 0 && <Box component="span" sx={changeStyles.corrected}>Corrected {changes === 1 ? '1 time' : `${changes} times`}</Box>}
      {!cancelled && <Box sx={styles.actions}>
        <ManageBatchAction records={items} salesId={salesId} variant="button" onUpdate={refresh}
          trigger={(open) => <Button variant="contained" sx={styles.fullWidth} onClick={open}>Pay the batch</Button>} />
        <Box sx={styles.actionPair}>
          <Button variant="outlined" color="primary" sx={styles.fullWidth} onClick={() => onReceipt(items, salesId)}>Print receipt</Button>
          {owes && <Box sx={styles.whatsapp}><WhatsAppReminder clientName={first.client} contact={first.contact || ''} balance={balance} jobDescription={`${items.length} ${items.length === 1 ? 'item' : 'items'}`} variant="full" /></Box>}
        </Box>
      </Box>}
      {mayCancel && <Box sx={changeStyles.actionsRow}><Button variant="outlined" color="error" onClick={() => setChanging({ mode: 'cancel' })}>Cancel the whole sale</Button></Box>}
      {salesId && <SaleHistory salesId={salesId} onLoaded={setChanges} />}
    </Box>}
    <Menu open={!!menu} anchorEl={menu?.anchor} onClose={() => setMenu(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
      <MenuItem onClick={() => { if (menu) setChanging({ mode: 'correct', item: menu.item }); setMenu(null); }}>Correct this item</MenuItem>
    </Menu>
    {changing?.mode === 'correct' && <CorrectSaleSheet jobId={String(changing.item.raw._jobId)} description={changing.item.description} owner={!!access?.isOwner} onClose={() => setChanging(null)} onDone={() => { setChanging(null); refresh(); }} />}
    {changing?.mode === 'cancel' && first && <CancelSaleSheet salesId={salesId} client={first.client} owner={!!access?.isOwner} onClose={() => setChanging(null)} onDone={() => { setChanging(null); refresh(); }} />}
  </ResponsiveSheet>;
}

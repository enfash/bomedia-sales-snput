"use client";

import { Alert, Box, Button, Typography } from '@mui/material';
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
        <Typography>{record.description}</Typography>
      </Box>

      {sale && !record.isPending && <Box sx={styles.actions}>
        <ManageSaleAction record={record} variant="button" onUpdate={refresh}
          trigger={(open) => <Button variant="contained" sx={styles.fullWidth} onClick={open}>Record a payment or update</Button>} />
        <Box sx={styles.actionPair}>
          <Button variant="outlined" color="primary" sx={styles.fullWidth} onClick={() => onReceipt([record], record.salesId || '')}>Print receipt</Button>
          {owes && <Box sx={styles.whatsapp}><WhatsAppReminder clientName={record.client} contact={record.contact || ''} balance={record.balance || 0} jobDescription={record.description} variant="full" /></Box>}
        </Box>
      </Box>}
    </Box>}
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
            return <Box key={item.id} sx={styles.itemRow}>
              <Box sx={styles.rowMain}>
                <Typography sx={styles.category}>{item.description || 'No description'}</Typography>
                <Typography variant="body2" component="span" sx={styles.meta}>
                  {item.material || 'No material'}{itemBalance.tone === 'debt' && <> · <Box component="span" sx={styles.owes}>Owes {naira(item.balance || 0)}</Box></>}
                </Typography>
              </Box>
              <Box component="span" sx={styles.rowEnd}>
                <Typography component="span" sx={styles.amount}>{naira(item.amount)}</Typography>
                <StatusBadge status={item.status} />
              </Box>
            </Box>;
          })}
        </Box>
      </Box>

      <Box sx={styles.actions}>
        <ManageBatchAction records={items} salesId={salesId} variant="button" onUpdate={refresh}
          trigger={(open) => <Button variant="contained" sx={styles.fullWidth} onClick={open}>Pay the batch</Button>} />
        <Box sx={styles.actionPair}>
          <Button variant="outlined" color="primary" sx={styles.fullWidth} onClick={() => onReceipt(items, salesId)}>Print receipt</Button>
          {owes && <Box sx={styles.whatsapp}><WhatsAppReminder clientName={first.client} contact={first.contact || ''} balance={balance} jobDescription={`${items.length} ${items.length === 1 ? 'item' : 'items'}`} variant="full" /></Box>}
        </Box>
      </Box>
    </Box>}
  </ResponsiveSheet>;
}

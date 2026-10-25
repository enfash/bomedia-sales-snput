"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Paper, Typography } from '@mui/material';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { settingsStyles, systemStatusStyles as styles } from '@/app/theme';
import { readDeviceQueue } from '@/lib/device-queue-read';
import type { DeviceQueueSummary } from '@/lib/device-queue-status';
import { EXPECTED_MIGRATION_COUNT } from '@/lib/schema-version';
import { formatClock, formatWhen } from '@/lib/status-format';
import { useSyncStore } from '@/lib/store';
import { BackLink } from '@/components/back-link';
import { LoadingState } from '@/components/loading-state';

type Seen = { reference: string | null; at: string } | null;
type Status = {
  checkedAt: string; backend: 'postgres' | 'sheets'; testDatabase: boolean;
  database: { reachable: boolean; ms: number | null };
  schema: { state: 'current' | 'behind' | 'ahead' | 'unknown'; applied: number | null; expected: number; behindBy: number };
  lastSale: Seen; lastPayment: Seen; lastExpense: Seen; today: { sales: number; payments: number; expenses: number } | null;
};
const ENDPOINT = '/api/accounting/system-status';

export function SystemStatus() {
  const legacy = useSyncStore((state) => state.pendingQueue);
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [queue, setQueue] = useState<DeviceQueueSummary | null>(null);

  const check = useCallback(async () => {
    setChecking(true); setError('');
    try {
      const response = await fetch(ENDPOINT, { cache: 'no-store' });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'The status could not be loaded. Try again.');
      setStatus(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The status could not be loaded. Try again.'); }
    finally { setChecking(false); }
  }, []);

  useEffect(() => { void Promise.resolve().then(() => void check()); }, [check]);
  useEffect(() => { void Promise.resolve().then(() => setQueue(readDeviceQueue(legacy))); }, [legacy, status]);

  const problems = useMemo(() => {
    if (!status) return 0;
    let count = 0;
    if (status.backend === 'postgres' && !status.database.reachable) count += 1;
    if (status.backend === 'postgres' && status.database.reachable && status.schema.state === 'behind') count += 1;
    if (queue && queue.needsAttention > 0) count += 1;
    return count;
  }, [status, queue]);

  const postgres = status?.backend === 'postgres';
  return <Box sx={settingsStyles.page}>
    <BackLink href="/bom03/settings" label="Settings" />
    <Box sx={[settingsStyles.heading, styles.stack]}>
      <Typography variant="h3" component="h1">System status</Typography>
      <Typography color="text.secondary">A quick check that the app is saving where it should. Only you can see this page.</Typography>
    </Box>
    {error && <Alert severity="error" sx={styles.alert}>{error}</Alert>}
    {!status && !error && <LoadingState pieces={[{ k: 'cards', n: 4 }]} label="Loading system status" />}
    {status && <Box sx={styles.stack}>
      <Box sx={[styles.banner, problems ? styles.bannerWarn : styles.bannerOk]} role="status">
        <Box sx={problems ? styles.bannerIconWarn : styles.bannerIconOk}>{problems ? <AlertTriangle size={28} /> : <CheckCircle2 size={28} />}</Box>
        <Box>
          <Typography variant="h6" component="p">{problems ? `${problems} thing${problems === 1 ? '' : 's'} need${problems === 1 ? 's' : ''} attention` : 'Everything is working'}</Typography>
          <Typography variant="body2" color="text.secondary">{problems ? 'See the cards marked below' : `Checked at ${formatClock(status.checkedAt)}`}</Typography>
        </Box>
      </Box>

      <Paper variant="outlined" sx={styles.card}>
        <Typography variant="overline" sx={styles.label}>Where saving goes</Typography>
        <Box sx={styles.line}>
          <Typography variant="h6" component="p">{postgres ? 'New database' : 'Google Sheets'}</Typography>
          <Box component="span" sx={[styles.chip, styles.chipInfo]}>In use</Box>
        </Box>
        <Typography variant="body2" color="text.secondary">
          {postgres ? 'Sales, payments and expenses are saved to the new database. Google Sheets is not being written to.'
            : 'The new database is not switched on, so everything is still saved to Google Sheets.'}
        </Typography>
        {status.testDatabase && <Typography variant="body2" sx={styles.testNote}>This is the test database. No live data.</Typography>}
      </Paper>

      {postgres && <>
        <Paper variant="outlined" sx={[styles.card, (!status.database.reachable || status.schema.state === 'behind') && styles.cardWarn]}>
          <Box sx={styles.cardHead}>
            <Typography variant="overline" sx={styles.label}>Database</Typography>
            {(!status.database.reachable || status.schema.state === 'behind') && <Box component="span" sx={[styles.chip, styles.chipWarn]}>Needs attention</Box>}
          </Box>
          <Box sx={styles.line}>
            <Box sx={styles.lineLeft}>
              <Box component="span" sx={[styles.dot, status.database.reachable ? styles.dotOk : styles.dotBad]} />
              <Typography sx={styles.strong}>{status.database.reachable ? 'Connected' : 'Cannot reach the database'}</Typography>
            </Box>
            {status.database.ms !== null && <Typography variant="body2" color="text.secondary">Answered in {status.database.ms} ms</Typography>}
          </Box>
          {status.database.reachable && <>
            <Box sx={styles.line}>
              <Box sx={styles.lineLeft}>
                <Box component="span" sx={[styles.dot, status.schema.state === 'behind' ? styles.dotWarn : status.schema.state === 'unknown' ? styles.dotWarn : styles.dotOk]} />
                <Typography sx={styles.strong}>{{ current: 'Up to date', behind: 'Behind', ahead: 'Newer than this app', unknown: 'Version cannot be checked' }[status.schema.state]}</Typography>
              </Box>
              {status.schema.applied !== null && <Typography variant="body2" color="text.secondary">Version {status.schema.applied} of {EXPECTED_MIGRATION_COUNT}</Typography>}
            </Box>
            {status.schema.state === 'behind' && <Typography variant="body2" sx={styles.testNote}>
              The database is missing {status.schema.behindBy === 1 ? 'the newest update' : `${status.schema.behindBy} updates`}. Some screens may not save correctly until {status.schema.behindBy === 1 ? 'it is' : 'they are'} applied.
            </Typography>}
          </>}
          {!status.database.reachable && <Typography variant="body2" sx={styles.testNote}>Entries made now are kept on the phone and sent when the database answers again.</Typography>}
        </Paper>

        {status.database.reachable && status.today && <Paper variant="outlined" sx={styles.card}>
          <Typography variant="overline" sx={styles.label}>Latest activity</Typography>
          {([['Last sale saved', status.lastSale], ['Last payment saved', status.lastPayment], ['Last expense saved', status.lastExpense]] as const).map(([label, seen]) => (
            <Box key={label} sx={styles.lineTop}>
              <Box><Typography sx={styles.strong}>{label}</Typography>{seen?.reference && <Typography variant="body2" color="text.secondary">{seen.reference}</Typography>}</Box>
              <Typography variant="body2" sx={styles.right}>{formatWhen(seen?.at)}</Typography>
            </Box>
          ))}
          <Box sx={styles.counts}>
            {([['Sales today', status.today.sales], ['Payments today', status.today.payments], ['Expenses today', status.today.expenses]] as const).map(([label, value]) => (
              <Box key={label} sx={styles.count}><Typography variant="h5" component="p" sx={styles.big}>{value}</Typography><Typography variant="caption" color="text.secondary">{label}</Typography></Box>
            ))}
          </Box>
        </Paper>}
      </>}

      <Paper variant="outlined" sx={[styles.card, queue && queue.needsAttention > 0 && styles.cardWarn]}>
        <Box sx={styles.cardHead}>
          <Typography variant="overline" sx={styles.label}>Waiting on this device</Typography>
          {queue && queue.needsAttention > 0 && <Box component="span" sx={[styles.chip, styles.chipWarn]}>Needs attention</Box>}
        </Box>
        {queue === null ? <LoadingState pieces={[{ k: 'wide' }]} label="Loading the queue" /> : queue.total === 0 ? <>
          <Box sx={styles.lineLeft}><Box component="span" sx={[styles.dot, styles.dotOk]} /><Typography sx={styles.strong}>Nothing waiting</Typography></Box>
          <Typography variant="body2" color="text.secondary">Every entry made on this phone has been saved. Other phones keep their own waiting entries, and those cannot be seen from here.</Typography>
        </> : <>
          <Box sx={styles.lineLeft}><Box component="span" sx={[styles.dot, queue.needsAttention ? styles.dotWarn : styles.dotOk]} />
            <Typography sx={styles.strong}>{queue.total} entr{queue.total === 1 ? 'y has' : 'ies have'} not saved yet</Typography></Box>
          <Box sx={styles.stack}>{queue.rows.map((row, index) => (
            <Box key={`${row.label}-${index}`} sx={styles.queueRow}>
              <Typography variant="body2">{row.label}</Typography>
              <Typography variant="body2" sx={[styles.right, row.attention && styles.testNote]} color={row.attention ? undefined : 'text.secondary'}>{row.detail}</Typography>
            </Box>))}</Box>
          <Typography variant="body2" color="text.secondary">These are kept safely on this phone and nothing is deleted. Retry them from the red banner at the top of the app. Other phones keep their own waiting entries, and those cannot be seen from here.</Typography>
        </>}
      </Paper>

      <Typography variant="body2" color="text.secondary" sx={styles.note}>Backups are managed in Supabase. This page cannot see them, so it does not show a backup date.</Typography>

      <Box sx={styles.footer}>
        <Typography variant="body2" color="text.secondary">Checked at {formatClock(status.checkedAt)}</Typography>
        <Button variant="outlined" color="inherit" disabled={checking} onClick={() => void check()}>{checking ? 'Checking…' : 'Check again'}</Button>
      </Box>
    </Box>}
  </Box>;
}

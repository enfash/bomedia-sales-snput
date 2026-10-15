"use client";

import { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';

import { customerStyles as diffStyles, saleChangeStyles as styles } from '@/app/theme';
import { EXPENSE_LABELS, FieldDiff } from '@/components/sale-corrections/field-diff';
import { timeLabel } from '@/lib/customers-view';
import { koboNaira } from '@/lib/approvals-view';
import type { ExpenseHistoryEntry } from '@/lib/server/expense-corrections';
import { LoadingState } from '@/components/loading-state';

/** Everything that was changed on an expense, newest first. Renders nothing for an expense nobody has changed. */
export function ExpenseHistory({ reference, onLoaded }: { reference: string; onLoaded?: (count: number) => void }) {
  const [entries, setEntries] = useState<ExpenseHistoryEntry[] | null>(null);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      try {
        const response = await fetch(`/api/accounting/expense-corrections?reference=${encodeURIComponent(reference)}`, { cache: 'no-store' }), result = await response.json();
        if (!response.ok || !Array.isArray(result?.data)) throw new Error();
        if (active) { setEntries(result.data); onLoaded?.(result.data.length); }
      } catch { if (active) setEntries([]); }
    });
    return () => { active = false; };
  }, [reference, onLoaded]);

  if (!entries) return <LoadingState pieces={[{ k: 'list', n: 2 }]} label="Loading the history" />;
  if (!entries.length) return null;
  return <Box sx={styles.historyList}>
    <Typography variant="subtitle1" sx={styles.strong}>History</Typography>
    {entries.map((entry) => <Box key={`${entry.at}-${entry.revision}`} sx={diffStyles.change}>
      <Box sx={diffStyles.changeHead}>
        <Typography sx={styles.strong}>{entry.kind === 'cancellation' ? 'Cancelled' : 'Corrected'} by {entry.by ?? 'staff'}{entry.approved_by ? ` · approved by ${entry.approved_by}` : ''}</Typography>
        <Typography variant="body2" color="text.secondary">{timeLabel(entry.at)}</Typography>
      </Box>
      <Typography variant="body2" color="text.secondary">“{entry.reason}”</Typography>
      <FieldDiff before={entry.before} after={entry.after} labels={EXPENSE_LABELS} />
      {Number(entry.excess_kobo) > 0 && <Typography variant="caption" color="text.secondary">{koboNaira(Number(entry.excess_kobo))} was already paid out and is held as “to recover”.</Typography>}
    </Box>)}
  </Box>;
}

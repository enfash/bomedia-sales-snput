"use client";

import { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';

import { customerStyles as diffStyles, saleChangeStyles as styles } from '@/app/theme';
import { FieldDiff } from '@/components/sale-corrections/field-diff';
import { timeLabel } from '@/lib/customers-view';
import type { SaleHistoryEntry } from '@/lib/server/sale-corrections';
import { LoadingState } from '@/components/loading-state';

/** Everything that was changed on a sale, newest first. Renders nothing for a sale nobody has changed. */
export function SaleHistory({ salesId, version = 0, onLoaded }: { salesId: string; version?: number; onLoaded?: (count: number) => void }) {
  const [entries, setEntries] = useState<SaleHistoryEntry[] | null>(null);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      try {
        const response = await fetch(`/api/accounting/sale-corrections?sales_id=${encodeURIComponent(salesId)}`, { cache: 'no-store' }), result = await response.json();
        if (!response.ok || !Array.isArray(result?.data)) throw new Error();
        if (active) { setEntries(result.data); onLoaded?.(result.data.length); }
      } catch { if (active) setEntries([]); }
    });
    return () => { active = false; };
  }, [salesId, version, onLoaded]);

  if (!entries) return <LoadingState pieces={[{ k: 'list', n: 2 }]} label="Loading the history" />;
  if (!entries.length) return null;
  return <Box sx={styles.historyList}>
    <Typography variant="subtitle1" sx={styles.strong}>History</Typography>
    {entries.map((entry) => {
      return <Box key={`${entry.at}-${entry.revision}-${entry.job}`} sx={diffStyles.change}>
        <Box sx={diffStyles.changeHead}>
          <Typography sx={styles.strong}>{entry.kind === 'cancellation' ? 'Cancelled' : 'Corrected'} by {entry.by ?? 'staff'}{entry.approved_by ? ` · approved by ${entry.approved_by}` : ''}</Typography>
          <Typography variant="body2" color="text.secondary">{timeLabel(entry.at)}</Typography>
        </Box>
        <Typography variant="body2" color="text.secondary">“{entry.reason}”</Typography>
        {entry.kind === 'correction' && <Typography variant="body2" color="text.secondary">{entry.job}</Typography>}
        <FieldDiff before={entry.before} after={entry.after} />
        {(entry.stock_returned.length > 0 || entry.stock_taken.length > 0) && <Typography variant="caption" color="text.secondary">
          Stock: {[...entry.stock_returned.map((r) => `${r.length_ft} ft returned to ${r.roll}`), ...entry.stock_taken.map((r) => `${r.length_ft} ft taken from ${r.roll}`)].join(', ')}.
        </Typography>}
      </Box>;
    })}
  </Box>;
}
export { styles as historyStyles };

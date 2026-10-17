"use client";

import { useState } from 'react';
import { Box, Button, Stack, TextField, Typography } from '@mui/material';

import { approvalPromptStyles as styles } from '@/app/theme';
import { ResponsiveSheet } from '@/components/responsive-sheet';
import { changeText, changeTitle, type EntryChange } from '@/lib/approvals-view';

const MAX = 500;

/** Shown before sending an entry the owner will have to approve. The cashier must say why; nothing is recorded until the owner decides. */
export function ApprovalReasonSheet({ open, changes, busy, description, backLabel, onSend, onClose }: {
  open: boolean; changes: EntryChange[]; busy: boolean; description: string; backLabel: string; onSend: (reason: string) => void; onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const trimmed = reason.trim();
  return <ResponsiveSheet open={open} onClose={onClose} busy={busy} title="Needs the owner’s approval" description={description}
    footer={<Box sx={styles.footer}>
      <Button variant="contained" size="large" disabled={busy || !trimmed} onClick={() => onSend(trimmed)}>Send for approval</Button>
      <Button color="inherit" variant="outlined" disabled={busy} onClick={onClose}>{backLabel}</Button>
    </Box>}>
    <Stack sx={styles.body}>
      <Box sx={styles.changes}>
        {changes.map((change, index) => <Box key={index} sx={styles.change}>
          <Box component="span" sx={styles.changeTitle}>{changeTitle(change)}</Box>{changeText(change)}
        </Box>)}
      </Box>
      <Box>
        <TextField label="Why? (required)" multiline minRows={3} fullWidth autoFocus value={reason} disabled={busy}
          onChange={(event) => setReason(event.target.value.slice(0, MAX))} />
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'right', mt: 0.5 }}>{reason.length} / {MAX}</Typography>
      </Box>
    </Stack>
  </ResponsiveSheet>;
}

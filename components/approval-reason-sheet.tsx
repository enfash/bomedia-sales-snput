"use client";

import { useState } from 'react';
import { Box, Button, Stack, TextField, Typography } from '@mui/material';

import { approvalPromptStyles as styles } from '@/app/theme';
import { ResponsiveSheet } from '@/components/responsive-sheet';
import { changeText, changeTitle, type EntryChange } from '@/lib/approvals-view';

const MAX = 500;

/** Shown before saving a sale the owner will have to approve. The cashier must say why; the sale is held until the owner decides. */
export function ApprovalReasonSheet({ open, changes, busy, onSend, onClose }: {
  open: boolean; changes: EntryChange[]; busy: boolean; onSend: (reason: string) => void; onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const trimmed = reason.trim();
  return <ResponsiveSheet open={open} onClose={onClose} busy={busy} title="Needs the owner’s approval"
    description="This sale is different from the usual. It will not be recorded until the owner approves it."
    footer={<Box sx={styles.footer}>
      <Button variant="contained" size="large" disabled={busy || !trimmed} onClick={() => onSend(trimmed)}>Send for approval</Button>
      <Button color="inherit" variant="outlined" disabled={busy} onClick={onClose}>Change the date or price</Button>
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

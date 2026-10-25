"use client";

import { Box } from '@mui/material';

import { saleChangeStyles as styles } from '@/app/theme';

/** "Corrected" under a sale or expense in a list, when it has been changed since it was first recorded. */
export function CorrectedTag({ revisions }: { revisions: unknown }) {
  return Number(revisions) > 0 ? <Box component="span" sx={styles.correctedSmall}>Corrected</Box> : null;
}

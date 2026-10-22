"use client";

import type { ReactNode } from 'react';
import { Box, Drawer, IconButton, Typography } from '@mui/material';
import { X } from 'lucide-react';
import { sidePanelStyles as styles } from '@/app/theme';

/**
 * A panel from the right edge with a title, a close button and a tap-outside-to-close backdrop. On a phone it stops short of the
 * left edge so there is always some page left to tap. Escape also closes it.
 */
export function SidePanel({ open, onClose, title, subtitle, icon, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return <Drawer anchor="right" open={open} onClose={onClose} slotProps={{ paper: { sx: styles.paper, role: 'dialog', 'aria-label': title } }}>
    <Box sx={styles.header}>
      <Box sx={styles.headerText}>
        <Box sx={styles.titleLine}>
          {icon && <Box component="span" sx={styles.titleIcon}>{icon}</Box>}
          <Typography variant="h6" component="h2" sx={styles.title}>{title}</Typography>
        </Box>
        {subtitle && <Typography variant="caption" sx={styles.subtitle}>{subtitle}</Typography>}
      </Box>
      <IconButton aria-label={`Close ${title}`} onClick={onClose} sx={styles.closeButton}><X size={20} /></IconButton>
    </Box>
    <Box sx={styles.body}>{children}</Box>
  </Drawer>;
}

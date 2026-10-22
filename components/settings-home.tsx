"use client";

import NextLink from 'next/link';
import { Box, Paper, Stack, Typography } from '@mui/material';
import { ChevronRight } from 'lucide-react';
import { settingsStyles as styles } from '@/app/theme';
import { settingsGroups } from './settings-navigation';
import { BackLink } from '@/components/back-link';

export function SettingsHome() {
  return <Box sx={styles.page}>
    <BackLink href="/bom03" label="Dashboard" />
    <Stack spacing={1} sx={styles.heading}>
      <Typography variant="h3" component="h1">Settings</Typography>
      <Typography color="text.secondary">Manage your business, money and team.</Typography>
    </Stack>
    <Box sx={styles.groups}>
      {settingsGroups.map(({ id, title, sections }) => <Box component="section" aria-labelledby={`settings-${id}`} key={id}>
        <Typography id={`settings-${id}`} component="h2" variant="h6" sx={styles.groupHeading}>{title}</Typography>
        <Paper variant="outlined" sx={styles.sections}>
          {sections.map(({href,title,description,icon:Icon})=><Box component={NextLink} href={href} key={href} sx={styles.sectionLink}>
            <Box sx={styles.icon}><Icon size={24}/></Box>
            <Box sx={styles.grow}><Typography variant="subtitle1" component="h3" sx={styles.itemHeading}>{title}</Typography><Typography variant="body2" color="text.secondary">{description}</Typography></Box>
            <Box sx={styles.chevron}><ChevronRight size={20}/></Box>
          </Box>)}
        </Paper>
      </Box>)}
    </Box>
  </Box>;
}

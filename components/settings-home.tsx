"use client";

import NextLink from 'next/link';
import { Box, Button, Paper, Stack, Typography } from '@mui/material';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { settingsStyles as styles } from '@/app/theme';
import { settingsSections } from './settings-navigation';

export function SettingsHome() {
  return <Box sx={styles.page}>
    <Button component={NextLink} href="/bom03" startIcon={<ArrowLeft size={18}/>}>Dashboard</Button>
    <Stack spacing={1} sx={styles.heading}>
      <Typography variant="h3" component="h1">Settings</Typography>
      <Typography color="text.secondary">Manage your services and team.</Typography>
    </Stack>
    <Paper variant="outlined" sx={styles.sections}>
      {settingsSections.map(({href,title,description,icon:Icon})=><Box component={NextLink} href={href} key={href} sx={styles.sectionLink}>
        <Box sx={styles.icon}><Icon size={24}/></Box>
        <Box sx={styles.grow}><Typography variant="h6" component="h2">{title}</Typography><Typography variant="body2" color="text.secondary">{description}</Typography></Box>
        <ChevronRight size={20}/>
      </Box>)}
    </Paper>
  </Box>;
}

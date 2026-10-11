"use client";

import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { CalendarRange } from 'lucide-react';
import { dateRangeStyles } from '@/app/theme';

export type Period = 'all' | 'today' | '7d' | '30d' | 'custom';
const options: { value: Period; label: string }[] = [
  { value: 'all', label: 'All' }, { value: 'today', label: 'Today' },
  { value: '7d', label: '7D' }, { value: '30d', label: '30D' },
  { value: 'custom', label: 'Custom date range' },
];
export function PeriodSelector({ value, onChange, fullWidth = false }: {
  value: Period; onChange: (value: Period) => void; fullWidth?: boolean;
}) {
  return <ToggleButtonGroup value={value} exclusive fullWidth={fullWidth} size="small"
    aria-label="Date period" onChange={(_, next: Period | null) => { if (next) onChange(next); }} sx={dateRangeStyles.periods}>
    {options.map(option => <ToggleButton key={option.value} value={option.value} aria-label={option.label}>
      {option.value === 'custom' ? <CalendarRange size={16} /> : option.label}
    </ToggleButton>)}
  </ToggleButtonGroup>;
}

"use client";

import Box from '@mui/material/Box';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs from 'dayjs';
import { dateRangeStyles } from '@/app/theme';

type Props = {
  start: string;
  end: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
};

/** Shared range fields: bounded mobile dialogs and a container-sized field grid. */
export function DateRangeFields({ start, end, onStartChange, onEndChange }: Props) {
  const slots = {
    textField: { size: 'small' as const, fullWidth: true, sx: dateRangeStyles.field },
    dialog: { sx: dateRangeStyles.dialog },
  };
  return (
    <Box role="group" aria-label="Custom date range" sx={dateRangeStyles.fields}>
      <DatePicker label="From" value={start ? dayjs(start) : null}
        maxDate={end ? dayjs(end) : undefined} format="DD/MM/YYYY"
        desktopModeMediaQuery="(min-width: 900px)"
        onChange={(value, context) => { if (!context.validationError) onStartChange(value?.format('YYYY-MM-DD') ?? ''); }}
        slotProps={slots} />
      <DatePicker label="To" value={end ? dayjs(end) : null}
        minDate={start ? dayjs(start) : undefined} format="DD/MM/YYYY"
        desktopModeMediaQuery="(min-width: 900px)"
        onChange={(value, context) => { if (!context.validationError) onEndChange(value?.format('YYYY-MM-DD') ?? ''); }}
        slotProps={slots} />
    </Box>
  );
}
